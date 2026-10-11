# DaKEN (打鍵) Roadmap

Rule: every phase ends with something playable on the deployed Vercel URL.

## Phase 0: Setup (done in this repo)
- Next.js (App Router) + TypeScript + Tailwind, ESLint
- `src/game/types.ts`: Chart / Note data format
- `src/content/stages/sample-words-en.json`: first sample stage
- Push to GitHub, connect to Vercel

## Phase 1: Core engine, PC only, English (the "one fun minute")
- Game clock based on the audio clock (not `setTimeout`)
- Canvas renderer: notes fall to a hit line, 60fps with `requestAnimationFrame`
- Keyboard input -> judgment (perfect / great / good / miss) -> score + combo
- Plays `sample-words-en.json` with a metronome click
- Done when: a friend can play 30 seconds and say whether it feels on-beat

## Phase 2: Visual keyboard + results
- On-screen QWERTY-shaped guide; each note falls toward its first letter's key
- Pressed key lights up
- Results screen: score, max combo, accuracy, judgment counts
- Missed-words review list

## Phase 3: Japanese romaji
- Kana -> romaji matcher that accepts all common spellings (shi/si, chi/ti, tsu/tu, ja/zya/jya, n/nn, small tsu by doubling)
- Unit tests for the matcher (this is where bugs hide)
- First Japanese word stage

## Phase 4: Playback speed, health, calibration
- Speed 0.5x-1.5x, pitch preserved; note times scale by 1/speed
- Optional health bar (mistakes drain it, run ends at 0)
- Audio/input offset calibration screen (every device has different latency)

## Phase 5: Smartphone
- In-page touch keyboard (our own, not the system keyboard) so note lanes line up with keys
- Portrait layout, touch latency testing on a real iPhone and Android

## Phase 6: Dialogue + Music modes and a chart editor
- Internal "tap to time" editor: play audio, tap on each word, export Chart JSON
- Built-in stages from content we have rights to (see Content rights)

## Phase 7: Custom stages
- Upload audio + Chart JSON, choose content type and mode
- Processed in the browser first (no server storage = fewer rights problems)
- Later: Supabase for saving/sharing custom stages and accounts

## Phase 8 (stretch): AI-assisted note generation
- Speech-to-text with word timestamps to draft a chart from audio; user fixes it in the editor
- Music with vocals is much harder than clean speech; expect manual fixing

## Content rights
- Do not ship commercial songs, film clips, or lyrics without a license.
- Safe sources: your own recordings, friends' voices with permission, public-domain texts, CC-licensed audio (check the exact license), text-to-speech.
- Record the source in each chart's `license` field.
