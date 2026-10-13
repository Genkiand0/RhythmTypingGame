// Pure math for "where should a falling note be drawn right now?"
// No canvas/DOM here, so it's unit testable; the canvas component just
// calls noteProgress() every animation frame and multiplies by its own
// pixel height.

import type { Judgment } from "./types";

/** How long (ms) a note takes to fall from the top of the screen to the hit line, at 1x speed. */
export const FALL_DURATION_MS = 2000;

/** Bounds and step for the player-adjustable speed multiplier (the +/- buttons). */
export const DEFAULT_SPEED_MULTIPLIER = 1;
export const MIN_SPEED_MULTIPLIER = 0.1;
export const MAX_SPEED_MULTIPLIER = 10;
export const SPEED_MULTIPLIER_STEP = 0.25;

export function clampSpeedMultiplier(value: number): number {
  return Math.min(MAX_SPEED_MULTIPLIER, Math.max(MIN_SPEED_MULTIPLIER, value));
}

/**
 * How long a note's fall actually takes at a given speed multiplier —
 * a higher multiplier means less time, i.e. faster. This only changes
 * how quickly notes visually travel (and so how much advance warning a
 * player gets); it does not touch JUDGE_WINDOWS, so hit timing accuracy
 * is identical at every speed.
 */
export function effectiveFallDurationMs(
  speedMultiplier: number,
  baseFallDurationMs: number = FALL_DURATION_MS,
): number {
  return baseFallDurationMs / speedMultiplier;
}

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

/**
 * The accepted timing window's radius in the horizontal stream, as a
 * fraction of that display's width — i.e. how far (in screen space) a
 * note travels during the loosest judge window either side of its
 * timeMs. A note hit while still inside this radius of the bar can still
 * score; a wrong key there should feel like a real rejection, not a
 * missed target.
 */
export function horizontalWindowRadiusFraction(
  windowMs: number,
  fallDurationMs: number = FALL_DURATION_MS,
  hitXFraction: number = HORIZONTAL_HIT_X_FRACTION,
  spawnXFraction: number = HORIZONTAL_SPAWN_X_FRACTION,
): number {
  const speedFractionPerMs = Math.abs(hitXFraction - spawnXFraction) / fallDurationMs;
  return speedFractionPerMs * windowMs;
}

/** How long an unjudged note keeps fading after it passes the hit bar, and how long a judged (non-perfect) note fades once frozen. */
export const PASS_THROUGH_FADE_MS = 750;

export interface NoteVisual {
  /** Where to draw the note — not clamped, since it keeps moving past the bar. */
  progress: number;
  alpha: number;
}

/**
 * How a falling note should look right now, given whether (and when)
 * it's been judged. Notes no longer stop at the hit bar: an unjudged
 * note keeps moving at the same steady rate, and only starts fading once
 * it's past the bar with no input yet. A judged note (anything but
 * "perfect", which bursts instead of fading) freezes at the position it
 * had the instant it was judged, then fades from there.
 *
 * Returns null once the note has fully faded and shouldn't be drawn.
 */
export function noteVisual(
  nowMs: number,
  noteTimeMs: number,
  judgment: Judgment | undefined,
  judgedAtMs: number | undefined,
  fallDurationMs: number = FALL_DURATION_MS,
  fadeDurationMs: number = PASS_THROUGH_FADE_MS,
): NoteVisual | null {
  if (judgment !== undefined && judgedAtMs !== undefined) {
    // Fade continuously from whichever came first — the judgment itself
    // (an early or on-time hit) or the moment the note passed the bar
    // unjudged (a late hit, or an eventual miss) — so there's never a
    // visible jump in opacity right as a miss gets officially recorded;
    // it was already fading from the moment it passed the bar.
    const fadeStartMs = Math.min(judgedAtMs, noteTimeMs);
    const elapsed = nowMs - fadeStartMs;
    if (elapsed < 0 || elapsed > fadeDurationMs) return null;
    return {
      progress: noteProgress(judgedAtMs, noteTimeMs, fallDurationMs),
      alpha: 1 - elapsed / fadeDurationMs,
    };
  }

  const progress = noteProgress(nowMs, noteTimeMs, fallDurationMs);
  if (progress < 0) return null;
  if (progress <= 1) return { progress, alpha: noteAlpha(progress) };

  // Past the bar, never judged: keep moving, but start fading right away.
  const elapsedSincePassingBar = nowMs - noteTimeMs;
  if (elapsedSincePassingBar > fadeDurationMs) return null;
  return { progress, alpha: Math.max(0, 1 - elapsedSincePassingBar / fadeDurationMs) };
}
