import { expect, test } from "bun:test";
import { suggestProfile, type Profile } from "./profiles.ts";

const profile = (...targets: string[]): Profile => ({ targets, items: {} });

test("suggestProfile picks the widest profile whose targets are all detected", () => {
  const profiles = { headless: profile("claude"), "work-mac": profile("claude", "codex", "copilot", "bob") };
  expect(suggestProfile(profiles, new Set(["claude", "codex", "copilot", "bob"]))).toBe("work-mac");
  expect(suggestProfile(profiles, new Set(["claude", "codex"]))).toBe("headless");
  expect(suggestProfile(profiles, new Set(["codex"]))).toBeUndefined();
});
