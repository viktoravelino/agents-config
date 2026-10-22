import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { emptyItems, type Catalog, type ItemSelection } from "./catalog.ts";
import { readSetting } from "./json-setting.ts";
import { sha256, type Owned } from "./state.ts";
import { artifactFor, type Artifact, type Context, type Desired, type Target } from "./targets/types.ts";

export const backupSuffix = ".pre-agents-config-bak";

export type Action =
  | { type: "create"; desired: Desired }
  | { type: "update"; desired: Desired }
  | { type: "remove"; owned: Owned; reason: "deselected" | "source gone" }
  /**
   * Something is in the way. `in-the-way`: a file we do not own sits at the
   * path (backed up by default). `edited`: a generated file changed since we
   * wrote it (kept by default). `backup` moves the old file aside, then writes
   * `desired`, or just removes when there is no `desired`. A json-setting
   * whose key holds another value is `edited`; backing it up copies the file.
   */
  | {
      type: "conflict";
      cause: "in-the-way" | "edited";
      targets: string[];
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

/**
 * Every artifact the selected targets want for the selected items. Targets
 * that want the same path (e.g. ~/.agents/skills/<name>) share one artifact.
 */
export function desiredArtifacts(
  catalog: Catalog,
  targetList: Target[],
  selectedTargets: string[],
  items: ItemSelection,
  ctx: Context,
): Desired[] {
  const byPath = new Map<string, Desired>();
  const add = (artifact: Artifact, id: string) => {
    const existing = byPath.get(artifact.path);
    if (!existing) byPath.set(artifact.path, { ...artifact, targets: [id] });
    else if (!existing.targets.includes(id)) existing.targets.push(id);
  };
  for (const target of targetList) {
    if (!selectedTargets.includes(target.id)) continue;
    for (const item of catalog) {
      if (!items[item.kind].includes(item.name)) continue;
      const artifact = artifactFor(target, item, ctx);
      if (artifact) add(artifact, target.id);
    }
    for (const artifact of target.extras?.(items, ctx) ?? []) add(artifact, target.id);
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
    if (d.kind === "json-setting") {
      const current = stat ? readSetting(d.path, d.keyPath) : undefined;
      if (current === undefined) actions.push({ type: "create", desired: d });
      else if (isDeepStrictEqual(current, d.value)) unchanged.push(d);
      else actions.push({ type: "conflict", cause: "edited", targets: d.targets, path: d.path, desired: d, owned: record, resolution: "keep" });
      continue;
    }
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
    else if (record.kind === "file" && record.hash === current) actions.push({ type: "update", desired: d });
    else actions.push({ type: "conflict", cause: "edited", targets: d.targets, path: d.path, desired: d, owned: record, resolution: "keep" });
  }

  for (const o of owned) {
    if (wanted.has(o.path)) continue;
    const stat = lstat(o.path);
    if (!stat) continue;
    switch (o.kind) {
      case "symlink":
        // Only remove what is still the link we made.
        if (stat.isSymbolicLink() && readlinkSync(o.path) === o.source) {
          actions.push({ type: "remove", owned: o, reason: existsSync(o.source) ? "deselected" : "source gone" });
        }
        break;
      case "file":
        if (!stat.isFile()) break;
        if (sha256(readFileSync(o.path, "utf8")) === o.hash) {
          actions.push({ type: "remove", owned: o, reason: existsSync(o.source) ? "deselected" : "source gone" });
        } else {
          actions.push({ type: "conflict", cause: "edited", targets: o.targets, path: o.path, owned: o, resolution: "keep" });
        }
        break;
      case "json-setting":
        // A key the user changed or removed is theirs now; leave it.
        if (stillHolds(o.path, o.keyPath, o.value)) actions.push({ type: "remove", owned: o, reason: "deselected" });
        break;
    }
  }

  return { actions, unchanged };
}

function stillHolds(path: string, keyPath: string[], value: unknown): boolean {
  try {
    return isDeepStrictEqual(readSetting(path, keyPath), value);
  } catch {
    return false;
  }
}

function inTheWay(d: Desired): Action {
  return { type: "conflict", cause: "in-the-way", targets: d.targets, path: d.path, desired: d, resolution: "backup" };
}

/**
 * Symlinks the installer would already have made: any link in a target's
 * scan dirs pointing into the repo, plus links at exactly-desired paths.
 * Used to migrate from install.sh on first run.
 */
export function adoptExisting(catalog: Catalog, targetList: Target[], ctx: Context): Owned[] {
  const found = new Map<string, Owned>();
  const consider = (targetId: string, path: string, expected?: string) => {
    if (path.endsWith(backupSuffix) || !lstat(path)?.isSymbolicLink()) return;
    const source = readlinkSync(path);
    const ours = expected !== undefined ? source === expected : source.startsWith(ctx.repo + "/");
    if (ours && !found.has(path)) found.set(path, { targets: [targetId], path, kind: "symlink", source });
  };
  for (const target of targetList) {
    for (const dir of target.scanDirs(ctx)) {
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir)) consider(target.id, join(dir, entry));
    }
    for (const item of catalog) {
      const artifact = artifactFor(target, item, ctx);
      if (artifact?.kind === "symlink") consider(target.id, artifact.path, artifact.source);
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
  // Shared destinations are adopted under the first target that scans them, so match on that.
  const ownedBy = new Map(owned.map((o) => [o.path, o.targets] as const));
  const targets = new Set<string>();
  const items = emptyItems();
  for (const target of targetList) {
    for (const item of catalog) {
      const artifact = artifactFor(target, item, ctx);
      if (!artifact || !ownedBy.get(artifact.path)?.includes(target.id)) continue;
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
