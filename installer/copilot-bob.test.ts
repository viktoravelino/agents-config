import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan } from "./apply.ts";
import { discoverCatalog, type ItemSelection } from "./catalog.ts";
import { computePlan, desiredArtifacts } from "./plan.ts";
import type { Owned } from "./state.ts";
import { bob } from "./targets/bob.ts";
import { copilot } from "./targets/copilot.ts";
import { targets } from "./targets/registry.ts";
import type { Context } from "./targets/types.ts";

let root: string;
let ctx: Context;
let settings: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agents-config-test-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "shared", "skills", "alpha"), { recursive: true });
  mkdirSync(join(repo, "shared", "agents"), { recursive: true });
  writeFileSync(join(repo, "shared", "instructions.md"), "hi\n");
  writeFileSync(join(repo, "shared", "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: A\n---\n");
  writeFileSync(join(repo, "shared", "agents", "helper.md"), "---\nname: helper\ndescription: Helps\n---\nHelp.\n");
  mkdirSync(join(root, "home"));
  mkdirSync(join(root, "bin"));
  ctx = { home: join(root, "home"), repo, root: join(root, "fs"), path: join(root, "bin"), run: () => ({ code: 127, stdout: "", stderr: "" }) };
  settings = join(ctx.home, "Library", "Application Support", "Code", "User", "settings.json");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const everything: ItemSelection = { instructions: ["instructions"], skills: ["alpha"], agents: ["helper"], settings: [], mcp: [] };

function run(owned: Owned[], selected: string[], items = everything) {
  return computePlan(desiredArtifacts(discoverCatalog(ctx.repo), targets, selected, items, ctx), owned, ctx);
}

const fakeBinary = (dir: string, name: string, version: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `#!/bin/sh\necho ${version}\n`);
  chmodSync(join(dir, name), 0o755);
};

const installVSCode = () => mkdirSync(join(ctx.root, "Applications", "Visual Studio Code.app"), { recursive: true });

test("a shared skills dir stays while any of its targets is selected", () => {
  const skillsOnly: ItemSelection = { ...everything, instructions: [], agents: [] };
  const skill = join(ctx.home, ".agents", "skills", "alpha");
  const owned = applyPlan(run([], ["codex", "bob"], skillsOnly));
  expect(owned.find((o) => o.path === skill)?.targets).toEqual(["codex", "bob"]);

  const noCodex = run(owned, ["bob"], skillsOnly);
  expect(noCodex.actions).toEqual([]);
  const stillOwned = applyPlan(noCodex);
  expect(stillOwned.find((o) => o.path === skill)?.targets).toEqual(["bob"]);
  expect(lstatSync(skill).isSymbolicLink()).toBe(true);

  const none = run(stillOwned, ["claude"], skillsOnly);
  expect(none.actions.some((a) => a.type === "remove" && a.owned.path === skill)).toBe(true);
  applyPlan(none);
  expect(existsSync(skill)).toBe(false);
});

test("copilot and bob links are planned and applied", () => {
  const plan = run([], ["copilot", "bob"]);
  const owned = applyPlan(plan);
  const link = (...parts: string[]) => readlinkSync(join(ctx.home, ...parts));
  const shared = join(ctx.repo, "shared");
  expect(link(".copilot", "copilot-instructions.md")).toBe(join(shared, "instructions.md"));
  expect(link(".copilot", "agents", "helper.md")).toBe(join(shared, "agents", "helper.md"));
  expect(link(".bob", "rules", "agents-config.md")).toBe(join(shared, "instructions.md"));
  expect(link(".agents", "skills", "alpha")).toBe(join(shared, "skills", "alpha"));
  expect(existsSync(join(ctx.home, ".bob", "agents"))).toBe(false);
  expect(owned).toHaveLength(4);
  expect(run(owned, ["copilot", "bob"]).actions).toEqual([]);
});

test("a foreign file in ~/.bob/rules is left alone", () => {
  mkdirSync(join(ctx.home, ".bob", "rules"), { recursive: true });
  writeFileSync(join(ctx.home, ".bob", "rules", "security.md"), "mine");
  const owned = applyPlan(run([], ["bob"]));
  applyPlan(run(owned, ["claude"]));
  expect(readFileSync(join(ctx.home, ".bob", "rules", "security.md"), "utf8")).toBe("mine");
});

const ours = ["chat.agentFilesLocations", "~/.copilot/agents"];

test("the VS Code setting merges into JSONC, is idempotent, and removes only our key", () => {
  installVSCode();
  mkdirSync(join(settings, ".."), { recursive: true });
  const original = '{\n  // keep me\n  "editor.fontSize": 13,\n  "chat.agentFilesLocations": {\n    "~/other": true, // mine\n  },\n}\n';
  writeFileSync(settings, original);

  const owned = applyPlan(run([], ["copilot"]));
  const merged = readFileSync(settings, "utf8");
  expect(merged).toContain("// keep me");
  expect(merged).toContain("// mine");
  expect(merged).toContain('"~/other": true');
  expect(merged).toMatch(/"~\/\.copilot\/agents": false/);
  expect(owned).toContainEqual({ targets: ["copilot"], path: settings, kind: "json-setting", keyPath: ours, value: false });

  const again = run(owned, ["copilot"]);
  expect(again.actions).toEqual([]);

  // Dropping agents removes the key and nothing else.
  const removal = run(owned, ["copilot"], { ...everything, agents: [] });
  expect(removal.actions.filter((a) => a.type === "remove").map((a) => a.type === "remove" && a.owned.path)).toContain(settings);
  applyPlan(removal);
  const after = readFileSync(settings, "utf8");
  expect(after).not.toContain(".copilot/agents");
  expect(after).toContain("chat.agentFilesLocations");
  expect(after).toContain("// keep me");
  expect(after).toContain('"~/other": true');
});

test("the VS Code setting is created when missing and skipped without VS Code", () => {
  expect(run([], ["copilot"]).actions.some((a) => a.type === "create" && a.desired.path === settings)).toBe(false);
  installVSCode();
  applyPlan(run([], ["copilot"]));
  expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({ "chat.agentFilesLocations": { "~/.copilot/agents": false } });
});

test("removing our only key also drops the object it created", () => {
  installVSCode();
  const owned = applyPlan(run([], ["copilot"]));
  applyPlan(run(owned, ["copilot"], { ...everything, agents: [] }));
  expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({});
});

test("a user-changed VS Code value is kept, not overwritten or removed", () => {
  installVSCode();
  const owned = applyPlan(run([], ["copilot"]));
  writeFileSync(settings, JSON.stringify({ "chat.agentFilesLocations": { "~/.copilot/agents": true } }));

  expect(run(owned, ["copilot"]).actions).toMatchObject([{ type: "conflict", cause: "edited", resolution: "keep" }]);
  const kept = applyPlan(run(owned, ["copilot"]));
  expect(readFileSync(settings, "utf8")).toContain("true");
  expect(kept.some((o) => o.path === settings)).toBe(true);

  const removal = run(owned, ["claude"], { ...everything, agents: [] });
  expect(removal.actions.some((a) => a.type === "remove" && a.owned.path === settings)).toBe(false);
});

test("copilot detection rejects copilot-shim and finds fixed and T3 binaries", async () => {
  expect(await copilot.detect(ctx)).toBeUndefined();

  fakeBinary(join(root, "copilot-shim", "bin"), "copilot", "9.9.9");
  ctx.path = join(root, "copilot-shim", "bin");
  expect(await copilot.detect(ctx)).toBeUndefined();

  fakeBinary(join(ctx.home, ".t3", "tools", "github-copilot-cli", "1.0.102", "npm", "bin"), "copilot", "1.0.102");
  expect(await copilot.detect(ctx)).toEqual({ hint: "CLI 1.0.102" });

  ctx.path = "";
  rmSync(join(ctx.home, ".t3"), { recursive: true });
  fakeBinary(join(ctx.root, "opt", "homebrew", "bin"), "copilot", "2.0.0");
  expect(await copilot.detect(ctx)).toEqual({ hint: "CLI 2.0.0" });
});

test("copilot is detected from VS Code alone, and shows both consumers", async () => {
  const manifest = join(ctx.root, "Applications", "Visual Studio Code.app", "Contents", "Resources", "app", "extensions", "copilot");
  mkdirSync(manifest, { recursive: true });
  writeFileSync(join(manifest, "package.json"), "{}");
  expect(await copilot.detect(ctx)).toEqual({ hint: "VS Code" });
  fakeBinary(ctx.path, "copilot", "1.0.102");
  expect(await copilot.detect(ctx)).toEqual({ hint: "CLI 1.0.102 + VS Code" });
});

test("bob is detected from the shell, T3 install, or the IDE app", async () => {
  expect(await bob.detect(ctx)).toBeUndefined();
  mkdirSync(join(ctx.root, "Applications", "IBM Bob - Insiders.app"), { recursive: true });
  expect(await bob.detect(ctx)).toEqual({ hint: "IDE" });
  fakeBinary(join(ctx.home, ".t3", "tools", "bob", "2.0.6", "npm", "bin"), "bob", "2.0.6");
  expect(await bob.detect(ctx)).toEqual({ hint: "Shell 2.0.6 + IDE" });
});
