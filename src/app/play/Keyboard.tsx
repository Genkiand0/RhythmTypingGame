"use client";

// A letters-only on-screen keyboard, drawn as an overlay directly inside
// the playfield (not below it), so a note's landing spot and the real key
// underneath are the same pixels. Purely a display of state passed in —
// it doesn't know about typing, judgments, or the game loop. Position and
// color both come from the same shared layout the canvas renderer uses
// (playfield.ts / keyboard.ts), so the two can never drift apart.

import { KEY_ROWS, colorForRow } from "@/game/keyboard";
import { getKeySlot, CANVAS_WIDTH, CANVAS_HEIGHT } from "@/game/playfield";

const KEY_GAP_PX = 4;
const PRESSED_COLOR = "#facc15";

interface Props {
  /** The most recently typed letter, or null if nothing's lit up right now. */
  activeKey: string | null;
}

export default function Keyboard({ activeKey }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {KEY_ROWS.flatMap((row) => [...row]).map((letter) => {
        const slot = getKeySlot(letter);
        if (!slot) return null;

        const isActive = activeKey?.toLowerCase() === letter;
        const left = slot.leftFraction * CANVAS_WIDTH;
        const top = slot.rowTopFraction * CANVAS_HEIGHT;
        const width = (slot.rightFraction - slot.leftFraction) * CANVAS_WIDTH;
        const height = (slot.rowBottomFraction - slot.rowTopFraction) * CANVAS_HEIGHT;
        const color = isActive ? PRESSED_COLOR : colorForRow(slot.row);

        return (
          <div
            key={letter}
            className="absolute flex items-center justify-center rounded-md border text-[17.5px] font-semibold uppercase text-zinc-900 transition-[opacity,background-color,border-color] duration-100"
            style={{
              left: left + KEY_GAP_PX / 2,
              top: top + KEY_GAP_PX / 2,
              width: width - KEY_GAP_PX,
              height: height - KEY_GAP_PX,
              backgroundColor: color,
              borderColor: color,
              opacity: isActive ? 1 : 0.55,
            }}
          >
            {letter}
          </div>
        );
      })}
    </div>
  );
}
