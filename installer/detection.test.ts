import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan } from "./apply.ts";
import type { Runner } from "./cli-plugin.ts";
import { discoverCatalog, type ItemSelection } from "./catalog.ts";
import { computePlan, wantedArtifacts } from "./plan.ts";
import { targetChoices } from "./prompts.ts";
import type { Owned } from "./state.ts";
import { targets } from "./targets/registry.ts";
import type { Context } from "./targets/types.ts";

let root: string;
let ctx: Context;
/** CLIs the fake runner can run, and the plugin commands it saw. */
let runnable: Set<string>;
let calls: string[];
let installed: Set<string>;

const fakeRun: Runner = (command, args) => {
  calls.push(`${command} ${args.join(" ")}`);
  if (!runnable.has(command)) return { code: 127, stdout: "", stderr: "not found" };
  if (args[0] === "--version") return { code: 0, stdout: "1.0.0", stderr: "" };
  if (args[1] === "marketplace") {
    const list = args[2] === "list" ? { marketplaces: [{ name: "agents-config", marketplaceSource: { source: ctx.repo } }] } : {};
    return { code: 0, stdout: JSON.stringify(list), stderr: "" };
  }
  if (args[1] === "add" || args[1] === "install") installed.add(`${command}:${args[2]}`);
  const active = [...installed].filter((i) => i.startsWith(`${command}:`)).map((i) => i.slice(command.length + 1));
  const listing =
    command === "codex"
      ? { installed: active.map((pluginId) => ({ pluginId, enabled: true })) }
      : active.map((id) => ({ name: id.split("@")[0], marketplace: id.split("@")[1], enabled: true }));
  return { code: 0, stdout: JSON.stringify(listing), stderr: "" };
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agents-config-detect-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
  mkdirSync(join(repo, "shared", "skills", "alpha"), { recursive: true });
  mkdirSync(join(repo, "shared", "plugins", "mcp", ".claude-plugin"), { recursive: true });
  writeFileSync(join(repo, "shared", "instructions.md"), "hi\n");
  writeFileSync(join(repo, "shared", "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: A\n---\n");
  writeFileSync(join(repo, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "agents-config" }));
  writeFileSync(join(repo, "shared", "plugins", "mcp", ".claude-plugin", "plugin.json"), JSON.stringify({ name: "mcp" }));
  writeFileSync(join(repo, "shared", "plugins", "mcp", ".mcp.json"), JSON.stringify({ mcpServers: { local: { command: "tool" } } }));
  mkdirSync(join(root, "home"));
  runnable = new Set(["codex", "copilot"]);
  calls = [];
  installed = new Set();
  ctx = { home: join(root, "home"), repo, root: join(root, "fs"), path: "", run: fakeRun };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const items: ItemSelection = { instructions: ["instructions"], skills: ["alpha"], agents: [], settings: [], mcp: ["local"] };
const selected = ["claude", "codex", "copilot"];

function plan(owned: Owned[], detected: string[]) {
  const wanted = wantedArtifacts(discoverCatalog(ctx.repo), targets, selected, items, ctx, new Set(detected));
  return { plan: computePlan(wanted.desired, owned, ctx, wanted.held), notices: wanted.notices };
}

const planned = (p: ReturnType<typeof plan>) => p.plan.actions.flatMap((a) => (a.type === "create" ? [a.desired.path.replace(ctx.home, "~")] : []));

test("an undetected target plans nothing, is announced, and keeps its owned artifacts", () => {
  const owned = applyPlan(plan([], ["claude", "codex", "copilot"]).plan, fakeRun);
  const copilotOwned = owned.filter((o) => o.targets.includes("copilot") && o.targets.length === 1);
  expect(copilotOwned.length).toBeGreaterThan(0);

  const next = plan(owned, ["claude", "codex"]);
  expect(next.notices).toEqual(["Skipped GitHub Copilot: not found"]);
  expect(next.plan.actions).toEqual([]);
  expect(next.plan.kept.map((o) => o.path).sort()).toEqual(copilotOwned.map((o) => o.path).sort());
  // The skills link is shared, so it stays planned for Codex, and what we own is still recorded after applying.
  expect(applyPlan(next.plan, fakeRun)).toHaveLength(owned.length);
});

test("a detected target without its CLI still gets links, but the plugin is skipped", () => {
  runnable.delete("copilot");
  const result = plan([], ["claude", "codex", "copilot"]);
  expect(planned(result)).toContain("~/.copilot/copilot-instructions.md");
  expect(planned(result)).toContain("codex plugin mcp@agents-config");
  expect(planned(result)).not.toContain("copilot plugin mcp@agents-config");
  expect(result.notices).toEqual(["Skipped copilot plugin mcp@agents-config: `copilot` is not runnable"]);
});

test("a missing CLI does not uninstall a plugin we own", () => {
  const owned = applyPlan(plan([], ["claude", "codex", "copilot"]).plan, fakeRun);
  runnable.delete("copilot");
  const next = plan(owned, ["claude", "codex", "copilot"]);
  expect(next.plan.actions.filter((a) => a.type === "remove")).toEqual([]);
  expect(next.plan.kept.map((o) => o.path)).toEqual(["copilot plugin mcp@agents-config"]);
});

test("the target prompt offers only detected tools and never preselects the rest", () => {
  const found = new Map([["claude", {}], ["codex", { hint: "0.159.2" }]]);
  const { options, initialValues } = targetChoices(targets, found, ["codex", "copilot", "bob"]);
  expect(options.map((o) => [o.value, "disabled" in o && o.disabled, o.hint])).toEqual([
    ["claude", false, "detected"],
    ["codex", false, "detected (0.159.2)"],
    ["copilot", true, "not found"],
    ["bob", true, "not found"],
  ]);
  expect(initialValues).toEqual(["codex"]);
  expect(targetChoices(targets, found, ["copilot"]).initialValues).toEqual(["claude", "codex"]);
});
