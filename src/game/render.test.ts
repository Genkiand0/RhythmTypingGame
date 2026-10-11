import { describe, it, expect } from "vitest";
import { noteProgress, isNoteVisible, FALL_DURATION_MS } from "./render";

describe("noteProgress", () => {
  it("is 0 when the note just spawned (one fall-duration before its time)", () => {
    expect(noteProgress(0, FALL_DURATION_MS)).toBe(0);
  });

  it("is 1 exactly when the note is due", () => {
    expect(noteProgress(2000, 2000)).toBe(1);
  });

  it("is 0.5 halfway through the fall", () => {
    expect(noteProgress(1000, 2000)).toBe(0.5);
  });

  it("goes past 1 after the note's time has passed", () => {
    expect(noteProgress(2000, 1000)).toBeGreaterThan(1);
  });
});

describe("isNoteVisible", () => {
  it("is not visible long before it spawns", () => {
    expect(isNoteVisible(0, 10000)).toBe(false);
  });

  it("is visible right as it spawns and right at the hit line", () => {
    expect(isNoteVisible(0, FALL_DURATION_MS)).toBe(true);
    expect(isNoteVisible(FALL_DURATION_MS, FALL_DURATION_MS)).toBe(true);
  });

  it("stays visible briefly after the hit line, then disappears", () => {
    expect(isNoteVisible(2100, 2000)).toBe(true);
    expect(isNoteVisible(2400, 2000)).toBe(false);
  });
});
