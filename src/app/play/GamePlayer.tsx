"use client";

// Thin display layer: owns the canvas, the AudioContext, and the browser
// event listeners, but all the actual game rules (judging, scoring,
// falling-note math, metronome timing) live in src/game/. This component
// just reads that state every animation frame and draws it.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Chart, Judgment } from "@/game/types";
import { GameClock, audioContextTimeSource } from "@/game/clock";
import { GameSession } from "@/game/session";
import type { LetterNote } from "@/game/letterNotes";
import { isNoteVisible, noteProgress, noteScale, noteAlpha } from "@/game/render";
import { upcomingBeats } from "@/game/metronome";
import { getKeyPosition } from "@/game/keyboard";
import Keyboard from "./Keyboard";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;
const HIT_LINE_Y = CANVAS_HEIGHT - 60;
const METRONOME_LOOKAHEAD_MS = 150;
const JUDGMENT_LABEL_FADE_MS = 500;
const PRESSED_KEY_GLOW_MS = 150;

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
      session.typeChar(e.key, clock.nowMs());

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
        draw(canvas, session, nowMs);
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

/** Where a letter should converge toward horizontally: its key, or dead center if unknown. */
function letterTargetX(canvasWidth: number, letter: LetterNote): number {
  const pos = getKeyPosition(letter.char);
  return pos ? pos.colFraction * canvasWidth : canvasWidth / 2;
}

function draw(canvas: HTMLCanvasElement, session: GameSession, nowMs: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#52525b";
  ctx.beginPath();
  ctx.moveTo(0, HIT_LINE_Y);
  ctx.lineTo(canvas.width, HIT_LINE_Y);
  ctx.stroke();

  const vanishingX = canvas.width / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const letter of session.letters) {
    if (!isNoteVisible(nowMs, letter.timeMs)) continue;

    const progress = noteProgress(nowMs, letter.timeMs);
    const y = progress * HIT_LINE_Y;
    // Converge from the vanishing point toward the letter's key as it
    // approaches, like a note "homing in" on where it should be typed.
    const x = vanishingX + (letterTargetX(canvas.width, letter) - vanishingX) * Math.min(progress, 1);
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
      const x = letterTargetX(canvas.width, event.letter);
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
