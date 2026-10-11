import { describe, it, expect } from "vitest";
import { ScoreTracker } from "./tracker";

describe("ScoreTracker", () => {
  it("starts at zero", () => {
    const tracker = new ScoreTracker();
    expect(tracker.score).toBe(0);
    expect(tracker.combo).toBe(0);
    expect(tracker.maxCombo).toBe(0);
    expect(tracker.counts).toEqual({ perfect: 0, great: 0, good: 0, miss: 0 });
  });

  it("adds points and grows combo on a non-miss judgment", () => {
    const tracker = new ScoreTracker();
    tracker.recordJudgment("perfect");

    expect(tracker.score).toBe(300);
    expect(tracker.combo).toBe(1);
    expect(tracker.maxCombo).toBe(1);
    expect(tracker.counts.perfect).toBe(1);
  });

  it("keeps growing combo across consecutive hits", () => {
    const tracker = new ScoreTracker();
    tracker.recordJudgment("perfect");
    tracker.recordJudgment("great");
    tracker.recordJudgment("good");

    expect(tracker.combo).toBe(3);
    expect(tracker.maxCombo).toBe(3);
    expect(tracker.score).toBe(300 + 200 + 100);
  });

  it("resets combo to zero on a miss, but keeps the score", () => {
    const tracker = new ScoreTracker();
    tracker.recordJudgment("perfect");
    tracker.recordJudgment("perfect");
    tracker.recordJudgment("miss");

    expect(tracker.combo).toBe(0);
    expect(tracker.score).toBe(600);
    expect(tracker.counts.miss).toBe(1);
  });

  it("remembers the highest combo even after it resets", () => {
    const tracker = new ScoreTracker();
    tracker.recordJudgment("perfect");
    tracker.recordJudgment("perfect");
    tracker.recordJudgment("perfect");
    tracker.recordJudgment("miss");
    tracker.recordJudgment("perfect");

    expect(tracker.combo).toBe(1);
    expect(tracker.maxCombo).toBe(3);
  });

  it("tracks counts per judgment type", () => {
    const tracker = new ScoreTracker();
    tracker.recordJudgment("perfect");
    tracker.recordJudgment("perfect");
    tracker.recordJudgment("great");
    tracker.recordJudgment("miss");

    expect(tracker.counts).toEqual({ perfect: 2, great: 1, good: 0, miss: 1 });
  });

  it("returns a copy of counts, not a live reference", () => {
    const tracker = new ScoreTracker();
    const counts = tracker.counts;
    counts.perfect = 999;

    expect(tracker.counts.perfect).toBe(0);
  });
});
