import { describe, it, expect } from "vitest";
import { GameClock, type TimeSource } from "./clock";

// A fake clock we control by hand, standing in for AudioContext.currentTime.
class FakeTimeSource implements TimeSource {
  seconds = 0;
  now(): number {
    return this.seconds;
  }
}

describe("GameClock", () => {
  it("reports 0ms before start() is called", () => {
    const clock = new GameClock(new FakeTimeSource());
    expect(clock.isRunning).toBe(false);
    expect(clock.nowMs()).toBe(0);
  });

  it("starts counting from 0 at start()", () => {
    const source = new FakeTimeSource();
    source.seconds = 10; // clock starts at an arbitrary point in real time
    const clock = new GameClock(source);

    clock.start();
    expect(clock.isRunning).toBe(true);
    expect(clock.nowMs()).toBe(0);
  });

  it("converts elapsed seconds to milliseconds", () => {
    const source = new FakeTimeSource();
    const clock = new GameClock(source);

    clock.start();
    source.seconds += 1.5;

    expect(clock.nowMs()).toBe(1500);
  });
});
