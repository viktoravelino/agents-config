import { styleText } from "node:util";
import type { Catalog } from "./catalog.ts";
import { displayPath, type Action, type Plan } from "./plan.ts";

const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (format: Parameters<typeof styleText>[0], text: string) => (color ? styleText(format, text) : text);

/** Maps each skill's source dir to the skill that pulled it in, for "(via x)" notes. */
export function viaBySource(catalog: Catalog, via: Map<string, string>): Map<string, string> {
  return new Map(
    catalog.flatMap((item) => {
      const parent = item.kind === "skills" ? via.get(item.name) : undefined;
      return parent ? [[item.source, parent] as const] : [];
    }),
  );
}

/** Display name of an artifact; a setting inside a shared JSON file also names its key. */
function labelOf(a: { path: string; kind: string; keyPath?: string[] }, home: string): string {
  return displayPath(a.path, home) + (a.kind === "json-setting" && a.keyPath ? ` [${a.keyPath.join(".")}]` : "");
}

function line(action: Action, home: string, via: Map<string, string>): string {
  switch (action.type) {
    case "create":
    case "update": {
      const { desired } = action;
      const notes = [
        desired.note,
        "source" in desired && via.has(desired.source) ? `via ${via.get(desired.source)}` : undefined,
      ].filter(Boolean);
      const glyph = action.type === "create" ? paint("green", "+") : paint("yellow", "~");
      return `${glyph} ${labelOf(desired, home)}${notes.length ? paint("dim", `  (${notes.join("; ")})`) : ""}`;
    }
    case "remove":
      return `${paint("red", "-")} ${labelOf(action.owned, home)}${paint("dim", `  (${action.reason})`)}`;
    case "conflict": {
      const setting = action.desired?.kind === "json-setting";
      const what =
        action.cause === "in-the-way"
          ? "real file in the way, will be backed up"
          : `${setting ? "setting has another value" : "edited since last install"}, ${action.resolution === "keep" ? "kept" : "will be overwritten, old copy backed up"}`;
      return `${paint("yellow", "!")} ${displayPath(action.path, home)}${paint("dim", `  (${what})`)}`;
    }
  }
}

function targetsOf(action: Action): string[] {
  switch (action.type) {
    case "create":
    case "update":
      return action.desired.targets;
    case "remove":
      return action.owned.targets;
    case "conflict":
      return action.targets;
  }
}

/**
 * Prints the plan grouped by the targets each line serves; unchanged
 * artifacts are only counted. Lines shared by several targets (skills in
 * ~/.agents/skills) appear once, under a "Shared (...)" group listed last.
 */
export function renderPlan(
  plan: Plan,
  labels: Map<string, string>,
  home: string,
  via: Map<string, string>,
): void {
  const groups = new Map<string, string[]>();
  for (const targets of [...plan.actions.map(targetsOf), ...plan.unchanged.map((d) => d.targets)]) {
    groups.set(targets.join(","), targets);
  }
  const ordered = [...groups.entries()].sort(([, a], [, b]) => Number(a.length > 1) - Number(b.length > 1));
  for (const [key, targets] of ordered) {
    const names = targets.map((id) => labels.get(id) ?? id);
    console.log(`\n${paint("bold", targets.length > 1 ? `Shared (${names.join(", ")})` : names[0]!)}`);
    for (const action of plan.actions.filter((a) => targetsOf(a).join(",") === key)) {
      console.log(`  ${line(action, home, via)}`);
    }
    const same = plan.unchanged.filter((d) => d.targets.join(",") === key).length;
    if (same) console.log(paint("dim", `  = ${same} unchanged`));
  }
  if (groups.size === 0) console.log("\nNothing selected.");
}

/** One-line tally, e.g. "2 created · 1 removed · 14 unchanged". */
export function summarize(plan: Plan): string {
  const count = (pred: (a: Action) => boolean) => plan.actions.filter(pred).length;
  const backedUp = count(
    (a) => a.type === "conflict" && a.resolution === "backup",
  );
  return [
    `${count((a) => a.type === "create")} created`,
    `${count((a) => a.type === "update")} updated`,
    `${count((a) => a.type === "remove")} removed`,
    `${plan.unchanged.length} unchanged`,
    ...(backedUp ? [`${backedUp} backed up`] : []),
  ].join(" · ");
}
