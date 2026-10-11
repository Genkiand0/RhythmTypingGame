// Which metronome click times fall within an upcoming scheduling window.
//
// Scheduling audio precisely from requestAnimationFrame (which only fires
// ~60 times a second and can jitter) means looking a little ahead each
// frame and handing exact times to the AudioContext, which does the
// actual precise playback. This module only computes *which* beat times
// need scheduling; the AudioContext glue lives in the React layer since
// it isn't something plain TypeScript can unit test anyway.

export const DEFAULT_BPM = 120;

export function beatIntervalMs(bpm: number = DEFAULT_BPM): number {
  return 60000 / bpm;
}

/**
 * Returns every beat time (ms, on the game clock) that is after `afterMs`
 * and no later than `scheduleUntilMs`. Call this each frame with the last
 * beat you already scheduled as `afterMs`, so each beat is returned once.
 */
export function upcomingBeats(
  afterMs: number,
  scheduleUntilMs: number,
  bpm: number = DEFAULT_BPM,
): number[] {
  const interval = beatIntervalMs(bpm);
  const beats: number[] = [];

  let next = Math.floor(afterMs / interval + 1) * interval;
  while (next <= scheduleUntilMs) {
    beats.push(next);
    next += interval;
  }

  return beats;
}
