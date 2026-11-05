import { copyFileSync, lstatSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { installPlugin, spawnRunner, uninstallPlugin, type Runner } from "./cli-plugin.ts";
import { writeSetting } from "./json-setting.ts";
import { backupSuffix, type Plan } from "./plan.ts";
import { sha256, type Owned } from "./state.ts";
import type { Desired } from "./targets/types.ts";

/** Whether anything (also a dangling symlink) exists at `path`. */
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

/** Puts one desired artifact in place. */
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

/** The record the installer keeps for an artifact it put in place. */
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

/** What a plan run leaves behind: the artifacts the installer owns, and one line per failed step. */
export type ApplyResult = { owned: Owned[]; failures: string[] };

/** Undoes one owned artifact. */
function remove(o: Owned, run: Runner): void {
  switch (o.kind) {
    case "json-setting":
      writeSetting(o.path, o.keyPath, undefined);
      break;
    case "cli-plugin":
      uninstallPlugin(o, run);
      break;
    case "symlink":
    case "file":
      rmSync(o.path);
      break;
  }
}

/**
 * Executes a plan and returns what the installer owns afterwards. A failing
 * step (for example a plugin CLI command) does not stop the rest of the plan.
 * A failed step keeps its old record, so the next run tries it again.
 */
export function applyPlan(plan: Plan, run: Runner): ApplyResult {
  const owned = [...plan.unchanged.map(toOwned), ...plan.kept];
  const failures: string[] = [];
  /** Runs one step and records its failure; true when it succeeded. */
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
        if (!attempt(action.owned.path, () => remove(action.owned, run))) owned.push(action.owned);
        break;
      case "conflict": {
        const { desired, owned: record } = action;
        const done =
          action.resolution === "backup" &&
          attempt(action.path, () => {
            backUp(action.path, desired?.kind === "json-setting");
            if (desired) write(desired, run);
          });
        if (done && desired) owned.push(toOwned(desired));
        else if (!done && record) owned.push(record);
        break;
      }
    }
  }
  return { owned, failures };
}
