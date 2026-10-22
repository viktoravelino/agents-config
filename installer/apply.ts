import { copyFileSync, lstatSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { installPlugin, spawnRunner, uninstallPlugin, type Runner } from "./cli-plugin.ts";
import { writeSetting } from "./json-setting.ts";
import { backupSuffix, type Plan } from "./plan.ts";
import { sha256, type Owned } from "./state.ts";
import type { Desired } from "./targets/types.ts";

function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Moves `path` aside, or copies it when the file must stay in place (a settings file we edit). */
function backUp(path: string, copy: boolean): void {
  if (!present(path)) return;
  let backup = path + backupSuffix;
  for (let n = 2; present(backup); n++) backup = `${path}${backupSuffix}${n}`;
  if (copy) copyFileSync(path, backup);
  else renameSync(path, backup);
}

function write(d: Desired, run: Runner): void {
  switch (d.kind) {
    case "symlink":
      mkdirSync(dirname(d.path), { recursive: true });
      if (present(d.path)) rmSync(d.path);
      symlinkSync(d.source, d.path);
      break;
    case "file":
      mkdirSync(dirname(d.path), { recursive: true });
      writeFileSync(d.path, d.content);
      break;
    case "json-setting":
      writeSetting(d.path, d.keyPath, d.value);
      break;
    case "cli-plugin":
      installPlugin(d, run);
      break;
  }
}

function toOwned(d: Desired): Owned {
  const base = { targets: d.targets, path: d.path };
  switch (d.kind) {
    case "file":
      return { ...base, kind: "file", source: d.source, hash: sha256(d.content) };
    case "symlink":
      return { ...base, kind: "symlink", source: d.source };
    case "json-setting":
      return { ...base, kind: "json-setting", keyPath: d.keyPath, value: d.value };
    case "cli-plugin":
      return { ...base, kind: "cli-plugin", cli: d.cli, id: d.id, marketplace: d.marketplace, repo: d.repo, hash: d.hash };
  }
}

/** Raised after a plan finished when some write failed; `owned` is what the installer owns regardless. */
export class ApplyError extends Error {
  constructor(
    readonly failures: string[],
    readonly owned: Owned[],
  ) {
    super(failures.join("\n"));
  }
}

/**
 * Executes a plan and returns the artifacts the installer owns afterwards.
 * A failing write (e.g. a plugin CLI command) does not stop the rest of the
 * plan; it is reported by throwing an ApplyError at the end.
 */
export function applyPlan(plan: Plan, run: Runner = spawnRunner): Owned[] {
  const owned = plan.unchanged.map(toOwned);
  const failures: string[] = [];
  /** Failures are collected so the other artifacts still land. */
  const attempt = (label: string, fn: () => void): boolean => {
    try {
      fn();
      return true;
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
  for (const action of plan.actions) {
    switch (action.type) {
      case "create":
      case "update":
        if (attempt(action.desired.path, () => write(action.desired, run))) owned.push(toOwned(action.desired));
        break;
      case "remove":
        if (action.owned.kind === "json-setting") writeSetting(action.owned.path, action.owned.keyPath, undefined);
        else if (action.owned.kind === "cli-plugin") {
          const ref = action.owned;
          if (!attempt(ref.path, () => uninstallPlugin(ref, run))) owned.push(ref);
        } else rmSync(action.owned.path);
        break;
      case "conflict":
        if (action.resolution === "keep") {
          if (action.owned) owned.push(action.owned);
          break;
        }
        backUp(action.path, action.desired?.kind === "json-setting");
        if (action.desired) {
          write(action.desired, run);
          owned.push(toOwned(action.desired));
        }
        break;
    }
  }
  if (failures.length) throw new ApplyError(failures, owned);
  return owned;
}
