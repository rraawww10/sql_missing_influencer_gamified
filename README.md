# SQL: The Missing Influencer

A story-driven SQL game for the *Introduction to Databases* course. The learner is a new intern at the City Police Data Cell;
singer Tara Sen has vanished six hours before her first stadium show, and the only witness is the data. Thirteen episodes
(one per course topic, 6 PM → midnight) teach the course's SQL by solving the case: every clue is the result of a query the
learner writes themselves. Audience: learners who just finished 12th class, many from small towns, SQL beginners.

Everything runs in the browser (SQLite via WebAssembly) — no server, no database to host.

## Ready to upload: `missing-influencer-v2/`

The built game is committed in **`missing-influencer-v2/`** (~8 MB). Upload that whole folder to S3 (or any static host) as one tree:

```
missing-influencer-v2/
  intro/index.html        the briefing (before the first episode)
  s01/ … s13/index.html   the 13 episodes — She's Gone … Showtime
  assets/  content/       shared app bundle + case database (every page points at ../assets and ../content)
  sessions.json           folder → episode name, minutes, course topic_id
  embed-demo.html         optional test host page
```

Each episode is embedded with `<iframe src="…/missing-influencer-v2/s03/index.html?user_id=STUDENT-ID">` (see `app/README.md` for the
platform messages). Serve `.wasm` as `application/wasm`. **After any change to the game or the content, rebuild it** —
`cd app && npm run build:s3` writes the folder again (asset file names change every build, so re-upload the whole folder) — and commit it.

## Quick start

Requirements: **Node 18+** (22 recommended), **Python 3** (only to rebuild the case database), a modern browser.

```bash
# 1. the content pipeline (validates the episode sources and builds the game packs)
cd pipeline && npm install && cd ..
node pipeline/build_sessions.mjs         # → content/sessions/sNN.json, solutions, units
python3 pipeline/audit_clues.py          # every clue must be earned by a query (exit 1 if not)

# 2. the game
cd app && npm install
npm run dev                              # http://localhost:5173 — case map, briefing, all 13 episodes
npm test                                 # engine + UI tests; plays every episode pack end to end
```

Open `http://localhost:5173/#/intro` for the briefing, `#/s/3` for an episode intro, `#/play/3` to play it.

## What's where

| Path | What | Edit? |
|---|---|---|
| `content/sessions/src/sNN.yaml` | **The 13 episodes** — story beats, Case Notes, activities, SQL tasks with reference SQL, hints, traps, clues | ✅ the main thing to edit |
| `content/story/cast.json` | Every character, place and number plate (`{{placeholders}}` in the YAML) | ✅ |
| `content/reading_materials.json` | Verbatim extract of the course reading materials (+ `curation.json` cuts) | ❌ never hand-edit |
| `content/case_db/` | The fictional case database: `schema.sql`, seed SQL, per-episode snapshots, built by `pipeline/build_case_db.py` | edit the builder, then rebuild |
| `content/sessions/sNN.json`, `solutions/`, `content/units/` | **Generated** packs the game loads | ❌ generated |
| `pipeline/` | `build_sessions.mjs` (validate + build packs), `audit_clues.py` (evidence-chain check), `test_grader.mjs`, `build_case_db.py`, `check_case_db.mjs` | |
| `app/` | The game: React + TypeScript + Vite. `src/ui` screens and components, `src/engine` (SQL worker, session runner, progress), `scripts/` (build, smoke tests) | ✅ |
| `missing-influencer-v2/` | **The built upload folder** (briefing + 13 episodes). Rebuilt by `npm run build:s3` | ❌ generated — rebuild, don't edit |
| `shared/` | Grader, result hashing, SQL feature map — used by both the pipeline and the app | |
| `docs/SESSION_PLAN.md` | **The design**: beat-by-beat flow of every episode, the case truth, the evidence-chain rule (§0.5) | keep in sync with the YAML |
| `docs/screenshots/after/` | Screenshots of every screen | |
| `PLAN.md` | Original concept, audience, safety rules | |

## Editing an episode

1. Edit `content/sessions/src/sNN.yaml` (see `content/sessions/README.md` for every beat type and the rules).
2. `node pipeline/build_sessions.mjs --only N` — fails on: unknown reading-material headings, uncovered headings, reference SQL
   that errors / returns nothing / uses SQL taught in a later episode, traps that don't trigger, unwired clues, > 60 min.
3. `python3 pipeline/audit_clues.py N` — prints each clue with the query that unlocks it and its real result; fails if a card
   states a time / plate / amount the learner never saw.
4. `node pipeline/test_grader.mjs` — replays every reference answer and trap through the game's grader.
5. `cd app && npm run dev` — the dev server copies the packs automatically; play the episode.
6. `npm test`, and for the full browser check `npm run build && npm run smoke` (real Chrome plays episodes 1–3).

### The rules that matter

- **Evidence chain** (`docs/SESSION_PLAN.md` §0.5): a clue is never told. Lead scene → the learner's query shows the facts →
  a read-it step (tap the cell / a check) → the clue card quotes only what was shown and cites earlier clues by id.
- **Teach only what the reading material contains.** The build's feature audit enforces it for reference SQL.
- **Grading follows SQLite**, never stricter than the course: results are compared by value; column names don't matter, count and order do.
- **Episode names, never numbers.** Learners see "Hotel Gate Log · 7:00 PM", never "Session 3" (`app/src/ui/episodes.ts`). Folder ids `sNN` are machine keys only.
- **Safety:** Tara is *missing*, never hurt; no violence; fans are respected; every name, place and company is fictional (`PLAN.md` §3).
- **Simple English.** Short sentences, one idea per line.

## Shipping

```bash
cd app && npm run build:s3     # rewrites ../missing-influencer-v2/  (~8 MB: briefing + 13 episodes, one shared assets/ + content/)
git add missing-influencer-v2 && git commit -m "rebuild upload folder"
```

Upload the folder as one tree to any static host (S3, etc.). Each episode is `…/sNN/index.html`, the briefing is `…/intro/index.html`;
embed in an iframe with `?user_id=<learner id>`. Details, the platform messages (`ready`, `progress`, `completed`, `reset`) and the
progress-sharing rules are in `app/README.md` and `deploy/README.md` (the latter is generated by `npm run build:deploy`, the self-contained test build).

`npm run smoke:deploy` (after `build:deploy`) or `DEPLOY_DIR=missing-influencer-v2 node scripts/smoke-deploy.mjs sessions` plays the
built sites inside an iframe in real Chrome.

## Rebuilding the case database

Only needed if you change the story's data (`pipeline/build_case_db.py`): `python3 pipeline/build_case_db.py`, then
`node pipeline/check_case_db.mjs`, then rebuild the episodes. The snapshots in `content/case_db/snapshots/` are committed, so the normal edit loop never needs Python.
