# SQL: The Missing Influencer — Implementation Plan

Companion docs: `PLAN.md` (product plan), `docs/SESSION_PLAN.md` (case flow per session).
Input content: `content/reading_materials.json` (verbatim extract — never edited; see §2).

---

## 1. Principles

1. **Course content is a read-only layer.** `content/reading_materials.json` mirrors the course export, plus the course team's curation rules (`content/curation.json`: compliance-only sections cut from a heading to the end). Both are applied by `pipeline/extract_reading_materials.py`, so the extract is reproducible. The game never edits it; it references entries by `unit_id` / `learning_resource_id` and heading text.
2. **Story/game is a separate layer** (`content/sessions/`). Any choice like "use RM #37 not #34" or "show #29 before #27" lives here, not in the extract.
3. **Teach only what the RM contains.** An automated coverage check fails the build if a session uses a SQL feature its RMs don't teach, or if an RM heading has no beat.
4. **Learner SQL runs only in the browser** (sql.js sandbox). No learner SQL ever reaches a server.
5. **LMS-ready from day 1**: auth and progress behind adapters, events keyed by original course IDs.
6. **English only** — simple English, short sentences. No i18n layer in v1.
7. **Continue any time** — an unfinished session resumes at the same step, with no time limit (see §4.5).

---

## 2. Architecture

```
                 ┌──────────────────────── Browser ────────────────────────┐
 content/        │  Session Runner ──► Beat renderer (scene/note/activity) │
 sessions/*.json │        │                                                │
 case_db/*.sqlite│        ▼                                                │
 (static files)  │  SQL Console ──► SQL Worker (sql.js, SQLite ≥ 3.39)     │
       │         │        │              │  per-task DB snapshot          │
       └────────►│        ▼              ▼                                │
                 │  Grader (result-set / table-state / schema / error)     │
                 │        │                                                │
                 │        ▼                                                │
                 │  Evidence Board · Hints · Progress (event log)          │
                 │        │                                                │
                 │  ports: AuthProvider, ProgressStore                     │
                 └────────┼────────────────────────────────────────────────┘
                          ▼
        GuestAuth + IndexedDB (now) → Pilot API + Postgres → LMS (later)
```

---

## 2b. Deployment model (2026-10-05)

**Standalone static sites embedded in the LMS with iframes** — no dev work on the LMS side. Two cuts of the same content:
13 session sites (`deploy/sNN`) and, since 2026-10-08, **38 unit sites (`deploy/uNN`) — one per course reading material** (+ finale),
because the platform configures every reading material as its own unit. Units are contiguous slices of their session (`units:` block
in the session YAML, with an opener/closer each); duplicate reading materials are aliases. Units connect through browser storage on one
origin (`?user_id=` from the platform keys it) and, as a fallback, a `restore` postMessage from the host page. `deploy/README.md` §Progress.
`app/scripts/build-deploy.mjs` builds `deploy/s01 … s13`, each with only its own pack, solutions, snapshot and course notes, relative paths (any host/folder), and an iframe bridge (`postMessage`: ready / progress / completed / resize). Every session is playable on its own: it opens with "The case so far" and shows earlier clues as *briefed* on its Evidence Board. Guide for the LMS team: `deploy/README.md`. Verified by `app/scripts/smoke-deploy.mjs` (each session played inside an iframe, fresh browser profile).

## 3. Repository layout

```
intro_to_databases.json            # course export (source of truth, untouched)
pipeline/
  extract_reading_materials.py     # DONE — builds content/reading_materials.json
  build_case_db.py                 # DONE — story rows + seeded noise → seeds + per-session snapshots
  check_case_db.mjs                # DONE — runs checks.json on snapshots with sql.js (browser engine)
  build_sessions.mjs               # DONE — validate src/*.yaml (structure, rm_refs, coverage, feature audit,
                                   #        reference + trap SQL on snapshots, budget) → public packs + solutions
  test_grader.mjs                  # DONE — replays every answer/trap through lib/grader.mjs
  lib/result.mjs                   # DONE — result normalisation + SHA-256 hash (shared with the app)
  lib/grader.mjs                   # DONE — task grader (shared with the app)
  lib/sql_features.mjs             # DONE — SQL feature → session map (audit + in-game nudge)
content/
  reading_materials.json           # DONE — verbatim extract
  case_db/
    schema.sql                     # DONE — all case tables
    seed/*.sql                     # DONE — generated, reviewable INSERTs
    snapshots/s01.sqlite … s13.sqlite   # DONE — generated (≤ 700 KB each)
    runtime/index_demo.sql         # DONE — builds the 1-lakh-row index demo table in the browser
    checks.json                    # DONE — 115 reference/trap/clue checks
  sessions/
    src/s01.yaml …                 # DONE (S1–S3) — authored source (see content/sessions/README.md)
    s01.json … s13.json            # generated public packs (no reference SQL)
    solutions/s01.json …           # generated reference + trap SQL, lazy-loaded (hint 3 only)
    coverage.json                  # generated RM heading coverage
  story/
    characters.json  clues.json  timeline.json
shared/                            # DONE — used by both pipeline/ and app/ (plain ESM + .d.mts types)
  result.mjs  grader.mjs  sql_features.mjs
app/                               # see app/README.md
  scripts/sync-content.mjs         # DONE — ../content → public/content
  scripts/smoke.mjs                # DONE — real-Chrome smoke test of the team build (case map)
  scripts/build-deploy.mjs         # DONE — one standalone site per session → ../deploy/sNN
  scripts/smoke-deploy.mjs         # DONE — plays every deploy/sNN inside an iframe
  src/
    content/          DONE — zod schemas (types.ts), loader, Case Notes extractor
    engine/sql/       DONE — SqlJsEngine, worker.ts, client.ts (WorkerEngine)
    engine/runner/    DONE — sessionRunner.ts, sitting.ts (resume any time)
    engine/activities/ DONE — activity answer checking
    engine/progress/  DONE — derive.ts (points, ranks, unlocks, badges, Evidence Board)
    ports/            DONE — auth.ts, progress.ts
    adapters/         DONE — guestAuth.ts, localProgressStore.ts (IndexedDB), memoryProgressStore.ts
    dev/              DONE — engine dev harness (team only, at #/dev)
    ui/               DONE (M4) — App shell + hash routes, screens/ (Home, SessionIntro, Player, SessionDone, EvidenceBoard),
                      game/ (MissionRail, StoryStages), components/ (TaskPanel, SqlEditor, ResultTable, CheckPanel, DemoPanel, Sheet, CourseNote, Markdown), activities/ (5 widgets)
    (Session 9 case board = tap activities in ui/activities — no separate canvas)
server/               (Phase 4) pilot API
docs/
```

---

## 4. Data contracts

### 4.1 Session pack (`content/sessions/sNN.json`)

Authored as YAML in `content/sessions/src/sNN.yaml` (format: `content/sessions/README.md`); `build_sessions.mjs` emits the JSON below. The sample shows the shape; field names follow the README.

```jsonc
{
  "session": 3,
  "title": "Hotel Gate Log",
  "story_clock": "2026-12-12 19:00:00",
  "course_topic_id": "96f9178e-a503-4611-9d16-abf889375c54",
  "reading_materials": [               // references into reading_materials.json
    { "unit_id": "5a12e93b-…", "learning_resource_id": "…", "role": "primary" }
  ],
  "snapshot": "s03.sqlite",
  "beats": [
    { "id": "S3.1", "type": "note",
      "rm_ref": { "unit_id": "5a12e93b-…", "heading": "Comparison Operators" },
      "body_md": "…story-voiced explainer…" },
    { "id": "S3.5", "type": "task", "task_id": "T3.3c",
      "ask_md": "Watchman remembers '26 BH 4471 E?'…",
      "grading": { "mode": "result_set", "ordered": false, "expected_hash": "sha256:…" },
      "uses_features": ["SELECT", "WHERE", "LIKE", "LIKE_UNDERSCORE"],
      "hints": [
        { "tier": 1, "rm_ref": { "unit_id": "e0bdc576-…", "heading": "Common Patterns" } },
        { "tier": 2, "skeleton": "SELECT * FROM gate_log WHERE vehicle_no LIKE '____';" },
        { "tier": 3, "solution_ref": "solutions/s03.json#T3.3c" }
      ],
      "traps": [],
      "on_pass": { "clue_id": "S3-C1" } },
    { "id": "S3.12", "type": "task", "task_id": "T3.8",
      "grading": { "mode": "result_set", "expected_hash": "sha256:…" },
      "traps": [
        { "id": "precedence", "rm_ref": { "unit_id": "efa7c57d-…", "heading": "Precedence" },
          "match": { "result_hash": "sha256:…" },
          "reply_md": "Careful. AND runs before OR…" }
      ] }
  ],
  "clues": ["S3-C1"],
  "exit": { "required_beats": ["S3.5", "S3.12"], "required_clues": ["S3-C1"] }
}
```

Validated with zod (client) and JSON Schema (pipeline).

### 4.2 Grading modes

Implemented in `pipeline/lib/grader.mjs` (one grader for pipeline tests and the app):

| Case | How |
|---|---|
| SELECT tasks | Run `setup` + learner SQL on a fresh snapshot copy; take the last result; normalise (`lib/result.mjs`: trim strings, non-integers to 6 dp, NULL kept); compare SHA-256 with `expected_hash` — rows as multiset unless `ordered: true`; column **count** matters, names don't |
| DDL / DML tasks | Same, but after the learner SQL the grader runs `grading.inspect` (e.g. `SELECT … FROM suspects`, `pragma_table_info(...)`, `sqlite_master`) and compares that result |
| Traps | On an error: first trap whose `error_regex` (and optional `sql_regex`) matches. On a wrong result: first trap whose `result_hash` matches (optionally after its own `inspect`). Traps with `sql_regex` are tried first |
| Activities | Compare the learner's answer with the key in the pack |

Verdicts: `pass` · `trap` (story reply) · `error` (SQLite message + friendly line) · `wrong`.

**Trap detection:** before saying "wrong", the grader hashes the learner's normalised result and checks it against `traps[].match.result_hash` (or `error_regex`). A match triggers the story reply instead of a generic retry.

**Feature guard:** a lightweight SQL tokenizer flags features outside `uses_features` + earlier sessions' features (e.g. a JOIN in Session 4). The guard only shows a nudge ("We'll learn JOIN later — try with WHERE"). It never blocks a correct answer.

### 4.3 Case DB snapshots

- `schema.sql` + `seed/*.sql` hold **all** tables. `build_case_db.py` writes one snapshot per session that contains only the tables unlocked by then (S3 has `hotel_guests`, `gate_log`, `vehicles`; S10 adds the normalised tables, etc.).
- Learner-created tables (e.g. `suspects` in S2, `person/booking…` in S9) are **re-seeded canonically** in later snapshots, so a learner's typo in S2 can't break S8.
- Each task runs on a **fresh copy** of the session snapshot plus any `setup_sql` the task declares (e.g. tasks after 2.3 start with the 5 suspects inserted). The console's "my workspace" state is kept separately for free play and can be reset at any time.
- Determinism: fixed timestamps, no `random()`; background noise rows (300 gate entries, 400 cab rides, 600 UPI payments, 5,000 pings) come from a fixed-seed generator; generated SQL is written to `seed/`. Two builds are byte-identical (checked).
- The S12 index demo's 1 lakh rows are generated in the browser by `runtime/index_demo.sql` (~0.45 s), keeping s12 at ~670 KB instead of ~7 MB. Measured in sql.js: 9 ms per search without an index vs 0.2 ms with one.
- `PRAGMA foreign_keys = ON` is set on every connection (matches RM #30 "enabled by default on our platform").

### 4.4a Session length budget

| Session | Est. | Session | Est. |
|---|---|---|---|
| S1 | ~24 min (built) | S8 | 35–45 min |
| S2 | ~55 min (built) | S9 | 45–55 min |
| S3 | ~36 min (built) | S10 | 35–45 min |
| S4 | 35–45 min | S11 | 45–55 min |
| S5 | 35–45 min | S12 | 45–55 min |
| S6 | 25–30 min | S13 | 30–40 min |
| S7 | 45–55 min | | |

Hard target: **≤ 60 min** per session at median learner speed, measured in the M4/M5 playtests. `build_sessions.mjs` sums per-beat time estimates and fails above 60.

### 4.4 Progress events (append-only)

```jsonc
{
  "event_id": "uuid",            // client-generated → idempotent sync
  "user_id": "game-uuid",
  "verb": "task_passed",         // session_started | beat_viewed | task_attempted | task_passed |
                                 // trap_hit | hint_used | clue_pinned | activity_done | session_completed
  "object": { "type": "task", "id": "T3.3c", "session": 3 },
  "course_ref": { "topic_id": "96f9…", "unit_id": "e0bd…", "learning_resource_id": "…" },
  "result": { "correct": true, "attempt": 2, "duration_ms": 41000, "hint_tier": 0, "sql": "SELECT …" },
  "client_ts": "2026-…"
}
```
`session_progress` / XP / badges are derived from events (pure functions, unit-tested).

### 4.5 Continue any time (changed 2026-10-05 — no time limit)

| Situation | Behaviour |
|---|---|
| Session started | `session_started` event; in-progress state (step, answers, pinned clues) saved on the device after every action |
| Learner leaves (closes tab, reloads, comes back days later) | Resumes at the same step (`session_resumed`) |
| Learner taps **↺ Reset progress** (session intro, ↺ Reset in the player, or the done screen; inline confirm) | `session_reset` event: everything of that session before it is ignored — saved place, points, clues, completion. Other sessions untouched. Parent page gets a `reset` message |
| Session completed | `session_completed` event; clues/rank saved permanently; saved state cleared |

Pilot: in-progress state stays on the device; only events sync. Moving in-progress state to the server (continue on another device) is a later option.

---

## 5. Content pipeline

| Step | Script | Checks (fail the build) |
|---|---|---|
| 1. Extract RMs | `extract_reading_materials.py` (done) | content verbatim vs source, then `curation.json` applied; fails if a curation heading or unit is missing |
| 2. Build case DB | `build_case_db.py` + `check_case_db.mjs` | schema loads; every snapshot opens in sql.js; all `checks.json` reference queries, traps (expected errors / different results) and clue rows pass |
| 3. Build sessions | `build_sessions.mjs` | (a) structure; (b) every `rm_ref` resolves to a real heading of a session RM; (c) **coverage**: every non-generic heading of every session RM is referenced; (d) reference queries run, are non-empty (unless `allow_empty`), match `expect_rows`; (e) traps trigger and differ from the answer; (f) clue wiring; (g) ≤ 60 min |
| 4. Grader replay | `test_grader.mjs` | every reference → pass, every trap → its own reply, wrong probes → not pass, lower-case keywords → pass (hashes are written by step 3) |
| 5. Feature audit | inside step 3 | reference queries use only features taught up to that session |

Runs in CI on every push.

---

## 6. Front-end

| Area | Components | Notes |
|---|---|---|
| Shell | Session map (13 stops on a 6 PM → 12 AM clock), story clock header | Responsive, desktop + mobile |
| Chat | Ira / suspect chat threads, notification toasts | Scenes are data-driven from `beats` |
| Case Notes | Markdown renderer for RM sections | Supports the RM components: `Section`, `MultiLineNote`, `SingleLineNote`, `MultiLineWarning`, `SingleLineQuickTip`, `IndexList`/`IndexItem`, `ImageInlineText`, `Checkpoint`, `details/summary`, images |
| SQL Console | CodeMirror 6 (SQL), schema sidebar (tables of current snapshot), Run / Reset / Hint, result grid | Errors shown verbatim + friendly line |
| Activities | Sort/match, order steps, pick-the-cell (instances), constraint validator | One generic component per activity type |
| ER Board | React Flow: entity, attribute, key, relationship, cardinality, single/double lines | Grades against a key graph |
| Evidence Board | Pinned clue cards with the query + result that produced them | Used in the finale |
| Hints | 3 tiers; tier 3 lazy-loads `solutions/sNN.json` | Hint use recorded |
| Progress | XP, ranks, badges, share card (rank + badges only) | Derived from events |

Tech: React + TypeScript + Vite, Zustand (state), zod (content schemas), sql.js in a Web Worker, Dexie (IndexedDB), Vitest, Playwright.

---

## 7. Platform layer (no LMS access yet)

| Port | Now | Pilot | Later |
|---|---|---|---|
| `AuthProvider` | `GuestAuth` — uuid on device | `PilotAuth` — invite code / OTP | `LmsAuth` — LMS SSO token |
| `ProgressStore` | `LocalProgressStore` — IndexedDB event log | `ApiProgressStore` — POST events, idempotent by `event_id` | `LmsProgressStore` — LMS APIs, map by `course_ref` |

Migration path: on first LMS login, replay the device/pilot event log to LMS (dedupe by `event_id`), then set `lms_user_id` on the game user. No UI changes.

---

## 8. Milestones

Assumed team: 2 front-end devs, 1 content/story writer, 1 designer (part-time), 1 backend dev (from M5). Estimates in weeks.

| # | Milestone | Key tasks | Deliverable / acceptance | Est. |
|---|---|---|---|---|
| M0 | Story bible & specs | Lock case truth + clue graph (SESSION_PLAN §0.4); character sheets; tone & safety guide; art direction | Signed-off story bible; no open story questions | 1 |
| M1 ✅ | Case DB | `schema.sql`; hand-authored key rows for every clue; seeded noise generator; `build_case_db.py`; snapshots s01–s13; `checks.json` + `check_case_db.mjs` | **Done 2026-10-04:** 115/115 checks pass on sql.js (SQLite 3.49) | 2 |
| M2 ✅ | Session packs S1–S3 + validator | `src/s01–s03.yaml`; `build_sessions.mjs` (coverage, feature audit, hashing); shared `lib/grader.mjs`; `test_grader.mjs` | **Done 2026-10-04:** 3 sessions, 25 tasks, 71/71 RM headings covered, 64/64 grader expectations | 1.5 |
| M3 ✅ | Engine core | SQL worker + snapshots; shared grader; trap detection; feature nudge; session runner; hints; evidence board; resume store; event log + LocalProgressStore + GuestAuth | **Done 2026-10-04:** 32 Vitest tests (S1–S3 played end to end) + 64 pipeline grader checks; real-Chrome smoke test passes (worker verdict ~16 ms) | 3 |
| M4 🟡 | **Vertical slice S1–S3** | Chat, Case Notes renderer, console, activities (sort/match/order/pick-cell), progress UI | **Build done 2026-10-05:** full S1–S3 playthrough passes in real Chrome (incl. trap, refresh restore, Evidence Board); 37 Vitest tests. **Open:** playtest with 15–20 learners + fix list | 2 |
| M5 🟡 | Sessions S4–S8 | Packs + any new activity types; pilot backend (Fastify + Postgres) + `ApiProgressStore` + `PilotAuth` | **Content done 2026-10-05** (S4–S8 built, standalone + iframe-tested). **Open:** pilot backend — not needed while progress is reported to the LMS via postMessage | 3 |
| M6 ✅ | Sessions S9–S12 | Case board as tap activities (match/sort — works on phones; no canvas needed); view/subquery tasks; ACID on the label log; index demo (`demo` beat) | **Done 2026-10-05:** S9–S12 built; 100% heading coverage of RM #23–#37 (curated) | 3 |
| M7 🟡 | Finale + polish | S13 case report; badges; share card; accessibility; performance | **Done:** S13 finale (5 proof queries + verdict); all 13 sessions pass the iframe smoke test. **Open:** share card, accessibility audit | 1.5 |
| M8 | MCQ / coding bank hookup (deferred) | Plug course MCQs into 🎙️ CHECK slots by `question_tags`; "Old Case Files" from coding questions | Separate decision — out of current scope | — |
| M9 | LMS integration | `LmsAuth`, `LmsProgressStore`, event replay, account merge | Progress visible in LMS per student | 2 |

Critical path: M0 → M1 → M2 → M3 → M4 (≈ 9.5 weeks to the vertical-slice playtest; ≈ 17 weeks to full game, excluding M8–M9).

---

## 9. Testing

| Layer | What | Tool |
|---|---|---|
| Pipeline | extract verbatim, schema load, reference queries, trap ≠ reference, coverage, feature audit | pytest (CI) |
| Grader | normalisation, multiset vs ordered, DML state diff, schema compare, error regex, trap hashing | Vitest |
| Session runner | beat progression, exit criteria, resume any time, start over | Vitest |
| Progress | event → XP/badge derivation, idempotent replay | Vitest |
| E2E | play each session with reference answers; play with one trap per session | Playwright |
| Content QA | story read-through for tone/safety; English simplicity check | Manual checklist per session |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Story requires a SQL feature an RM doesn't teach | Feature audit in CI; SESSION_PLAN already constrained (e.g. no SUBSTR/LENGTH, no CREATE INDEX/BEGIN/COMMIT) |
| Learner-created tables differ from expected | Canonical re-seed in later snapshots; per-task fresh copies |
| Float/ordering mismatches cause false "wrong" | Normaliser rules + `ordered` flag per task + grader test suite |
| RIGHT/FULL JOIN unsupported | Pin a sql.js build with SQLite ≥ 3.39; startup self-test |
| Client-side grading can be bypassed | Fine for learning; when LMS awards credit, add server re-check (sandboxed SQLite) |
| Sensitive theme (missing young woman) | Safety guide (PLAN.md §3), "missing" wording, no violence, fan cleared with respect message, review at M0 and M7 |
| Session too long | ≤ 60 min budget (§4.4a), time estimate shown before start, playtest timing in M4/M5, trim activities (not concepts) if over |
| Learner loses a long session after a break | Resume any time (§4.5) |

---

## 11. Decisions

Resolved (2026-10-04):
1. **Language:** English only; responsive web (desktop + mobile). No Hindi/Telugu, no low-end-phone/offline-first requirement.
2. **Sessions:** ~~one sitting each~~ → 2026-10-05: no time limit, resume any time (§4.5).
3. **Pilot hosting:** yes — Fastify + Postgres pilot backend in M5.
4. **Team:** as assumed in §8.

Still open (from PLAN.md §10): placement vs course units, art style, leaderboard.
