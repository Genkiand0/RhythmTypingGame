// Plays one Chart from start to finish: advances through its notes one
// *letter* at a time, turns keypresses into judgments, and feeds those
// into a ScoreTracker.
//
// This is the piece that connects judge.ts, tracker.ts and letterNotes.ts.
// It only needs a clock reading in milliseconds, so it has no idea
// whether that time came from a real AudioContext or a test fake.

import type { Chart, Judgment } from "./types";
import { JUDGE_WINDOWS } from "./types";
import { judge } from "./judge";
import { ScoreTracker } from "./tracker";
import { expandToLetterNotes, getWordSeparators, type LetterNote, type WordSeparator } from "./letterNotes";

/** A judgment that just happened, for the UI to display at the note's spot. */
export interface JudgmentEvent {
  judgment: Judgment;
  letter: LetterNote;
  atMs: number;
}

export class GameSession {
  /** Every letter of the whole chart, in order. Rendered as individual falling notes. */
  readonly letters: readonly LetterNote[];
  /** For displays (like a scrolling word stream) that want a marker between words. */
  readonly wordSeparators: readonly WordSeparator[];
  private index = 0;
  readonly tracker = new ScoreTracker();
  private lastEvent_: JudgmentEvent | null = null;

  constructor(private readonly chart: Chart) {
    this.letters = expandToLetterNotes(chart.notes);
    this.wordSeparators = getWordSeparators(chart.notes, this.letters);
  }

  get currentLetter(): LetterNote | null {
    return this.letters[this.index] ?? null;
  }

  get isFinished(): boolean {
    return this.index >= this.letters.length;
  }

  /** The most recent judgment, so the UI can show "PERFECT" etc. where it happened. */
  get lastEvent(): JudgmentEvent | null {
    return this.lastEvent_;
  }

  /**
   * Call once per animation frame with the current game-clock time.
   * This is what catches letters the player never got to in time — once
   * a letter falls outside its "good" window, it's a miss even with no
   * keypress, and play moves on to the next letter.
   */
  update(nowMs: number): void {
    while (!this.isFinished) {
      const letter = this.currentLetter as LetterNote;
      if (nowMs > letter.timeMs + JUDGE_WINDOWS.good) {
        this.finishCurrentLetter("miss", nowMs);
      } else {
        break;
      }
    }
  }

  /**
   * Call for each character the player types, with the current game-clock
   * time. Returns what happened, so the display layer can react to a
   * wrong keypress (e.g. shaking the target letter) — gameplay itself
   * doesn't penalize it beyond simply not advancing.
   */
  typeChar(char: string, nowMs: number): "correct" | "wrong" | "ignored" {
    if (this.isFinished) return "ignored";

    const letter = this.currentLetter as LetterNote;
    if (char.toLowerCase() === letter.char.toLowerCase()) {
      this.finishCurrentLetter(judge(letter.timeMs, nowMs), nowMs);
      return "correct";
    }
    return "wrong";
  }

  private finishCurrentLetter(judgment: Judgment, nowMs: number): void {
    const letter = this.currentLetter as LetterNote;
    letter.judgment = judgment;
    letter.judgedAtMs = nowMs;
    this.tracker.recordJudgment(judgment);
    this.lastEvent_ = { judgment, letter, atMs: nowMs };
    this.index += 1;
  }
}
