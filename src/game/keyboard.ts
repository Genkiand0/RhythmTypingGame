// Layout data for a letters-only QWERTY keyboard. No rendering here —
// just "where does each letter sit" as fractions (0..1), so a canvas
// and an HTML component can both line up against the same key positions
// without duplicating the layout.

/** Each row's letters, in order. Row 0 is the top letter row. */
export const KEY_ROWS: readonly string[] = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** How many key-widths wide the keyboard is, based on the longest row. */
const COLUMN_COUNT = KEY_ROWS[0].length;

/** How far each row is shifted right, in key-widths, like a real keyboard's stagger. */
const ROW_OFFSETS: readonly number[] = [0, 0.5, 1];

export interface KeyPosition {
  row: number;
  /** Center of the key, as a fraction of the keyboard's width (0 = left edge, 1 = right edge). */
  colFraction: number;
}

/** Looks up where a single letter sits on the keyboard. Returns null for anything else. */
export function getKeyPosition(letter: string): KeyPosition | null {
  const lower = letter.toLowerCase();
  for (let row = 0; row < KEY_ROWS.length; row++) {
    const col = KEY_ROWS[row].indexOf(lower);
    if (col !== -1) {
      return { row, colFraction: (ROW_OFFSETS[row] + col + 0.5) / COLUMN_COUNT };
    }
  }
  return null;
}

export const KEYBOARD_ROW_COUNT = KEY_ROWS.length;
