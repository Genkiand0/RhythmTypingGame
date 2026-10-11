import { describe, it, expect } from "vitest";
import { GameSession } from "./session";
import type { Chart } from "./types";

// "cat" at 1000ms -> letters c/a/t at 560/780/1000ms (220ms apart, see letterNotes.ts).
// "dog" at 2000ms -> letters d/o/g at 1560/1780/2000ms.
function makeChart(): Chart {
  return {
    id: "test",
    title: "Test",
    mode: "words",
    language: "en",
    audioSrc: null,
    license: "test",
    notes: [
      { timeMs: 1000, durationMs: 0, display: "cat", reading: "cat" },
      { timeMs: 2000, durationMs: 0, display: "dog", reading: "dog" },
    ],
  };
}

describe("GameSession", () => {
  it("starts on the first letter of the first word", () => {
    const session = new GameSession(makeChart());
    expect(session.currentLetter?.char).toBe("c");
    expect(session.currentLetter?.noteIndex).toBe(0);
    expect(session.isFinished).toBe(false);
  });

  it("judges and advances when a letter is typed on time", () => {
    const session = new GameSession(makeChart());
    session.typeChar("c", 560); // exact hit -> perfect

    expect(session.tracker.counts.perfect).toBe(1);
    expect(session.tracker.combo).toBe(1);
    expect(session.currentLetter?.char).toBe("a");
    expect(session.lastEvent?.judgment).toBe("perfect");
    expect(session.lastEvent?.letter.char).toBe("c");
  });

  it("scores a looser judgment for a less exact hit", () => {
    const session = new GameSession(makeChart());
    session.typeChar("c", 650); // 90ms late -> great

    expect(session.tracker.counts.great).toBe(1);
  });

  it("ignores a wrong letter without advancing", () => {
    const session = new GameSession(makeChart());
    session.typeChar("x", 560);

    expect(session.currentLetter?.char).toBe("c");
    expect(session.tracker.score).toBe(0);
  });

  it("advances letter by letter through a word", () => {
    const session = new GameSession(makeChart());
    session.typeChar("c", 560);
    session.typeChar("a", 780);
    expect(session.currentLetter?.char).toBe("t");
    expect(session.currentLetter?.isLastOfWord).toBe(true);

    session.typeChar("t", 1000);
    expect(session.currentLetter?.char).toBe("d"); // first letter of the next word
    expect(session.tracker.combo).toBe(3);
  });

  it("marks a letter missed once it falls outside the good window, with no keypress", () => {
    const session = new GameSession(makeChart());
    session.update(760); // 200ms past "c"'s time (560ms), outside the 150ms good window

    expect(session.tracker.counts.miss).toBe(1);
    expect(session.currentLetter?.char).toBe("a");
  });

  it("does not miss a letter that is still inside its good window", () => {
    const session = new GameSession(makeChart());
    session.update(660); // 100ms late is still "good"

    expect(session.tracker.counts.miss).toBe(0);
    expect(session.currentLetter?.char).toBe("c");
  });

  it("finishes once every letter has been judged", () => {
    const session = new GameSession(makeChart());
    for (const char of "catdog") session.typeChar(char, 0);

    expect(session.isFinished).toBe(true);
    expect(session.currentLetter).toBeNull();
    expect(session.tracker.counts.perfect + session.tracker.counts.miss).toBe(6);
  });

  it("ignores keypresses once finished", () => {
    const session = new GameSession(makeChart());
    for (const char of "catdog") session.typeChar(char, 0);
    const scoreBefore = session.tracker.score;

    session.typeChar("x", 9999);
    expect(session.tracker.score).toBe(scoreBefore);
  });
});
