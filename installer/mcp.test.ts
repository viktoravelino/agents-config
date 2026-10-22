import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan } from "./apply.ts";
import type { Runner } from "./cli-plugin.ts";
import { discoverCatalog, type ItemSelection } from "./catalog.ts";
import { computePlan, desiredArtifacts } from "./plan.ts";
import type { Owned } from "./state.ts";
import { targets } from "./targets/registry.ts";
import type { Context } from "./targets/types.ts";
import { parseMcpServers, toBobServer } from "./translate/mcp.ts";

let root: string;
let ctx: Context;
let calls: string[];
/** Plugin ids the fake codex CLI has installed. */
let codexInstalled: Set<string>;
let codexMarketplaces: Map<string, string>;

/** A fake `codex` that keeps plugin state in memory and answers the JSON listings. */
const fakeRun: Runner = (command, args) => {
  calls.push(`${command} ${args.join(" ")}`);
  const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
  if (command !== "codex") return { code: 127, stdout: "", stderr: "not found" };
  if (args[0] === "--version") return ok("codex 0.0.0");
  const [group, verb, arg] = args;
  if (group !== "plugin") return { code: 1, stdout: "", stderr: "unexpected" };
  if (verb === "list") return ok(JSON.stringify({ installed: [...codexInstalled].map((pluginId) => ({ pluginId, enabled: true })), available: [] }));
  if (verb === "add") return ((codexInstalled.add(arg!), ok()));
  if (verb === "remove") return ((codexInstalled.delete(arg!), ok()));
  if (verb === "marketplace" && arg === "list") {
    return ok(JSON.stringify({ marketplaces: [...codexMarketplaces].map(([name, source]) => ({ name, marketplaceSource: { sourceType: "local", source } })) }));
  }
  if (verb === "marketplace" && arg === "add") return ((codexMarketplaces.set("agents-config", args[3]!), ok()));
  if (verb === "marketplace" && arg === "remove") return ((codexMarketplaces.delete(args[3]!), ok()));
  return { code: 1, stdout: "", stderr: "unexpected" };
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agents-config-mcp-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
  mkdirSync(join(repo, "shared", "plugins", "mcp", ".claude-plugin"), { recursive: true });
  writeFileSync(join(repo, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "agents-config", plugins: [{ name: "mcp", source: "./shared/plugins/mcp" }] }));
  writeFileSync(join(repo, "shared", "plugins", "mcp", ".claude-plugin", "plugin.json"), JSON.stringify({ name: "mcp" }));
  writeFileSync(
    join(repo, "shared", "plugins", "mcp", ".mcp.json"),
    JSON.stringify({ mcpServers: { local: { command: "tool", args: ["serve"] }, remote: { type: "http", url: "https://example.test/mcp" } } }),
  );
  mkdirSync(join(root, "home"));
  calls = [];
  codexInstalled = new Set();
  codexMarketplaces = new Map();
  ctx = { home: join(root, "home"), repo, root: join(root, "fs"), path: "", run: fakeRun };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const none: ItemSelection = { instructions: [], skills: [], agents: [], settings: [], mcp: [] };
const servers: ItemSelection = { ...none, mcp: ["local", "remote"] };

function plan(owned: Owned[], selected: string[], items = servers) {
  return computePlan(desiredArtifacts(discoverCatalog(ctx.repo), targets, selected, items, ctx), owned, ctx);
}

const bobFile = () => join(ctx.home, ".bob", "settings", "mcp.json");
const pluginFile = () => join(ctx.repo, "shared", "plugins", "mcp", ".mcp.json");

test("Bob: http becomes streamable-http, env references are rewritten, stdio passes through", () => {
  const parsed = parseMcpServers(
    JSON.stringify({
      mcpServers: {
        remote: { type: "http", url: "https://example.test/${REGION}/mcp", headers: { Authorization: "Bearer ${TOKEN}" } },
        events: { type: "sse", url: "https://example.test/sse" },
        local: { command: "tool", args: ["--key", "${KEY}", "${env:ALREADY}"], env: { HOME_DIR: "${HOME}" }, cwd: "/work" },
      },
    }),
  );
  expect(toBobServer(parsed.remote!)).toEqual({
    type: "streamable-http",
    url: "https://example.test/${env:REGION}/mcp",
    headers: { Authorization: "Bearer ${env:TOKEN}" },
  });
  expect(toBobServer(parsed.events!)).toEqual({ type: "sse", url: "https://example.test/sse" });
  expect(toBobServer(parsed.local!)).toEqual({
    command: "tool",
    args: ["--key", "${env:KEY}", "${env:ALREADY}"],
    env: { HOME_DIR: "${env:HOME}" },
    cwd: "/work",
  });
});

test("Bob: merging leaves the user's servers alone and removal deletes only ours", () => {
  mkdirSync(join(ctx.home, ".bob", "settings"), { recursive: true });
  const theirs = { command: "mine", args: [] };
  writeFileSync(bobFile(), JSON.stringify({ mcpServers: { mine: theirs } }, null, 2));

  const owned = applyPlan(plan([], ["bob"]));
  expect(JSON.parse(readFileSync(bobFile(), "utf8")).mcpServers).toEqual({
    mine: theirs,
    local: { command: "tool", args: ["serve"] },
    remote: { type: "streamable-http", url: "https://example.test/mcp" },
  });

  const removal = plan(owned, ["bob"], { ...none, mcp: ["local"] });
  expect(removal.actions).toMatchObject([{ type: "remove", owned: { keyPath: ["mcpServers", "remote"] } }]);
  applyPlan(removal);
  expect(JSON.parse(readFileSync(bobFile(), "utf8")).mcpServers).toEqual({
    mine: theirs,
    local: { command: "tool", args: ["serve"] },
  });
});

test("plugin: installs once for all servers, then reports it unchanged", () => {
  const first = plan([], ["codex"]);
  expect(first.actions).toMatchObject([{ type: "create", desired: { kind: "cli-plugin", id: "mcp@agents-config" } }]);
  const owned = applyPlan(first, fakeRun);
  expect(calls.filter((c) => c.includes("add"))).toEqual([`codex plugin marketplace add ${ctx.repo}`, "codex plugin add mcp@agents-config"]);

  const second = plan(owned, ["codex"]);
  expect(second.actions).toEqual([]);
  expect(second.unchanged).toHaveLength(1);
});

test("plugin: a copied plugin is reinstalled when its content changes", () => {
  const owned = applyPlan(plan([], ["codex"]), fakeRun);
  writeFileSync(pluginFile(), JSON.stringify({ mcpServers: { local: { command: "tool", args: ["serve", "--v2"] } } }));
  const next = plan(owned, ["codex"]);
  expect(next.actions).toMatchObject([{ type: "update" }]);

  calls = [];
  const after = applyPlan(next, fakeRun);
  expect(calls).toContain("codex plugin add mcp@agents-config");
  expect(plan(after, ["codex"]).actions).toEqual([]);
});

test("plugin: uninstalls and drops the marketplace when deselected", () => {
  const owned = applyPlan(plan([], ["codex"]), fakeRun);
  const removal = plan(owned, ["codex"], none);
  expect(removal.actions).toMatchObject([{ type: "remove", reason: "deselected" }]);

  const after = applyPlan(removal, fakeRun);
  expect(after).toEqual([]);
  expect(codexInstalled.size).toBe(0);
  expect(codexMarketplaces.size).toBe(0);
});

test("plugin: a marketplace name that points elsewhere fails without recording ownership", () => {
  codexMarketplaces.set("agents-config", join(root, "elsewhere"));
  expect(() => applyPlan(plan([], ["codex"]), fakeRun)).toThrow(/already points at/);
  expect(codexInstalled.size).toBe(0);
});
