import { describe, it, expect } from "vitest";
import { beatIntervalMs, upcomingBeats, DEFAULT_BPM } from "./metronome";

describe("beatIntervalMs", () => {
  it("is 500ms at the default 120 BPM", () => {
    expect(beatIntervalMs()).toBe(500);
    expect(beatIntervalMs(DEFAULT_BPM)).toBe(500);
  });

  it("is 1000ms at 60 BPM", () => {
    expect(beatIntervalMs(60)).toBe(1000);
  });
});

describe("upcomingBeats", () => {
  it("returns the first beat after time 0", () => {
    expect(upcomingBeats(0, 600)).toEqual([500]);
  });

  it("returns every beat in a wider window", () => {
    expect(upcomingBeats(0, 1600)).toEqual([500, 1000, 1500]);
  });

  it("never returns a beat at or before afterMs, so each beat is only scheduled once", () => {
    const first = upcomingBeats(0, 600);
    const second = upcomingBeats(first[0], 1100);
    expect(second).toEqual([1000]);
  });

  it("returns nothing when the window doesn't reach the next beat", () => {
    expect(upcomingBeats(0, 100)).toEqual([]);
  });
});
