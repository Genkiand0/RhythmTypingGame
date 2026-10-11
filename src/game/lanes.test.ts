import { describe, it, expect } from "vitest";
import { getLane, laneEdgesAt, DISTANT_KEYBOARD_SCALE } from "./lanes";
import { getKeyPosition, KEY_WIDTH_FRACTION } from "./keyboard";

describe("getLane", () => {
  it("returns null for a non-letter", () => {
    expect(getLane(" ")).toBeNull();
    expect(getLane("1")).toBeNull();
  });

  it("centers the near (foreground) edges on the key's own position", () => {
    const pos = getKeyPosition("q")!;
    const lane = getLane("q")!;

    expect((lane.nearLeft + lane.nearRight) / 2).toBeCloseTo(pos.colFraction);
    expect(lane.nearRight - lane.nearLeft).toBeCloseTo(KEY_WIDTH_FRACTION);
  });

  it("shrinks the far (spawn) edges toward the vanishing point", () => {
    const lane = getLane("q")!; // "q" sits near the left edge, far from center
    const farCenter = (lane.farLeft + lane.farRight) / 2;
    const nearCenter = (lane.nearLeft + lane.nearRight) / 2;

    expect(lane.farRight - lane.farLeft).toBeCloseTo(KEY_WIDTH_FRACTION * DISTANT_KEYBOARD_SCALE);
    // The far center sits between the vanishing point (0.5) and the near center,
    // much closer to 0.5.
    expect(Math.abs(farCenter - 0.5)).toBeLessThan(Math.abs(nearCenter - 0.5));
  });

  it("keeps a key near the vanishing point roughly in place", () => {
    // "m" (row 2) sits close to the middle of the keyboard.
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
