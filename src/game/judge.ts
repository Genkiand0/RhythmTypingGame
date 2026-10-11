// Turns timing into a Judgment: how close was the player's keypress
// to the moment the note was supposed to be hit?

import { JUDGE_WINDOWS, type Judgment } from "./types";

/**
 * @param noteTimeMs When the note reaches the hit line (from the Chart).
 * @param hitTimeMs When the player actually pressed the key, on the same clock.
 *
 * We only care about *how far off* the hit was, not whether it was early
 * or late, so we use the absolute difference. Each judgment window in
 * JUDGE_WINDOWS is checked from tightest (perfect) to loosest (good);
 * anything outside all of them is a miss.
 */
export function judge(noteTimeMs: number, hitTimeMs: number): Judgment {
  const diffMs = Math.abs(hitTimeMs - noteTimeMs);

  if (diffMs <= JUDGE_WINDOWS.perfect) return "perfect";
  if (diffMs <= JUDGE_WINDOWS.great) return "great";
  if (diffMs <= JUDGE_WINDOWS.good) return "good";
  return "miss";
}
