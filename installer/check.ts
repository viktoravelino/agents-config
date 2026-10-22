import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parseFrontmatter, str, strList } from "./frontmatter.ts";

export type Finding = { level: "FAIL" | "WARN"; path: string; reason: string };

/** Skills copied from an upstream repo. Their problems are warnings, not failures. */
const vendoredSkills = new Set(["use-railway"]);

/** Allowed skill names. Bob and VS Code skip skills that break this rule. */
const skillNamePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const maxSkillNameLength = 64;
/** VS Code limit. */
const maxDescriptionLength = 1024;

type Report = (path: string, reason: string) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads and parses a JSON file. Returns the error text when it fails. */
function readJson(file: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, "utf8")) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Reads the frontmatter of a markdown file. Returns the error text when it is missing or broken. */
function readFrontmatter(file: string) {
  const text = readFileSync(file, "utf8");
  if (!/^---\r?\n/.test(text)) return { ok: false, error: "no frontmatter" } as const;
  try {
    return { ok: true, data: parseFrontmatter(text).data } as const;
  } catch (error) {
    return {
      ok: false,
      error: `frontmatter does not parse: ${error instanceof Error ? error.message : String(error)}`,
    } as const;
  }
}

const listDirs = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir).sort().filter((entry) => statSync(join(dir, entry)).isDirectory())
    : [];

/** Checks one skill folder. `skillNames` is the set of all skill folder names. */
function checkSkill(dir: string, skillNames: Set<string>, fail: Report) {
  const folder = basename(dir);
  const file = join(dir, "SKILL.md");
  if (!existsSync(file)) return fail(dir, "missing SKILL.md");

  const fm = readFrontmatter(file);
  if (!fm.ok) return fail(file, fm.error);
  const { data } = fm;

  const name = str(data.name);
  if (name === undefined) fail(file, "missing name");
  else {
    if (name !== folder) fail(file, `name "${name}" does not match folder "${folder}"`);
    if (!skillNamePattern.test(name)) fail(file, `name "${name}" does not match ${skillNamePattern}`);
    if (name.length > maxSkillNameLength) fail(file, `name is longer than ${maxSkillNameLength} characters`);
  }

  const description = str(data.description);
  if (description === undefined) fail(file, "missing or empty description");
  else if (description.length > maxDescriptionLength) {
    fail(file, `description has ${description.length} characters, the limit is ${maxDescriptionLength}`);
  }

  if (data.metadata === undefined) return;
  if (!isRecord(data.metadata)) return fail(file, "metadata is not a mapping");
  const { requires } = data.metadata;
  if (requires === undefined) return;
  if (!Array.isArray(requires) || requires.length !== strList(requires).length) {
    return fail(file, "metadata.requires is not a list of names");
  }
  for (const required of strList(requires)) {
    if (!skillNames.has(required)) fail(file, `metadata.requires names missing skill "${required}"`);
  }
}

/** Checks one agent file. */
function checkAgent(file: string, fail: Report) {
  const fm = readFrontmatter(file);
  if (!fm.ok) return fail(file, fm.error);
  const stem = basename(file, ".md");
  const name = str(fm.data.name);
  if (name === undefined) fail(file, "missing name");
  else if (name !== stem) fail(file, `name "${name}" does not match file name "${stem}"`);
  if (str(fm.data.description) === undefined) fail(file, "missing or empty description");
}

/** Checks the MCP plugin server list. */
function checkMcp(file: string, fail: Report) {
  if (!existsSync(file)) return fail(file, "file is missing");
  const json = readJson(file);
  if (!json.ok) return fail(file, `invalid JSON: ${json.error}`);
  const servers = isRecord(json.value) ? json.value.mcpServers : undefined;
  if (!isRecord(servers)) return fail(file, "mcpServers is not an object");
  for (const [name, server] of Object.entries(servers)) {
    if (!isRecord(server) || (str(server.command) === undefined && str(server.url) === undefined)) {
      fail(file, `server "${name}" has no command or url`);
    }
  }
}

/** Checks the Claude plugin marketplace file and the plugins it points to. */
function checkMarketplace(root: string, fail: Report) {
  const file = join(root, ".claude-plugin", "marketplace.json");
  if (!existsSync(file)) return fail(file, "file is missing");
  const json = readJson(file);
  if (!json.ok) return fail(file, `invalid JSON: ${json.error}`);
  const plugins = isRecord(json.value) ? json.value.plugins : undefined;
  if (!Array.isArray(plugins)) return fail(file, "plugins is not a list");
  for (const entry of plugins) {
    if (!isRecord(entry)) {
      fail(file, "plugin entry is not an object");
      continue;
    }
    const name = str(entry.name);
    if (name === undefined) fail(file, "plugin entry has no name");
    // Only relative paths are checked. Other sources (repos, URLs) are not local.
    if (typeof entry.source !== "string" || !entry.source.startsWith(".")) continue;
    const pluginDir = resolve(root, entry.source);
    const manifest = join(pluginDir, ".claude-plugin", "plugin.json");
    if (!existsSync(manifest)) {
      fail(file, `plugin "${name}": ${relative(root, manifest)} is missing`);
      continue;
    }
    const manifestJson = readJson(manifest);
    if (!manifestJson.ok) fail(manifest, `invalid JSON: ${manifestJson.error}`);
    else if (!isRecord(manifestJson.value) || manifestJson.value.name !== name) {
      fail(manifest, `name does not match marketplace entry "${name}"`);
    }
  }
}

/** Checks skills, agents and the MCP plugin under `root`. Returns all findings. */
export function checkRepo(root: string): Finding[] {
  const findings: Finding[] = [];
  const failAt = (level: Finding["level"]): Report => (path, reason) =>
    findings.push({ level, path: relative(root, path) || ".", reason });
  const fail = failAt("FAIL");
  const warn = failAt("WARN");

  const skillsDir = join(root, "shared", "skills");
  const skills = listDirs(skillsDir);
  const skillNames = new Set(skills);
  for (const skill of skills) {
    checkSkill(join(skillsDir, skill), skillNames, vendoredSkills.has(skill) ? warn : fail);
  }

  const agentsDir = join(root, "shared", "agents");
  if (existsSync(agentsDir)) {
    for (const entry of readdirSync(agentsDir).sort().filter((e) => e.endsWith(".md"))) {
      checkAgent(join(agentsDir, entry), fail);
    }
  }

  checkMcp(join(root, "shared", "plugins", "mcp", ".mcp.json"), fail);
  checkMarketplace(root, fail);
  return findings;
}

/** Prints findings and returns the exit code. */
export function report(findings: Finding[]): number {
  for (const { level, path, reason } of findings) console.log(`${level} ${path}: ${reason}`);
  const failures = findings.filter((f) => f.level === "FAIL").length;
  const warnings = findings.length - failures;
  console.log(
    failures === 0
      ? `check passed (${warnings} warning${warnings === 1 ? "" : "s"})`
      : `check failed: ${failures} failure${failures === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`,
  );
  return failures === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(report(checkRepo(resolve(import.meta.dir, ".."))));
}
