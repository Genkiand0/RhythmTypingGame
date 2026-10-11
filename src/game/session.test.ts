import { describe, it, expect } from "vitest";
import { GameSession } from "./session";
import type { Chart } from "./types";

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

function type(session: GameSession, word: string, nowMs: number) {
  for (const char of word) session.typeChar(char, nowMs);
}

describe("GameSession", () => {
  it("starts on the first note", () => {
    const session = new GameSession(makeChart());
    expect(session.currentNote?.reading).toBe("cat");
    expect(session.remainingText).toBe("cat");
    expect(session.isFinished).toBe(false);
  });

  it("judges and advances when a word is typed on time", () => {
    const session = new GameSession(makeChart());
    type(session, "cat", 1000); // exact hit -> perfect

    expect(session.tracker.counts.perfect).toBe(1);
    expect(session.tracker.combo).toBe(1);
    expect(session.currentNote?.reading).toBe("dog");
  });

  it("scores a looser judgment for a less exact hit", () => {
    const session = new GameSession(makeChart());
    type(session, "cat", 1090); // 90ms late -> great

    expect(session.tracker.counts.great).toBe(1);
  });

  it("marks a note missed once it falls outside the good window, with no keypress", () => {
    const session = new GameSession(makeChart());
    session.update(1200); // 200ms past "cat"'s time, outside the 150ms good window

    expect(session.tracker.counts.miss).toBe(1);
    expect(session.currentNote?.reading).toBe("dog");
  });

  it("does not miss a note that is still inside its good window", () => {
    const session = new GameSession(makeChart());
    session.update(1100); // 100ms late is still "good"

    expect(session.tracker.counts.miss).toBe(0);
    expect(session.currentNote?.reading).toBe("cat");
  });

  it("finishes once every note has been judged", () => {
    const session = new GameSession(makeChart());
    type(session, "cat", 1000);
    type(session, "dog", 2000);

    expect(session.isFinished).toBe(true);
    expect(session.currentNote).toBeNull();
    expect(session.tracker.counts.perfect).toBe(2);
  });

  it("ignores keypresses once finished", () => {
    const session = new GameSession(makeChart());
    type(session, "cat", 1000);
    type(session, "dog", 2000);
    session.typeChar("x", 3000);

    expect(session.tracker.score).toBe(600);
  });
});
