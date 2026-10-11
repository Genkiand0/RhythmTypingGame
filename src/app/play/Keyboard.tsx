"use client";

// A letters-only on-screen keyboard. Purely a display of state passed in —
// it doesn't know about typing, judgments, or the game loop. The parent
// tells it which key (if any) was just pressed, and for how long to glow.

import { KEY_ROWS } from "@/game/keyboard";

interface Props {
  /** The most recently typed letter, or null if nothing's lit up right now. */
  activeKey: string | null;
}

export default function Keyboard({ activeKey }: Props) {
  return (
    <div className="flex w-full max-w-[800px] flex-col items-center gap-[7.5px]">
      {KEY_ROWS.map((row, rowIndex) => (
        <div
          key={row}
          className="flex gap-[7.5px]"
          style={{ marginLeft: `${rowIndex * 1.375}rem` }}
        >
          {[...row].map((letter) => {
            const isActive = activeKey?.toLowerCase() === letter;
            return (
              <div
                key={letter}
                className={`flex h-[45px] w-[45px] items-center justify-center rounded-md border text-[17.5px] font-medium uppercase transition-colors duration-100 ${
                  isActive
                    ? "border-yellow-400 bg-yellow-400 text-zinc-900"
                    : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {letter}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
