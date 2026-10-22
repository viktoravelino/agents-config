import { expect, test } from "bun:test";
import { parse } from "smol-toml";
import { translateAgent } from "./agent.ts";

const agent = (frontmatter: string) => `---\n${frontmatter}\n---\n\nDo the thing.\n\nThen stop.\n`;

test("maps name, description and body, and drops tools and model", () => {
  const toml = translateAgent(agent("name: quick\ndescription: Small edits\nmodel: haiku\ntools: Read, Edit\ncolor: red"));
  expect(parse(toml!)).toEqual({
    name: "quick",
    description: "Small edits",
    developer_instructions: "Do the thing.\n\nThen stop.",
  });
});

test("maps effort and turns max into xhigh", () => {
  const effort = (value: string) =>
    parse(translateAgent(agent(`name: a\ndescription: b\neffort: ${value}`))!).model_reasoning_effort;
  expect(effort("medium")).toBe("medium");
  expect(effort("max")).toBe("xhigh");
});

test("omits unknown effort values", () => {
  const parsed = parse(translateAgent(agent("name: a\ndescription: b\neffort: turbo"))!);
  expect("model_reasoning_effort" in parsed).toBe(false);
});

test("rejects an agent without a description", () => {
  expect(translateAgent(agent("name: a"))).toBeUndefined();
});
