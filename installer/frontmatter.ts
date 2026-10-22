import { parse } from "yaml";

/** Splits a markdown file into its YAML frontmatter (as a plain record) and body. */
export function parseFrontmatter(markdown: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!match) return { data: {}, body: markdown };
  const data: unknown = parse(match[1] ?? "");
  return {
    data: typeof data === "object" && data !== null && !Array.isArray(data) ? { ...data } : {},
    body: match[2] ?? "",
  };
}

/** Returns the value when it is a non-empty string. */
export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Returns the string members of an array value, or an empty list. */
export function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
