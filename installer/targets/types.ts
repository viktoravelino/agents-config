import type { Item, ItemOf, ItemSelection, Kind } from "../catalog.ts";

/**
 * Everything the installer derives paths and detection from. Tests point
 * `home` at a temp dir, `root` at a fake filesystem root (for /Applications,
 * /opt/homebrew) and `path` at a dir of fake binaries.
 */
export type Context = { home: string; repo: string; root: string; path: string };

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * An artifact a target wants on disk. Generated files carry their content; a
 * json-setting is one key inside a user-owned JSON(C) file.
 */
export type Artifact = {
  path: string;
  note?: string;
} & (
  | { kind: "symlink"; source: string }
  | { kind: "file"; source: string; content: string }
  | { kind: "json-setting"; keyPath: string[]; value: JsonValue }
);

/** An artifact plus every selected target that wants it (shared destinations list several). */
export type Desired = Artifact & { targets: string[] };

/** What detection learned about a tool; `hint` names the consumers found, e.g. "CLI 1.0.102 + VS Code". */
export type Detection = { hint?: string };

/** Maps one catalog item of a kind to the artifact it becomes for a target. */
export type Installer<K extends Kind> = (item: ItemOf<K>, ctx: Context) => Artifact;

export type Target = {
  id: string;
  label: string;
  /** Undefined when the tool is not installed. */
  detect(ctx: Context): Promise<Detection | undefined>;
  /** Directories whose symlinks into the repo are adopted on first run. */
  scanDirs(ctx: Context): string[];
  install: { [K in Kind]?: Installer<K> };
  /** Artifacts that depend on the whole selection rather than on one item. */
  extras?(items: ItemSelection, ctx: Context): Artifact[];
};

/** Builds the artifact for an item, or undefined when the target skips its kind. */
export function artifactFor(target: Target, item: Item, ctx: Context): Artifact | undefined {
  // The mapped type cannot correlate item.kind with its installer, so dispatch per kind.
  switch (item.kind) {
    case "instructions": {
      const install = target.install.instructions;
      return install && install(item, ctx);
    }
    case "settings": {
      const install = target.install.settings;
      return install && install(item, ctx);
    }
    case "skills": {
      const install = target.install.skills;
      return install && install(item, ctx);
    }
    case "agents": {
      const install = target.install.agents;
      return install && install(item, ctx);
    }
  }
}
