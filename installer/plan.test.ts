import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan } from "./apply.ts";
import { discoverCatalog, type ItemSelection } from "./catalog.ts";
import { adoptExisting, computePlan, desiredArtifacts, selectionFromOwned, type Plan } from "./plan.ts";
import type { Owned } from "./state.ts";
import { targets } from "./targets/registry.ts";
import type { Context } from "./targets/types.ts";

let root: string;
let ctx: Context;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agents-config-test-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "shared", "skills", "alpha"), { recursive: true });
  mkdirSync(join(repo, "shared", "agents"), { recursive: true });
  writeFileSync(join(repo, "shared", "instructions.md"), "hi\n");
  writeFileSync(join(repo, "shared", "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: A\n---\n");
  writeFileSync(join(repo, "shared", "agents", "helper.md"), "---\nname: helper\ndescription: Helps\n---\nHelp.\n");
  mkdirSync(join(root, "home"));
  ctx = { home: join(root, "home"), repo, root: join(root, "fs"), path: "" };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const everything: ItemSelection = { instructions: ["instructions"], skills: ["alpha"], agents: ["helper"], settings: [] };

function run(owned: Owned[], items = everything, selected = ["claude", "codex"]) {
  const catalog = discoverCatalog(ctx.repo);
  const plan = computePlan(desiredArtifacts(catalog, targets, selected, items, ctx), owned, ctx);
  return plan;
}

const hashOf = (o?: Owned) => (o?.kind === "file" ? o.hash : undefined);

const types = (plan: Plan) => plan.actions.map((a) => a.type);

test("creates everything on an empty home, then reports it unchanged", () => {
  const first = run([]);
  expect(types(first)).toEqual(Array(6).fill("create"));
  const owned = applyPlan(first);
  expect(readlinkSync(join(ctx.home, ".claude", "skills", "alpha"))).toBe(join(ctx.repo, "shared", "skills", "alpha"));
  expect(readFileSync(join(ctx.home, ".codex", "agents", "helper.toml"), "utf8")).toContain('name = "helper"');

  const second = run(owned);
  expect(second.actions).toEqual([]);
  expect(second.unchanged).toHaveLength(6);
});

test("removes an owned link once its item is deselected", () => {
  const owned = applyPlan(run([]));
  const plan = run(owned, { ...everything, skills: [] });
  expect(plan.actions.map((a) => a.type === "remove" && a.reason)).toEqual(["deselected", "deselected"]);
  const after = applyPlan(plan);
  expect(existsSync(join(ctx.home, ".claude", "skills", "alpha"))).toBe(false);
  expect(after.some((o) => o.path.endsWith("alpha"))).toBe(false);
});

test("backs up a real file in the way and links over it", () => {
  mkdirSync(join(ctx.home, ".claude"));
  const file = join(ctx.home, ".claude", "CLAUDE.md");
  writeFileSync(file, "mine");
  const plan = run([], { ...everything, skills: [], agents: [] }, ["claude"]);
  expect(plan.actions).toMatchObject([{ type: "conflict", cause: "in-the-way", resolution: "backup" }]);
  applyPlan(plan);
  expect(lstatSync(file).isSymbolicLink()).toBe(true);
  expect(readFileSync(file + ".pre-agents-config-bak", "utf8")).toBe("mine");
});

test("flags an edited generated file and keeps it by default", () => {
  const owned = applyPlan(run([]));
  const toml = join(ctx.home, ".codex", "agents", "helper.toml");
  writeFileSync(toml, "edited");
  const plan = run(owned);
  expect(plan.actions).toMatchObject([{ type: "conflict", cause: "edited", resolution: "keep" }]);
  const kept = applyPlan(plan);
  expect(readFileSync(toml, "utf8")).toBe("edited");
  expect(hashOf(kept.find((o) => o.path === toml))).toBe(hashOf(owned.find((o) => o.path === toml)));

  const [conflict] = plan.actions;
  if (conflict?.type === "conflict") conflict.resolution = "backup";
  applyPlan(plan);
  expect(readFileSync(toml, "utf8")).toContain('name = "helper"');
  expect(readFileSync(toml + ".pre-agents-config-bak", "utf8")).toBe("edited");
});

test("adopts links made by install.sh and leaves foreign entries alone", () => {
  const skillDir = join(ctx.repo, "shared", "skills", "alpha");
  mkdirSync(join(ctx.home, ".claude", "skills"), { recursive: true });
  mkdirSync(join(ctx.home, ".claude", "agents"), { recursive: true });
  symlinkSync(skillDir, join(ctx.home, ".claude", "skills", "alpha"));
  symlinkSync(join(ctx.repo, "shared", "skills", "gone"), join(ctx.home, ".claude", "skills", "gone"));
  symlinkSync("/elsewhere", join(ctx.home, ".claude", "skills", "synced"));
  writeFileSync(join(ctx.home, ".claude", "agents", "bob.md"), "bob");

  const catalog = discoverCatalog(ctx.repo);
  const adopted = adoptExisting(catalog, targets, ctx);
  expect(adopted.map((o) => o.path).sort()).toEqual([
    join(ctx.home, ".claude", "skills", "alpha"),
    join(ctx.home, ".claude", "skills", "gone"),
  ]);
  const selection = selectionFromOwned(catalog, targets, adopted, ctx);
  expect(selection).toEqual({ targets: ["claude"], items: { instructions: [], skills: ["alpha"], agents: [], settings: [] } });

  const plan = run(adopted, selection.items, selection.targets);
  expect(plan.actions).toMatchObject([{ type: "remove", reason: "source gone" }]);
  expect(plan.unchanged).toHaveLength(1);
});
