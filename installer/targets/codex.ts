import { join } from "node:path";
import { toCodexToml } from "../translate/agent.ts";
import { detectBinary } from "./detect.ts";
import { agentsSkills } from "./shared.ts";
import type { Target } from "./types.ts";

/** Codex custom agents with these names replace a built-in agent. */
const builtInAgents = new Set(["default", "worker", "explorer"]);

/** Codex: symlinked instructions and skills, agents generated as TOML. */
export const codex: Target = {
  id: "codex",
  label: "Codex",
  detect: (ctx) => detectBinary("codex", ctx),
  scanDirs: ({ home }) => [join(home, ".agents", "skills")],
  install: {
    instructions: (item, { home }) => ({ kind: "symlink", path: join(home, ".codex", "AGENTS.md"), source: item.source }),
    skills: agentsSkills,
    agents: (item, { home }) => ({
      kind: "file",
      path: join(home, ".codex", "agents", `${item.name}.toml`),
      source: item.source,
      content: toCodexToml(item.definition),
      ...(builtInAgents.has(item.name) && { note: "overrides the Codex built-in agent" }),
    }),
  },
};
