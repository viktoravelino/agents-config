import { join } from "node:path";
import type { Installer } from "./types.ts";

/** `~/.agents/skills` is read by Codex, Copilot and Bob alike, so all three install skills here. */
export const agentsSkills: Installer<"skills"> = (item, { home }) => ({
  kind: "symlink",
  path: join(home, ".agents", "skills", item.name),
  source: item.source,
});
