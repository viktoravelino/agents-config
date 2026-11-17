import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const script = join(import.meta.dir, "../shared/hooks/langflow-lint-stop.sh");
const langflowOrigin = "https://github.com/langflow-ai/langflow.git";
let dir: string;
let count = 0;

/** Makes a git repo with the given origin and one committed file per entry in `committed`. */
function repo(committed: Record<string, string>, origin = langflowOrigin): string {
  const path = join(dir, `r${count++}`);
  Bun.spawnSync(["git", "init", "-q", path]);
  Bun.spawnSync(["git", "-C", path, "remote", "add", "origin", origin]);
  for (const [name, text] of Object.entries(committed)) write(path, name, text);
  Bun.spawnSync(["git", "-C", path, "add", "-A"]);
  Bun.spawnSync(["git", "-C", path, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"]);
  return path;
}

/** Writes a file inside the repo and creates its folders. */
function write(path: string, name: string, text: string) {
  const file = join(path, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** Pipes a Stop payload into the hook and returns its exit code and stderr. */
function run(cwd: string, active = false) {
  const input = JSON.stringify({ cwd, stop_hook_active: active });
  const res = Bun.spawnSync(["bash", script], { stdin: Buffer.from(input) });
  return { code: res.exitCode, err: res.stderr.toString() };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "lint-stop-"));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("flags a noqa added to a tracked file", () => {
  const r = repo({ "a.py": "x = 1\n" });
  write(r, "a.py", "x = 1  # noqa: E501\n");
  const { code, err } = run(r);
  expect(code).toBe(2);
  expect(err).toContain("more suppression lines than before");
  expect(err).toContain("a.py");
});

test("does not flag a suppression that only moves", () => {
  const r = repo({ "a.py": "x = 1  # noqa: E501\ny = 2\n" });
  write(r, "a.py", "x = 1\ny = 2  # noqa: E501\n");
  expect(run(r).code).toBe(0);
});

test("flags biome-ignore in an untracked frontend file", () => {
  const r = repo({ "README.md": "hi\n" });
  write(r, "src/frontend/src/b.ts", "// biome-ignore lint/suspicious/noExplicitAny: legacy\nexport const b = 1;\n");
  const { code, err } = run(r);
  expect(code).toBe(2);
  expect(err).toContain("b.ts");
});

test("flags waitForTimeout only under src/frontend/tests", () => {
  const r = repo({ "README.md": "hi\n" });
  write(r, "src/frontend/src/c.ts", "await page.waitForTimeout(100);\n");
  expect(run(r).code).toBe(0);
  write(r, "src/frontend/tests/d.spec.ts", "await page.waitForTimeout(100);\n");
  expect(run(r).code).toBe(2);
});

test("lets the agent stop when stop_hook_active is true", () => {
  const r = repo({ "a.py": "x = 1\n" });
  write(r, "a.py", "x = 1  # noqa: E501\n");
  expect(run(r, true).code).toBe(0);
});

test("ignores repos whose origin is not Langflow", () => {
  const r = repo({ "a.py": "x = 1\n" }, "https://github.com/other/repo.git");
  write(r, "a.py", "x = 1  # noqa: E501\n");
  expect(run(r).code).toBe(0);
});

test("flags a noqa file directive such as ruff: noqa", () => {
  const r = repo({ "a.py": "x = 1\n" });
  write(r, "a.py", "# ruff: noqa\nx = 1\n");
  expect(run(r).code).toBe(2);
});

test("does not flag a file that moves with its old noqa", () => {
  const r = repo({ "a.py": "x = 1  # noqa: E501\n" });
  Bun.spawnSync(["git", "-C", r, "mv", "a.py", "b.py"]);
  expect(run(r).code).toBe(0);
});

test("flags an added line that starts with ++", () => {
  const r = repo({ "src/frontend/src/e.ts": "export const e = 1;\n" });
  write(r, "src/frontend/src/e.ts", "export const e = 1;\n++count; // eslint-disable-line no-plusplus\n");
  const { code, err } = run(r);
  expect(code).toBe(2);
  expect(err).toContain("e.ts");
});

test("keeps the suppression report when lint output is long", () => {
  const r = repo({ "a.py": "x = 1\n" });
  write(r, ".venv/bin/ruff", "#!/bin/sh\nseq 1 100\nexit 1\n");
  chmodSync(join(r, ".venv/bin/ruff"), 0o755);
  write(r, "a.py", "x = 1  # noqa: E501\n");
  const { code, err } = run(r);
  expect(code).toBe(2);
  expect(err).toContain("more suppression lines than before");
});

test("does not flag an ordinary comment that mentions noqa", () => {
  const r = repo({ "a.py": "x = 1\n" });
  write(r, "a.py", "x = 1\n# Explain why noqa is unsafe\n");
  expect(run(r).code).toBe(0);
});

test("lists modified files before files with a new path", () => {
  const r = repo({ "old.py": "x = 1  # noqa\n", "a.py": "y = 1\n" });
  Bun.spawnSync(["git", "-C", r, "mv", "old.py", "moved.py"]);
  write(r, "a.py", "y = 1  # noqa\n");
  const { code, err } = run(r);
  expect(code).toBe(2);
  expect(err.indexOf("a.py")).toBeGreaterThan(-1);
  expect(err.indexOf("a.py")).toBeLessThan(err.indexOf("moved.py"));
});

test("flags a noqa even when git colors its diff output", () => {
  const r = repo({ "a.py": "x = 1\n" });
  Bun.spawnSync(["git", "-C", r, "config", "color.ui", "always"]);
  write(r, "a.py", "x = 1  # noqa\n");
  expect(run(r).code).toBe(2);
});
