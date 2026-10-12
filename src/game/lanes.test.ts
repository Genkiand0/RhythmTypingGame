import { describe, it, expect } from "vitest";
import { getLane, laneEdgesAt, laneEdgesAtY, laneYAt, laneYAtUnclamped, DISTANT_KEYBOARD_SCALE } from "./lanes";
import { getKeySlot, LANE_SPAWN_Y_FRACTION, HIT_BAR_Y_FRACTION } from "./playfield";

describe("getLane", () => {
  it("returns null for a non-letter", () => {
    expect(getLane(" ")).toBeNull();
    expect(getLane("1")).toBeNull();
  });

  it("centers the near (foreground) edges on the key's own slot", () => {
    const slot = getKeySlot("q")!;
    const lane = getLane("q")!;

    expect(lane.nearLeft).toBeCloseTo(slot.leftFraction);
    expect(lane.nearRight).toBeCloseTo(slot.rightFraction);
    expect(lane.row).toBe(slot.row);
  });

  it("ends every lane at the same shared hit-bar height, regardless of row", () => {
    expect(getLane("q")!.nearYFraction).toBeCloseTo(HIT_BAR_Y_FRACTION); // row 0
    expect(getLane("a")!.nearYFraction).toBeCloseTo(HIT_BAR_Y_FRACTION); // row 1
    expect(getLane("z")!.nearYFraction).toBeCloseTo(HIT_BAR_Y_FRACTION); // row 2
  });

  it("shrinks the far (spawn) edges toward the vanishing point", () => {
    const lane = getLane("q")!; // "q" sits near the left edge, far from center
    const farCenter = (lane.farLeft + lane.farRight) / 2;
    const nearCenter = (lane.nearLeft + lane.nearRight) / 2;
    const nearWidth = lane.nearRight - lane.nearLeft;

    expect(lane.farRight - lane.farLeft).toBeCloseTo(nearWidth * DISTANT_KEYBOARD_SCALE);
    expect(Math.abs(farCenter - 0.5)).toBeLessThan(Math.abs(nearCenter - 0.5));
  });

  it("keeps a key near the vanishing point roughly in place", () => {
    // "m" sits close to the middle of the keyboard.
    const lane = getLane("m")!;
    const nearCenter = (lane.nearLeft + lane.nearRight) / 2;
    const farCenter = (lane.farLeft + lane.farRight) / 2;

    expect(farCenter).toBeCloseTo(0.5 + (nearCenter - 0.5) * DISTANT_KEYBOARD_SCALE);
  });
});

describe("laneEdgesAt", () => {
  const lane = getLane("q")!;

  it("is the far edges at t=0 and the near edges at t=1", () => {
    const far = laneEdgesAt(lane, 0);
    expect(far.left).toBeCloseTo(lane.farLeft);
    expect(far.right).toBeCloseTo(lane.farRight);

    const near = laneEdgesAt(lane, 1);
    expect(near.left).toBeCloseTo(lane.nearLeft);
    expect(near.right).toBeCloseTo(lane.nearRight);
  });

  it("interpolates linearly in between", () => {
    const mid = laneEdgesAt(lane, 0.5);
    expect(mid.left).toBeCloseTo((lane.farLeft + lane.nearLeft) / 2);
    expect(mid.right).toBeCloseTo((lane.farRight + lane.nearRight) / 2);
  });

  it("clamps past either end instead of continuing to narrow or widen", () => {
    expect(laneEdgesAt(lane, -1)).toEqual(laneEdgesAt(lane, 0));
    expect(laneEdgesAt(lane, 2)).toEqual(laneEdgesAt(lane, 1));
  });
});

describe("laneYAt", () => {
  it("starts at the shared spawn height and ends at the shared hit bar", () => {
    const lane = getLane("z")!;
    expect(laneYAt(lane, 0)).toBeCloseTo(LANE_SPAWN_Y_FRACTION);
    expect(laneYAt(lane, 1)).toBeCloseTo(HIT_BAR_Y_FRACTION);
  });

  it("gives every lane the same travel distance, regardless of row", () => {
    const topRow = getLane("q")!;
    const bottomRow = getLane("z")!;

    const topTravel = laneYAt(topRow, 1) - laneYAt(topRow, 0);
    const bottomTravel = laneYAt(bottomRow, 1) - laneYAt(bottomRow, 0);
    expect(bottomTravel).toBeCloseTo(topTravel);
  });
});

describe("laneYAtUnclamped", () => {
  it("matches laneYAt within [0, 1]", () => {
    const lane = getLane("z")!;
    expect(laneYAtUnclamped(lane, 0)).toBeCloseTo(laneYAt(lane, 0));
    expect(laneYAtUnclamped(lane, 0.5)).toBeCloseTo(laneYAt(lane, 0.5));
    expect(laneYAtUnclamped(lane, 1)).toBeCloseTo(laneYAt(lane, 1));
  });

  it("keeps growing past the hit bar instead of clamping", () => {
    const lane = getLane("z")!;
    const atBar = laneYAtUnclamped(lane, 1);
    const pastBar = laneYAtUnclamped(lane, 1.2);
    expect(pastBar).toBeGreaterThan(atBar);
  });
});

describe("laneEdgesAtY", () => {
  const lane = getLane("q")!;

  it("matches the clamped edges at the spawn height and the hit-bar height", () => {
    const atSpawn = laneEdgesAtY(lane, LANE_SPAWN_Y_FRACTION);
    expect(atSpawn.left).toBeCloseTo(lane.farLeft);
    expect(atSpawn.right).toBeCloseTo(lane.farRight);

    const atBar = laneEdgesAtY(lane, HIT_BAR_Y_FRACTION);
    expect(atBar.left).toBeCloseTo(lane.nearLeft);
    expect(atBar.right).toBeCloseTo(lane.nearRight);
  });

  it("keeps widening past the hit bar instead of clamping, for drawing keys below it", () => {
    const pastBarY = HIT_BAR_Y_FRACTION + (HIT_BAR_Y_FRACTION - LANE_SPAWN_Y_FRACTION) * 0.1;
    const pastBar = laneEdgesAtY(lane, pastBarY);
    const atBarWidth = lane.nearRight - lane.nearLeft;
    const pastBarWidth = pastBar.right - pastBar.left;

    expect(pastBarWidth).toBeGreaterThan(atBarWidth);
  });
});
