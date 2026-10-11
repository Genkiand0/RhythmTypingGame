import { describe, it, expect } from "vitest";
import {
  getKeySlot,
  KEYBOARD_LEFT_FRACTION,
  KEYBOARD_WIDTH_FRACTION,
  KEYBOARD_AREA_TOP_FRACTION,
} from "./playfield";

describe("getKeySlot", () => {
  it("returns null for a non-letter", () => {
    expect(getKeySlot(" ")).toBeNull();
    expect(getKeySlot("5")).toBeNull();
  });

  it("keeps every key within the keyboard's centered margin", () => {
    for (const char of "qwertyuiopasdfghjklzxcvbnm") {
      const slot = getKeySlot(char)!;
      expect(slot.leftFraction).toBeGreaterThanOrEqual(KEYBOARD_LEFT_FRACTION - 1e-9);
      expect(slot.rightFraction).toBeLessThanOrEqual(
        KEYBOARD_LEFT_FRACTION + KEYBOARD_WIDTH_FRACTION + 1e-9,
      );
    }
  });

  it("places row 0 above row 1 above row 2", () => {
    const row0 = getKeySlot("q")!;
    const row1 = getKeySlot("a")!;
    const row2 = getKeySlot("z")!;

    expect(row0.rowTopFraction).toBeLessThan(row1.rowTopFraction);
    expect(row1.rowTopFraction).toBeLessThan(row2.rowTopFraction);
  });

  it("starts the keyboard's rows at the reserved area's top", () => {
    const row0 = getKeySlot("q")!;
    expect(row0.rowTopFraction).toBeCloseTo(KEYBOARD_AREA_TOP_FRACTION);
  });

  it("gives every row the same height", () => {
    const row0 = getKeySlot("q")!;
    const row1 = getKeySlot("a")!;
    expect(row1.rowTopFraction - row0.rowTopFraction).toBeCloseTo(
      row0.rowBottomFraction - row0.rowTopFraction,
    );
  });

  it("centers a key between its own left and right edges", () => {
    const slot = getKeySlot("g")!;
    expect(slot.centerFraction).toBeCloseTo((slot.leftFraction + slot.rightFraction) / 2);
  });
});
