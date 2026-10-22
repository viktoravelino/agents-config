import { accessSync, constants, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Context, Detection } from "./types.ts";

type BinarySearch = {
  bin: string;
  /** Absolute paths checked after PATH. */
  fixed?: string[];
  /** T3 Code installs to ~/.t3/tools/<toolDir>/<version>/npm/bin/<bin>; defaults to `bin`. */
  toolDir?: string;
  /** PATH hits containing any of these substrings are ignored (wrapper shims). */
  reject?: string[];
};

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Finds a binary on PATH, at a fixed location, or in T3 Code's tool dir; returns its path. */
export async function findBinary(search: BinarySearch, ctx: Context): Promise<string | undefined> {
  const { bin, fixed = [], toolDir = bin, reject = [] } = search;
  const onPath = ctx.path
    .split(":")
    .filter(Boolean)
    .map((dir) => join(dir, bin))
    .filter((file) => !reject.some((r) => file.includes(r)));
  const found = [...onPath, ...fixed].find(isExecutable);
  if (found) return found;

  const tools = join(ctx.home, ".t3", "tools", toolDir);
  if (!existsSync(tools)) return undefined;
  const t3 = await Array.fromAsync(new Bun.Glob(`*/npm/bin/${bin}`).scan({ cwd: tools, absolute: true, onlyFiles: false }));
  return t3.sort().at(-1);
}

/** The first x.y.z printed by `<file> --version`, if it answers promptly. */
export async function binaryVersion(file: string): Promise<string | undefined> {
  try {
    const proc = Bun.spawn([file, "--version"], { stdout: "pipe", stderr: "ignore", stdin: "ignore", timeout: 5000 });
    return /\d+\.\d+\.\d+/.exec(await new Response(proc.stdout).text())?.[0];
  } catch {
    return undefined;
  }
}

/** Detection for a tool that is just a binary. */
export async function detectBinary(bin: string, ctx: Context): Promise<Detection | undefined> {
  return (await findBinary({ bin }, ctx)) ? {} : undefined;
}

/** `/Applications/<name>` under the injected root. */
export function appPath(ctx: Context, name: string): string {
  return join(ctx.root, "Applications", name);
}

export function appInstalled(ctx: Context, name: string): boolean {
  return existsSync(appPath(ctx, name));
}

/** Joins the consumers found into a hint, e.g. "CLI 1.0.102 + VS Code"; undefined when none. */
export function detectionOf(consumers: (string | false | undefined)[]): Detection | undefined {
  const found = consumers.filter((c): c is string => Boolean(c));
  return found.length ? { hint: found.join(" + ") } : undefined;
}
