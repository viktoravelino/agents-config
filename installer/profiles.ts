import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { emptyItems, kinds, type Catalog, type ItemSelection, type Kind } from "./catalog.ts";
import { isStringList } from "./state.ts";

/** A partial selection: targets plus item names per kind, or "all" of a kind. */
export type Profile = {
  targets: string[];
  items: Partial<Record<Kind, string[] | "all">>;
};

export type Selection = { targets: string[]; items: ItemSelection };

/** Whether a parsed JSON value has the shape of a profile. */
function isProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null || !("targets" in value) || !("items" in value)) return false;
  const { targets, items } = value;
  return (
    isStringList(targets) &&
    typeof items === "object" &&
    items !== null &&
    Object.values(items).every((names) => names === "all" || isStringList(names))
  );
}

/** Reads `profiles/*.json`, keyed by file name without extension. Throws on a file that is not a profile. */
export function loadProfiles(repo: string): Record<string, Profile> {
  const dir = join(repo, "profiles");
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => {
        const path = join(dir, file);
        const profile: unknown = JSON.parse(readFileSync(path, "utf8"));
        if (!isProfile(profile)) throw new Error(`Unrecognized profile: ${path}`);
        return [basename(file, ".json"), profile] as const;
      }),
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

/**
 * Suggests the profile with the most targets among those whose targets are
 * all detected. Undefined when no profile fits.
 */
export function suggestProfile(
  profiles: Record<string, Profile>,
  detectedTargetIds: ReadonlySet<string>,
): string | undefined {
  const fits = Object.entries(profiles).filter(([, p]) => p.targets.every((id) => detectedTargetIds.has(id)));
  return fits.sort(([, a], [, b]) => b.targets.length - a.targets.length)[0]?.[0];
}
