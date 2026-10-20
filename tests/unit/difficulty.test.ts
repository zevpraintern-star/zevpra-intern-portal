import { describe, expect, it } from "vitest";

import type { DifficultyLevel } from "@/generated/prisma/enums";
import { difficultyLabel, difficultyTierKey } from "@/lib/difficulty";

const LEVELS: DifficultyLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

describe("difficultyLabel", () => {
  it.each(LEVELS)("%s should map to a readable tier label", (level) => {
    expect(difficultyLabel(level)).toMatch(/^(Easy|Medium|Hard)$/);
  });

  it("maps the three normalized levels to the correct Easy/Medium/Hard wording", () => {
    expect(difficultyLabel("BEGINNER")).toBe("Easy");
    expect(difficultyLabel("INTERMEDIATE")).toBe("Medium");
    expect(difficultyLabel("ADVANCED")).toBe("Hard");
  });
});

describe("difficultyTierKey", () => {
  it.each([
    ["BEGINNER", "standard"],
    ["INTERMEDIATE", "premium"],
    ["ADVANCED", "hard"],
  ] as const)("%s should resolve to the %s certificate template", (level, expected) => {
    expect(difficultyTierKey(level)).toBe(expected);
  });
});