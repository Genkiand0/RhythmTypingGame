# DaKEN (打鍵) Roadmap

Rule: every phase ends with something playable on the deployed Vercel URL.

## Phase 0: Setup
- Next.js (App Router) + TypeScript + Tailwind, ESLint
- `src/game/types.ts`: Chart / Note data format
- `src/content/stages/sample-words-en.json`: first sample stage
- Push to GitHub, connect to Vercel

## Phase 1: Core engine, PC only, English
- Game clock based on the audio clock (not `setTimeout`)
- Canvas renderer: notes fall to a hit line with `requestAnimationFrame`
- Keyboard input -> judgment (perfect / great / good / miss) -> score + combo
- Plays `sample-words-en.json` with a metronome click
- Done when: a friend can play 30 seconds and say whether it feels on-beat

## Phase 2: Visual keyboard + results
- On-screen QWERTY-shaped guide; each note falls toward its first letter's key
- Pressed key lights up
- Results screen: score, max combo, accuracy, judgment counts
- Missed-words review list

## Phase 3: Japanese romaji
- Kana -> romaji matcher accepting all common spellings (shi/si, chi/ti, tsu/tu, ja/zya/jya, n/nn, small tsu by doubling)
- Unit tests for the matcher
- First Japanese word stage

## Phase 4: Playback speed, health, calibration
- Speed 0.5x-1.5x, pitch preserved; note times scale by 1/speed
- Optional health bar (mistakes drain it, run ends at 0)
- Audio/input offset calibration screen

## Phase 5: Smartphone
- In-page touch keyboard (our own, not the system keyboard) so note lanes line up with keys
- Portrait layout, latency testing on a real iPhone and Android

## Phase 6: Dialogue + Music modes and a chart editor
- "Tap to time" editor: play audio, tap on each word, export Chart JSON
- Built-in stages from content we have rights to

## Phase 7: Custom stages
- Upload audio + Chart JSON, choose content type and mode
- Processed in the browser first; later Supabase for saving/sharing

## Phase 8 (stretch): AI-assisted note generation
- Speech-to-text with word timestamps drafts a chart; user fixes it in the editor

## Content rights
- Do not ship commercial songs, film clips, or lyrics without a license.
- Safe sources: own recordings, friends' voices with permission, public-domain texts, CC-licensed audio (check the exact license), text-to-speech.
- Record the source in each chart's `license` field.
