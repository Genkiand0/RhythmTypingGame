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
 * hit line (progress 1). Growth is linear in time — a note's speed and
 * size both change at a constant rate, so the approach never looks like
 * it's accelerating into a last-moment pop or stalling beforehand.
 */
export function noteScale(progress: number, minScale = 0.35, maxScale = 1.4): number {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return minScale + (maxScale - minScale) * clamped;
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

/**
 * Where a horizontally-scrolling note (or word separator) sits, as a
 * fraction of that display's own width. It shares noteProgress() with the
 * falling-note view, so a letter crosses this stream's hit bar at exactly
 * the same moment its perspective counterpart crosses the one above the
 * keyboard — same progress value, same instant.
 */
export const HORIZONTAL_HIT_X_FRACTION = 0.25;
const HORIZONTAL_SPAWN_X_FRACTION = 1.05;

export function horizontalX(
  progress: number,
  hitXFraction: number = HORIZONTAL_HIT_X_FRACTION,
  spawnXFraction: number = HORIZONTAL_SPAWN_X_FRACTION,
): number {
  return spawnXFraction + (hitXFraction - spawnXFraction) * progress;
}
