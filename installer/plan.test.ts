import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPlan } from "./apply.ts";
import type { Plan } from "./plan.ts";
import type { Owned } from "./state.ts";
import { createFixture, everything, planFor, removeFixture, type Fixture } from "./test-fixture.ts";
import type { Context } from "./targets/types.ts";

let fx: Fixture;
let ctx: Context;

beforeEach(() => {
  fx = createFixture();
  ctx = fx.ctx;
});

afterEach(() => removeFixture(fx));

/** Plans for Claude and Codex unless told otherwise. */
const plan = (owned: Owned[], items = everything, selected = ["claude", "codex"]) => planFor(ctx, owned, selected, items);

/** Applies a plan and expects every step to succeed. */
function apply(p: Plan): Owned[] {
  const { owned, failures } = applyPlan(p, ctx.run);
  expect(failures).toEqual([]);
  return owned;
}

const hashOf = (o?: Owned) => (o?.kind === "file" ? o.hash : undefined);

const types = (p: Plan) => p.actions.map((a) => a.type);

test("creates everything on an empty home, then reports it unchanged", () => {
  const first = plan([]);
  expect(types(first)).toEqual(Array(6).fill("create"));
  const owned = apply(first);
  expect(readlinkSync(join(ctx.home, ".claude", "skills", "alpha"))).toBe(join(ctx.repo, "shared", "skills", "alpha"));
  expect(readFileSync(join(ctx.home, ".codex", "agents", "helper.toml"), "utf8")).toContain('name = "helper"');

  const second = plan(owned);
  expect(second.actions).toEqual([]);
  expect(second.unchanged).toHaveLength(6);
});

test("removes an owned link once its item is deselected", () => {
  const owned = apply(plan([]));
  const removal = plan(owned, { ...everything, skills: [] });
  expect(removal.actions.map((a) => a.type === "remove" && a.reason)).toEqual(["deselected", "deselected"]);
  const after = apply(removal);
  expect(existsSync(join(ctx.home, ".claude", "skills", "alpha"))).toBe(false);
  expect(after.some((o) => o.path.endsWith("alpha"))).toBe(false);
});

test("backs up a real file in the way and links over it", () => {
  const file = join(ctx.home, ".claude", "CLAUDE.md");
  mkdirSync(join(ctx.home, ".claude"));
  writeFileSync(file, "mine");
  const conflict = plan([], { ...everything, skills: [], agents: [] }, ["claude"]);
  expect(conflict.actions).toMatchObject([{ type: "conflict", cause: "in-the-way", resolution: "backup" }]);
  apply(conflict);
  expect(lstatSync(file).isSymbolicLink()).toBe(true);
  expect(readFileSync(file + ".pre-agents-config-bak", "utf8")).toBe("mine");
});

test("a second backup of the same path gets the suffix bak2", () => {
  const file = join(ctx.home, ".claude", "CLAUDE.md");
  mkdirSync(join(ctx.home, ".claude"));
  writeFileSync(file + ".pre-agents-config-bak", "first");
  writeFileSync(file, "second");
  apply(plan([], { ...everything, skills: [], agents: [] }, ["claude"]));
  expect(readFileSync(file + ".pre-agents-config-bak", "utf8")).toBe("first");
  expect(readFileSync(file + ".pre-agents-config-bak2", "utf8")).toBe("second");
});

test("flags an edited generated file and keeps it by default", () => {
  const owned = apply(plan([]));
  const toml = join(ctx.home, ".codex", "agents", "helper.toml");
  writeFileSync(toml, "edited");
  const edited = plan(owned);
  expect(edited.actions).toMatchObject([{ type: "conflict", cause: "edited", resolution: "keep" }]);
  const kept = apply(edited);
  expect(readFileSync(toml, "utf8")).toBe("edited");
  expect(hashOf(kept.find((o) => o.path === toml))).toBe(hashOf(owned.find((o) => o.path === toml)));
});

test("an edited generated file with resolution backup is moved aside and rewritten", () => {
  const owned = apply(plan([]));
  const toml = join(ctx.home, ".codex", "agents", "helper.toml");
  const generated = readFileSync(toml, "utf8");
  writeFileSync(toml, "edited");
  const edited = plan(owned);
  const [conflict] = edited.actions;
  if (conflict?.type === "conflict") conflict.resolution = "backup";

  const after = apply(edited);
  expect(readFileSync(toml, "utf8")).toBe(generated);
  expect(readFileSync(toml + ".pre-agents-config-bak", "utf8")).toBe("edited");
  expect(hashOf(after.find((o) => o.path === toml))).toBe(hashOf(owned.find((o) => o.path === toml)));
});

test("a failed step does not stop the plan, and owned records survive it", () => {
  const owned = apply(plan([]));
  const link = join(ctx.home, ".claude", "skills", "alpha");
  // The plugin step fails: the marketplace name already points somewhere else.
  fx.cli.state.codex.marketplaces.set("agents-config", join(fx.root, "elsewhere"));
  // The removal fails too: the link is gone, but the record still asks to remove it.
  const removal: Owned = { targets: ["claude"], path: join(ctx.home, ".claude", "skills", "gone"), kind: "symlink", source: link };
  const next = plan([...owned, removal], { ...everything, mcp: ["local"] });
  next.actions.push({ type: "remove", owned: removal, reason: "deselected" });

  const result = applyPlan(next, ctx.run);
  expect(result.failures).toEqual([expect.stringMatching(/already points at/), expect.stringContaining("ENOENT")]);
  expect(result.owned).toHaveLength(owned.length + 1);
  expect(result.owned).toContainEqual(removal);
  expect(result.owned.some((o) => o.kind === "cli-plugin")).toBe(false);
  expect(fx.cli.state.codex.plugins.size).toBe(0);
});
