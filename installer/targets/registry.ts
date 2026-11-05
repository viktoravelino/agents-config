import { kinds, type Kind } from "../catalog.ts";
import { bob } from "./bob.ts";
import { claude } from "./claude.ts";
import { codex } from "./codex.ts";
import { copilot } from "./copilot.ts";
import type { Target } from "./types.ts";

export const targets: Target[] = [claude, codex, copilot, bob];

/** Kinds that at least one of the given targets can install. */
export function installableKinds(targetIds: readonly string[]): Set<Kind> {
  const chosen = targets.filter((t) => targetIds.includes(t.id));
  return new Set(kinds.filter((kind) => chosen.some((t) => t.install[kind])));
}
