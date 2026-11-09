import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPlan } from "./apply.ts";
import type { Plan } from "./plan.ts";
import type { Owned } from "./state.ts";
import type { Context } from "./targets/types.ts";
import { createFixture, nothing, planFor, removeFixture, type Fixture } from "./test-fixture.ts";
import { parseMcpServers, toBobServer } from "./translate/mcp.ts";

let fx: Fixture;
let ctx: Context;

beforeEach(() => {
  fx = createFixture();
  ctx = fx.ctx;
});

afterEach(() => removeFixture(fx));

const servers = { ...nothing, mcp: ["local", "remote"] };

/** Plans `items` (both servers by default) for the `selected` targets. */
const plan = (owned: Owned[], selected: string[], items = servers) => planFor(ctx, owned, selected, items);

/** Applies a plan and expects every step to succeed. */
function apply(p: Plan): Owned[] {
  const { owned, failures } = applyPlan(p, ctx.run);
  expect(failures).toEqual([]);
  return owned;
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

  const owned = apply(plan([], ["bob"]));
  expect(JSON.parse(readFileSync(bobFile(), "utf8")).mcpServers).toEqual({
    mine: theirs,
    local: { command: "tool", args: ["serve"] },
    remote: { type: "streamable-http", url: "https://example.test/mcp" },
  });

  const removal = plan(owned, ["bob"], { ...nothing, mcp: ["local"] });
  expect(removal.actions).toMatchObject([{ type: "remove", owned: { keyPath: ["mcpServers", "remote"] } }]);
  apply(removal);
  expect(JSON.parse(readFileSync(bobFile(), "utf8")).mcpServers).toEqual({
    mine: theirs,
    local: { command: "tool", args: ["serve"] },
  });
});

test("Bob: a changed repo value updates an untouched key and conflicts with a hand-edited one", () => {
  const owned = apply(plan([], ["bob"]));
  const next = { mcpServers: { local: { command: "tool", args: ["serve"] }, remote: { type: "http", url: "https://example.test/v2" } } };
  writeFileSync(pluginFile(), JSON.stringify(next));
  const remoteKey = ["mcpServers", "remote"];

  const update = plan(owned, ["bob"]);
  expect(update.actions).toMatchObject([{ type: "update", desired: { keyPath: remoteKey } }]);
  apply(update);
  expect(JSON.parse(readFileSync(bobFile(), "utf8")).mcpServers.remote).toEqual({ type: "streamable-http", url: "https://example.test/v2" });

  // Reset to the first install, edit the key by hand, then change the repo value again.
  writeFileSync(bobFile(), JSON.stringify({ mcpServers: { local: { command: "tool", args: ["serve"] }, remote: { url: "https://mine.test" } } }));
  writeFileSync(pluginFile(), JSON.stringify({ mcpServers: { ...next.mcpServers, remote: { type: "http", url: "https://example.test/v3" } } }));
  const conflict = plan(owned, ["bob"]);
  expect(conflict.actions).toMatchObject([{ type: "conflict", cause: "edited", resolution: "keep", desired: { keyPath: remoteKey } }]);
  apply(conflict);
  expect(JSON.parse(readFileSync(bobFile(), "utf8")).mcpServers.remote).toEqual({ url: "https://mine.test" });
});

test("plugin: installs once for all servers, then reports it unchanged", () => {
  const first = plan([], ["codex"]);
  expect(first.actions).toMatchObject([{ type: "create", desired: { kind: "cli-plugin", id: "mcp@agents-config" } }]);
  const owned = apply(first);
  expect(fx.cli.calls.filter((c) => c.includes("add"))).toEqual([`codex plugin marketplace add ${ctx.repo}`, "codex plugin add mcp@agents-config"]);

  const second = plan(owned, ["codex"]);
  expect(second.actions).toEqual([]);
  expect(second.unchanged).toHaveLength(1);
});

test("plugin: a copied plugin is reinstalled when its content changes", () => {
  const owned = apply(plan([], ["codex"]));
  writeFileSync(pluginFile(), JSON.stringify({ mcpServers: { local: { command: "tool", args: ["serve", "--v2"] } } }));
  const next = plan(owned, ["codex"]);
  expect(next.actions).toMatchObject([{ type: "update" }]);

  fx.cli.calls.length = 0;
  const after = apply(next);
  expect(fx.cli.calls).toContain("codex plugin add mcp@agents-config");
  expect(plan(after, ["codex"]).actions).toEqual([]);
});

test("plugin: uninstalls and drops the marketplace when deselected", () => {
  const owned = apply(plan([], ["codex"]));
  const removal = plan(owned, ["codex"], nothing);
  expect(removal.actions).toMatchObject([{ type: "remove", reason: "deselected" }]);

  const after = apply(removal);
  expect(after).toEqual([]);
  expect(fx.cli.state.codex.plugins.size).toBe(0);
  expect(fx.cli.state.codex.marketplaces.size).toBe(0);
});
