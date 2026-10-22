import { bob } from "./bob.ts";
import { claude } from "./claude.ts";
import { codex } from "./codex.ts";
import { copilot } from "./copilot.ts";
import type { Target } from "./types.ts";

export const targets: Target[] = [claude, codex, copilot, bob];
