import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, str, strList } from "./frontmatter.ts";
import { parseMcpServers, describeMcpServer, type McpServer } from "./translate/mcp.ts";
import { parseAgent, type AgentDefinition } from "./translate/agent.ts";

export const kinds = ["instructions", "skills", "agents", "settings", "mcp"] as const;
export type Kind = (typeof kinds)[number];

export type SkillGroup = "Workflows" | "Helpers" | "Project profiles";

type Base = { name: string; description: string; source: string };

/** One installable thing found in the repo. */
export type Item =
  | (Base & { kind: "instructions" })
  | (Base & { kind: "settings" })
  | (Base & { kind: "skills"; group: SkillGroup; requires: string[] })
  | (Base & { kind: "agents"; definition: AgentDefinition })
  | (Base & { kind: "mcp"; server: McpServer });

export type ItemOf<K extends Kind> = Extract<Item, { kind: K }>;

export type Catalog = Item[];

/** Item names chosen per kind. */
export type ItemSelection = Record<Kind, string[]>;

/** Discovers items from the repo layout; nothing is listed by hand. */
export function discoverCatalog(repo: string): Catalog {
  const shared = join(repo, "shared");
  const items: Catalog = [];

  const instructions = join(shared, "instructions.md");
  if (existsSync(instructions)) {
    items.push({ kind: "instructions", name: "instructions", description: "Shared instructions (CLAUDE.md / AGENTS.md)", source: instructions });
  }
  const settings = join(shared, "settings.json");
  if (existsSync(settings)) {
    items.push({ kind: "settings", name: "settings", description: "Claude settings.json", source: settings });
  }

  const skillsDir = join(shared, "skills");
  for (const entry of listDir(skillsDir).sort()) {
    const source = join(skillsDir, entry);
    const file = join(source, "SKILL.md");
    if (!existsSync(file)) continue;
    const { data } = parseFrontmatter(readFileSync(file, "utf8"));
    const metadata = typeof data.metadata === "object" && data.metadata !== null ? data.metadata : {};
    const meta: Record<string, unknown> = { ...metadata };
    const group: SkillGroup =
      meta.kind === "project-profile" ? "Project profiles"
      : data["user-invocable"] === false ? "Helpers"
      : "Workflows";
    items.push({
      kind: "skills",
      name: entry,
      description: str(data.description) ?? "",
      source,
      group,
      requires: strList(meta.requires),
    });
  }

  const agentsDir = join(shared, "agents");
  for (const entry of listDir(agentsDir).sort()) {
    if (!entry.endsWith(".md")) continue;
    const source = join(agentsDir, entry);
    const definition = parseAgent(readFileSync(source, "utf8"));
    if (definition) items.push({ kind: "agents", name: definition.name, description: definition.description, source, definition });
  }

  const mcpFile = join(shared, "plugins", "mcp", ".mcp.json");
  if (existsSync(mcpFile)) {
    for (const [name, server] of Object.entries(parseMcpServers(readFileSync(mcpFile, "utf8")))) {
      items.push({ kind: "mcp", name, description: describeMcpServer(server), source: mcpFile, server });
    }
  }

  return items;
}

function listDir(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir) : [];
}

/** An empty selection, for building one up kind by kind. */
export function emptyItems(): ItemSelection {
  return { instructions: [], skills: [], agents: [], settings: [], mcp: [] };
}

/**
 * Adds the `requires` of every selected skill, transitively. `via` maps each
 * auto-added skill to the skill that pulled it in.
 */
export function withRequires(
  catalog: Catalog,
  selected: string[],
): { names: string[]; via: Map<string, string> } {
  const skills = new Map(
    catalog.flatMap((item) => (item.kind === "skills" ? [[item.name, item] as const] : [])),
  );
  const names = new Set(selected);
  const via = new Map<string, string>();
  const queue = [...selected];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    for (const required of skills.get(name)?.requires ?? []) {
      if (!skills.has(required) || names.has(required)) continue;
      names.add(required);
      via.set(required, name);
      queue.push(required);
    }
  }
  return { names: [...names], via };
}
