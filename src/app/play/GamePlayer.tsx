"use client";

// Thin display layer: owns the canvas, the AudioContext, and the browser
// event listeners, but all the actual game rules (judging, scoring,
// falling-note math, metronome timing) live in src/game/. This component
// just reads that state every animation frame and draws it.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Chart } from "@/game/types";
import { GameClock, audioContextTimeSource } from "@/game/clock";
import { GameSession } from "@/game/session";
import { isNoteVisible, noteProgress } from "@/game/render";
import { upcomingBeats } from "@/game/metronome";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;
const HIT_LINE_Y = CANVAS_HEIGHT - 60;
const METRONOME_LOOKAHEAD_MS = 150;

interface Props {
  chart: Chart;
}

export default function GamePlayer({ chart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const clockRef = useRef<GameClock | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const lastScheduledBeatMsRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [hud, setHud] = useState({ score: 0, combo: 0, maxCombo: 0 });

  function start() {
    const ctx = new AudioContext();
    const clock = new GameClock(audioContextTimeSource(ctx));
    clock.start();

    audioCtxRef.current = ctx;
    clockRef.current = clock;
    sessionRef.current = new GameSession(chart);
    lastScheduledBeatMsRef.current = 0;
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
        draw(canvas, chart, session, nowMs);
        setHud({
          score: session.tracker.score,
          combo: session.tracker.combo,
          maxCombo: session.tracker.maxCombo,
        });
      }

      rafId = requestAnimationFrame(frame);
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(rafId);
    };
  }, [isPlaying, chart]);

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
      {!isPlaying && (
        <button
          onClick={start}
          className="rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Start
        </button>
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

function draw(canvas: HTMLCanvasElement, chart: Chart, session: GameSession, nowMs: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#52525b";
  ctx.beginPath();
  ctx.moveTo(0, HIT_LINE_Y);
  ctx.lineTo(canvas.width, HIT_LINE_Y);
  ctx.stroke();

  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";

  for (const note of chart.notes) {
    if (!isNoteVisible(nowMs, note.timeMs)) continue;
    const y = noteProgress(nowMs, note.timeMs) * HIT_LINE_Y;
    ctx.fillStyle = session.currentNote === note ? "#facc15" : "#a1a1aa";
    ctx.fillText(note.display, canvas.width / 2, y);
  }

  if (session.isFinished) {
    ctx.fillStyle = "#e4e4e7";
    ctx.fillText("Done!", canvas.width / 2, HIT_LINE_Y / 2);
  }
}
