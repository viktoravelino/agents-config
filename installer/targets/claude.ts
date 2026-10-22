import { basename, join } from "node:path";
import { detectBinary } from "./detect.ts";
import type { Target } from "./types.ts";

/** Claude Code: everything is a symlink into the repo. */
export const claude: Target = {
  id: "claude",
  label: "Claude Code",
  detect: (ctx) => detectBinary("claude", ctx),
  scanDirs: ({ home }) => [join(home, ".claude", "skills"), join(home, ".claude", "agents")],
  install: {
    instructions: (item, { home }) => ({ kind: "symlink", path: join(home, ".claude", "CLAUDE.md"), source: item.source }),
    settings: (item, { home }) => ({ kind: "symlink", path: join(home, ".claude", "settings.json"), source: item.source }),
    skills: (item, { home }) => ({ kind: "symlink", path: join(home, ".claude", "skills", item.name), source: item.source }),
    agents: (item, { home }) => ({ kind: "symlink", path: join(home, ".claude", "agents", basename(item.source)), source: item.source }),
  },
};
