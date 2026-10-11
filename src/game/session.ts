// Plays one Chart from start to finish: advances through its notes,
// turns keypresses into judgments, and feeds those into a ScoreTracker.
//
// This is the piece that connects judge.ts, tracker.ts and matcher.ts.
// It only needs a clock reading in milliseconds, so it has no idea
// whether that time came from a real AudioContext or a test fake.

import type { Chart, Note, Judgment } from "./types";
import { JUDGE_WINDOWS } from "./types";
import { judge } from "./judge";
import { ScoreTracker } from "./tracker";
import { WordMatcher } from "./matcher";

export class GameSession {
  private noteIndex_ = 0;
  private matcher: WordMatcher | null = null;
  readonly tracker = new ScoreTracker();

  constructor(private readonly chart: Chart) {
    this.loadMatcherForCurrentNote();
  }

  private loadMatcherForCurrentNote(): void {
    const note = this.currentNote;
    this.matcher = note ? new WordMatcher(note.reading) : null;
  }

  get currentNote(): Note | null {
    return this.chart.notes[this.noteIndex_] ?? null;
  }

  get isFinished(): boolean {
    return this.noteIndex_ >= this.chart.notes.length;
  }

  /** What the player still needs to type for the current note, or "" if finished. */
  get remainingText(): string {
    return this.matcher?.remaining ?? "";
  }

  /**
   * Call once per animation frame with the current game-clock time.
   * This is what catches notes the player never got to in time — once a
   * note falls outside its "good" window, it's a miss even with no keypress.
   */
  update(nowMs: number): void {
    while (!this.isFinished) {
      const note = this.currentNote as Note;
      if (nowMs > note.timeMs + JUDGE_WINDOWS.good) {
        this.finishCurrentNote("miss");
      } else {
        break;
      }
    }
  }

  /** Call for each character the player types, with the current game-clock time. */
  typeChar(char: string, nowMs: number): void {
    if (this.isFinished || !this.matcher) return;

    const result = this.matcher.type(char);
    if (result === "correct" && this.matcher.isComplete) {
      const note = this.currentNote as Note;
      this.finishCurrentNote(judge(note.timeMs, nowMs));
    }
  }

  private finishCurrentNote(judgment: Judgment): void {
    this.tracker.recordJudgment(judgment);
    this.noteIndex_ += 1;
    this.loadMatcherForCurrentNote();
  }
}
