// Pure math for "where should a falling note be drawn right now?"
// No canvas/DOM here, so it's unit testable; the canvas component just
// calls noteProgress() every animation frame and multiplies by its own
// pixel height.

/** How long (ms) a note takes to fall from the top of the screen to the hit line. */
export const FALL_DURATION_MS = 2000;

/**
 * 0 = note just spawned at the top of the screen.
 * 1 = note is exactly on the hit line (its timeMs).
 * >1 = note has fallen past the hit line (still drawn briefly after a miss).
 */
export function noteProgress(
  nowMs: number,
  noteTimeMs: number,
  fallDurationMs: number = FALL_DURATION_MS,
): number {
  return 1 - (noteTimeMs - nowMs) / fallDurationMs;
}

/** Whether a note is close enough to be worth drawing at all. */
export function isNoteVisible(
  nowMs: number,
  noteTimeMs: number,
  fallDurationMs: number = FALL_DURATION_MS,
): boolean {
  const progress = noteProgress(nowMs, noteTimeMs, fallDurationMs);
  // A little slack (0.15) past the hit line so a missed note doesn't just vanish.
  return progress >= 0 && progress <= 1.15;
}
