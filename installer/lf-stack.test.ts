import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "../shared/skills/langflow/bin/lf-stack");
const compose = join(import.meta.dir, "../shared/skills/langflow/docker/compose.yml");
let dir: string;
let bin: string;
let log: string;

/** Makes an empty git repo with the given directory name. */
function repo(name: string): string {
  const path = join(dir, name);
  mkdirSync(path);
  Bun.spawnSync(["git", "init", "-q", path]);
  return path;
}

/** Runs lf-stack in cwd with the fake docker first on PATH. */
function run(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(["/bin/bash", script, ...args], {
    cwd,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return { code: r.exitCode, out: r.stdout.toString() };
}

/** Port base computed with the same cksum formula as the script. */
function base(name: string): number {
  const sum = Bun.spawnSync(["sh", "-c", `printf '%s\\n' '${name}' | cksum | cut -d' ' -f1`]).stdout.toString();
  return 20000 + (Number(sum.trim()) % 500) * 20;
}

/** Reads the fake docker log. It is empty when docker never ran. */
function calls(): string {
  try {
    return readFileSync(log, "utf8");
  } catch {
    return "";
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "lfstack-"));
  bin = join(dir, "bin");
  log = join(dir, "docker.log");
  mkdirSync(bin);
  // Fake docker: logs its arguments and the exported variables. "image inspect" fails, so the script builds.
  writeFileSync(
    join(bin, "docker"),
    `#!/bin/sh\necho "ARGS $*" >> "${log}"\necho "ENV $WORKTREE $COMPOSE_PROJECT_NAME $BACKEND_PORT $FRONTEND_PORT" >> "${log}"\n[ "$1 $2" = "image inspect" ] && exit 1\nexit 0\n`,
  );
  chmodSync(join(bin, "docker"), 0o755);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("ports prints the agent project and URLs and does not call docker", () => {
  rmSync(log, { force: true });
  const p = base("wt-one");
  const r = run(repo("wt-one"), "ports");
  expect(r.code).toBe(0);
  expect(r.out).toBe(
    `project=langflow-agent-wt-one-${p}\nbackend=http://localhost:${p + 2}\nfrontend=http://localhost:${p + 3}\n`,
  );
  expect(calls()).toBe("");
});

test("--t3 ports uses the T3 project and ports p and p+1", () => {
  const p = base("wt-two");
  const r = run(repo("wt-two"), "--t3", "ports");
  expect(r.out).toBe(`project=langflow-wt-two-${p}\nbackend=http://localhost:${p}\nfrontend=http://localhost:${p + 1}\n`);
});

test("slug lower-cases and replaces characters outside a-z0-9-", () => {
  const r = run(repo("My Tree.v2"), "ports");
  expect(r.out.split("\n")[0]).toBe(`project=langflow-agent-my-tree-v2-${base("My Tree.v2")}`);
});

test("up creates both volumes and starts compose with the right env", () => {
  rmSync(log, { force: true });
  const path = repo("wt-up");
  const p = base("wt-up");
  const r = run(path, "up");
  expect(r.code).toBe(0);
  const text = calls();
  expect(text).toContain("ARGS volume create langflow-agent-uv-cache");
  expect(text).toContain("ARGS volume create langflow-agent-npm-cache");
  expect(text).toContain(`ARGS compose -f ${compose} build`);
  expect(text).toContain(`ARGS compose -f ${compose} up -d --wait --wait-timeout 900`);
  const env = text.split("\n").filter((l) => l.startsWith("ENV")).pop();
  expect(env).toBe(`ENV ${Bun.spawnSync(["git", "-C", path, "rev-parse", "--show-toplevel"]).stdout.toString().trim()} langflow-agent-wt-up-${p} ${p + 2} ${p + 3}`);
});

test("down -v passes through to compose with the same project name", () => {
  rmSync(log, { force: true });
  const p = base("wt-down");
  run(repo("wt-down"), "down", "-v");
  const text = calls();
  expect(text).toContain(`ARGS compose -f ${compose} down -v`);
  expect(text).toContain(`langflow-agent-wt-down-${p} ${p + 2} ${p + 3}`);
});

test("exits 1 outside a git repo", () => {
  const plain = join(dir, "plain");
  mkdirSync(plain);
  expect(run(plain, "ports").code).toBe(1);
});
