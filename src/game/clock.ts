// The game's single source of truth for "what time is it right now".
//
// AGENTS.md says: never use setTimeout/setInterval for note timing, always
// the audio clock. In the browser that's the Web Audio API's AudioContext,
// whose `currentTime` advances in lockstep with actual sound playback and
// doesn't drift or get throttled the way timers can.
//
// GameClock itself doesn't know about AudioContext directly — it takes a
// TimeSource (anything with a `now()` in seconds) so it can be unit tested
// with a fake clock instead of a real browser API.

export interface TimeSource {
  /** Seconds, monotonically increasing. Only the differences between calls matter. */
  now(): number;
}

export class GameClock {
  private startTime: number | null = null;

  constructor(private readonly source: TimeSource) {}

  /** Call once, right when the chart/metronome should begin at time 0. */
  start(): void {
    this.startTime = this.source.now();
  }

  get isRunning(): boolean {
    return this.startTime !== null;
  }

  /** Milliseconds since start(), matching the units Chart/Note use. */
  nowMs(): number {
    if (this.startTime === null) return 0;
    return (this.source.now() - this.startTime) * 1000;
  }
}

/** Wraps a real AudioContext as a TimeSource. Only usable in the browser. */
export function audioContextTimeSource(ctx: AudioContext): TimeSource {
  return { now: () => ctx.currentTime };
}
