import { describe, expect, test } from "bun:test";
import { suggestProfile, type Profile } from "./profiles.ts";

const profile = (...targets: string[]): Profile => ({ targets, items: {} });

const profiles = {
  headless: profile("claude"),
  "work-mac": profile("claude", "codex", "copilot", "bob"),
};

describe("suggestProfile", () => {
  test("picks the profile that covers all detected tools", () => {
    expect(suggestProfile(profiles, new Set(["claude", "codex", "copilot", "bob"]))).toBe("work-mac");
  });

  test("picks the smaller profile when only claude is detected", () => {
    expect(suggestProfile(profiles, new Set(["claude"]))).toBe("headless");
  });

  test("breaks a score tie by detected count, then by name", () => {
    const tied = { b: profile("claude", "codex"), a: profile("claude", "codex") };
    expect(suggestProfile(tied, new Set(["claude", "codex"]))).toBe("a");
    // Score 0 for both; "wide" has more detected targets.
    const wide = { narrow: profile("claude", "x"), wide: profile("claude", "codex", "x", "y") };
    expect(suggestProfile(wide, new Set(["claude", "codex", "z"]))).toBe("wide");
  });

  test("returns undefined without profiles", () => {
    expect(suggestProfile({}, new Set(["claude"]))).toBeUndefined();
  });
});
