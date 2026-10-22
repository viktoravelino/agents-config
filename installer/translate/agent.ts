import { stringify } from "smol-toml";
import { parseFrontmatter, str } from "../frontmatter.ts";

/** The parts of a Claude agent definition that other tools understand. */
export type AgentDefinition = {
  name: string;
  description: string;
  effort?: string;
  body: string;
};

const codexEffort: Record<string, string> = {
  none: "none",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "xhigh",
};

/** Parses a Claude agent `.md`; returns undefined when name or description is missing. */
export function parseAgent(markdown: string): AgentDefinition | undefined {
  const { data, body } = parseFrontmatter(markdown);
  const name = str(data.name);
  const description = str(data.description);
  if (!name || !description) return undefined;
  return { name, description, effort: str(data.effort), body: body.trim() };
}

/**
 * Renders a TOML multi-line basic string with real newlines. Escapes backslashes,
 * every `"""` run (so the body can't close the string early) and control characters
 * other than newline and tab, which TOML forbids unescaped.
 */
function multilineString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"""/g, '""\\"')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `"""\n${escaped}"""`;
}

/** Renders a Codex custom agent TOML. Emits only the keys Codex knows. */
export function toCodexToml(agent: AgentDefinition): string {
  const effort = agent.effort ? codexEffort[agent.effort] : undefined;
  // smol-toml's stringify output ends with a newline, so the next line follows directly.
  return stringify({
    name: agent.name,
    description: agent.description,
    ...(effort && { model_reasoning_effort: effort }),
  }) + `developer_instructions = ${multilineString(agent.body)}\n`;
}

/** Claude agent `.md` text in, Codex agent TOML out. */
export function translateAgent(markdown: string): string | undefined {
  const agent = parseAgent(markdown);
  return agent && toCodexToml(agent);
}
