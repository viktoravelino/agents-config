import { join } from "node:path";
import { appInstalled, binaryVersion, detectionOf, findBinary } from "./detect.ts";
import { agentsSkills } from "./shared.ts";
import type { Target } from "./types.ts";

const ideApps = ["IBM Bob.app", "IBM Bob - Insiders.app"];

/**
 * IBM Bob (Shell and IDE). Bob has no global AGENTS.md but reads every file in
 * ~/.bob/rules, so instructions are one link there; other files in that dir
 * are not ours. Skills come from ~/.agents/skills. No agents or settings.
 */
export const bob: Target = {
  id: "bob",
  label: "IBM Bob",
  async detect(ctx) {
    const shell = await findBinary({ bin: "bob" }, ctx);
    const version = shell && (await binaryVersion(shell));
    return detectionOf([shell && (version ? `Shell ${version}` : "Shell"), ideApps.some((app) => appInstalled(ctx, app)) && "IDE"]);
  },
  scanDirs: () => [],
  install: {
    instructions: (item, { home }) => ({ kind: "symlink", path: join(home, ".bob", "rules", "agents-config.md"), source: item.source }),
    skills: agentsSkills,
  },
};
