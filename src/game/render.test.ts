import { describe, it, expect } from "vitest";
import {
  noteProgress,
  isNoteVisible,
  noteScale,
  noteAlpha,
  horizontalX,
  horizontalWindowRadiusFraction,
  noteVisual,
  HORIZONTAL_HIT_X_FRACTION,
  PASS_THROUGH_FADE_MS,
  FALL_DURATION_MS,
} from "./render";

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

describe("noteScale", () => {
  it("is smallest at spawn and largest at the hit line", () => {
    expect(noteScale(0)).toBe(0.35);
    expect(noteScale(1)).toBe(1.4);
  });

  it("grows at a constant rate, so the approach never accelerates or stalls", () => {
    const earlyGrowth = noteScale(0.5) - noteScale(0);
    const lateGrowth = noteScale(1) - noteScale(0.5);
    expect(lateGrowth).toBeCloseTo(earlyGrowth);
  });

  it("clamps to the max size once a note is past the hit line", () => {
    expect(noteScale(1.5)).toBe(1.4);
  });

  it("clamps to the min size before a note has spawned", () => {
    expect(noteScale(-1)).toBe(0.35);
  });
});

describe("noteAlpha", () => {
  it("is invisible before spawning", () => {
    expect(noteAlpha(-0.1)).toBe(0);
  });

  it("fades in just after spawning", () => {
    expect(noteAlpha(0)).toBe(0);
    expect(noteAlpha(0.075)).toBeCloseTo(0.5);
  });

  it("is fully opaque through the middle of the fall and at the hit line", () => {
    expect(noteAlpha(0.5)).toBe(1);
    expect(noteAlpha(1)).toBe(1);
  });

  it("fades out after passing the hit line", () => {
    expect(noteAlpha(1.075)).toBeCloseTo(0.5);
    expect(noteAlpha(1.15)).toBeCloseTo(0, 5);
  });
});

describe("horizontalX", () => {
  it("starts off-screen to the right and ends exactly at the hit bar", () => {
    expect(horizontalX(0)).toBeGreaterThan(1);
    expect(horizontalX(1)).toBeCloseTo(HORIZONTAL_HIT_X_FRACTION);
  });

  it("moves strictly right-to-left as progress increases", () => {
    expect(horizontalX(0.25)).toBeGreaterThan(horizontalX(0.5));
    expect(horizontalX(0.5)).toBeGreaterThan(horizontalX(0.75));
  });

  it("keeps moving left past the hit bar instead of stopping", () => {
    expect(horizontalX(1.1)).toBeLessThan(HORIZONTAL_HIT_X_FRACTION);
  });
});

describe("horizontalWindowRadiusFraction", () => {
  it("grows with a wider accepted timing window", () => {
    expect(horizontalWindowRadiusFraction(150)).toBeGreaterThan(horizontalWindowRadiusFraction(50));
  });

  it("is zero for a zero-width window", () => {
    expect(horizontalWindowRadiusFraction(0)).toBe(0);
  });

  it("is always positive, regardless of travel direction", () => {
    expect(horizontalWindowRadiusFraction(150)).toBeGreaterThan(0);
  });
});

describe("noteVisual", () => {
  it("fades in while approaching and reports full alpha at the bar, unjudged", () => {
    const early = noteVisual(0, FALL_DURATION_MS, undefined, undefined);
    expect(early?.progress).toBe(0);
    expect(early?.alpha).toBe(0);

    const atBar = noteVisual(FALL_DURATION_MS, FALL_DURATION_MS, undefined, undefined);
    expect(atBar?.progress).toBe(1);
    expect(atBar?.alpha).toBe(1);
  });

  it("keeps moving and starts fading once unjudged and past the bar", () => {
    const justPast = noteVisual(FALL_DURATION_MS + 100, FALL_DURATION_MS, undefined, undefined);
    expect(justPast?.progress).toBeGreaterThan(1);
    expect(justPast?.alpha).toBeCloseTo(1 - 100 / PASS_THROUGH_FADE_MS);
  });

  it("disappears once an unjudged note has fully faded past the bar", () => {
    const longPast = noteVisual(FALL_DURATION_MS + PASS_THROUGH_FADE_MS + 1, FALL_DURATION_MS, undefined, undefined);
    expect(longPast).toBeNull();
  });

  it("freezes a judged (non-perfect) note at its judgment-time position", () => {
    const judgedAtMs = FALL_DURATION_MS - 40; // hit slightly early
    const atJudgment = noteVisual(judgedAtMs, FALL_DURATION_MS, "great", judgedAtMs);
    const muchLater = noteVisual(judgedAtMs + 200, FALL_DURATION_MS, "great", judgedAtMs);

    expect(atJudgment?.progress).toBe(muchLater?.progress); // frozen, not advancing
    expect(muchLater!.alpha).toBeLessThan(atJudgment!.alpha); // but still fading
  });

  it("disappears once a judged note has fully faded", () => {
    const judgedAtMs = 1000;
    const longAfter = noteVisual(judgedAtMs + PASS_THROUGH_FADE_MS + 1, 1000, "miss", judgedAtMs);
    expect(longAfter).toBeNull();
  });

  it("is invisible long before a note has spawned", () => {
    expect(noteVisual(-10000, 1000, undefined, undefined)).toBeNull();
  });

  it("never jumps in opacity the instant an unjudged note gets auto-marked a miss", () => {
    const noteTimeMs = 1000;
    const missAtMs = noteTimeMs + 150; // JUDGE_WINDOWS.good

    // The frame just before the miss is recorded (still unjudged)...
    const justBefore = noteVisual(missAtMs - 1, noteTimeMs, undefined, undefined);
    // ...and the very next frame, now freshly judged "miss" — should read
    // the same alpha, not snap back up to 1.
    const justAfter = noteVisual(missAtMs, noteTimeMs, "miss", missAtMs);

    expect(justAfter?.alpha).toBeCloseTo(justBefore!.alpha, 1);
  });
});
