// Tracks how much of a single note's text the player has typed so far.
// (Later, Phase 3 swaps this out for a kana/romaji matcher. For English
// it's just a plain character-by-character comparison.)

export type TypeResult = "correct" | "wrong" | "already-complete";

export class WordMatcher {
  private typedCount = 0;

  constructor(private readonly reading: string) {}

  get isComplete(): boolean {
    return this.typedCount >= this.reading.length;
  }

  /** How much of the word is left to type, for drawing on screen. */
  get remaining(): string {
    return this.reading.slice(this.typedCount);
  }

  /** Feed one typed character. Case-insensitive. */
  type(char: string): TypeResult {
    if (this.isComplete) return "already-complete";

    const expected = this.reading[this.typedCount];
    if (char.toLowerCase() !== expected.toLowerCase()) {
      return "wrong";
    }

    this.typedCount += 1;
    return "correct";
  }
}
