// How the keyboard sits inside the playfield: centered with margins on
// each side, and reserving a band at the bottom for its three rows. This
// is the single source of truth both the canvas renderer and the
// Keyboard.tsx overlay use, so a note's landing spot and the actual key
// underneath it always line up exactly.
//
// Everything here is in "playfield fractions" (0..1 of the whole play
// area's width/height) rather than pixels, so it works at any canvas size.

import { getKeyPosition, KEY_WIDTH_FRACTION, KEYBOARD_ROW_COUNT } from "./keyboard";

export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 560;

/** The keyboard only spans this much of the playfield's width, centered — leaving margins. */
export const KEYBOARD_WIDTH_FRACTION = 0.7;
export const KEYBOARD_LEFT_FRACTION = (1 - KEYBOARD_WIDTH_FRACTION) / 2;

/** The band at the bottom of the playfield reserved for the keyboard's rows. */
export const KEYBOARD_AREA_HEIGHT_FRACTION = 0.42;
export const KEYBOARD_AREA_TOP_FRACTION = 1 - KEYBOARD_AREA_HEIGHT_FRACTION;

/** Where every lane starts, right near the top of the playfield. */
export const LANE_SPAWN_Y_FRACTION = 0.02;

/**
 * The single shared hit-timing line every lane travels to, regardless of
 * which row its key is in — sitting just above the keyboard itself. The
 * keyboard below it is for identifying keys, not for timing: every lane
 * now covers the exact same vertical distance, which keeps the perceived
 * approach speed consistent across every key.
 */
export const HIT_BAR_Y_FRACTION = 0.555;

/**
 * The vertical center of the keyboard's last (bottom) row. Notes that
 * pass the hit bar unjudged keep heading toward this — not their own
 * key's row — purely as a visual target; the fade-out usually finishes
 * before a note actually gets there.
 */
export const BOTTOM_ROW_CENTER_FRACTION =
  KEYBOARD_AREA_TOP_FRACTION +
  (KEYBOARD_ROW_COUNT - 0.5) * (KEYBOARD_AREA_HEIGHT_FRACTION / KEYBOARD_ROW_COUNT);

export interface KeySlot {
  row: number;
  leftFraction: number;
  rightFraction: number;
  centerFraction: number;
  rowTopFraction: number;
  rowBottomFraction: number;
  rowCenterFraction: number;
}

/** Where a letter's key actually sits in the playfield, or null if it isn't a letter. */
export function getKeySlot(char: string): KeySlot | null {
  const pos = getKeyPosition(char);
  if (!pos) return null;

  const halfWidthFraction = (KEY_WIDTH_FRACTION / 2) * KEYBOARD_WIDTH_FRACTION;
  const centerFraction = KEYBOARD_LEFT_FRACTION + pos.colFraction * KEYBOARD_WIDTH_FRACTION;

  const rowHeightFraction = KEYBOARD_AREA_HEIGHT_FRACTION / KEYBOARD_ROW_COUNT;
  const rowTopFraction = KEYBOARD_AREA_TOP_FRACTION + pos.row * rowHeightFraction;

  return {
    row: pos.row,
    leftFraction: centerFraction - halfWidthFraction,
    rightFraction: centerFraction + halfWidthFraction,
    centerFraction,
    rowTopFraction,
    rowBottomFraction: rowTopFraction + rowHeightFraction,
    rowCenterFraction: rowTopFraction + rowHeightFraction / 2,
  };
}
