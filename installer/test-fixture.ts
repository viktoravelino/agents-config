import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { PluginCli, Runner } from "./cli-plugin.ts";
import { discoverCatalog, type ItemSelection } from "./catalog.ts";
import { computePlan, wantedArtifacts, type Plan } from "./plan.ts";
import type { Owned } from "./state.ts";
import { targets } from "./targets/registry.ts";
import type { Context } from "./targets/types.ts";

/** What the fake `codex` and `copilot` CLIs remember between commands. */
type CliState = { plugins: Set<string>; marketplaces: Map<string, string> };

/**
 * An in-memory `codex` and `copilot` that answer the plugin commands the
 * installer runs, in each CLI's own JSON format. Remove a name from
 * `runnable` to make that CLI missing (exit code 127).
 */
export function fakeCli() {
  const runnable = new Set<string>(["codex", "copilot"]);
  const calls: string[] = [];
  const state: Record<PluginCli, CliState> = {
    codex: { plugins: new Set(), marketplaces: new Map() },
    copilot: { plugins: new Set(), marketplaces: new Map() },
  };
  const ok = (value: unknown) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });

  const run: Runner = (command, args) => {
    calls.push(`${command} ${args.join(" ")}`);
    if ((command !== "codex" && command !== "copilot") || !runnable.has(command)) {
      return { code: 127, stdout: "", stderr: "not found" };
    }
    if (args[0] === "--version") return ok("1.0.0");
    const cli = state[command];
    const [, verb, arg, extra] = args;
    if (verb === "marketplace") {
      if (arg === "add" && extra) cli.marketplaces.set("agents-config", extra);
      if (arg === "remove" && extra) cli.marketplaces.delete(extra);
      const list = [...cli.marketplaces];
      return ok(
        command === "codex"
          ? { marketplaces: list.map(([name, source]) => ({ name, marketplaceSource: { source } })) }
          : list.map(([name, source]) => ({ name, source })),
      );
    }
    if (arg && (verb === "add" || verb === "install")) cli.plugins.add(arg);
    if (arg && (verb === "remove" || verb === "uninstall")) cli.plugins.delete(arg);
    const ids = [...cli.plugins];
    return ok(
      command === "codex"
        ? { installed: ids.map((pluginId) => ({ pluginId, enabled: true })) }
        : ids.map((id) => ({ name: id.split("@")[0], marketplace: id.split("@")[1], enabled: true })),
    );
  };
  return { run, runnable, calls, state };
}

export type Fixture = { root: string; ctx: Context; cli: ReturnType<typeof fakeCli> };

/** Writes a file and the folders above it. */
export function put(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * A temp dir with a small repo (instructions, skill `alpha`, agent `helper`,
 * an MCP plugin with servers `local` and `remote`), an empty home, an empty
 * bin dir on PATH, and the fake CLIs as the runner.
 */
export function createFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "agents-config-test-"));
  const repo = join(root, "repo");
  const plugin = join(repo, "shared", "plugins", "mcp");
  put(join(repo, "shared", "instructions.md"), "hi\n");
  put(join(repo, "shared", "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: A\n---\n");
  put(join(repo, "shared", "agents", "helper.md"), "---\nname: helper\ndescription: Helps\n---\nHelp.\n");
  put(join(repo, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "agents-config", plugins: [{ name: "mcp", source: "./shared/plugins/mcp" }] }));
  put(join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "mcp" }));
  put(
    join(plugin, ".mcp.json"),
    JSON.stringify({ mcpServers: { local: { command: "tool", args: ["serve"] }, remote: { type: "http", url: "https://example.test/mcp" } } }),
  );
  mkdirSync(join(root, "home"));
  mkdirSync(join(root, "bin"));
  const cli = fakeCli();
  return { root, cli, ctx: { home: join(root, "home"), repo, root: join(root, "fs"), path: join(root, "bin"), run: cli.run } };
}

/** Deletes the fixture's temp dir. */
export function removeFixture(fixture: Fixture): void {
  rmSync(fixture.root, { recursive: true, force: true });
}

/** Instructions, the skill and the agent; no settings or MCP servers. */
export const everything: ItemSelection = { instructions: ["instructions"], skills: ["alpha"], agents: ["helper"], settings: [], mcp: [] };

/** No items at all. */
export const nothing: ItemSelection = { instructions: [], skills: [], agents: [], settings: [], mcp: [] };

/** Plans `items` for the `selected` targets the way main.ts does. By default every target counts as detected. */
export function planFor(
  ctx: Context,
  owned: Owned[],
  selected: string[],
  items: ItemSelection,
  detected: ReadonlySet<string> = new Set(targets.map((t) => t.id)),
): Plan {
  return computePlan(wantedArtifacts(discoverCatalog(ctx.repo), targets, selected, items, ctx, detected), owned, ctx);
}
