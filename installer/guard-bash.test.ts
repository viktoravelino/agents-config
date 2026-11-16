import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "../shared/hooks/guard-bash.sh");
let dir: string;
let langflow: string;
let other: string;
let attributedBody: string;

/** Makes an empty git repo with the given origin URL. */
function repo(name: string, origin: string): string {
  const path = join(dir, name);
  Bun.spawnSync(["git", "init", "-q", path]);
  Bun.spawnSync(["git", "-C", path, "remote", "add", "origin", origin]);
  return path;
}

/** Pipes a hook payload into guard-bash.sh and returns its exit code. */
function run(command: string, cwd: string): number {
  const input = JSON.stringify({ tool_input: { command }, cwd });
  return Bun.spawnSync(["bash", script], { stdin: Buffer.from(input) }).exitCode;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "guard-"));
  langflow = repo("langflow", "https://github.com/langflow-ai/langflow.git");
  other = repo("other", "https://github.com/someone/else.git");
  attributedBody = join(dir, "body.md");
  writeFileSync(attributedBody, "Fix\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("passes a plain command", () => {
  expect(run("ls", other)).toBe(0);
});

test("blocks a merge through the API and through gh pr merge", () => {
  expect(run("gh api -X PUT repos/o/r/pulls/1/merge", other)).toBe(2);
  expect(run("cd x && gh pr merge 1", other)).toBe(2);
});

test("blocks a merge only as a command word", () => {
  expect(run('grep -n "gh pr merge" README.md', other)).toBe(0);
  expect(run("echo hi; gh pr merge 1", other)).toBe(2);
});

test("blocks an inline PR body but not --body-file", () => {
  expect(run('gh pr create --title x --body "text"', other)).toBe(2);
  expect(run("gh pr edit 1 --body-file /tmp/some-file-that-does-not-exist", other)).toBe(0);
});

test("blocks AI attribution in the command text and in a body file", () => {
  expect(run('git commit -m "x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"', other)).toBe(2);
  expect(run(`gh pr create --body-file ${attributedBody}`, other)).toBe(2);
  expect(run('git commit -m "fix: x"', other)).toBe(0);
});

test("blocks make backend only in Langflow and only as a command word", () => {
  expect(run("make backend", other)).toBe(0);
  expect(run("make backend", langflow)).toBe(2);
  expect(run("cd src && make backend", langflow)).toBe(2);
  expect(run('grep -n "make backend" Makefile', langflow)).toBe(0);
});
