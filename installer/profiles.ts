import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { emptyItems, kinds, type Catalog, type ItemSelection, type Kind } from "./catalog.ts";

/** A partial selection: targets plus item names per kind, or "all" of a kind. */
export type Profile = {
  targets: string[];
  items: Partial<Record<Kind, string[] | "all">>;
};

export type Selection = { targets: string[]; items: ItemSelection };

/** Reads `profiles/*.json`, keyed by file name without extension. */
export function loadProfiles(repo: string): Record<string, Profile> {
  const dir = join(repo, "profiles");
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file): [string, Profile] => [
        basename(file, ".json"),
        JSON.parse(readFileSync(join(dir, file), "utf8")),
      ]),
  );
}

/** Expands a profile against what the repo actually contains. */
export function profileSelection(profile: Profile, catalog: Catalog): Selection {
  const items = emptyItems();
  for (const kind of kinds) {
    const wanted = profile.items[kind];
    const available = catalog.filter((i) => i.kind === kind).map((i) => i.name);
    items[kind] = wanted === "all" ? available : available.filter((n) => wanted?.includes(n));
  }
  return { targets: profile.targets, items };
}

/** Union of two selections, keeping order. */
export function mergeSelections(a: Selection, b: Selection): Selection {
  const union = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  const items = emptyItems();
  for (const kind of kinds) items[kind] = union(a.items[kind], b.items[kind]);
  return { targets: union(a.targets, b.targets), items };
}

/**
 * Picks the profile that best fits the detected tools. Score is detected
 * targets minus missing targets. Ties go to more detected targets, then to
 * the first name alphabetically.
 */
export function suggestProfile(
  profiles: Record<string, Profile>,
  detectedTargetIds: ReadonlySet<string>,
): string | undefined {
  const ranked = Object.entries(profiles).map(([name, profile]) => {
    const hits = profile.targets.filter((id) => detectedTargetIds.has(id)).length;
    return { name, hits, score: hits - (profile.targets.length - hits) };
  });
  ranked.sort((a, b) => b.score - a.score || b.hits - a.hits || a.name.localeCompare(b.name));
  return ranked[0]?.name;
}
