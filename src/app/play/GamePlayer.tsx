"use client";

// Thin display layer: owns both canvases, the AudioContext, and the
// browser event listeners, but all the actual game rules (judging,
// scoring, falling-note math, metronome timing) live in src/game/. This
// component just reads that state every animation frame and draws it.
//
// Two canvases share one game clock and session:
//  - the perspective view: notes converge toward their key along a
//    trapezoidal lane, crossing a shared hit bar above the keyboard.
//  - the horizontal stream: the same letters, scrolling right to left,
//    crossing a vertical hit bar at the same instant as their
//    perspective counterpart (both read the same noteProgress()).

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Chart, Judgment } from "@/game/types";
import { GameClock, audioContextTimeSource } from "@/game/clock";
import { GameSession } from "@/game/session";
import { isNoteVisible, noteProgress, noteScale, noteAlpha, horizontalX } from "@/game/render";
import { upcomingBeats } from "@/game/metronome";
import { getLane, laneEdgesAt, laneEdgesAtY, laneYAt, type Lane } from "@/game/lanes";
import { KEY_ROWS, colorForRow } from "@/game/keyboard";
import { getKeySlot, CANVAS_WIDTH, CANVAS_HEIGHT, HIT_BAR_Y_FRACTION } from "@/game/playfield";

const HORIZONTAL_CANVAS_HEIGHT = 110;

const METRONOME_LOOKAHEAD_MS = 150;
const JUDGMENT_LABEL_FADE_MS = 500;
const PRESSED_KEY_GLOW_MS = 150;
const LANE_GLOW_FADE_MS = 250;
const LANE_GLOW_MAX_ALPHA = 0.22;
const INACTIVE_NOTE_ALPHA_FACTOR = 0.6;
const LANE_GUIDE_ALPHA = 0.14;

const GAP_PX = 4;
const ROW_GAP_Y_FRACTION = 0.008;
const HIT_BAR_HALF_HEIGHT_FRACTION = 0.01;
const FRAME_HALF_HEIGHT_AT_UNIT_SCALE = 0.035;
const NOTE_TEXT_COLOR = "#fafafa";
const KEY_TEXT_COLOR = "#18181b";
const PRESSED_KEY_COLOR = "#facc15";

const ALL_LETTERS = KEY_ROWS.flatMap((row) => [...row]);

const JUDGMENT_COLORS: Record<Judgment, string> = {
  perfect: "#facc15",
  great: "#4ade80",
  good: "#60a5fa",
  miss: "#f87171",
};

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
  const activeKeyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const lastPressRef = useRef<{ char: string; atMs: number } | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hud, setHud] = useState({ score: 0, combo: 0, maxCombo: 0 });

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
      const nowMs = clock.nowMs();
      session.typeChar(e.key, nowMs);
      lastPressRef.current = { char: e.key, atMs: nowMs };

      activeKeyRef.current = e.key.toLowerCase();
      if (activeKeyTimeoutRef.current) clearTimeout(activeKeyTimeoutRef.current);
      activeKeyTimeoutRef.current = setTimeout(() => {
        activeKeyRef.current = null;
      }, PRESSED_KEY_GLOW_MS);
    }
    window.addEventListener("keydown", onKeyDown);

    let rafId = requestAnimationFrame(function frame() {
      const clock = clockRef.current;
      const session = sessionRef.current;
      const canvas = canvasRef.current;
      const horizontalCanvas = horizontalCanvasRef.current;
      const audioCtx = audioCtxRef.current;
      const masterGain = masterGainRef.current;

      if (clock && session && canvas && horizontalCanvas && audioCtx && masterGain) {
        const nowMs = clock.nowMs();
        session.update(nowMs);
        scheduleMetronomeClicks(audioCtx, masterGain, clock, lastScheduledBeatMsRef, nowMs);
        drawHorizontalStream(horizontalCanvas, session, nowMs);
        drawPerspective(canvas, session, nowMs, lastPressRef.current, activeKeyRef.current);
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
  activeKey: string | null,
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

    const isActive = activeKey === letter;
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

/** One small, uniformly-sized segment per key, together forming the shared hit bar. */
function drawHitBar(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
  for (const letter of ALL_LETTERS) {
    const lane = getLane(letter);
    if (!lane) continue;

    const topY = (HIT_BAR_Y_FRACTION - HIT_BAR_HALF_HEIGHT_FRACTION) * canvasHeight;
    const bottomY = (HIT_BAR_Y_FRACTION + HIT_BAR_HALF_HEIGHT_FRACTION) * canvasHeight;
    const left = lane.nearLeft * canvasWidth + GAP_PX / 2;
    const right = lane.nearRight * canvasWidth - GAP_PX / 2;

    ctx.fillStyle = colorForRow(lane.row);
    ctx.fillRect(left, topY, right - left, bottomY - topY);
  }
}

function drawPerspective(
  canvas: HTMLCanvasElement,
  session: GameSession,
  nowMs: number,
  lastPress: { char: string; atMs: number } | null,
  activeKey: string | null,
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

  for (const letter of session.letters) {
    if (!isNoteVisible(nowMs, letter.timeMs)) continue;
    const lane = getLane(letter.char);
    if (lane) drawLaneGuide(ctx, width, height, lane, colorForRow(lane.row));
  }

  drawKeyboard(ctx, width, height, activeKey);
  drawHitBar(ctx, width, height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const letter of session.letters) {
    if (!isNoteVisible(nowMs, letter.timeMs)) continue;

    const lane = getLane(letter.char);
    if (!lane) continue;

    const progress = noteProgress(nowMs, letter.timeMs);
    const yFraction = laneYAt(lane, progress);
    const scale = noteScale(progress);
    const isCurrent = session.currentLetter === letter;
    const alpha = noteAlpha(progress) * (isCurrent ? 1 : INACTIVE_NOTE_ALPHA_FACTOR);

    const halfHeight = FRAME_HALF_HEIGHT_AT_UNIT_SCALE * scale;
    const frame = laneQuad(lane, yFraction - halfHeight, yFraction + halfHeight, width, height);

    ctx.globalAlpha = alpha;
    traceQuad(ctx, frame);
    ctx.strokeStyle = colorForRow(lane.row);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const x = (frame.topLeft.x + frame.topRight.x + frame.bottomLeft.x + frame.bottomRight.x) / 4;
    const y = yFraction * height;
    ctx.font = `${Math.round(24 * scale)}px sans-serif`;
    ctx.fillStyle = NOTE_TEXT_COLOR;
    ctx.fillText(letter.char, x, y);
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

function drawHorizontalStream(canvas: HTMLCanvasElement, session: GameSession, nowMs: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  const barX = horizontalX(1) * width;
  ctx.strokeStyle = "#f4f4f5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX, 0);
  ctx.lineTo(barX, height);
  ctx.stroke();

  for (const separator of session.wordSeparators) {
    if (!isNoteVisible(nowMs, separator.timeMs)) continue;
    const x = horizontalX(noteProgress(nowMs, separator.timeMs)) * width;
    ctx.strokeStyle = "rgba(244, 244, 245, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, height * 0.25);
    ctx.lineTo(x, height * 0.75);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const midY = height / 2;

  for (const letter of session.letters) {
    if (!isNoteVisible(nowMs, letter.timeMs)) continue;

    const progress = noteProgress(nowMs, letter.timeMs);
    const x = horizontalX(progress) * width;
    const isCurrent = session.currentLetter === letter;

    ctx.globalAlpha = noteAlpha(progress) * (isCurrent ? 1 : INACTIVE_NOTE_ALPHA_FACTOR);
    ctx.font = "22px sans-serif";
    ctx.fillStyle = NOTE_TEXT_COLOR;
    ctx.fillText(letter.char, x, midY);
  }
  ctx.globalAlpha = 1;
}
