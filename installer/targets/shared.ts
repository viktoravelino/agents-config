import { join } from "node:path";
import { copiesPlugin, mcpPlugin, type PluginCli } from "../cli-plugin.ts";
import type { Installer } from "./types.ts";

/** `~/.agents/skills` is read by Codex, Copilot and Bob alike, so all three install skills here. */
export const agentsSkills: Installer<"skills"> = (item, { home }) => ({
  kind: "symlink",
  path: join(home, ".agents", "skills", item.name),
  source: item.source,
});

/**
 * The repo's MCP plugin, installed through the CLI's own plugin commands. The
 * plugin is all-or-nothing, so every selected server maps to this one artifact.
 */
export const mcpPluginFor =
  (cli: PluginCli): Installer<"mcp"> =>
  (_item, { repo }) => {
    const { id, marketplace, hash } = mcpPlugin(repo);
    const copied = copiesPlugin(cli);
    return {
      kind: "cli-plugin",
      path: `${cli} plugin ${id}`,
      note: `installs every MCP server in the plugin${copied ? "; reinstalled when it changes" : "; read live from the checkout"}`,
      cli,
      id,
      marketplace,
      repo,
      hash,
      copied,
    };
  };
