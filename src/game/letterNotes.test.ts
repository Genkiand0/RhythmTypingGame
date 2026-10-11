import { describe, it, expect } from "vitest";
import { expandToLetterNotes } from "./letterNotes";
import type { Note } from "./types";

function note(timeMs: number, reading: string): Note {
  return { timeMs, durationMs: 0, display: reading, reading };
}

describe("expandToLetterNotes", () => {
  it("splits one word into one note per letter, in order", () => {
    const letters = expandToLetterNotes([note(1000, "cat")], 200);

    expect(letters.map((l) => l.char)).toEqual(["c", "a", "t"]);
  });

  it("makes the last letter land exactly on the word's original time", () => {
    const letters = expandToLetterNotes([note(1000, "cat")], 200);

    expect(letters[2].timeMs).toBe(1000);
    expect(letters[2].isLastOfWord).toBe(true);
  });

  it("spaces earlier letters backward by the interval", () => {
    const letters = expandToLetterNotes([note(1000, "cat")], 200);

    expect(letters[1].timeMs).toBe(800);
    expect(letters[0].timeMs).toBe(600);
    expect(letters[0].isLastOfWord).toBe(false);
    expect(letters[1].isLastOfWord).toBe(false);
  });

  it("tracks which word and letter position each note came from", () => {
    const letters = expandToLetterNotes([note(1000, "cat"), note(2000, "dog")], 200);

    expect(letters.map((l) => [l.noteIndex, l.letterIndex])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });

  it("handles a one-letter word", () => {
    const letters = expandToLetterNotes([note(500, "a")], 200);

    expect(letters).toEqual([
      { char: "a", timeMs: 500, noteIndex: 0, letterIndex: 0, isLastOfWord: true },
    ]);
  });

  it("returns nothing for an empty chart", () => {
    expect(expandToLetterNotes([])).toEqual([]);
  });
});
