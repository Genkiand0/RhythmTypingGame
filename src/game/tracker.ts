// Keeps score and combo as the player hits (or misses) notes.
//
// "Combo" is how many notes in a row the player has hit without a miss.
// A miss resets combo to 0 but doesn't erase past score.

import type { Judgment } from "./types";

/** Points awarded for each judgment. A miss is worth nothing. */
const POINTS: Record<Judgment, number> = {
  perfect: 300,
  great: 200,
  good: 100,
  miss: 0,
};

export interface JudgmentCounts {
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

export class ScoreTracker {
  private score_ = 0;
  private combo_ = 0;
  private maxCombo_ = 0;
  private counts_: JudgmentCounts = { perfect: 0, great: 0, good: 0, miss: 0 };

  /** Call this once per note, with whatever Judgment the player earned. */
  recordJudgment(judgment: Judgment): void {
    this.counts_[judgment] += 1;
    this.score_ += POINTS[judgment];

    if (judgment === "miss") {
      this.combo_ = 0;
    } else {
      this.combo_ += 1;
      // The combo can only ever grow between misses, so the running
      // combo is the max *unless* a later miss has already reset it.
      this.maxCombo_ = Math.max(this.maxCombo_, this.combo_);
    }
  }

  get score(): number {
    return this.score_;
  }

  get combo(): number {
    return this.combo_;
  }

  get maxCombo(): number {
    return this.maxCombo_;
  }

  /** A copy, so callers can't mutate our internal counts. */
  get counts(): JudgmentCounts {
    return { ...this.counts_ };
  }
}
