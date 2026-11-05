import { afterEach, beforeEach, expect, test } from "bun:test";
import { applyPlan } from "./apply.ts";
import type { ItemSelection } from "./catalog.ts";
import { targetChoices } from "./prompts.ts";
import type { Owned } from "./state.ts";
import { targets } from "./targets/registry.ts";
import { createFixture, nothing, planFor, removeFixture, type Fixture } from "./test-fixture.ts";

let fx: Fixture;

beforeEach(() => {
  fx = createFixture();
});

afterEach(() => removeFixture(fx));

const items: ItemSelection = { ...nothing, instructions: ["instructions"], skills: ["alpha"], mcp: ["local"] };
const selected = ["claude", "codex", "copilot"];

/** Plans `items` for Claude, Codex and Copilot with only `detected` installed. */
const plan = (owned: Owned[], detected: string[]) => planFor(fx.ctx, owned, selected, items, new Set(detected));

/** The created paths, with the home shown as `~`. */
const planned = (p: ReturnType<typeof plan>) =>
  p.actions.flatMap((a) => (a.type === "create" ? [a.desired.path.replace(fx.ctx.home, "~")] : []));

test("an undetected target plans nothing, is announced, and keeps its owned artifacts", () => {
  const { owned } = applyPlan(plan([], ["claude", "codex", "copilot"]), fx.ctx.run);
  const copilotOwned = owned.filter((o) => o.targets.includes("copilot") && o.targets.length === 1);
  expect(copilotOwned.length).toBeGreaterThan(0);

  const next = plan(owned, ["claude", "codex"]);
  expect(next.notices).toEqual(["Skipped GitHub Copilot: not found"]);
  expect(next.actions).toEqual([]);
  expect(next.kept.map((o) => o.path).sort()).toEqual(copilotOwned.map((o) => o.path).sort());
  // The skills link is shared, so it stays planned for Codex, and what we own is still recorded after applying.
  expect(applyPlan(next, fx.ctx.run).owned).toHaveLength(owned.length);
});

test("a detected target without its CLI still gets links, but the plugin is skipped", () => {
  fx.cli.runnable.delete("copilot");
  const result = plan([], ["claude", "codex", "copilot"]);
  expect(planned(result)).toContain("~/.copilot/copilot-instructions.md");
  expect(planned(result)).toContain("codex plugin mcp@agents-config");
  expect(planned(result)).not.toContain("copilot plugin mcp@agents-config");
  expect(result.notices).toEqual(["Skipped copilot plugin mcp@agents-config: `copilot` is not runnable"]);
});

test("a missing CLI does not uninstall a plugin we own", () => {
  const { owned } = applyPlan(plan([], ["claude", "codex", "copilot"]), fx.ctx.run);
  fx.cli.runnable.delete("copilot");
  const next = plan(owned, ["claude", "codex", "copilot"]);
  expect(next.actions.filter((a) => a.type === "remove")).toEqual([]);
  expect(next.kept.map((o) => o.path)).toEqual(["copilot plugin mcp@agents-config"]);
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
