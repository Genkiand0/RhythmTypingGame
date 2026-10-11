const MODES = [
  { name: "Dialogue Mode", desc: "Type spoken lines and conversations." },
  { name: "Music Mode", desc: "Type lyrics in time with the music." },
  { name: "Word / Short Sentence Mode", desc: "Type words and short sentences." },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-16">
      <header>
        <h1 className="text-4xl font-bold">DaKEN 打鍵</h1>
        <p className="mt-2 text-zinc-500">Rhythm typing game for Japanese and English.</p>
      </header>
      <ul className="flex flex-col gap-3">
        {MODES.map((m) => (
          <li key={m.name} className="rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
            <h2 className="font-semibold">{m.name}</h2>
            <p className="text-sm text-zinc-500">{m.desc}</p>
            <p className="mt-1 text-xs text-zinc-400">Coming soon</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
