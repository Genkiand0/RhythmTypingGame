import { describe, it, expect } from "vitest";
import { WordMatcher } from "./matcher";

describe("WordMatcher", () => {
  it("is incomplete with nothing typed", () => {
    const matcher = new WordMatcher("cat");
    expect(matcher.isComplete).toBe(false);
    expect(matcher.remaining).toBe("cat");
  });

  it("accepts correct letters one at a time", () => {
    const matcher = new WordMatcher("cat");
    expect(matcher.type("c")).toBe("correct");
    expect(matcher.remaining).toBe("at");
    expect(matcher.type("a")).toBe("correct");
    expect(matcher.type("t")).toBe("correct");
    expect(matcher.isComplete).toBe(true);
    expect(matcher.remaining).toBe("");
  });

  it("is case-insensitive", () => {
    const matcher = new WordMatcher("cat");
    expect(matcher.type("C")).toBe("correct");
    expect(matcher.type("A")).toBe("correct");
    expect(matcher.type("T")).toBe("correct");
    expect(matcher.isComplete).toBe(true);
  });

  it("rejects a wrong letter without consuming it", () => {
    const matcher = new WordMatcher("cat");
    expect(matcher.type("x")).toBe("wrong");
    expect(matcher.remaining).toBe("cat");
    // The next correct letter still works after a wrong guess.
    expect(matcher.type("c")).toBe("correct");
  });

  it("reports already-complete once finished", () => {
    const matcher = new WordMatcher("hi");
    matcher.type("h");
    matcher.type("i");
    expect(matcher.type("i")).toBe("already-complete");
  });
});
