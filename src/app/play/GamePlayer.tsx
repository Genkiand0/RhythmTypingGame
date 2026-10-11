"use client";

// Thin display layer: owns the canvas, the AudioContext, and the browser
// event listeners, but all the actual game rules (judging, scoring,
// falling-note math, metronome timing) live in src/game/. This component
// just reads that state every animation frame and draws it.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Chart, Judgment } from "@/game/types";
import { GameClock, audioContextTimeSource } from "@/game/clock";
import { GameSession } from "@/game/session";
import { isNoteVisible, noteProgress, noteScale, noteAlpha } from "@/game/render";
import { upcomingBeats } from "@/game/metronome";
import { getLane, laneEdgesAt, type Lane } from "@/game/lanes";
import Keyboard from "./Keyboard";

// The keyboard (and the canvas alongside it) are sized 1.25x a plainer
// base size, so note lanes and the on-screen keys line up pixel-for-pixel.
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const HIT_LINE_Y = CANVAS_HEIGHT - 75;
const METRONOME_LOOKAHEAD_MS = 150;
const JUDGMENT_LABEL_FADE_MS = 500;
const PRESSED_KEY_GLOW_MS = 150;
const LANE_GLOW_FADE_MS = 250;
const LANE_GLOW_MAX_ALPHA = 0.22;

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const clockRef = useRef<GameClock | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const lastScheduledBeatMsRef = useRef(0);
  const pressedKeyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPressRef = useRef<{ char: string; atMs: number } | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [hud, setHud] = useState({ score: 0, combo: 0, maxCombo: 0 });

  function startOrRestart() {
    // Reuse an existing AudioContext across "Try Again" so we don't need
    // another user gesture; only create one the very first time.
    const ctx = audioCtxRef.current ?? new AudioContext();
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

      setPressedKey(e.key);
      if (pressedKeyTimeoutRef.current) clearTimeout(pressedKeyTimeoutRef.current);
      pressedKeyTimeoutRef.current = setTimeout(() => setPressedKey(null), PRESSED_KEY_GLOW_MS);
    }
    window.addEventListener("keydown", onKeyDown);

    let rafId = requestAnimationFrame(function frame() {
      const clock = clockRef.current;
      const session = sessionRef.current;
      const canvas = canvasRef.current;
      const audioCtx = audioCtxRef.current;

      if (clock && session && canvas && audioCtx) {
        const nowMs = clock.nowMs();
        session.update(nowMs);
        scheduleMetronomeClicks(audioCtx, clock, lastScheduledBeatMsRef, nowMs);
        draw(canvas, session, nowMs, lastPressRef.current);
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
      <div className="flex gap-6 text-sm text-zinc-500">
        <span>Score: {hud.score}</span>
        <span>Combo: {hud.combo}</span>
        <span>Max Combo: {hud.maxCombo}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="rounded-lg border border-zinc-300 bg-zinc-950 dark:border-zinc-700"
      />
      <Keyboard activeKey={pressedKey} />
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
    osc.connect(gain).connect(ctx.destination);
    osc.start(whenCtxTime);
    osc.stop(whenCtxTime + 0.05);
  }
  if (beats.length > 0) {
    lastScheduledBeatMsRef.current = beats[beats.length - 1];
  }
}

/** The center of a letter's lane at some progress through its fall, in canvas-x pixels. */
function laneCenterX(canvasWidth: number, lane: Lane | null, progress: number): number {
  if (!lane) return canvasWidth / 2;
  const { left, right } = laneEdgesAt(lane, progress);
  return ((left + right) / 2) * canvasWidth;
}

/** The whole trapezoid a letter's note travels through, top (spawn) to bottom (its key). */
function drawLaneGlow(ctx: CanvasRenderingContext2D, canvasWidth: number, lane: Lane, alpha: number): void {
  const far = laneEdgesAt(lane, 0);
  const near = laneEdgesAt(lane, 1);

  ctx.beginPath();
  ctx.moveTo(far.left * canvasWidth, 0);
  ctx.lineTo(far.right * canvasWidth, 0);
  ctx.lineTo(near.right * canvasWidth, HIT_LINE_Y);
  ctx.lineTo(near.left * canvasWidth, HIT_LINE_Y);
  ctx.closePath();
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fill();
}

function draw(
  canvas: HTMLCanvasElement,
  session: GameSession,
  nowMs: number,
  lastPress: { char: string; atMs: number } | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Briefly glow the whole lane of whatever key was just pressed, as a
  // subtle, translucent backdrop behind the hit line and the notes.
  if (lastPress) {
    const elapsed = nowMs - lastPress.atMs;
    if (elapsed >= 0 && elapsed < LANE_GLOW_FADE_MS) {
      const lane = getLane(lastPress.char);
      if (lane) {
        drawLaneGlow(ctx, canvas.width, lane, LANE_GLOW_MAX_ALPHA * (1 - elapsed / LANE_GLOW_FADE_MS));
      }
    }
  }

  ctx.strokeStyle = "#52525b";
  ctx.beginPath();
  ctx.moveTo(0, HIT_LINE_Y);
  ctx.lineTo(canvas.width, HIT_LINE_Y);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const letter of session.letters) {
    if (!isNoteVisible(nowMs, letter.timeMs)) continue;

    const progress = noteProgress(nowMs, letter.timeMs);
    const y = progress * HIT_LINE_Y;
    // Travel along the center of this letter's lane, so it always ends
    // up exactly on its key — not just "toward the middle of the screen".
    const x = laneCenterX(canvas.width, getLane(letter.char), progress);
    const scale = noteScale(progress);

    ctx.globalAlpha = noteAlpha(progress);
    ctx.font = `${Math.round(24 * scale)}px sans-serif`;
    ctx.fillStyle = session.currentLetter === letter ? "#facc15" : "#a1a1aa";
    ctx.fillText(letter.char, x, y);
  }
  ctx.globalAlpha = 1;

  const event = session.lastEvent;
  if (event) {
    const elapsed = nowMs - event.atMs;
    if (elapsed >= 0 && elapsed < JUDGMENT_LABEL_FADE_MS) {
      const x = laneCenterX(canvas.width, getLane(event.letter.char), 1);
      ctx.globalAlpha = 1 - elapsed / JUDGMENT_LABEL_FADE_MS;
      ctx.font = "bold 18px sans-serif";
      ctx.fillStyle = JUDGMENT_COLORS[event.judgment];
      ctx.fillText(event.judgment.toUpperCase(), x, HIT_LINE_Y - 28);
      ctx.globalAlpha = 1;
    }
  }

  if (session.isFinished) {
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "24px sans-serif";
    ctx.fillText("Done!", canvas.width / 2, HIT_LINE_Y / 2);
  }
}
