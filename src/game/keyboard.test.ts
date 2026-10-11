import { describe, it, expect } from "vitest";
import { getKeyPosition, KEY_ROWS } from "./keyboard";

describe("getKeyPosition", () => {
  it("finds a letter on the top row", () => {
    const pos = getKeyPosition("q");
    expect(pos?.row).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(getKeyPosition("Q")).toEqual(getKeyPosition("q"));
  });

  it("places the top row's first and last keys near the left and right edges", () => {
    const first = getKeyPosition("q")!;
    const last = getKeyPosition("p")!;
    expect(first.colFraction).toBeLessThan(0.15);
    expect(last.colFraction).toBeGreaterThan(0.85);
  });

  it("returns a position for every letter in every row", () => {
    for (const row of KEY_ROWS) {
      for (const letter of row) {
        expect(getKeyPosition(letter)).not.toBeNull();
      }
    }
  });

  it("returns null for non-letters", () => {
    expect(getKeyPosition(" ")).toBeNull();
    expect(getKeyPosition("1")).toBeNull();
    expect(getKeyPosition(".")).toBeNull();
  });

  it("keeps every column fraction within 0 and 1", () => {
    for (const row of KEY_ROWS) {
      for (const letter of row) {
        const pos = getKeyPosition(letter)!;
        expect(pos.colFraction).toBeGreaterThan(0);
        expect(pos.colFraction).toBeLessThan(1);
      }
    }
  });
});
