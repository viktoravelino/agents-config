import { lstatSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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

function backUp(path: string): void {
  if (!present(path)) return;
  let backup = path + backupSuffix;
  for (let n = 2; present(backup); n++) backup = `${path}${backupSuffix}${n}`;
  renameSync(path, backup);
}

function write(d: Desired): void {
  mkdirSync(dirname(d.path), { recursive: true });
  if (d.kind === "symlink") {
    if (present(d.path)) rmSync(d.path);
    symlinkSync(d.source, d.path);
  } else {
    writeFileSync(d.path, d.content);
  }
}

function toOwned(d: Desired): Owned {
  return d.kind === "file"
    ? { target: d.target, path: d.path, kind: "file", source: d.source, hash: sha256(d.content) }
    : { target: d.target, path: d.path, kind: "symlink", source: d.source };
}

/** Executes a plan and returns the artifacts the installer owns afterwards. */
export function applyPlan(plan: Plan): Owned[] {
  const owned = plan.unchanged.map(toOwned);
  for (const action of plan.actions) {
    switch (action.type) {
      case "create":
      case "update":
        write(action.desired);
        owned.push(toOwned(action.desired));
        break;
      case "remove":
        rmSync(action.owned.path);
        break;
      case "conflict":
        if (action.resolution === "keep") {
          if (action.owned) owned.push(action.owned);
          break;
        }
        backUp(action.path);
        if (action.desired) {
          write(action.desired);
          owned.push(toOwned(action.desired));
        }
        break;
    }
  }
  return owned;
}
