// Each letter gets a trapezoidal "lane" running from a tiny, invisible
// copy of the keyboard out at the vanishing point, down to its real key
// in the foreground. A falling note travels along its lane's center line,
// so it always ends up exactly on the key it needs to hit.
//
// All coordinates here are fractions of the play area's width (0..1), not
// pixels — the canvas renderer multiplies by its own width when drawing.

import { getKeyPosition, KEY_WIDTH_FRACTION } from "./keyboard";

/** How much smaller the distant, spawn-point keyboard is than the real one. */
export const DISTANT_KEYBOARD_SCALE = 0.22;

export interface Lane {
  farLeft: number;
  farRight: number;
  nearLeft: number;
  nearRight: number;
}

/** The lane for a single letter, or null if it isn't on the keyboard. */
export function getLane(char: string): Lane | null {
  const pos = getKeyPosition(char);
  if (!pos) return null;

  const halfWidth = KEY_WIDTH_FRACTION / 2;
  const nearLeft = pos.colFraction - halfWidth;
  const nearRight = pos.colFraction + halfWidth;

  // The distant keyboard is the same layout, shrunk toward the center
  // (the vanishing point at 0.5) instead of toward its own left edge.
  const farCenter = 0.5 + (pos.colFraction - 0.5) * DISTANT_KEYBOARD_SCALE;
  const farHalfWidth = halfWidth * DISTANT_KEYBOARD_SCALE;

  return {
    farLeft: farCenter - farHalfWidth,
    farRight: farCenter + farHalfWidth,
    nearLeft,
    nearRight,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The lane's left/right edges at some fraction of the way from spawn (0)
 * to the key (1). Values outside [0, 1] are clamped — a note doesn't
 * keep narrowing before it spawns, or keep widening past the key.
 */
export function laneEdgesAt(lane: Lane, t: number): { left: number; right: number } {
  const clamped = Math.min(Math.max(t, 0), 1);
  return {
    left: lerp(lane.farLeft, lane.nearLeft, clamped),
    right: lerp(lane.farRight, lane.nearRight, clamped),
  };
}
