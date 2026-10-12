// Splits each word in a Chart into one falling note per letter, so the
// player types "cat" as c -> a -> t instead of all at once.
//
// A word's *last* letter keeps the word's original timeMs, so the word
// still lands on the beat the chart author placed it at; earlier letters
// are spaced backward from there. That way charts don't need to change
// to describe per-letter timing.

import type { Judgment, Note } from "./types";

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
  /**
   * Set once GameSession judges this letter (hit or auto-missed). Both
   * displays (the perspective view and the horizontal stream) read this
   * directly to decide how to animate the note — frozen-and-fading,
   * bursting, or ejected — instead of each tracking their own copy.
   */
  judgment?: Judgment;
  /** The game-clock time judgment happened, paired with `judgment`. */
  judgedAtMs?: number;
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

/** A subtle marker between two words, for displays that scroll letters by. */
export interface WordSeparator {
  /** Sits halfway between the previous word's last letter and this word's first. */
  timeMs: number;
}

/** One separator between each pair of consecutive words — none before the first word. */
export function getWordSeparators(
  notes: readonly Note[],
  letters: readonly LetterNote[],
): WordSeparator[] {
  const separators: WordSeparator[] = [];

  for (let noteIndex = 1; noteIndex < notes.length; noteIndex++) {
    const previousWordEndMs = notes[noteIndex - 1].timeMs;
    const thisWordStart = letters.find((l) => l.noteIndex === noteIndex && l.letterIndex === 0);
    const thisWordStartMs = thisWordStart ? thisWordStart.timeMs : notes[noteIndex].timeMs;
    separators.push({ timeMs: (previousWordEndMs + thisWordStartMs) / 2 });
  }

  return separators;
}
