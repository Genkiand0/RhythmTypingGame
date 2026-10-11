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

/**
 * How big a falling note should be drawn, to fake a "coming toward the
 * camera" perspective: small and distant at progress 0, full size at the
 * hit line (progress 1). Growth is squared (slow at first, fast near the
 * end) because that's how perspective size actually behaves — apparent
 * size grows with 1/distance, not linearly with time.
 */
export function noteScale(progress: number, minScale = 0.35, maxScale = 1.4): number {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return minScale + (maxScale - minScale) * clamped ** 2;
}

/**
 * Opacity for a falling note: fades in just after it spawns (instead of
 * popping into existence) and fades out shortly after it passes the hit
 * line (instead of vanishing instantly).
 */
export function noteAlpha(progress: number): number {
  const fadeInEnd = 0.15;
  const fadeOutDuration = 0.15; // matches isNoteVisible's 1.15 cutoff

  if (progress < 0) return 0;
  if (progress < fadeInEnd) return progress / fadeInEnd;
  if (progress > 1) return Math.max(0, 1 - (progress - 1) / fadeOutDuration);
  return 1;
}
