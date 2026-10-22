import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import type { JsonValue } from "./targets/types.ts";

function readText(path: string): string {
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  return text.trim() ? text : "{}\n";
}

/** Value at `keyPath` in a JSONC file; undefined when the file or key is missing. Throws on a file it cannot parse. */
export function readSetting(path: string, keyPath: string[]): JsonValue | undefined {
  const errors: ParseError[] = [];
  let node: unknown = parse(readText(path), errors, { allowTrailingComma: true });
  if (errors.length) throw new Error(`Cannot parse ${path}: ${printParseErrorCode(errors[0]!.error)}`);
  for (const key of keyPath) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node as JsonValue | undefined;
}

function edit(path: string, keyPath: string[], value: JsonValue | undefined): void {
  const text = readText(path);
  const edits = modify(text, keyPath, value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, applyEdits(text, edits));
}

/**
 * Sets (or, with undefined, deletes) the key at `keyPath`, creating the file
 * and intermediate objects as needed. Edits are minimal, so comments and
 * formatting elsewhere in the file survive. Deleting also drops a parent
 * object that the deletion left empty.
 */
export function writeSetting(path: string, keyPath: string[], value: JsonValue | undefined): void {
  edit(path, keyPath, value);
  if (value !== undefined) return;
  for (let depth = keyPath.length - 1; depth > 0; depth--) {
    const parent = readSetting(path, keyPath.slice(0, depth));
    if (typeof parent !== "object" || parent === null || Object.keys(parent).length > 0) return;
    edit(path, keyPath.slice(0, depth), undefined);
  }
}
