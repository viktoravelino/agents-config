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

/** Renders a Codex custom agent TOML. Emits only the keys Codex knows. */
export function toCodexToml(agent: AgentDefinition): string {
  const effort = agent.effort ? codexEffort[agent.effort] : undefined;
  return stringify({
    name: agent.name,
    description: agent.description,
    developer_instructions: agent.body,
    ...(effort && { model_reasoning_effort: effort }),
  }) + "\n";
}

/** Claude agent `.md` text in, Codex agent TOML out. */
export function translateAgent(markdown: string): string | undefined {
  const agent = parseAgent(markdown);
  return agent && toCodexToml(agent);
}
