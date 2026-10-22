import { join } from "node:path";
import type { Context } from "./types.ts";

/** True when `bin` is on PATH or installed by T3 Code under ~/.t3/tools/<bin>/*. */
export async function detectBinary(bin: string, ctx: Context): Promise<boolean> {
  if (Bun.which(bin)) return true;
  const glob = new Bun.Glob(`*/npm/bin/${bin}`);
  for await (const _ of glob.scan({ cwd: join(ctx.home, ".t3", "tools", bin), onlyFiles: false })) {
    return true;
  }
  return false;
}
