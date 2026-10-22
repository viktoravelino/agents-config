import type { Item, ItemOf, Kind } from "../catalog.ts";

/** Paths every installer derives from; tests point `home` at a temp dir. */
export type Context = { home: string; repo: string };

/** An artifact a target wants on disk. Generated files carry their content. */
export type Artifact = {
  path: string;
  source: string;
  note?: string;
} & ({ kind: "symlink" } | { kind: "file"; content: string });

export type Desired = Artifact & { target: string };

/** Maps one catalog item of a kind to the artifact it becomes for a target. */
export type Installer<K extends Kind> = (item: ItemOf<K>, ctx: Context) => Artifact;

export type Target = {
  id: string;
  label: string;
  detect(ctx: Context): Promise<boolean>;
  /** Directories whose symlinks into the repo are adopted on first run. */
  scanDirs(ctx: Context): string[];
  install: { [K in Kind]?: Installer<K> };
};

/** Builds the desired artifact for an item, or undefined when the target skips its kind. */
export function desiredFor(target: Target, item: Item, ctx: Context): Desired | undefined {
  // The mapped type cannot correlate item.kind with its installer, so dispatch per kind.
  switch (item.kind) {
    case "instructions": {
      const install = target.install.instructions;
      return install && { ...install(item, ctx), target: target.id };
    }
    case "settings": {
      const install = target.install.settings;
      return install && { ...install(item, ctx), target: target.id };
    }
    case "skills": {
      const install = target.install.skills;
      return install && { ...install(item, ctx), target: target.id };
    }
    case "agents": {
      const install = target.install.agents;
      return install && { ...install(item, ctx), target: target.id };
    }
  }
}
