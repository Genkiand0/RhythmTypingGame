import sampleChart from "@/content/stages/sample-words-en.json";
import type { Chart } from "@/game/types";
import GamePlayer from "./GamePlayer";

// JSON imports lose the string-literal types (e.g. GameMode), so we assert
// back to Chart once here, right where the JSON enters the app.
const chart = sampleChart as Chart;

export default function PlayPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center gap-8 px-4 py-16">
      <header className="text-center">
        <h1 className="text-3xl font-bold">{chart.title}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Type each word as it reaches the line. Click Start first (audio needs that).
        </p>
      </header>
      <GamePlayer chart={chart} />
    </main>
  );
}
