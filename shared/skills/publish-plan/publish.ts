#!/usr/bin/env bun
// Publish, list, or unpublish self-contained HTML files at https://<hash>.viktoravelino.dev.
// Usage: publish.ts <file.html> | publish.ts --list | publish.ts --delete <hash-or-url>
// Token: env PUBLISH_TOKEN, else ~/.config/publish/token.

import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.viktoravelino.dev/v1/pages";
const HASH_RE = /^[0-9a-f]{12}$/;

async function readToken() {
  if (process.env.PUBLISH_TOKEN) return process.env.PUBLISH_TOKEN.trim();
  const file = Bun.file(join(homedir(), ".config", "publish", "token"));
  if (await file.exists()) return (await file.text()).trim();
  throw new Error("No PUBLISH_TOKEN in env and no ~/.config/publish/token file");
}

// First 12 hex chars of sha256 — the same rule the server enforces.
function hashOf(bytes: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 12);
}

// Accepts a bare hash or any https://<hash>.viktoravelino.dev URL.
function parseHash(input: string) {
  const candidate = input.startsWith("http") ? new URL(input).hostname.split(".")[0] : input;
  if (!candidate || !HASH_RE.test(candidate)) throw new Error(`Not a page hash or URL: ${input}`);
  return candidate;
}

async function call(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path || "/"} failed: ${res.status} ${await res.text()}`);
  return res;
}

async function publish(path: string, token: string) {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const res = await call(`/${hashOf(bytes)}`, token, {
    method: "PUT",
    headers: { "Content-Type": "text/html" },
    body: bytes,
  });
  const { url } = (await res.json()) as { url: string };
  return url;
}

type Page = { url: string; title: string; publishedAt: string; size: number };

// One line per page, newest first: URL, date, title.
async function list(token: string) {
  const { pages } = (await (await call("", token)).json()) as { pages: Page[] };
  return pages
    .map((p) => `${p.url}  ${p.publishedAt.slice(0, 10)}  ${p.title || "(untitled)"}`)
    .join("\n");
}

const [flagOrFile, maybeTarget] = process.argv.slice(2);
try {
  if (!flagOrFile) throw new Error("Usage: publish.ts <file.html> | publish.ts --list | publish.ts --delete <hash-or-url>");
  const token = await readToken();
  if (flagOrFile === "--list") {
    console.log(await list(token));
  } else if (flagOrFile === "--delete") {
    if (!maybeTarget) throw new Error("--delete needs a hash or URL");
    await call(`/${parseHash(maybeTarget)}`, token, { method: "DELETE" });
  } else {
    console.log(await publish(flagOrFile, token));
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
