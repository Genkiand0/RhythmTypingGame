import { describe, it, expect } from "vitest";
import {
  noteProgress,
  isNoteVisible,
  noteScale,
  noteAlpha,
  horizontalX,
  horizontalWindowRadiusFraction,
  hitNoteVisual,
  missedNoteVisual,
  clampSpeedMultiplier,
  effectiveFallDurationMs,
  HORIZONTAL_HIT_X_FRACTION,
  HIT_FADE_MS,
  MISSED_FADE_MS,
  FALL_DURATION_MS,
  MIN_SPEED_MULTIPLIER,
  MAX_SPEED_MULTIPLIER,
} from "./render";

describe("effectiveFallDurationMs", () => {
  it("is the base duration at 1x speed", () => {
    expect(effectiveFallDurationMs(1)).toBe(FALL_DURATION_MS);
  });

  it("is faster (shorter duration) above 1x", () => {
    expect(effectiveFallDurationMs(2)).toBe(FALL_DURATION_MS / 2);
  });

  it("is slower (longer duration) below 1x", () => {
    expect(effectiveFallDurationMs(0.5)).toBe(FALL_DURATION_MS / 0.5);
  });
});

describe("clampSpeedMultiplier", () => {
  it("passes values already within range through unchanged", () => {
    expect(clampSpeedMultiplier(1)).toBe(1);
  });

  it("clamps to the min and max bounds", () => {
    expect(clampSpeedMultiplier(0)).toBe(MIN_SPEED_MULTIPLIER);
    expect(clampSpeedMultiplier(100)).toBe(MAX_SPEED_MULTIPLIER);
  });
});

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

describe("hitNoteVisual", () => {
  it("freezes at its judgment-time position", () => {
    const judgedAtMs = FALL_DURATION_MS - 40; // hit slightly early
    const atJudgment = hitNoteVisual(judgedAtMs, FALL_DURATION_MS, judgedAtMs);
    const muchLater = hitNoteVisual(judgedAtMs + 200, FALL_DURATION_MS, judgedAtMs);

    expect(atJudgment?.progress).toBe(muchLater?.progress); // frozen, not advancing
    expect(muchLater!.alpha).toBeLessThan(atJudgment!.alpha); // but still fading
  });

  it("starts at full opacity right at the judgment instant", () => {
    const judgedAtMs = 1000;
    expect(hitNoteVisual(judgedAtMs, FALL_DURATION_MS, judgedAtMs)?.alpha).toBe(1);
  });

  it("disappears once fully faded, using its own HIT_FADE_MS duration", () => {
    const judgedAtMs = 1000;
    expect(hitNoteVisual(judgedAtMs + HIT_FADE_MS + 1, FALL_DURATION_MS, judgedAtMs)).toBeNull();
  });
});

describe("missedNoteVisual", () => {
  it("fades in while approaching and reports full alpha at the bar", () => {
    const early = missedNoteVisual(0, FALL_DURATION_MS);
    expect(early?.progress).toBe(0);
    expect(early?.alpha).toBe(0);

    const atBar = missedNoteVisual(FALL_DURATION_MS, FALL_DURATION_MS);
    expect(atBar?.progress).toBe(1);
    expect(atBar?.alpha).toBe(1);
  });

  it("keeps moving and starts fading once past the bar", () => {
    const justPast = missedNoteVisual(FALL_DURATION_MS + 100, FALL_DURATION_MS);
    expect(justPast?.progress).toBeGreaterThan(1);
    expect(justPast?.alpha).toBeCloseTo(1 - 100 / MISSED_FADE_MS);
  });

  it("disappears once it has fully faded past the bar", () => {
    const longPast = missedNoteVisual(FALL_DURATION_MS + MISSED_FADE_MS + 1, FALL_DURATION_MS);
    expect(longPast).toBeNull();
  });

  it("never stops — it keeps advancing at the same rate even well past the official miss", () => {
    // JUDGE_WINDOWS.good (150ms) is when the miss is officially recorded,
    // but that has no effect here: there's no judgedAtMs to freeze at.
    const justAfterMiss = missedNoteVisual(FALL_DURATION_MS + 150, FALL_DURATION_MS);
    const wellAfterMiss = missedNoteVisual(FALL_DURATION_MS + 400, FALL_DURATION_MS);

    expect(wellAfterMiss!.progress).toBeGreaterThan(justAfterMiss!.progress);

    // Rate is identical to the approach's rate — no slowdown or speedup.
    const rateBefore = missedNoteVisual(600, FALL_DURATION_MS)!.progress - missedNoteVisual(500, FALL_DURATION_MS)!.progress;
    const rateAfter = wellAfterMiss!.progress - justAfterMiss!.progress;
    const rateAfterPerMs = rateAfter / 250;
    expect(rateAfterPerMs).toBeCloseTo(rateBefore / 100);
  });

  it("disappears once fully faded, using MISSED_FADE_MS from when it passed the bar", () => {
    const longAfter = missedNoteVisual(FALL_DURATION_MS + MISSED_FADE_MS + 1, FALL_DURATION_MS);
    expect(longAfter).toBeNull();
  });

  it("is invisible long before a note has spawned", () => {
    expect(missedNoteVisual(-10000, 1000)).toBeNull();
  });

  it("never jumps in opacity across the instant the miss would be officially recorded", () => {
    const noteTimeMs = 1000;
    const missAtMs = noteTimeMs + 150; // JUDGE_WINDOWS.good

    const justBefore = missedNoteVisual(missAtMs - 1, noteTimeMs);
    const justAfter = missedNoteVisual(missAtMs, noteTimeMs);

    expect(justAfter?.alpha).toBeCloseTo(justBefore!.alpha, 1);
  });
});
