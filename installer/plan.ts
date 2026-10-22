import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { emptyItems, type Catalog, type ItemSelection } from "./catalog.ts";
import { sha256, type Owned } from "./state.ts";
import { desiredFor, type Context, type Desired, type Target } from "./targets/types.ts";

export const backupSuffix = ".pre-agents-config-bak";

export type Action =
  | { type: "create"; desired: Desired }
  | { type: "update"; desired: Desired }
  | { type: "remove"; owned: Owned; reason: "deselected" | "source gone" }
  /**
   * Something is in the way. `in-the-way`: a file we do not own sits at the
   * path (backed up by default). `edited`: a generated file changed since we
   * wrote it (kept by default). `backup` moves the old file aside, then writes
   * `desired`, or just removes when there is no `desired`.
   */
  | {
      type: "conflict";
      cause: "in-the-way" | "edited";
      target: string;
      path: string;
      desired?: Desired;
      owned?: Owned;
      resolution: "keep" | "backup";
    };

export type Plan = {
  actions: Action[];
  /** Desired artifacts already in place. */
  unchanged: Desired[];
};

/** Every artifact the selected targets want for the selected items. */
export function desiredArtifacts(
  catalog: Catalog,
  targetList: Target[],
  selectedTargets: string[],
  items: ItemSelection,
  ctx: Context,
): Desired[] {
  const byPath = new Map<string, Desired>();
  for (const target of targetList) {
    if (!selectedTargets.includes(target.id)) continue;
    for (const item of catalog) {
      if (!items[item.kind].includes(item.name)) continue;
      const desired = desiredFor(target, item, ctx);
      if (desired && !byPath.has(desired.path)) byPath.set(desired.path, desired);
    }
  }
  return [...byPath.values()];
}

function lstat(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

/** Compares desired artifacts with the disk and the owned records; touches nothing. */
export function computePlan(desired: Desired[], owned: Owned[], ctx: Context): Plan {
  const ownedByPath = new Map(owned.map((o) => [o.path, o]));
  const wanted = new Set(desired.map((d) => d.path));
  const actions: Action[] = [];
  const unchanged: Desired[] = [];

  for (const d of desired) {
    const stat = lstat(d.path);
    const record = ownedByPath.get(d.path);
    if (!stat) {
      actions.push({ type: "create", desired: d });
      continue;
    }
    if (d.kind === "symlink") {
      if (stat.isSymbolicLink()) {
        const dest = readlinkSync(d.path);
        if (dest === d.source) unchanged.push(d);
        else if (record || dest.startsWith(ctx.repo + "/")) actions.push({ type: "update", desired: d });
        else actions.push(inTheWay(d));
      } else {
        actions.push(inTheWay(d));
      }
      continue;
    }
    if (!stat.isFile()) {
      actions.push(inTheWay(d));
      continue;
    }
    const current = sha256(readFileSync(d.path, "utf8"));
    if (current === sha256(d.content)) unchanged.push(d);
    else if (!record) actions.push(inTheWay(d));
    else if (record.hash === current) actions.push({ type: "update", desired: d });
    else actions.push({ type: "conflict", cause: "edited", target: d.target, path: d.path, desired: d, owned: record, resolution: "keep" });
  }

  for (const o of owned) {
    if (wanted.has(o.path)) continue;
    const stat = lstat(o.path);
    if (!stat) continue;
    if (o.kind === "symlink") {
      // Only remove what is still the link we made.
      if (stat.isSymbolicLink() && readlinkSync(o.path) === o.source) {
        actions.push({ type: "remove", owned: o, reason: existsSync(o.source) ? "deselected" : "source gone" });
      }
    } else if (stat.isFile()) {
      if (sha256(readFileSync(o.path, "utf8")) === o.hash) {
        actions.push({ type: "remove", owned: o, reason: existsSync(o.source) ? "deselected" : "source gone" });
      } else {
        actions.push({ type: "conflict", cause: "edited", target: o.target, path: o.path, owned: o, resolution: "keep" });
      }
    }
  }

  return { actions, unchanged };
}

function inTheWay(d: Desired): Action {
  return { type: "conflict", cause: "in-the-way", target: d.target, path: d.path, desired: d, resolution: "backup" };
}

/**
 * Symlinks the installer would already have made: any link in a target's
 * scan dirs pointing into the repo, plus links at exactly-desired paths.
 * Used to migrate from install.sh on first run.
 */
export function adoptExisting(catalog: Catalog, targetList: Target[], ctx: Context): Owned[] {
  const found = new Map<string, Owned>();
  const consider = (target: string, path: string, expected?: string) => {
    if (path.endsWith(backupSuffix) || !lstat(path)?.isSymbolicLink()) return;
    const source = readlinkSync(path);
    const ours = expected !== undefined ? source === expected : source.startsWith(ctx.repo + "/");
    if (ours && !found.has(path)) found.set(path, { target, path, kind: "symlink", source });
  };
  for (const target of targetList) {
    for (const dir of target.scanDirs(ctx)) {
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir)) consider(target.id, join(dir, entry));
    }
    for (const item of catalog) {
      const desired = desiredFor(target, item, ctx);
      if (desired?.kind === "symlink") consider(target.id, desired.path, desired.source);
    }
  }
  return [...found.values()];
}

/** Which targets and items the adopted links already cover. */
export function selectionFromOwned(
  catalog: Catalog,
  targetList: Target[],
  owned: Owned[],
  ctx: Context,
): { targets: string[]; items: ItemSelection } {
  const paths = new Set(owned.map((o) => o.path));
  const targets = new Set<string>();
  const items = emptyItems();
  for (const target of targetList) {
    for (const item of catalog) {
      const desired = desiredFor(target, item, ctx);
      if (!desired || !paths.has(desired.path)) continue;
      targets.add(target.id);
      if (!items[item.kind].includes(item.name)) items[item.kind].push(item.name);
    }
  }
  return { targets: [...targets], items };
}

/** Joins a path under the home dir for display, e.g. `~/.claude/CLAUDE.md`. */
export function displayPath(path: string, home: string): string {
  return path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}
