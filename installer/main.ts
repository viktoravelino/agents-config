import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { intro, log, outro } from "@clack/prompts";
import { applyPlan } from "./apply.ts";
import { spawnRunner } from "./cli-plugin.ts";
import { discoverCatalog, emptyItems, kinds, withRequires, type Catalog, type Item } from "./catalog.ts";
import { computePlan, displayPath, wantedArtifacts, type Plan } from "./plan.ts";
import { loadProfiles, profileSelection, type Selection } from "./profiles.ts";
import { promptConfirm, promptEdited, promptNewItems, promptProfile, promptSelection } from "./prompts.ts";
import { renderPlan, summarize, viaBySource } from "./render.ts";
import { loadState, saveState, statePath, type State } from "./state.ts";
import { installableKinds, targets } from "./targets/registry.ts";
import type { Context } from "./targets/types.ts";

const usage = `Usage: ./install [options]

Links this repo's shared config into Claude Code, Codex, GitHub Copilot and
IBM Bob, and generates Codex agents from the Claude agent files. Installs the
user-wide MCP servers: a plugin for Codex and Copilot, and
~/.bob/settings/mcp.json for Bob. Prompts on the first run. Later runs reuse
the saved selection (~/.config/agents-config/state.json).

  --edit              change the saved selection
  --yes               skip the confirmation prompt
  --profile <name>    start from profiles/<name>.json
                      (required on a first run without a terminal)
  --dry-run           print the plan, change nothing
  -h, --help          show this help
`;

const { values } = parseArgs({
  options: {
    edit: { type: "boolean" },
    yes: { type: "boolean" },
    profile: { type: "string" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (values.help) {
  console.log(usage);
  process.exit(0);
}

const ctx: Context = {
  home: process.env.HOME ?? homedir(),
  repo: resolve(import.meta.dir, ".."),
  root: "/",
  path: process.env.PATH ?? "",
  run: spawnRunner,
};
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const dryRun = values["dry-run"] ?? false;
const stateFile = statePath(ctx.home);

/** Prints an error and exits with 1. */
function fail(message: string): never {
  console.error(`install: ${message}`);
  process.exit(1);
}

/** Items in the repo that the saved state has never seen, limited to kinds a chosen target installs. */
function newItems(catalog: Catalog, state: State): Item[] {
  const installable = installableKinds(state.targets);
  return catalog.filter((i) => !state.known[i.kind].includes(i.name) && installable.has(i.kind));
}

/** Detection per installed tool. A missing tool has no entry; its targets are skipped, never removed. */
const found = new Map(
  (await Promise.all(targets.map(async (t) => [t.id, await t.detect(ctx)] as const))).flatMap(([id, d]) =>
    d ? [[id, d] as const] : [],
  ),
);
const detected = new Set(found.keys());

const catalog = discoverCatalog(ctx.repo);
const state = loadState(stateFile);
const profiles = loadProfiles(ctx.repo);
const profile = values.profile ? profiles[values.profile] : undefined;

if (values.profile && !profile) fail(`unknown profile "${values.profile}" (have: ${Object.keys(profiles).join(", ") || "none"})`);
if (!interactive && !state && !profile) fail("no saved state; pass --profile <name> (or run in a terminal)");

const owned = state?.owned ?? [];

/** Picks the starting selection and, when allowed, lets the user refine it. */
async function chooseSelection(): Promise<{ selection: Selection; known: State["known"]; profile?: string }> {
  const all = emptyItems();
  for (const kind of kinds) all[kind] = catalog.filter((i) => i.kind === kind).map((i) => i.name);

  let profileName = values.profile ?? state?.profile;
  let selection: Selection;
  if (profile) {
    selection = profileSelection(profile, catalog);
  } else if (state) {
    selection = { targets: state.targets, items: state.items };
  } else {
    // Only an interactive run gets here: a run without a terminal needs state or --profile.
    profileName = await promptProfile(profiles, detected);
    const picked = profileName ? profiles[profileName] : undefined;
    selection = picked ? profileSelection(picked, catalog) : { targets: [], items: emptyItems() };
  }

  if (interactive && (values.edit || !state)) {
    selection = await promptSelection(catalog, selection, found);
    return { selection, known: all, profile: profileName };
  }

  if (state && !profile) {
    const fresh = newItems(catalog, state);
    if (!fresh.length) return { selection, known: all, profile: profileName };
    if (!interactive) {
      log.warn(`New in the repo, skipped (run in a terminal to choose): ${fresh.map((i) => i.name).join(", ")}`);
      return { selection, known: state.known, profile: profileName };
    }
    const picked = await promptNewItems(fresh);
    const items = structuredClone(selection.items);
    for (const item of picked) items[item.kind].push(item.name);
    return { selection: { ...selection, items }, known: all, profile: profileName };
  }
  return { selection, known: all, profile: profileName };
}

/** Plans the selection, with its skill dependencies, against the disk. */
function buildPlan(selection: Selection): { plan: Plan; via: Map<string, string> } {
  const { names, via } = withRequires(catalog, selection.items.skills);
  const items = { ...selection.items, skills: names };
  const wanted = wantedArtifacts(catalog, targets, selection.targets, items, ctx, detected);
  return { plan: computePlan(wanted, owned, ctx), via: viaBySource(catalog, via) };
}

intro("agents-config");
const labels = new Map(targets.map((t) => [t.id, t.label]));
let chosen = await chooseSelection();
let plan: Plan;
for (;;) {
  const built = buildPlan(chosen.selection);
  plan = built.plan;
  renderPlan(plan, labels, ctx.home, built.via);
  for (const notice of plan.notices) log.warn(notice);
  if (dryRun || !interactive || values.yes) break;
  const answer = await promptConfirm();
  if (answer === "cancel") {
    outro("Cancelled, nothing changed.");
    process.exit(0);
  }
  if (answer === "apply") break;
  chosen = { ...chosen, selection: await promptSelection(catalog, chosen.selection, found) };
}

if (dryRun) {
  outro(`Dry run: ${summarize(plan)}`);
  process.exit(0);
}

if (interactive) {
  for (const action of plan.actions) {
    if (action.type === "conflict" && action.cause === "edited") {
      action.resolution = await promptEdited(displayPath(action.path, ctx.home));
    }
  }
}

const { owned: nextOwned, failures } = applyPlan(plan, ctx.run);
saveState(stateFile, {
  version: 1,
  profile: chosen.profile,
  targets: chosen.selection.targets,
  items: chosen.selection.items,
  known: chosen.known,
  owned: nextOwned,
});
for (const failure of failures) log.error(failure);
if (failures.length) fail(`${failures.length} step(s) failed; the rest was applied and saved`);
outro(`Done: ${summarize(plan)}`);
