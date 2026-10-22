import { cancel, groupMultiselect, isCancel, log, multiselect, select } from "@clack/prompts";
import { emptyItems, withRequires, type Catalog, type Item, type Kind, type SkillGroup } from "./catalog.ts";
import type { Profile, Selection } from "./profiles.ts";
import { targets } from "./targets/registry.ts";
import type { Context, Detection, Target } from "./targets/types.ts";

/** Unwraps a prompt result, exiting cleanly when the user cancels. */
function answer<T>(value: T): Exclude<T, symbol> {
  if (typeof value === "symbol" || isCancel(value)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

const short = (text: string) => (text.length > 70 ? text.slice(0, 67) + "..." : text);

/** Kinds at least one of the chosen targets can install. */
function supportedKinds(chosen: string[]): Set<Kind> {
  return new Set(
    targets.filter((t) => chosen.includes(t.id)).flatMap((t) => Object.keys(t.install) as Kind[]),
  );
}

/** First-run profile choice; undefined means "custom". */
export async function promptProfile(profiles: Record<string, Profile>): Promise<string | undefined> {
  const names = Object.keys(profiles);
  if (names.length === 0) return undefined;
  const choice = answer(
    await select({
      message: "Start from a profile?",
      options: [
        ...names.map((name) => ({ value: name, label: name })),
        { value: "", label: "none", hint: "choose everything by hand" },
      ],
    }),
  );
  return choice || undefined;
}

/**
 * Options for the target prompt. Only detected tools can be picked; the rest
 * are listed disabled, and never preselected.
 */
export function targetChoices(
  targetList: Pick<Target, "id" | "label">[],
  found: ReadonlyMap<string, Detection>,
  current: string[],
) {
  const detectedIds = targetList.filter((t) => found.has(t.id)).map((t) => t.id);
  const saved = current.filter((id) => found.has(id));
  return {
    options: targetList.map((t) => {
      const detection = found.get(t.id);
      return detection
        ? { value: t.id, label: t.label, hint: `detected${detection.hint ? ` (${detection.hint})` : ""}` }
        : { value: t.id, label: t.label, hint: "not found", disabled: true };
    }),
    initialValues: saved.length ? saved : detectedIds,
  };
}

/** Walks the target and item prompts, preselecting `current`. */
export async function promptSelection(
  catalog: Catalog,
  current: Selection,
  ctx: Context,
): Promise<Selection> {
  const found = new Map(
    (await Promise.all(targets.map(async (t: Target) => [t.id, await t.detect(ctx)] as const))).flatMap(([id, d]) => (d ? [[id, d] as const] : [])),
  );

  if (found.size === 0) {
    cancel("None of the supported tools were found.");
    process.exit(1);
  }
  const picked = answer(
    await multiselect({
      message: "Install for which tools?",
      ...targetChoices(targets, found, current.targets),
      required: true,
    }),
  );
  // A saved tool that is not installed right now stays selected, so it returns when it is.
  const chosenTargets = [...picked, ...current.targets.filter((id) => !found.has(id) && !picked.includes(id))];
  const supported = supportedKinds(picked);
  const items = emptyItems();

  const core = catalog.filter((i) => (i.kind === "instructions" || i.kind === "settings") && supported.has(i.kind));
  if (core.length) {
    const picked = answer(
      await multiselect({
        message: "Core files",
        options: core.map((i) => ({ value: i.kind, label: i.name, hint: i.description })),
        initialValues: core.filter((i) => current.items[i.kind].includes(i.name)).map((i) => i.kind),
        required: false,
      }),
    );
    for (const i of core) if (picked.includes(i.kind)) items[i.kind].push(i.name);
  }

  const agents = catalog.filter((i) => i.kind === "agents");
  if (agents.length && supported.has("agents")) {
    items.agents = answer(
      await multiselect({
        message: "Agents",
        options: agents.map((i) => ({ value: i.name, label: i.name, hint: short(i.description) })),
        initialValues: current.items.agents.filter((n) => agents.some((a) => a.name === n)),
        required: false,
      }),
    );
  }

  const skills = catalog.filter((i): i is Extract<Item, { kind: "skills" }> => i.kind === "skills");
  if (skills.length && supported.has("skills")) {
    const groups: SkillGroup[] = ["Workflows", "Helpers", "Project profiles"];
    items.skills = answer(
      await groupMultiselect({
        message: "Skills (dependencies are added automatically)",
        options: Object.fromEntries(
          groups.map((group) => [
            group,
            skills.filter((s) => s.group === group).map((s) => ({ value: s.name, label: s.name, hint: short(s.description) })),
          ]),
        ),
        initialValues: current.items.skills,
        required: false,
      }),
    );
  }

  const servers = catalog.filter((i) => i.kind === "mcp");
  if (servers.length && supported.has("mcp")) {
    items.mcp = answer(
      await multiselect({
        message: "MCP servers (Claude gets all of them from its settings; Codex and Copilot install the whole plugin)",
        options: servers.map((i) => ({ value: i.name, label: i.name, hint: short(i.description) })),
        initialValues: current.items.mcp.filter((n) => servers.some((s) => s.name === n)),
        required: false,
      }),
    );
  }

  const { names, via } = withRequires(catalog, items.skills);
  for (const [name, parent] of via) log.info(`Added ${name} (via ${parent})`);
  items.skills = names;
  return { targets: chosenTargets, items };
}

/** Asks which repo items that appeared since the last run to install. */
export async function promptNewItems(fresh: Item[]): Promise<Item[]> {
  const picked = answer(
    await multiselect({
      message: "New in the repo since the last run",
      options: fresh.map((i) => ({ value: `${i.kind}:${i.name}`, label: i.name, hint: i.kind })),
      initialValues: fresh.map((i) => `${i.kind}:${i.name}`),
      required: false,
    }),
  );
  return fresh.filter((i) => picked.includes(`${i.kind}:${i.name}`));
}

export type Confirmation = "apply" | "edit" | "cancel";

export async function promptConfirm(): Promise<Confirmation> {
  return answer(
    await select<Confirmation>({
      message: "Apply this plan?",
      options: [
        { value: "apply", label: "Apply" },
        { value: "edit", label: "Edit selection" },
        { value: "cancel", label: "Cancel" },
      ],
    }),
  );
}

/** Keep or overwrite a generated file the user has edited. */
export async function promptEdited(path: string): Promise<"keep" | "backup"> {
  return answer(
    await select<"keep" | "backup">({
      message: `${path} was edited since the last install`,
      options: [
        { value: "keep", label: "Keep my edits" },
        { value: "backup", label: "Overwrite", hint: "old copy is backed up" },
      ],
    }),
  );
}
