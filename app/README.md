# app/ — the game

React + TypeScript + Vite. All 13 episodes play end to end, standalone and in iframes. (The 38 per-reading-material units still build and test, but are not shipped — decision 2026-10-19.)

```bash
npm install
npm run dev          # copies ../content into public/content, starts Vite → http://localhost:5173
npm test             # Vitest: engine + UI widgets; plays the real session packs end to end in Node
npm run build        # typecheck + production build
npm run smoke        # after build: real Chrome reads the briefing and plays episodes 1–3 through the UI (SHOTS=dir saves screenshots)
npm run build:deploy # ../deploy/intro (briefing) + ../deploy/sNN (13 episodes), self-contained, for tests; `-- s 3`, `-- intro`, `-- units` / `-- u 11 12` (unit sites, not shipped)
npm run build:s3     # ../missing-influencer-v2: briefing + 13 episodes with ONE shared assets/ + content/ (~8 MB) — this is what gets uploaded (`--units` adds the 38 unit sites)
npm run smoke:deploy # plays every deploy folder inside an iframe (`sessions` | `units` | `--only 11`); DEPLOY_DIR=missing-influencer-v2 tests the compact folder
```

Node ≥ 18 (the pipeline and scripts use top-level `await`); on this machine `~/.nvm/versions/node/v22.22.2/bin`.

## Three ways to open the same game

| Page | How | Content |
|---|---|---|
| Case map (dev) | `npm run dev` → `http://localhost:5173` | all sessions (units: open `?unit=N` directly; the learning portal places them) |
| The **briefing** | `?intro=1` (or `#/intro`) in dev; `<meta name="tmi-intro" content="1">` in `deploy/intro` | the page before the first episode: who you are, how to play, every episode by name, the cast (`content/story/cast.json`) |
| One session | `?session=3` in dev; `<meta name="tmi-session" content="3">` in `deploy/s03` | `content/sessions/s03.json` |
| One **unit** | `?unit=11` in dev; `<meta name="tmi-unit" content="11">` in `deploy/u11` | `content/units/u11.json` — a slice of session 3 (part 2/3) |

A unit is played by the same `SessionRunner`, `Player`, intro and done screens: its pack *is* a session pack (`pack.unit` set,
beats sliced). Only the progress scope differs (`packScope`: `s3` vs `s3.u11`), so a unit resumes and resets on its own, and
`deriveProgress` marks a session complete when a whole-session sitting finished it **or** all its unit parts are done.

Identity and sharing between unit sites: `UrlAuth` (`?user_id=` from the platform, else `GuestAuth`); the embed bridge (`ui/embed.ts`)
also accepts a `restore` message from the host page that replays saved events. Details for the platform team: `../deploy/README.md`.

## Screens (hash routes, so a refresh keeps your place)

| Route | Screen |
|---|---|
| `#/` | Case map: 13 episode cards from 6 PM to midnight (named after what happens — the learner never sees "Session 3"), points, clues, badges, link to the briefing |
| `#/intro` | The briefing: premise, your role, how a step works, every episode with teaser + skills, the cast, points/ranks, house rules |
| `#/s/3` | Episode intro: poster, story clock, length / tasks / clues / skills, "how this works", "the case so far"; Start / Continue, and **↺ Reset progress** |
| `#/play/3` | Game screen: HUD (episode name, story clock, **🗄 Tables** — the case database, rows + schema, on every step —, evidence, reset) · stories-style progress bar, one segment per step (tap a finished one to reopen it; a steps list opens from the step chip) · one step at a time on the stage — cinematic scene with "typing…", wide Case Note card, SQL task laid out as an IDE (brief on top; console with Run / **↺ Reset DB** / Clear / Hints, verdict, result that scrolls both ways with sticky header + "⤢ Full view"; the Tables drawer beside it, one tab per table, Data or Schema, tap a column to type it), evidence reveal, quick check, activity board — with ← Back / Continue → in a floating dock (arrow keys work). Finished steps reopen read-only; solved SQL tasks become a free practice run |
| `#/done/3` | Episode solved: confetti, points count up, hints, traps, new clues, next episode by name |
| `#/evidence` | Evidence Board: every pinned clue with the learner's own proving query |
| `#/dev` | Engine dev harness (team only) |

## Structure

| Path | What |
|---|---|
| `src/ui/` | App shell, screens (incl. `Briefing.tsx`), `game/` (story bar + steps list, story stages), components (SQL terminal on CodeMirror, results table, confetti, side sheets for hints / course note / evidence, Case Notes markdown), activity widgets. Dark night theme in `styles.css`, per-episode accent in `theme.ts`, episode names / teasers / skills in `episodes.ts`, scene art in `art/SceneArt.tsx` |
| `src/content/` | zod schemas for packs, loader, Case Notes section extractor |
| `src/engine/sql/` | `SqlJsEngine` (fresh snapshot copy per run), Web Worker + promise client |
| `src/engine/runner/` | `SessionRunner` (beats, tasks, hints, activities, checks, clues), resume store |
| `src/engine/activities/` | answer checking for sort / match / order / pick-cell / multi-select |
| `src/engine/progress/` | points, ranks, unlocks, badges, Evidence Board — derived from the event log |
| `src/ports/`, `src/adapters/` | `AuthProvider` / `ProgressStore` + GuestAuth, IndexedDB store |
| `../shared/` | grader, result hashing, SQL feature map — shared with `../pipeline` |

UI notes (2026-10-19 redesign): every stage is an **episode named after what happens** — `Session N` / `S1` never appear to the learner (folder ids `sNN`/`uNN` stay as machine keys). Each episode has its own sky + accent (`src/ui/theme.ts`), an inline-SVG banner (`src/ui/art/SceneArt.tsx` — no image files to host) and an emoji / teaser / skills line (`src/ui/episodes.ts`). Look: glass cards over a slow aurora, Unbounded display type, electric-lime stickers, chunky pill buttons, confetti on correct answers, shake on wrong, a stamp slam on pinned evidence, "typing…" before a person's line, count-up points on the solved screen; all motion respects `prefers-reduced-motion`. Notes look like case-file paper, clues like evidence tags, the Evidence Board is a cork board; mobile-first; every widget works by tap/keyboard (no drag-and-drop); traps show in amber (a mistake is a lesson, not a failure). Screenshots: `../docs/screenshots/`.
Content in `public/content` is **generated** by `scripts/sync-content.mjs` from `../content` (sessions, solutions, units, snapshots, notes, cast); never edit it.
