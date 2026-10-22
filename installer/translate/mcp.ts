import { str, strList } from "../frontmatter.ts";
import type { JsonValue } from "../targets/types.ts";

/** An MCP server as declared in a Claude `.mcp.json`, with the transport made explicit. */
export type McpServer =
  | { type: "stdio"; command: string; args: string[]; env?: Record<string, string>; cwd?: string }
  | { type: "http" | "sse"; url: string; headers?: Record<string, string> };

function stringMap(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string");
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function parseServer(raw: unknown): McpServer | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r: Record<string, unknown> = { ...raw };
  const url = str(r.url);
  if (url) return { type: r.type === "sse" ? "sse" : "http", url, ...(stringMap(r.headers) && { headers: stringMap(r.headers) }) };
  const command = str(r.command);
  if (!command) return undefined;
  return { type: "stdio", command, args: strList(r.args), ...(stringMap(r.env) && { env: stringMap(r.env) }), ...(str(r.cwd) && { cwd: str(r.cwd) }) };
}

/** Servers under `mcpServers` of a `.mcp.json`; entries that are neither stdio nor URL based are skipped. */
export function parseMcpServers(text: string): Record<string, McpServer> {
  const raw: unknown = JSON.parse(text);
  const servers = typeof raw === "object" && raw !== null && "mcpServers" in raw ? raw.mcpServers : undefined;
  if (typeof servers !== "object" || servers === null) return {};
  return Object.fromEntries(
    Object.entries(servers).flatMap(([name, value]) => {
      const server = parseServer(value);
      return server ? [[name, server] as const] : [];
    }),
  );
}

/** One-line summary for the selection prompt. */
export function describeMcpServer(server: McpServer): string {
  return server.type === "stdio" ? [server.command, ...server.args].join(" ") : server.url;
}

/** Claude `${VAR}` references are written `${env:VAR}` in Bob. */
const bobReference = (text: string) => text.replace(/\$\{(?!env:)([A-Za-z_]\w*)\}/g, (_, name: string) => `\${env:${name}}`);

const bobMap = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, bobReference(v)]));

/** The entry Bob expects under `mcpServers.<name>` in `~/.bob/settings/mcp.json`. */
export function toBobServer(server: McpServer): JsonValue {
  if (server.type === "stdio") {
    return {
      command: bobReference(server.command),
      args: server.args.map(bobReference),
      ...(server.env && { env: bobMap(server.env) }),
      ...(server.cwd && { cwd: bobReference(server.cwd) }),
    };
  }
  return {
    type: server.type === "http" ? "streamable-http" : "sse",
    url: bobReference(server.url),
    ...(server.headers && { headers: bobMap(server.headers) }),
  };
}
