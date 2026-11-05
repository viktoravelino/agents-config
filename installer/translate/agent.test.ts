import { expect, test } from "bun:test";
import { parse } from "smol-toml";
import { parseAgent, toCodexToml } from "./agent.ts";

const agent = (frontmatter: string) => `---\n${frontmatter}\n---\n\nDo the thing.\n\nThen stop.\n`;

/** Claude agent `.md` text in, Codex agent TOML out. */
const translate = (markdown: string) => toCodexToml(parseAgent(markdown)!);

test("maps name, description and body, and drops tools and model", () => {
  const toml = translate(agent("name: quick\ndescription: Small edits\nmodel: haiku\ntools: Read, Edit\ncolor: red"));
  expect(parse(toml)).toEqual({
    name: "quick",
    description: "Small edits",
    developer_instructions: "Do the thing.\n\nThen stop.",
  });
});

test("maps effort and turns max into xhigh", () => {
  const effort = (value: string) => parse(translate(agent(`name: a\ndescription: b\neffort: ${value}`))).model_reasoning_effort;
  expect(effort("medium")).toBe("medium");
  expect(effort("max")).toBe("xhigh");
});

test("omits unknown effort values", () => {
  const parsed = parse(translate(agent("name: a\ndescription: b\neffort: turbo")));
  expect("model_reasoning_effort" in parsed).toBe(false);
});

test("writes developer_instructions as a multi-line string with literal newlines", () => {
  expect(translate(agent("name: a\ndescription: b"))).toContain('developer_instructions = """\nDo the thing.\n\nThen stop."""');
});

test("round-trips backslashes, triple quotes and quotes in the body exactly", () => {
  const body = 'C:\\new "x" """y""" \r\nend "';
  expect(parse(translate(`---\nname: a\ndescription: b\n---\n\n${body}\n`)).developer_instructions).toBe(body);
});

test("rejects an agent without a description", () => {
  expect(parseAgent(agent("name: a"))).toBeUndefined();
});
