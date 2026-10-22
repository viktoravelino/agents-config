import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { appInstalled, appPath, binaryVersion, detectionOf, findBinary } from "./detect.ts";
import { agentsSkills } from "./shared.ts";
import type { Context, Target } from "./types.ts";

const vscodeApp = "Visual Studio Code.app";

/** VS Code user settings; a JSONC file the installer edits in place. */
const vscodeSettings = (home: string) => join(home, "Library", "Application Support", "Code", "User", "settings.json");

/** Copilot ships inside VS Code as a built-in extension. */
const vscodeCopilotManifest = (ctx: Context) =>
  join(appPath(ctx, vscodeApp), "Contents", "Resources", "app", "extensions", "copilot", "package.json");

/**
 * GitHub Copilot (CLI and VS Code). Skills come from ~/.agents/skills. Agents
 * are linked for the CLI; VS Code already reads ~/.claude/agents, so its read
 * of ~/.copilot/agents is switched off to avoid listing each agent twice.
 */
export const copilot: Target = {
  id: "copilot",
  label: "GitHub Copilot",
  async detect(ctx) {
    const cli = await findBinary(
      {
        bin: "copilot",
        toolDir: "github-copilot-cli",
        fixed: [join(ctx.root, "opt", "homebrew", "bin", "copilot"), join(ctx.home, ".local", "bin", "copilot")],
        reject: ["copilot-shim"],
      },
      ctx,
    );
    const version = cli && (await binaryVersion(cli));
    return detectionOf([
      cli && (version ? `CLI ${version}` : "CLI"),
      existsSync(vscodeCopilotManifest(ctx)) && "VS Code",
    ]);
  },
  scanDirs: () => [],
  install: {
    instructions: (item, { home }) => ({ kind: "symlink", path: join(home, ".copilot", "copilot-instructions.md"), source: item.source }),
    skills: agentsSkills,
    agents: (item, { home }) => ({ kind: "symlink", path: join(home, ".copilot", "agents", basename(item.source)), source: item.source }),
  },
  extras: (items, ctx) =>
    items.agents.length > 0 && appInstalled(ctx, vscodeApp)
      ? [
          {
            kind: "json-setting",
            path: vscodeSettings(ctx.home),
            keyPath: ["chat.agentFilesLocations", "~/.copilot/agents"],
            value: false,
            note: "VS Code reads ~/.claude/agents already",
          },
        ]
      : [],
};
