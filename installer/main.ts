import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { intro, log, outro } from "@clack/prompts";
import { ApplyError, applyPlan } from "./apply.ts";
import { spawnRunner } from "./cli-plugin.ts";
import { discoverCatalog, emptyItems, kinds, withRequires, type Catalog, type Item } from "./catalog.ts";
import { adoptExisting, computePlan, desiredArtifacts, displayPath, selectionFromOwned, type Plan } from "./plan.ts";
import { loadProfiles, mergeSelections, profileSelection, type Selection } from "./profiles.ts";
import { promptConfirm, promptEdited, promptNewItems, promptProfile, promptSelection } from "./prompts.ts";
import { renderPlan, summarize, viaBySource } from "./render.ts";
import { loadState, saveState, statePath, type Owned, type State } from "./state.ts";
import { targets } from "./targets/registry.ts";
import type { Context } from "./targets/types.ts";

const usage = `Usage: ./install [options]

Links this repo's shared config into Claude Code, Codex, GitHub Copilot and
IBM Bob, generates Codex agents from the Claude agent files, and installs the
user-wide MCP servers (plugin for Codex and Copilot, ~/.bob/settings/mcp.json for Bob). Prompts on first run; later runs
reuse the saved selection (~/.config/agents-config/state.json).

  --edit              change the saved selection
  --yes               skip the confirmation prompt
  --profile <name>    start from profiles/<name>.json (required without state when not a TTY)
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

function fail(message: string): never {
  console.error(`install: ${message}`);
  process.exit(1);
}

/** Items in the repo that the saved state has never seen, limited to kinds a chosen target installs. */
function newItems(catalog: Catalog, state: State): Item[] {
  const installable = new Set(
    targets.filter((t) => state.targets.includes(t.id)).flatMap((t) => Object.keys(t.install)),
  );
  return catalog.filter((i) => !state.known[i.kind].includes(i.name) && installable.has(i.kind));
}

const catalog = discoverCatalog(ctx.repo);
const state = loadState(stateFile);
const profiles = loadProfiles(ctx.repo);
const profile = values.profile ? profiles[values.profile] : undefined;

if (values.profile && !profile) fail(`unknown profile "${values.profile}" (have: ${Object.keys(profiles).join(", ") || "none"})`);
if (!interactive && !state && !profile) fail("no saved state; pass --profile <name> (or run in a terminal)");

const owned = state?.owned ?? adoptExisting(catalog, targets, ctx);
const adopted = state ? undefined : selectionFromOwned(catalog, targets, owned, ctx);

/** Picks the starting selection and, when allowed, lets the user refine it. */
async function chooseSelection(): Promise<{ selection: Selection; known: State["known"]; profile?: string }> {
  const all = emptyItems();
  for (const kind of kinds) all[kind] = catalog.filter((i) => i.kind === kind).map((i) => i.name);

  let profileName = values.profile ?? state?.profile;
  let selection: Selection;
  if (profile) {
    selection = profileSelection(profile, catalog);
    if (adopted) selection = mergeSelections(selection, adopted);
  } else if (state) {
    selection = { targets: state.targets, items: state.items };
  } else {
    profileName = interactive ? await promptProfile(profiles) : undefined;
    const chosen = profileName ? profileSelection(profiles[profileName]!, catalog) : undefined;
    selection = chosen && adopted ? mergeSelections(chosen, adopted) : (chosen ?? adopted!);
  }

  if (interactive && (values.edit || !state)) {
    selection = await promptSelection(catalog, selection, ctx);
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

function buildPlan(selection: Selection): { plan: Plan; via: Map<string, string> } {
  const { names, via } = withRequires(catalog, selection.items.skills);
  const items = { ...selection.items, skills: names };
  const desired = desiredArtifacts(catalog, targets, selection.targets, items, ctx);
  return { plan: computePlan(desired, owned, ctx), via: viaBySource(catalog, via) };
}

intro("agents-config");
const labels = new Map(targets.map((t) => [t.id, t.label]));
let chosen = await chooseSelection();
let plan: Plan;
for (;;) {
  const built = buildPlan(chosen.selection);
  plan = built.plan;
  renderPlan(plan, labels, ctx.home, built.via);
  if (dryRun || !interactive || values.yes) break;
  const answer = await promptConfirm();
  if (answer === "cancel") {
    outro("Cancelled, nothing changed.");
    process.exit(0);
  }
  if (answer === "apply") break;
  chosen = { ...chosen, selection: await promptSelection(catalog, chosen.selection, ctx) };
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

let nextOwned: Owned[];
let failures: string[] = [];
try {
  nextOwned = applyPlan(plan, ctx.run);
} catch (error) {
  if (!(error instanceof ApplyError)) throw error;
  nextOwned = error.owned;
  failures = error.failures;
}
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
