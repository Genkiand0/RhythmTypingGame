"use client";

// Thin display layer: owns both canvases, the AudioContext, and the
// browser event listeners, but all the actual game rules (judging,
// scoring, falling-note math, metronome timing) live in src/game/. This
// component just reads that state every animation frame and draws it.
//
// Two canvases share one game clock and session:
//  - the perspective view: notes converge toward their key along a
//    trapezoidal lane, passing straight through a shared hit bar above
//    the keyboard (they no longer stop there) unless a judgment fires.
//  - the horizontal stream: the same letters, scrolling right to left,
//    crossing a vertical hit bar at the same instant as their
//    perspective counterpart (both read the same noteProgress()), with
//    successfully-typed letters assembling into words below it.

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import type { Chart, Judgment } from "@/game/types";
import { JUDGE_WINDOWS } from "@/game/types";
import { GameClock, audioContextTimeSource } from "@/game/clock";
import { GameSession } from "@/game/session";
import type { LetterNote } from "@/game/letterNotes";
import {
  isNoteVisible,
  noteProgress,
  noteScale,
  noteAlpha,
  hitNoteVisual,
  missedNoteVisual,
  horizontalX,
  horizontalWindowRadiusFraction,
  effectiveFallDurationMs,
  clampSpeedMultiplier,
  DEFAULT_SPEED_MULTIPLIER,
  SPEED_MULTIPLIER_FINE_STEP,
  SPEED_MULTIPLIER_COARSE_STEP,
} from "@/game/render";
import { upcomingBeats } from "@/game/metronome";
import { getLane, laneEdgesAt, laneEdgesAtY, laneYAt, laneYAtUnclamped, type Lane } from "@/game/lanes";
import { KEY_ROWS, colorForRow } from "@/game/keyboard";
import { getKeySlot, CANVAS_WIDTH, CANVAS_HEIGHT, HIT_BAR_Y_FRACTION } from "@/game/playfield";

const LETTER_STREAM_HEIGHT = 110;
const WORD_SLOT_AREA_HEIGHT = 70;
const HORIZONTAL_CANVAS_HEIGHT = LETTER_STREAM_HEIGHT + WORD_SLOT_AREA_HEIGHT;

const METRONOME_LOOKAHEAD_MS = 150;
const JUDGMENT_LABEL_FADE_MS = 500;
const LANE_GLOW_FADE_MS = 250;
const LANE_GLOW_MAX_ALPHA = 0.22;
const INACTIVE_NOTE_ALPHA_FACTOR = 0.6;
const LANE_GUIDE_ALPHA = 0.14;

const GAP_PX = 4;
const ROW_GAP_Y_FRACTION = 0.008;
const HIT_BAR_HALF_HEIGHT_FRACTION = 0.00667; // two-thirds of the previous 0.01
const HIT_BAR_ROW_STAGGER_PX = 4;
const FRAME_HALF_HEIGHT_AT_UNIT_SCALE = 0.035;
const FRAME_FILL_ALPHA_FACTOR = 0.22;
const NOTE_TEXT_COLOR = "#fafafa";
const KEY_TEXT_COLOR = "#18181b";
const PRESSED_KEY_COLOR = "#facc15";

const BURST_PARTICLE_COUNT = 8;
const BURST_DURATION_MS = 450;
const BURST_SPEED_PX_PER_SEC = 170;
const BURST_PARTICLE_RADIUS_PX = 3;

const EJECT_DURATION_MS = 450;
const EJECT_ARC_HEIGHT_PX = 26;
const SHAKE_DURATION_MS = 220;
const SHAKE_PERIOD_MS = 60;
const SHAKE_AMPLITUDE_PX = 6;

const WORD_SLOT_WIDTH = 30;
const WORD_SLOT_GAP = 8;
const WORD_SLOT_START_X = 26;
const WORD_EXIT_FADE_MS = 500;
const WORD_EXIT_BUMP_MS = 150;
const WORD_EXIT_BUMP_PX = 10;
const WORD_EXIT_SLIDE_MS = 550;
const WORD_EXIT_SLIDE_PX = 300;
const MAX_WORD_EXIT_TRACK_MS = WORD_EXIT_BUMP_MS + WORD_EXIT_SLIDE_MS;

const ALL_LETTERS = KEY_ROWS.flatMap((row) => [...row]);

const JUDGMENT_COLORS: Record<Judgment, string> = {
  perfect: "#facc15",
  great: "#4ade80",
  good: "#60a5fa",
  miss: "#f87171",
};

interface ExitingWord {
  letters: LetterNote[];
  fullyCorrect: boolean;
  completedAtMs: number;
}

interface Props {
  chart: Chart;
}

export default function GamePlayer({ chart }: Props) {
  const horizontalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const clockRef = useRef<GameClock | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const lastScheduledBeatMsRef = useRef(0);

  /** Keys currently held down — driven by keydown/keyup, not a timeout. */
  const activeKeysRef = useRef<Set<string>>(new Set());
  /** Most recent press (right or wrong), for the one-shot lane glow. */
  const lastPressRef = useRef<{ char: string; atMs: number } | null>(null);
  /** Most recent wrong-key attempt, so the horizontal view can shake the target. */
  const wrongPressRef = useRef<{ letter: LetterNote; atMs: number } | null>(null);
  /** Tracks word boundaries so a just-finished word can start its exit animation. */
  const lastActiveNoteIndexRef = useRef<number | null>(null);
  const exitingWordsRef = useRef<ExitingWord[]>([]);
  /** Mirrors speedMultiplier for the rAF loop, which can't read React state directly. */
  const speedMultiplierRef = useRef(DEFAULT_SPEED_MULTIPLIER);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(DEFAULT_SPEED_MULTIPLIER);
  const [hud, setHud] = useState({ score: 0, combo: 0, maxCombo: 0 });

  function adjustSpeed(deltaStep: number) {
    setSpeedMultiplier((prev) => {
      const next = clampSpeedMultiplier(prev + deltaStep);
      speedMultiplierRef.current = next;
      return next;
    });
  }

  function toggleMute() {
    setIsMuted((wasMuted) => {
      const nowMuted = !wasMuted;
      if (masterGainRef.current) masterGainRef.current.gain.value = nowMuted ? 0 : 1;
      return nowMuted;
    });
  }

  function startOrRestart() {
    // Reuse an existing AudioContext (and its master volume node) across
    // "Try Again" so we don't need another user gesture to unlock audio.
    const ctx = audioCtxRef.current ?? new AudioContext();
    if (!masterGainRef.current) {
      const masterGain = ctx.createGain();
      masterGain.gain.value = isMuted ? 0 : 1;
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;
    }

    const clock = new GameClock(audioContextTimeSource(ctx));
    clock.start();

    audioCtxRef.current = ctx;
    clockRef.current = clock;
    sessionRef.current = new GameSession(chart);
    lastScheduledBeatMsRef.current = 0;
    activeKeysRef.current.clear();
    lastPressRef.current = null;
    wrongPressRef.current = null;
    lastActiveNoteIndexRef.current = null;
    exitingWordsRef.current = [];
    setIsFinished(false);
    setHud({ score: 0, combo: 0, maxCombo: 0 });
    setIsPlaying(true);
  }

  useEffect(() => {
    if (!isPlaying) return;

    function onKeyDown(e: KeyboardEvent) {
      // Only single printable characters are part of typing; ignore
      // Shift, Enter, arrow keys, etc.
      if (e.key.length !== 1) return;
      const clock = clockRef.current;
      const session = sessionRef.current;
      if (!clock || !session) return;

      e.preventDefault();
      activeKeysRef.current.add(e.key.toLowerCase());

      // The OS repeats keydown while a key is held; gameplay (and the
      // one-shot press feedback below) should only react to the initial
      // press. Holding is already reflected continuously via
      // activeKeysRef, cleared by keyup instead of a timer.
      if (e.repeat) return;

      const nowMs = clock.nowMs();
      lastPressRef.current = { char: e.key, atMs: nowMs };

      const result = session.typeChar(e.key, nowMs);
      if (result === "wrong" && session.currentLetter) {
        wrongPressRef.current = { letter: session.currentLetter, atMs: nowMs };
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key.length !== 1) return;
      activeKeysRef.current.delete(e.key.toLowerCase());
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let rafId = requestAnimationFrame(function frame() {
      const clock = clockRef.current;
      const session = sessionRef.current;
      const canvas = canvasRef.current;
      const horizontalCanvas = horizontalCanvasRef.current;
      const audioCtx = audioCtxRef.current;
      const masterGain = masterGainRef.current;

      if (clock && session && canvas && horizontalCanvas && audioCtx && masterGain) {
        const nowMs = clock.nowMs();
        const fallDurationMs = effectiveFallDurationMs(speedMultiplierRef.current);
        session.update(nowMs);
        scheduleMetronomeClicks(audioCtx, masterGain, clock, lastScheduledBeatMsRef, nowMs);
        updateExitingWords(session, nowMs, lastActiveNoteIndexRef, exitingWordsRef);
        drawHorizontalStream(
          horizontalCanvas,
          session,
          nowMs,
          wrongPressRef.current,
          exitingWordsRef.current,
          fallDurationMs,
        );
        drawPerspective(canvas, session, nowMs, lastPressRef.current, activeKeysRef.current, fallDurationMs);
        setHud({
          score: session.tracker.score,
          combo: session.tracker.combo,
          maxCombo: session.tracker.maxCombo,
        });
        if (session.isFinished) setIsFinished(true);
      }

      rafId = requestAnimationFrame(frame);
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(rafId);
    };
  }, [isPlaying]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-6 text-sm text-zinc-500">
        <span>Score: {hud.score}</span>
        <span>Combo: {hud.combo}</span>
        <span>Max Combo: {hud.maxCombo}</span>
        <button
          onClick={toggleMute}
          aria-pressed={isMuted}
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700"
        >
          {isMuted ? "Sound: Off" : "Sound: On"}
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => adjustSpeed(-SPEED_MULTIPLIER_COARSE_STEP)}
            aria-label="Decrease note speed by 1.0"
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
          >
            −1.0
          </button>
          <button
            onClick={() => adjustSpeed(-SPEED_MULTIPLIER_FINE_STEP)}
            aria-label="Decrease note speed by 0.1"
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
          >
            −0.1
          </button>
          <span className="w-16 text-center text-xs">Speed: {speedMultiplier.toFixed(2)}x</span>
          <button
            onClick={() => adjustSpeed(SPEED_MULTIPLIER_FINE_STEP)}
            aria-label="Increase note speed by 0.1"
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
          >
            +0.1
          </button>
          <button
            onClick={() => adjustSpeed(SPEED_MULTIPLIER_COARSE_STEP)}
            aria-label="Increase note speed by 1.0"
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
          >
            +1.0
          </button>
        </div>
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700"
        >
          Return to Menu
        </Link>
      </div>
      <canvas
        ref={horizontalCanvasRef}
        width={CANVAS_WIDTH}
        height={HORIZONTAL_CANVAS_HEIGHT}
        className="rounded-lg border border-zinc-300 bg-zinc-950 dark:border-zinc-700"
      />
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="rounded-lg border border-zinc-300 bg-zinc-950 dark:border-zinc-700"
      />
      {!isPlaying && (
        <button
          onClick={startOrRestart}
          className="rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Start
        </button>
      )}
      {isPlaying && isFinished && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-lg font-semibold">
            Finished! Score: {hud.score} (Max Combo: {hud.maxCombo})
          </p>
          <button
            onClick={startOrRestart}
            className="rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

/** Plays a short beep at an exact AudioContext time for every beat due soon. */
function scheduleMetronomeClicks(
  ctx: AudioContext,
  masterGain: GainNode,
  clock: GameClock,
  lastScheduledBeatMsRef: RefObject<number>,
  nowMs: number,
): void {
  const beats = upcomingBeats(lastScheduledBeatMsRef.current, nowMs + METRONOME_LOOKAHEAD_MS);
  for (const beatMs of beats) {
    const delaySec = Math.max((beatMs - nowMs) / 1000, 0);
    const whenCtxTime = ctx.currentTime + delaySec;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.2, whenCtxTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, whenCtxTime + 0.05);
    osc.connect(gain).connect(masterGain);
    osc.start(whenCtxTime);
    osc.stop(whenCtxTime + 0.05);
  }
  if (beats.length > 0) {
    lastScheduledBeatMsRef.current = beats[beats.length - 1];
  }
}

/** Detects when the "active" word changes, queuing the just-finished one for its exit animation. */
function updateExitingWords(
  session: GameSession,
  nowMs: number,
  lastActiveNoteIndexRef: RefObject<number | null>,
  exitingWordsRef: RefObject<ExitingWord[]>,
): void {
  const currentActiveIndex = session.currentLetter?.noteIndex ?? null;
  if (currentActiveIndex !== lastActiveNoteIndexRef.current) {
    const finishedIndex = lastActiveNoteIndexRef.current;
    if (finishedIndex !== null) {
      const finishedLetters = session.letters.filter((l) => l.noteIndex === finishedIndex);
      if (finishedLetters.length > 0) {
        const fullyCorrect = finishedLetters.every((l) => l.judgment !== undefined && l.judgment !== "miss");
        const completedAtMs = Math.max(...finishedLetters.map((l) => l.judgedAtMs ?? nowMs));
        exitingWordsRef.current = [
          ...exitingWordsRef.current,
          { letters: finishedLetters, fullyCorrect, completedAtMs },
        ];
      }
    }
    lastActiveNoteIndexRef.current = currentActiveIndex;
  }
  exitingWordsRef.current = exitingWordsRef.current.filter(
    (w) => nowMs - w.completedAtMs < MAX_WORD_EXIT_TRACK_MS,
  );
}

interface Point {
  x: number;
  y: number;
}
interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

/** A quadrilateral spanning two Y fractions, following the lane's perspective slant. */
function laneQuad(
  lane: Lane,
  topYFraction: number,
  bottomYFraction: number,
  canvasWidth: number,
  canvasHeight: number,
): Quad {
  const top = laneEdgesAtY(lane, topYFraction);
  const bottom = laneEdgesAtY(lane, bottomYFraction);
  const topY = topYFraction * canvasHeight;
  const bottomY = bottomYFraction * canvasHeight;
  return {
    topLeft: { x: top.left * canvasWidth, y: topY },
    topRight: { x: top.right * canvasWidth, y: topY },
    bottomRight: { x: bottom.right * canvasWidth, y: bottomY },
    bottomLeft: { x: bottom.left * canvasWidth, y: bottomY },
  };
}

function traceQuad(ctx: CanvasRenderingContext2D, quad: Quad): void {
  ctx.beginPath();
  ctx.moveTo(quad.topLeft.x, quad.topLeft.y);
  ctx.lineTo(quad.topRight.x, quad.topRight.y);
  ctx.lineTo(quad.bottomRight.x, quad.bottomRight.y);
  ctx.lineTo(quad.bottomLeft.x, quad.bottomLeft.y);
  ctx.closePath();
}

/** Shrinks a quad inward by a pixel gap, so adjacent keys/segments read as separate. */
function insetQuad(quad: Quad, gapPx: number): Quad {
  const half = gapPx / 2;
  return {
    topLeft: { x: quad.topLeft.x + half, y: quad.topLeft.y + half },
    topRight: { x: quad.topRight.x - half, y: quad.topRight.y + half },
    bottomRight: { x: quad.bottomRight.x - half, y: quad.bottomRight.y - half },
    bottomLeft: { x: quad.bottomLeft.x + half, y: quad.bottomLeft.y - half },
  };
}

/** The whole trapezoid a letter's note travels through, spawn to the hit bar. */
function drawLaneGlow(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  lane: Lane,
  alpha: number,
): void {
  const far = laneEdgesAt(lane, 0);
  const farY = laneYAt(lane, 0) * canvasHeight;
  const near = laneEdgesAt(lane, 1);
  const nearY = laneYAt(lane, 1) * canvasHeight;

  ctx.beginPath();
  ctx.moveTo(far.left * canvasWidth, farY);
  ctx.lineTo(far.right * canvasWidth, farY);
  ctx.lineTo(near.right * canvasWidth, nearY);
  ctx.lineTo(near.left * canvasWidth, nearY);
  ctx.closePath();
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fill();
}

/** The thin guide line along one edge of a lane, from its spawn point to the hit bar. */
function drawLaneGuide(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  lane: Lane,
  color: string,
): void {
  const far = laneEdgesAt(lane, 0);
  const farY = laneYAt(lane, 0) * canvasHeight;
  const near = laneEdgesAt(lane, 1);
  const nearY = laneYAt(lane, 1) * canvasHeight;

  ctx.strokeStyle = color;
  ctx.globalAlpha = LANE_GUIDE_ALPHA;
  ctx.lineWidth = 1;
  for (const [farX, nearX] of [
    [far.left, near.left],
    [far.right, near.right],
  ]) {
    ctx.beginPath();
    ctx.moveTo(farX * canvasWidth, farY);
    ctx.lineTo(nearX * canvasWidth, nearY);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Every key, drawn as a trapezoid matching its lane's slant, below the hit bar. */
function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  activeKeys: ReadonlySet<string>,
): void {
  for (const letter of ALL_LETTERS) {
    const slot = getKeySlot(letter);
    const lane = getLane(letter);
    if (!slot || !lane) continue;

    const quad = insetQuad(
      laneQuad(
        lane,
        slot.rowTopFraction + ROW_GAP_Y_FRACTION / 2,
        slot.rowBottomFraction - ROW_GAP_Y_FRACTION / 2,
        canvasWidth,
        canvasHeight,
      ),
      GAP_PX,
    );

    const isActive = activeKeys.has(letter);
    traceQuad(ctx, quad);
    ctx.fillStyle = isActive ? PRESSED_KEY_COLOR : colorForRow(slot.row);
    ctx.globalAlpha = isActive ? 1 : 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;

    const centerX = (quad.topLeft.x + quad.topRight.x + quad.bottomLeft.x + quad.bottomRight.x) / 4;
    const centerY = (quad.topLeft.y + quad.bottomLeft.y) / 2;
    ctx.fillStyle = KEY_TEXT_COLOR;
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter.toUpperCase(), centerX, centerY);
  }
}

/** One small, uniformly-sized segment per key, staggered by row so adjacent rows overlap less. */
function drawHitBar(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
  for (const letter of ALL_LETTERS) {
    const lane = getLane(letter);
    if (!lane) continue;

    const rowOffsetPx = (lane.row - 1) * HIT_BAR_ROW_STAGGER_PX;
    const centerY = HIT_BAR_Y_FRACTION * canvasHeight + rowOffsetPx;
    const halfHeightPx = HIT_BAR_HALF_HEIGHT_FRACTION * canvasHeight;
    const left = lane.nearLeft * canvasWidth + GAP_PX / 2;
    const right = lane.nearRight * canvasWidth - GAP_PX / 2;

    ctx.fillStyle = colorForRow(lane.row);
    ctx.fillRect(left, centerY - halfHeightPx, right - left, halfHeightPx * 2);
  }
}

/** A perfect hit bursts into a small ring of fading particles instead of leaving a frozen note. */
function drawPerfectBurst(ctx: CanvasRenderingContext2D, originX: number, originY: number, elapsedMs: number): void {
  const seconds = elapsedMs / 1000;
  const alpha = Math.max(0, 1 - elapsedMs / BURST_DURATION_MS);
  ctx.fillStyle = JUDGMENT_COLORS.perfect;
  for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
    const angle = (i / BURST_PARTICLE_COUNT) * Math.PI * 2;
    const dist = BURST_SPEED_PX_PER_SEC * seconds;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(originX + Math.cos(angle) * dist, originY + Math.sin(angle) * dist, BURST_PARTICLE_RADIUS_PX, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPerspective(
  canvas: HTMLCanvasElement,
  session: GameSession,
  nowMs: number,
  lastPress: { char: string; atMs: number } | null,
  activeKeys: ReadonlySet<string>,
  fallDurationMs: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  // Briefly glow the whole lane of whatever key was just pressed, as a
  // subtle, translucent backdrop behind the guide lines and the notes.
  if (lastPress) {
    const elapsed = nowMs - lastPress.atMs;
    if (elapsed >= 0 && elapsed < LANE_GLOW_FADE_MS) {
      const lane = getLane(lastPress.char);
      if (lane) {
        drawLaneGlow(ctx, width, height, lane, LANE_GLOW_MAX_ALPHA * (1 - elapsed / LANE_GLOW_FADE_MS));
      }
    }
  }

  // Guides only make sense for a note still actively approaching the bar.
  for (const letter of session.letters) {
    if (letter.judgment !== undefined) continue;
    const progress = noteProgress(nowMs, letter.timeMs, fallDurationMs);
    if (progress < 0 || progress >= 1) continue;
    const lane = getLane(letter.char);
    if (lane) drawLaneGuide(ctx, width, height, lane, colorForRow(lane.row));
  }

  drawKeyboard(ctx, width, height, activeKeys);
  drawHitBar(ctx, width, height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const letter of session.letters) {
    const lane = getLane(letter.char);
    if (!lane) continue;

    if (letter.judgment === "perfect") {
      const elapsed = nowMs - (letter.judgedAtMs ?? nowMs);
      if (elapsed < 0 || elapsed > BURST_DURATION_MS) continue;
      const progress = noteProgress(letter.judgedAtMs as number, letter.timeMs, fallDurationMs);
      const yFraction = laneYAtUnclamped(lane, progress);
      const { left, right } = laneEdgesAtY(lane, yFraction);
      drawPerfectBurst(ctx, ((left + right) / 2) * width, yFraction * height, elapsed);
      continue;
    }

    const visual =
      letter.judgment !== undefined && letter.judgment !== "miss"
        ? hitNoteVisual(nowMs, letter.timeMs, letter.judgedAtMs as number, fallDurationMs)
        : missedNoteVisual(nowMs, letter.timeMs, letter.judgedAtMs, fallDurationMs);
    if (!visual) continue;

    const yFraction = laneYAtUnclamped(lane, visual.progress);
    const scale = noteScale(visual.progress);
    const isCurrent = session.currentLetter === letter;
    const alpha = visual.alpha * (isCurrent ? 1 : INACTIVE_NOTE_ALPHA_FACTOR);

    const halfHeight = FRAME_HALF_HEIGHT_AT_UNIT_SCALE * scale;
    const frame = laneQuad(lane, yFraction - halfHeight, yFraction + halfHeight, width, height);

    traceQuad(ctx, frame);
    ctx.globalAlpha = alpha * FRAME_FILL_ALPHA_FACTOR;
    ctx.fillStyle = colorForRow(lane.row);
    ctx.fill();

    traceQuad(ctx, frame);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colorForRow(lane.row);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const x = (frame.topLeft.x + frame.topRight.x + frame.bottomLeft.x + frame.bottomRight.x) / 4;
    ctx.font = `${Math.round(24 * scale)}px sans-serif`;
    ctx.fillStyle = NOTE_TEXT_COLOR;
    ctx.fillText(letter.char, x, yFraction * height);
    ctx.globalAlpha = 1;
  }

  const event = session.lastEvent;
  if (event) {
    const elapsed = nowMs - event.atMs;
    if (elapsed >= 0 && elapsed < JUDGMENT_LABEL_FADE_MS) {
      const lane = getLane(event.letter.char);
      if (lane) {
        const { left, right } = laneEdgesAt(lane, 1);
        const x = ((left + right) / 2) * width;
        const y = HIT_BAR_Y_FRACTION * height;
        ctx.globalAlpha = 1 - elapsed / JUDGMENT_LABEL_FADE_MS;
        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = JUDGMENT_COLORS[event.judgment];
        ctx.fillText(event.judgment.toUpperCase(), x, y - 30);
        ctx.globalAlpha = 1;
      }
    }
  }

  if (session.isFinished) {
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "24px sans-serif";
    ctx.fillText("Done!", width / 2, HIT_BAR_Y_FRACTION * height * 0.4);
  }
}

function drawWordRow(
  ctx: CanvasRenderingContext2D,
  letters: readonly LetterNote[],
  originX: number,
  y: number,
  alpha: number,
): void {
  letters.forEach((letter, i) => {
    const x = originX + i * (WORD_SLOT_WIDTH + WORD_SLOT_GAP);

    ctx.strokeStyle = `rgba(244, 244, 245, ${0.5 * alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 16);
    ctx.lineTo(x + WORD_SLOT_WIDTH, y + 16);
    ctx.stroke();

    if (letter.judgment !== undefined && letter.judgment !== "miss") {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = NOTE_TEXT_COLOR;
      ctx.font = "20px sans-serif";
      ctx.fillText(letter.char.toUpperCase(), x + WORD_SLOT_WIDTH / 2, y);
      ctx.globalAlpha = 1;
    }
  });
}

/** A fully-correct word briefly nudges right, then eases off to the left while fading. */
function completedWordOffsetX(elapsedMs: number): number {
  if (elapsedMs < WORD_EXIT_BUMP_MS) {
    return WORD_EXIT_BUMP_PX * (elapsedMs / WORD_EXIT_BUMP_MS);
  }
  const t = Math.min((elapsedMs - WORD_EXIT_BUMP_MS) / WORD_EXIT_SLIDE_MS, 1);
  return WORD_EXIT_BUMP_PX - t * t * WORD_EXIT_SLIDE_PX;
}

function drawWordSlots(
  ctx: CanvasRenderingContext2D,
  session: GameSession,
  exitingWords: readonly ExitingWord[],
  streamHeight: number,
  nowMs: number,
): void {
  const y = streamHeight + WORD_SLOT_AREA_HEIGHT / 2 - 8;

  for (const exiting of exitingWords) {
    const elapsed = nowMs - exiting.completedAtMs;
    let offsetX = 0;
    let alpha = 1;
    if (exiting.fullyCorrect) {
      offsetX = completedWordOffsetX(elapsed);
      alpha = elapsed > WORD_EXIT_BUMP_MS ? Math.max(0, 1 - (elapsed - WORD_EXIT_BUMP_MS) / WORD_EXIT_SLIDE_MS) : 1;
    } else {
      alpha = Math.max(0, 1 - elapsed / WORD_EXIT_FADE_MS);
    }
    if (alpha <= 0) continue;
    drawWordRow(ctx, exiting.letters, WORD_SLOT_START_X + offsetX, y, alpha);
  }

  const activeIndex = session.currentLetter?.noteIndex;
  if (activeIndex !== undefined) {
    const activeLetters = session.letters.filter((l) => l.noteIndex === activeIndex);
    drawWordRow(ctx, activeLetters, WORD_SLOT_START_X, y, 1);
  }
}

function drawHorizontalStream(
  canvas: HTMLCanvasElement,
  session: GameSession,
  nowMs: number,
  wrongPress: { letter: LetterNote; atMs: number } | null,
  exitingWords: readonly ExitingWord[],
  fallDurationMs: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width } = canvas;

  ctx.clearRect(0, 0, width, canvas.height);

  const barX = horizontalX(1) * width;
  const midY = LETTER_STREAM_HEIGHT / 2;
  const radiusPx = horizontalWindowRadiusFraction(JUDGE_WINDOWS.good, fallDurationMs) * width;

  // Vertical hit bar, with a gap left for the timing-window circle.
  ctx.strokeStyle = "#f4f4f5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX, 0);
  ctx.lineTo(barX, Math.max(0, midY - radiusPx));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(barX, Math.min(LETTER_STREAM_HEIGHT, midY + radiusPx));
  ctx.lineTo(barX, LETTER_STREAM_HEIGHT);
  ctx.stroke();

  ctx.strokeStyle = "rgba(244, 244, 245, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(barX, midY, radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  for (const separator of session.wordSeparators) {
    if (!isNoteVisible(nowMs, separator.timeMs, fallDurationMs)) continue;
    const x = horizontalX(noteProgress(nowMs, separator.timeMs, fallDurationMs)) * width;
    ctx.strokeStyle = "rgba(244, 244, 245, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, LETTER_STREAM_HEIGHT * 0.25);
    ctx.lineTo(x, LETTER_STREAM_HEIGHT * 0.75);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const letter of session.letters) {
    if (letter.judgment !== undefined) {
      const elapsed = nowMs - (letter.judgedAtMs ?? nowMs);

      if (letter.judgment === "miss") {
        if (!isNoteVisible(nowMs, letter.timeMs, fallDurationMs)) continue;
        const progress = noteProgress(nowMs, letter.timeMs, fallDurationMs);
        ctx.globalAlpha = noteAlpha(progress) * INACTIVE_NOTE_ALPHA_FACTOR;
        ctx.font = "22px sans-serif";
        ctx.fillStyle = NOTE_TEXT_COLOR;
        ctx.fillText(letter.char, horizontalX(progress) * width, midY);
        ctx.globalAlpha = 1;
        continue;
      }

      // A successful hit ejects out of the lane: a small downward arc, fading.
      if (elapsed < 0 || elapsed > EJECT_DURATION_MS) continue;
      const progressAtHit = noteProgress(letter.judgedAtMs as number, letter.timeMs, fallDurationMs);
      const x = horizontalX(progressAtHit) * width;
      const t = elapsed / EJECT_DURATION_MS;
      ctx.globalAlpha = 1 - t;
      ctx.font = "22px sans-serif";
      ctx.fillStyle = NOTE_TEXT_COLOR;
      ctx.fillText(letter.char, x, midY + EJECT_ARC_HEIGHT_PX * t * t);
      ctx.globalAlpha = 1;
      continue;
    }

    if (!isNoteVisible(nowMs, letter.timeMs, fallDurationMs)) continue;
    const progress = noteProgress(nowMs, letter.timeMs, fallDurationMs);
    let x = horizontalX(progress) * width;

    if (wrongPress && session.currentLetter === letter) {
      const shakeElapsed = nowMs - wrongPress.atMs;
      if (shakeElapsed >= 0 && shakeElapsed < SHAKE_DURATION_MS) {
        const decay = 1 - shakeElapsed / SHAKE_DURATION_MS;
        x += Math.sin((shakeElapsed / SHAKE_PERIOD_MS) * Math.PI * 2) * SHAKE_AMPLITUDE_PX * decay;
      }
    }

    const isCurrent = session.currentLetter === letter;
    ctx.globalAlpha = noteAlpha(progress) * (isCurrent ? 1 : INACTIVE_NOTE_ALPHA_FACTOR);
    ctx.font = "22px sans-serif";
    ctx.fillStyle = NOTE_TEXT_COLOR;
    ctx.fillText(letter.char, x, midY);
    ctx.globalAlpha = 1;
  }

  drawWordSlots(ctx, session, exitingWords, LETTER_STREAM_HEIGHT, nowMs);
}
