// Each letter gets a trapezoidal "lane" running from a tiny, invisible
// copy of the keyboard out at the vanishing point, down to the shared
// hit-timing bar above the keyboard. A falling note travels along its
// lane's center line, so it always arrives exactly where it should —
// and because every lane ends at the same shared bar (not each key's own
// row), every lane covers the same vertical distance, keeping approach
// speed consistent across every key.
//
// All coordinates here are fractions of the playfield's width/height
// (0..1), not pixels — the canvas renderer multiplies by its own
// dimensions when drawing.

import { getKeySlot, LANE_SPAWN_Y_FRACTION, HIT_BAR_Y_FRACTION, BOTTOM_ROW_CENTER_FRACTION } from "./playfield";

/** How much smaller the distant, spawn-point keyboard is than the real one. */
export const DISTANT_KEYBOARD_SCALE = 0.22;

export interface Lane {
  farLeft: number;
  farRight: number;
  nearLeft: number;
  nearRight: number;
  /** The shared hit-bar height — the same for every lane. */
  nearYFraction: number;
  row: number;
}

/** The lane for a single letter, or null if it isn't on the keyboard. */
export function getLane(char: string): Lane | null {
  const slot = getKeySlot(char);
  if (!slot) return null;

  const nearHalfWidth = (slot.rightFraction - slot.leftFraction) / 2;

  // The distant keyboard is the same layout, shrunk toward the center
  // (the vanishing point at 0.5) instead of toward its own left edge.
  const farCenter = 0.5 + (slot.centerFraction - 0.5) * DISTANT_KEYBOARD_SCALE;
  const farHalfWidth = nearHalfWidth * DISTANT_KEYBOARD_SCALE;

  return {
    farLeft: farCenter - farHalfWidth,
    farRight: farCenter + farHalfWidth,
    nearLeft: slot.leftFraction,
    nearRight: slot.rightFraction,
    nearYFraction: HIT_BAR_Y_FRACTION,
    row: slot.row,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(t: number): number {
  return Math.min(Math.max(t, 0), 1);
}

/** Converts a Y position into the lane's own 0 (spawn) .. 1 (hit bar) parameter, unclamped. */
function tForY(lane: Lane, yFraction: number): number {
  return (yFraction - LANE_SPAWN_Y_FRACTION) / (lane.nearYFraction - LANE_SPAWN_Y_FRACTION);
}

/**
 * The lane's left/right edges at some fraction of the way from spawn (0)
 * to the hit bar (1). Values outside [0, 1] are clamped — a note doesn't
 * keep narrowing before it spawns, or keep widening past the bar.
 */
export function laneEdgesAt(lane: Lane, t: number): { left: number; right: number } {
  const clamped = clamp01(t);
  return {
    left: lerp(lane.farLeft, lane.nearLeft, clamped),
    right: lerp(lane.farRight, lane.nearRight, clamped),
  };
}

/** The lane's vertical position at the same fraction t, from spawn to the hit bar. */
export function laneYAt(lane: Lane, t: number): number {
  const clamped = clamp01(t);
  return lerp(LANE_SPAWN_Y_FRACTION, lane.nearYFraction, clamped);
}

/**
 * How much of the lane's own "t" scale it takes, past the hit bar, for
 * the pass-through leg to reach the bottom keyboard row. Kept short —
 * notes are usually fully faded out well before reaching it; this is
 * only about giving the brief visible portion a believable direction,
 * not about ever actually arriving there.
 */
const PASS_THROUGH_T_SPAN = 0.4;

/**
 * The same vertical interpolation as laneYAt, but NOT clamped to [0, 1] —
 * a note that hasn't been hit keeps traveling straight through the hit
 * bar rather than stopping there. Past t=1 it switches to a second,
 * steeper leg heading toward the bottom keyboard row (not back toward
 * its own key's row), so it reads as diving into the keyboard rather
 * than merely drifting a little past the bar.
 */
export function laneYAtUnclamped(lane: Lane, t: number): number {
  if (t <= 1) return lerp(LANE_SPAWN_Y_FRACTION, lane.nearYFraction, t);

  const passThroughT = Math.min((t - 1) / PASS_THROUGH_T_SPAN, 1);
  return lerp(lane.nearYFraction, BOTTOM_ROW_CENTER_FRACTION, passThroughT);
}

/**
 * The lane's left/right edges at an arbitrary Y position, NOT clamped to
 * the spawn/hit-bar range. The lane is a straight line from spawn to the
 * hit bar, so that same line extrapolates cleanly past the bar — which is
 * exactly what drawing the keyboard's keys (below the bar) and a note's
 * local frame (a small span around its current position) both need.
 */
export function laneEdgesAtY(lane: Lane, yFraction: number): { left: number; right: number } {
  const t = tForY(lane, yFraction);
  return {
    left: lerp(lane.farLeft, lane.nearLeft, t),
    right: lerp(lane.farRight, lane.nearRight, t),
  };
}
