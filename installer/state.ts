import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ItemSelection } from "./catalog.ts";
import type { JsonValue } from "./targets/types.ts";

/**
 * An artifact the installer created or adopted, and may later change or
 * remove. `targets` lists every target that wanted it, since destinations
 * like ~/.agents/skills are shared.
 */
export type Owned = { targets: string[]; path: string } & (
  | { kind: "symlink"; source: string }
  /** `hash` is the sha256 of the generated content. */
  | { kind: "file"; source: string; hash: string }
  /** One key inside a user-owned JSON file, removed only while it still holds `value`. */
  | { kind: "json-setting"; keyPath: string[]; value: JsonValue }
);

export type State = {
  version: 1;
  profile?: string;
  targets: string[];
  items: ItemSelection;
  /** Every item that existed in the repo at the last run, to spot new ones. */
  known: ItemSelection;
  owned: Owned[];
};

/** `$XDG_CONFIG_HOME/agents-config/state.json`, falling back to `$HOME/.config`. */
export function statePath(home: string, xdgConfigHome = process.env.XDG_CONFIG_HOME): string {
  return join(xdgConfigHome || join(home, ".config"), "agents-config", "state.json");
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isItemSelection(value: unknown): value is ItemSelection {
  if (typeof value !== "object" || value === null) return false;
  return (["instructions", "skills", "agents", "settings"] as const).every(
    (kind) => kind in value && isStringList((value as Record<string, unknown>)[kind]),
  );
}

function isState(value: unknown): value is State {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    isStringList(v.targets) &&
    isItemSelection(v.items) &&
    isItemSelection(v.known) &&
    Array.isArray(v.owned)
  );
}

/** Older state recorded a single `target` per owned artifact. */
function migrateOwned(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("target" in value) || "targets" in value) return value;
  const { target, ...rest } = value;
  return { ...rest, targets: [target] };
}

/** Loads saved state; undefined when absent. Throws on a file it cannot understand. */
export function loadState(file: string): State | undefined {
  if (!existsSync(file)) return undefined;
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const parsed =
    typeof raw === "object" && raw !== null && "owned" in raw && Array.isArray(raw.owned)
      ? { ...raw, owned: raw.owned.map(migrateOwned) }
      : raw;
  if (!isState(parsed)) throw new Error(`Unrecognized state file: ${file}`);
  return parsed;
}

export function saveState(file: string, state: State): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}
