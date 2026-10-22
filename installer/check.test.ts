import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkRepo } from "./check.ts";

let root: string;

/** Writes a file under the fixture root, creating folders. */
function put(path: string, content: string) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const skill = (folder: string, frontmatter: string) =>
  put(`shared/skills/${folder}/SKILL.md`, `---\n${frontmatter}\n---\n\nBody\n`);

const goodMcp = JSON.stringify({ mcpServers: { a: { command: "a" }, b: { url: "https://b" } } });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "check-"));
  skill("alpha", "name: alpha\ndescription: Does alpha.\nmetadata:\n  requires: [beta]");
  skill("beta", "name: beta\ndescription: Does beta.");
  put("shared/agents/quick.md", "---\nname: quick\ndescription: Fast.\n---\n");
  put("shared/plugins/mcp/.mcp.json", goodMcp);
  put("shared/plugins/mcp/.claude-plugin/plugin.json", JSON.stringify({ name: "mcp" }));
  put(
    ".claude-plugin/marketplace.json",
    JSON.stringify({ plugins: [{ name: "mcp", source: "./shared/plugins/mcp" }] }),
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Returns "LEVEL path: reason" lines for easy matching. */
const lines = () => checkRepo(root).map((f) => `${f.level} ${f.path}: ${f.reason}`);

test("clean fixture passes", () => {
  expect(lines()).toEqual([]);
});

test("skill name differs from folder", () => {
  skill("beta", "name: gamma\ndescription: Does beta.");
  expect(lines()).toEqual([expect.stringContaining('FAIL shared/skills/beta/SKILL.md: name "gamma" does not match folder')]);
});

test("skill name breaks the pattern", () => {
  skill("Bad_Name", "name: Bad_Name\ndescription: Bad.");
  expect(lines().join("\n")).toContain("does not match /^[a-z0-9]+(-[a-z0-9]+)*$/");
});

test("description is too long", () => {
  skill("beta", `name: beta\ndescription: ${"x".repeat(1025)}`);
  expect(lines()).toEqual([expect.stringContaining("description has 1025 characters")]);
});

test("metadata is not a mapping", () => {
  skill("beta", "name: beta\ndescription: Does beta.\nmetadata: nope");
  expect(lines()).toEqual([expect.stringContaining("metadata is not a mapping")]);
});

test("requires names a missing skill", () => {
  skill("alpha", "name: alpha\ndescription: Does alpha.\nmetadata:\n  requires: [ghost]");
  expect(lines()).toEqual([expect.stringContaining('missing skill "ghost"')]);
});

test("agent name differs from file stem", () => {
  put("shared/agents/quick.md", "---\nname: fast\ndescription: Fast.\n---\n");
  expect(lines()).toEqual([expect.stringContaining('FAIL shared/agents/quick.md: name "fast"')]);
});

test("MCP server has no command or url", () => {
  put("shared/plugins/mcp/.mcp.json", JSON.stringify({ mcpServers: { a: { args: [] } } }));
  expect(lines()).toEqual([expect.stringContaining('server "a" has no command or url')]);
});

test("marketplace plugin name differs from plugin.json", () => {
  put("shared/plugins/mcp/.claude-plugin/plugin.json", JSON.stringify({ name: "other" }));
  expect(lines()).toEqual([expect.stringContaining("name does not match marketplace entry")]);
});

test("vendored skill problems are warnings", () => {
  skill("use-railway", "name: wrong\ndescription: Railway.");
  expect(lines()).toEqual([expect.stringMatching(/^WARN shared\/skills\/use-railway\/SKILL.md/)]);
});
