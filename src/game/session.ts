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
import { expandToLetterNotes, type LetterNote } from "./letterNotes";

/** A judgment that just happened, for the UI to display at the note's spot. */
export interface JudgmentEvent {
  judgment: Judgment;
  letter: LetterNote;
  atMs: number;
}

export class GameSession {
  /** Every letter of the whole chart, in order. Rendered as individual falling notes. */
  readonly letters: readonly LetterNote[];
  private index = 0;
  readonly tracker = new ScoreTracker();
  private lastEvent_: JudgmentEvent | null = null;

  constructor(private readonly chart: Chart) {
    this.letters = expandToLetterNotes(chart.notes);
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

  /** Call for each character the player types, with the current game-clock time. */
  typeChar(char: string, nowMs: number): void {
    if (this.isFinished) return;

    const letter = this.currentLetter as LetterNote;
    if (char.toLowerCase() === letter.char.toLowerCase()) {
      this.finishCurrentLetter(judge(letter.timeMs, nowMs), nowMs);
    }
    // A wrong letter is simply ignored — no penalty beyond not progressing.
  }

  private finishCurrentLetter(judgment: Judgment, nowMs: number): void {
    const letter = this.currentLetter as LetterNote;
    this.tracker.recordJudgment(judgment);
    this.lastEvent_ = { judgment, letter, atMs: nowMs };
    this.index += 1;
  }
}
