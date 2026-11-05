import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PluginRef } from "./cli-plugin.ts";
import { kinds, type ItemSelection } from "./catalog.ts";
import type { JsonValue } from "./targets/types.ts";

/**
 * An artifact the installer created or found in place, and may later change or
 * remove. `targets` lists every target that wanted it, since destinations
 * like ~/.agents/skills are shared.
 */
export type Owned = { targets: string[]; path: string } & (
  | { kind: "symlink"; source: string }
  /** `hash` is the sha256 of the generated content. */
  | { kind: "file"; source: string; hash: string }
  /** One key inside a user-owned JSON file, removed only while it still holds `value`. */
  | { kind: "json-setting"; keyPath: string[]; value: JsonValue }
  /** A plugin installed through a CLI; `hash` is the plugin content it was installed from. */
  | ({ kind: "cli-plugin"; hash: string } & PluginRef)
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

/** Hex sha256 of a string. */
export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Whether a parsed JSON value is a list of strings. */
export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Whether a parsed JSON value maps every kind to item names. */
function isItemSelection(value: unknown): value is ItemSelection {
  if (typeof value !== "object" || value === null) return false;
  const v: Record<string, unknown> = { ...value };
  return kinds.every((kind) => isStringList(v[kind]));
}

/** Whether a parsed JSON value has the shape of the saved state. */
function isState(value: unknown): value is State {
  if (typeof value !== "object" || value === null) return false;
  const v: Record<string, unknown> = { ...value };
  return (
    v.version === 1 &&
    isStringList(v.targets) &&
    isItemSelection(v.items) &&
    isItemSelection(v.known) &&
    Array.isArray(v.owned)
  );
}

/** Loads saved state; undefined when absent. Throws on a file it cannot understand. */
export function loadState(file: string): State | undefined {
  if (!existsSync(file)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isState(parsed)) throw new Error(`Unrecognized state file: ${file}`);
  return parsed;
}

/** Writes the state file, creating its directory. */
export function saveState(file: string, state: State): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}
