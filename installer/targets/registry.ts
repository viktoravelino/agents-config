import { claude } from "./claude.ts";
import { codex } from "./codex.ts";
import type { Target } from "./types.ts";

export const targets: Target[] = [claude, codex];

/** Shown disabled in the target list until their adapters exist. */
export const upcomingTargets = [
  { id: "copilot", label: "GitHub Copilot" },
  { id: "bob", label: "IBM Bob" },
] as const;
