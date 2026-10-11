// Splits each word in a Chart into one falling note per letter, so the
// player types "cat" as c -> a -> t instead of all at once.
//
// A word's *last* letter keeps the word's original timeMs, so the word
// still lands on the beat the chart author placed it at; earlier letters
// are spaced backward from there. That way charts don't need to change
// to describe per-letter timing.

import type { Note } from "./types";

/** Time between consecutive letters of the same word. */
export const LETTER_INTERVAL_MS = 220;

export interface LetterNote {
  /** The character the player must type for this note. */
  char: string;
  /** When this letter should be hit, in the same clock as Note.timeMs. */
  timeMs: number;
  /** Index of the parent word in the chart's notes array. */
  noteIndex: number;
  /** Index of this letter within its word's reading. */
  letterIndex: number;
  /** True for a word's final letter — completing it finishes the word. */
  isLastOfWord: boolean;
}

export function expandToLetterNotes(
  notes: readonly Note[],
  intervalMs: number = LETTER_INTERVAL_MS,
): LetterNote[] {
  const letterNotes: LetterNote[] = [];

  notes.forEach((note, noteIndex) => {
    const letters = [...note.reading];
    letters.forEach((char, letterIndex) => {
      const lettersAfter = letters.length - 1 - letterIndex;
      letterNotes.push({
        char,
        timeMs: note.timeMs - lettersAfter * intervalMs,
        noteIndex,
        letterIndex,
        isLastOfWord: letterIndex === letters.length - 1,
      });
    });
  });

  return letterNotes;
}
