// Core data types for DaKEN. Everything the game plays is a "Chart":
// an audio file plus a list of timed notes.

export type GameMode = "dialogue" | "music" | "words";

export type InputLanguage = "ja-romaji" | "en";

/** One thing the player types. Times are in milliseconds from audio start, at 1.0x speed. */
export interface Note {
  /** When the note reaches the hit line. */
  timeMs: number;
  /** 0 for a tap note; > 0 makes it a long (sustained) note. */
  durationMs: number;
  /** What is shown on screen, e.g. "ありがとう" or "thank you". */
  display: string;
  /**
   * What the player must type. For Japanese this is kana (e.g. "ありがとう");
   * the romaji matcher accepts any valid spelling (shi/si, tsu/tu, n/nn).
   * For English it is the plain text.
   */
  reading: string;
}

export interface Chart {
  id: string;
  title: string;
  mode: GameMode;
  language: InputLanguage;
  /** Path under /public, e.g. "/audio/sample-words.mp3". Null = no audio (metronome only). */
  audioSrc: string | null;
  /** Where the audio came from and why we may use it. Required for built-in stages. */
  license: string;
  notes: Note[];
}

/** Timing windows in ms (plus or minus). Tune these during playtesting. */
export const JUDGE_WINDOWS = {
  perfect: 50,
  great: 100,
  good: 150,
} as const;

export type Judgment = keyof typeof JUDGE_WINDOWS | "miss";
