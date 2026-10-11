@AGENTS.md

# DaKEN (打鍵) project guide

Rhythm typing game: notes fall in sync with audio, player types the text. Japanese (romaji) and English. PC and smartphone.

- Stack: Next.js App Router, TypeScript (strict), Tailwind CSS, deployed on Vercel.
- Read first: `docs/ROADMAP.md` (current phase), `src/game/types.ts` (Chart / Note format).
- Game logic lives in `src/game/` as plain TypeScript with no React, so it can be unit tested.
- React components only display state and forward input.
- Timing: use the audio clock as the source of truth, never `setTimeout`/`setInterval` for note timing.
- Chart times are milliseconds at 1.0x speed.
- Before finishing: run `npm run lint` and `npm run build`. Show the diff and stop before committing.
