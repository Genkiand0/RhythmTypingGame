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
import { getLane, laneEdgesAt, laneYAt, type Lane } from "@/game/lanes";
import { colorForRow } from "@/game/keyboard";
import { CANVAS_WIDTH, CANVAS_HEIGHT, KEYBOARD_AREA_TOP_FRACTION } from "@/game/playfield";
import Keyboard from "./Keyboard";

const KEYBOARD_BOUNDARY_Y = KEYBOARD_AREA_TOP_FRACTION * CANVAS_HEIGHT;
const METRONOME_LOOKAHEAD_MS = 150;
const JUDGMENT_LABEL_FADE_MS = 500;
const PRESSED_KEY_GLOW_MS = 150;
const LANE_GLOW_FADE_MS = 250;
const LANE_GLOW_MAX_ALPHA = 0.22;
const INACTIVE_NOTE_ALPHA_FACTOR = 0.6;
const LANE_GUIDE_ALPHA = 0.14;

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
  const masterGainRef = useRef<GainNode | null>(null);
  const clockRef = useRef<GameClock | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const lastScheduledBeatMsRef = useRef(0);
  const pressedKeyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPressRef = useRef<{ char: string; atMs: number } | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
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
      const masterGain = masterGainRef.current;

      if (clock && session && canvas && audioCtx && masterGain) {
        const nowMs = clock.nowMs();
        session.update(nowMs);
        scheduleMetronomeClicks(audioCtx, masterGain, clock, lastScheduledBeatMsRef, nowMs);
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
      <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 rounded-lg border border-zinc-300 bg-zinc-950 dark:border-zinc-700"
        />
        <Keyboard activeKey={pressedKey} />
      </div>
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

/** A lane's position (center-x, y) at some progress through its fall, in canvas pixels. */
function lanePointAt(canvasWidth: number, canvasHeight: number, lane: Lane, progress: number) {
  const { left, right } = laneEdgesAt(lane, progress);
  return {
    x: ((left + right) / 2) * canvasWidth,
    y: laneYAt(lane, progress) * canvasHeight,
  };
}

/** The thin guide line along one edge of a lane, from its spawn point to its key. */
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

/** The whole trapezoid a letter's note travels through, spawn to key. */
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

function draw(
  canvas: HTMLCanvasElement,
  session: GameSession,
  nowMs: number,
  lastPress: { char: string; atMs: number } | null,
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

  // Where the falling zone ends and the embedded keyboard begins.
  ctx.strokeStyle = "#3f3f46";
  ctx.beginPath();
  ctx.moveTo(0, KEYBOARD_BOUNDARY_Y);
  ctx.lineTo(width, KEYBOARD_BOUNDARY_Y);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const letter of session.letters) {
    if (!isNoteVisible(nowMs, letter.timeMs)) continue;

    const lane = getLane(letter.char);
    if (!lane) continue;

    // The lane guide shows the whole path toward the key, regardless of
    // how far this particular note has traveled yet.
    drawLaneGuide(ctx, width, height, lane, colorForRow(lane.row));

    const progress = noteProgress(nowMs, letter.timeMs);
    const { x, y } = lanePointAt(width, height, lane, progress);
    const scale = noteScale(progress);
    const isCurrent = session.currentLetter === letter;

    ctx.globalAlpha = noteAlpha(progress) * (isCurrent ? 1 : INACTIVE_NOTE_ALPHA_FACTOR);
    ctx.font = `${Math.round(24 * scale)}px sans-serif`;
    ctx.fillStyle = colorForRow(lane.row);
    ctx.fillText(letter.char, x, y);
  }
  ctx.globalAlpha = 1;

  const event = session.lastEvent;
  if (event) {
    const elapsed = nowMs - event.atMs;
    if (elapsed >= 0 && elapsed < JUDGMENT_LABEL_FADE_MS) {
      const lane = getLane(event.letter.char);
      if (lane) {
        const { x, y } = lanePointAt(width, height, lane, 1);
        ctx.globalAlpha = 1 - elapsed / JUDGMENT_LABEL_FADE_MS;
        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = JUDGMENT_COLORS[event.judgment];
        ctx.fillText(event.judgment.toUpperCase(), x, y - 26);
        ctx.globalAlpha = 1;
      }
    }
  }

  if (session.isFinished) {
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "24px sans-serif";
    ctx.fillText("Done!", width / 2, KEYBOARD_BOUNDARY_Y / 2);
  }
}
