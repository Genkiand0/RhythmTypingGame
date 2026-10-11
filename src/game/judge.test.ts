import { describe, it, expect } from "vitest";
import { judge } from "./judge";

// JUDGE_WINDOWS is { perfect: 50, great: 100, good: 150 }.
// We test right on each boundary, since off-by-one errors are the
// easiest mistake to make in a function like this.

describe("judge", () => {
  it("returns perfect for an exact hit", () => {
    expect(judge(1000, 1000)).toBe("perfect");
  });

  it("returns perfect at the edge of the perfect window (50ms)", () => {
    expect(judge(1000, 1050)).toBe("perfect");
    expect(judge(1000, 950)).toBe("perfect");
  });

  it("returns great just past the perfect window", () => {
    expect(judge(1000, 1051)).toBe("great");
  });

  it("returns great at the edge of the great window (100ms)", () => {
    expect(judge(1000, 1100)).toBe("great");
    expect(judge(1000, 900)).toBe("great");
  });

  it("returns good just past the great window", () => {
    expect(judge(1000, 1101)).toBe("good");
  });

  it("returns good at the edge of the good window (150ms)", () => {
    expect(judge(1000, 1150)).toBe("good");
    expect(judge(1000, 850)).toBe("good");
  });

  it("returns miss just past the good window", () => {
    expect(judge(1000, 1151)).toBe("miss");
    expect(judge(1000, 849)).toBe("miss");
  });

  it("returns miss for a wildly late or early hit", () => {
    expect(judge(1000, 5000)).toBe("miss");
    expect(judge(5000, 1000)).toBe("miss");
  });

  it("treats early and late hits the same", () => {
    expect(judge(1000, 1030)).toBe(judge(1000, 970));
  });
});
