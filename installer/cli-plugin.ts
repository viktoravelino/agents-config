import { createHash } from "node:crypto";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";

export type CommandResult = { code: number; stdout: string; stderr: string };

/** Runs a command to completion. Tests inject a fake; a missing binary is exit code 127. */
export type Runner = (command: string, args: string[]) => CommandResult;

export const spawnRunner: Runner = (command, args) => {
  try {
    const result = Bun.spawnSync([command, ...args], { stdin: "ignore" });
    return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  } catch (error) {
    return { code: 127, stdout: "", stderr: String(error) };
  }
};

export type PluginCli = "codex" | "copilot";

/** A plugin installed through a CLI's own `plugin` commands from this repo's marketplace. */
export type PluginRef = {
  cli: PluginCli;
  /** `<plugin>@<marketplace>` */
  id: string;
  marketplace: string;
  /** The checkout the marketplace points at. */
  repo: string;
};

function json(result: CommandResult): unknown {
  if (result.code !== 0) return undefined;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null) : [];
}

type CliSpec = {
  /** Codex copies the plugin into a cache, so edits need a reinstall; Copilot reads the checkout live. */
  copied: boolean;
  /** Ids of the plugins that are installed and enabled. */
  active(run: Runner): string[];
  /** Registered marketplaces: name to source path (undefined when the source is not a local path). */
  marketplaces(run: Runner): Map<string, string | undefined>;
  install: string[];
  uninstall: string[];
};

const specs: Record<PluginCli, CliSpec> = {
  codex: {
    copied: true,
    active: (run) => {
      const parsed = json(run("codex", ["plugin", "list", "--json"]));
      const installed = typeof parsed === "object" && parsed !== null && "installed" in parsed ? records(parsed.installed) : [];
      return installed.flatMap((p) => (typeof p.pluginId === "string" && p.enabled !== false ? [p.pluginId] : []));
    },
    marketplaces: (run) => {
      const parsed = json(run("codex", ["plugin", "marketplace", "list", "--json"]));
      const list = typeof parsed === "object" && parsed !== null && "marketplaces" in parsed ? records(parsed.marketplaces) : [];
      return new Map(
        list.flatMap((m) => {
          const source = typeof m.marketplaceSource === "object" && m.marketplaceSource !== null && "source" in m.marketplaceSource ? m.marketplaceSource.source : undefined;
          return typeof m.name === "string" ? [[m.name, typeof source === "string" ? source : undefined] as const] : [];
        }),
      );
    },
    install: ["plugin", "add"],
    uninstall: ["plugin", "remove"],
  },
  copilot: {
    copied: false,
    active: (run) =>
      records(json(run("copilot", ["plugin", "list", "--json"]))).flatMap((p) =>
        typeof p.name === "string" && typeof p.marketplace === "string" && p.marketplace && p.enabled === true ? [`${p.name}@${p.marketplace}`] : [],
      ),
    marketplaces: (run) =>
      new Map(
        records(json(run("copilot", ["plugin", "marketplace", "list", "--json"]))).flatMap((m) =>
          typeof m.name === "string" ? [[m.name, typeof m.source === "string" ? m.source.replace(/^Local: /, "") : undefined] as const] : [],
        ),
      ),
    install: ["plugin", "install"],
    uninstall: ["plugin", "uninstall"],
  },
};

/** Whether installing a changed plugin needs a reinstall for the CLI to see it. */
export const copiesPlugin = (cli: PluginCli) => specs[cli].copied;

/** Whether the plugin is installed and enabled right now. */
export function pluginActive(ref: PluginRef, run: Runner): boolean {
  return specs[ref.cli].active(run).includes(ref.id);
}

function must(run: Runner, command: string, args: string[]): void {
  const result = run(command, args);
  if (result.code !== 0) {
    throw new Error(`\`${command} ${args.join(" ")}\` failed (${result.code}): ${(result.stderr || result.stdout).trim()}`);
  }
}

function samePath(a: string, b: string): boolean {
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  return real(a) === real(b);
}

/**
 * Registers the repo as a marketplace when needed, then installs (or
 * refreshes) the plugin. Throws when the marketplace name already points
 * somewhere else.
 */
export function installPlugin(ref: PluginRef, run: Runner): void {
  const spec = specs[ref.cli];
  const registered = spec.marketplaces(run);
  if (!registered.has(ref.marketplace)) {
    must(run, ref.cli, ["plugin", "marketplace", "add", ref.repo]);
  } else {
    const source = registered.get(ref.marketplace);
    if (source === undefined || !samePath(source, ref.repo)) {
      throw new Error(`${ref.cli} marketplace "${ref.marketplace}" already points at ${source ?? "another source"}, not ${ref.repo}`);
    }
  }
  must(run, ref.cli, [...spec.install, ref.id]);
}

/** Uninstalls the plugin, then drops the marketplace registration if it is the one we made. */
export function uninstallPlugin(ref: PluginRef, run: Runner): void {
  const spec = specs[ref.cli];
  must(run, ref.cli, [...spec.uninstall, ref.id]);
  const source = spec.marketplaces(run).get(ref.marketplace);
  if (source !== undefined && samePath(source, ref.repo)) {
    must(run, ref.cli, ["plugin", "marketplace", "remove", ref.marketplace]);
  }
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]));
}

/** The repo's MCP plugin: its ids and a content hash over the plugin directory and the marketplace manifest. */
export function mcpPlugin(repo: string): { id: string; marketplace: string; hash: string } {
  const manifest = join(repo, ".claude-plugin", "marketplace.json");
  const marketplace: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  const name = typeof marketplace === "object" && marketplace !== null && "name" in marketplace ? marketplace.name : undefined;
  if (typeof name !== "string") throw new Error(`${manifest} has no name`);
  const plugin = JSON.parse(readFileSync(join(repo, "shared", "plugins", "mcp", ".claude-plugin", "plugin.json"), "utf8")) as { name?: unknown };
  if (typeof plugin.name !== "string") throw new Error("shared/plugins/mcp/.claude-plugin/plugin.json has no name");

  const hash = createHash("sha256");
  for (const file of [manifest, ...filesUnder(join(repo, "shared", "plugins", "mcp"))]) {
    hash.update(relative(repo, file)).update("\0").update(readFileSync(file)).update("\0");
  }
  return { id: `${plugin.name}@${name}`, marketplace: name, hash: hash.digest("hex") };
}
