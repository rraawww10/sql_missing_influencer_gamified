# SQL: The Missing Influencer — Game-Based Learning Plan (v3)

Course: **Introduction to Databases** (source: `intro_to_databases.json`)
Status: Plan — awaiting sign-off before Phase 0.

---

## 1. Audience & design constraints

| Fact | Design response |
|---|---|
| Just finished 12th class (age ~17–18), SQL beginners | Story explains every concept in plain words before asking for SQL |
| Many from villages / small towns | Indian setting, Indian names, ₹, UPI, cabs, trains, phone towers — no Western culture references |
| English comfort varies | Simple English (short sentences); SQL keywords stay English |
| Mixed confidence | No real-time timer pressure, gentle failure, hints always available |

---

## 2. Course content summary (from JSON)

| Type | Count | Use in game |
|---|---|---|
| Reading material (markdown) | 70 docs, ~263K chars | **Case Notes** — concept explainers, hint tier 1 |
| MCQ | 4,333 | **Quick Checks** from the mentor + suspect questioning |
| SQL_CODING (`db_url` + `tests_url`) | 788 | **Old Case Files** (optional side practice) |
| FIB_SQL_CODING (`correct_query`) | 624 | Guided queries, hint tier 2 |
| REARRANGE | 20 | "Put the events in order" puzzles |
| Multi-correct MCQ | 6 | Deduction checks |

- SQLite dialect. Course grading = compare output table of learner query vs `correct_query`.
- 13 practice `.sqlite3` DBs are publicly reachable on S3 → reused for Old Case Files.
- Concept reading materials extracted to `content/reading_materials.json` (37 entries, course order, duplicates kept as separate entries): verbatim, then the course team's curation (`content/curation.json`, 2026-10-05) removes compliance-only sections from 7 materials. Any choice between duplicate versions lives in the game layer (`docs/SESSION_PLAN.md`), never in the extract.
- Notes: course code already uses `EXCEPT` (MINUS is only the concept name); RIGHT/FULL JOIN need SQLite ≥ 3.39; two topics share `order: 11`.

---

## 3. Story

### Premise
**Tara Sen**, 21, grew up in a small village near Chandpur and became famous by singing folk songs on reels. Tonight is her first big stadium concert in the city. **6 hours before the show, she goes missing from her hotel.** Her phone is switched off. 40,000 fans are on their way.

The player is a new intern at the **City Police Data Cell** (fictional). Mentor **SI Ira Menon** gives them one tool: the data. Every clue comes from a SQL query.

### Ticking clock
Each session = ~30 minutes of story time, **6:00 PM → 12:00 AM**. The countdown is *story time only* — no real timer, so beginners never feel rushed. (Optional "speedrun" mode later.)

### Characters (all fictional)
| Character | Role | In the story |
|---|---|---|
| **Tara Sen** | Missing singer | Smart, not helpless. Leaves hidden clues in the data (UPI note, smartwatch, last story song) |
| **SI Ira Menon** | Mentor | Gives briefings, Quick Checks, hints |
| **Mahi Sen** | Tara's younger sister | Receives Tara's coded ₹1 UPI clue |
| **Dev Arora** | Manager | Contract penalty if she misses the show — **culprit (draft)** |
| **Nysa Kapoor** | Rival singer | Gets the slot if Tara doesn't show — cleared by rehearsal records |
| **@tara_squad** (Ishita, 19) | Biggest fan page | Sends lots of DMs — red herring, cleared |
| **Sunny** | Cab driver | Last ride booking — cleared, becomes key witness |
| **Kunal Bajaj** | Event organiser | Files insurance claim early — suspicious, cleared |

### Draft culprit & motive
Dev (manager) wants Tara to miss the show. Her contract has a "missed show" clause that lets him move her to a new label that pays him a big bonus. He took her to a rented farmhouse on the city outskirts, switched off her phone, and **edited the contract record** in the label's system to hide the change. Tara still had her smartwatch and left clues. The player finds her at 11:40 PM; the show starts at 12:15 AM with her song.

Final culprit and full clue graph get locked in the Phase 0 story bible.

### Safety guardrails
- Story always says **"missing"** — no violence, threats, injury or fear scenes shown.
- Tara is an active hero who helps solve her own case.
- The fan who sends lots of DMs is cleared, and the story clearly says stalking/harassment is wrong.
- Motive is money/contract — nothing romantic or gender-based.
- The working-class suspect (cab driver) is cleared and becomes a helper — no stereotyping.
- All people, places, apps, brands and police units are fictional (real city/region names only as backdrop).
- Ending shows proper process: evidence → police action → safe rescue. No mob justice, no online shaming.
- Marketing uses "missing", not "kidnap".

---

## 4. Session ↔ concept map

Full beat-by-beat flow: **`docs/SESSION_PLAN.md`** (source of truth). Summary:

| # | Time | Course topic | Session | Core concepts (only what the reading materials teach) |
|---|---|---|---|---|
| 1 | 6:00 PM | Introduction to Database | **She's Gone** | Data, DB, DBMS + advantages, relational vs non-relational, relational / non-relational DBMS — no SQL |
| 2 | 6:30 PM | Introduction To SQL | **Build the Case File** | Data types, CREATE, PRAGMA, INSERT (4 mistakes), SELECT, UPDATE, DELETE, DROP, ALTER, ALTER vs UPDATE |
| 3 | 7:00 PM | Querying with SQL | **Hotel Gate Log** | Comparison operators, LIKE (`%`, `_`), AND/OR/NOT, precedence trap |
| 4 | 7:30 PM | Querying with SQL - 2 | **The Last Cab** | IN, BETWEEN (3 mistakes), ORDER BY, DISTINCT, LIMIT/OFFSET (2 mistakes) |
| 5 | 8:00 PM | Aggregations and Group By | **Follow the Money** | COUNT/SUM/MIN/MAX/AVG, COUNT variants, special cases, alias, GROUP BY |
| 6 | 8:30 PM | Group By with Having | **Phone Towers** | HAVING, WHERE vs HAVING |
| 7 | 9:00 PM | SQL Expressions and Functions | **Smartwatch Secrets** | Arithmetic operators, `\|\|`, strftime, CAST, FLOOR/CEIL/ROUND, UPPER/LOWER |
| 8 | 9:30 PM | SQL Case Clause and Set Operations | **Clear the Innocent** | CASE, CASE with aggregates, INTERSECT/EXCEPT/UNION/UNION ALL, set-operation rules, ORDER BY / pagination in set operations |
| 9 | 10:00 PM | Modelling Databases | **The Case Board** | ER model (entities, attributes, keys, relationships, cardinality), entity → table, relationships → FK / junction table, PK/FK, 1:1/1:N/M:N queries |
| 10 | 10:30 PM | Joins | **Connect the Dots** | NATURAL, INNER, LEFT JOIN |
| 11 | 11:00 PM | Querying with Joins | **The Toll Plaza** | Multi-table joins, joins + clauses/aggregations, RIGHT, FULL, CROSS, SELF JOIN |
| 12 | 11:30 PM | Views and Subqueries | **The Edited Contract** | Views, subqueries; transactions + ACID applied to the label system's log; index demo |
| 13 | 12:00 AM | SQL Course Quiz | **Showtime** | Case report: every claim backed by a query; rescue + concert |

**Red-herring rule:** each wrong lead appears only if the player makes a mistake listed in the reading materials ("Possible Mistakes" sections and notes). Fixing the query clears that lead.

**Session rule:** each session takes ≤ 60 min; learners can stop any time and continue later (no time limit). See §6.

---

## 5. Two separate databases

| | **A. Case DB (story data)** | **B. Platform DB (users & progress)** |
|---|---|---|
| What | Fictional hotel, cab, UPI, tower, toll data the learner queries | Learners, progress, attempts, XP |
| Where | In the browser — SQLite via sql.js (WASM) | Interim: our own store → later LMS DB |
| Server needed | No — ships as a static `.sqlite` seed file | Yes, eventually |
| Learner SQL runs here | Yes, sandboxed per learner, reset anytime | **Never** |

Learner SQL runs only in the browser sandbox → no SQL-injection risk to any real database.

### Case DB schema
Per-session tables are listed in `docs/SESSION_PLAN.md`; build details (schema, seeds, per-session snapshots) in `docs/IMPLEMENTATION_PLAN.md` §4.3. Deterministic data → stable grading. All names, numbers, UPI IDs and vehicle numbers fictional.

---

## 6. Game mechanics

- **Phone-style UI:** WhatsApp-like chat with SI Ira and suspects, notification-style story beats, countdown clock at top.
- **SQL console:** CodeMirror editor, tap-to-insert table/column names (easier on phones than typing), results shown as cards.
- **Evidence Board:** pin a correct query result as evidence. The finale uses pinned evidence.
- **Quick Checks:** MCQs from the course bank asked by Ira ("Before we go, tell me…"). Wrong answer → short explanation + retry. No lives lost.
- **Questioning suspects:** MCQ in chat. Wrong answer → suspect avoids the question, try again.
- **Hints (cost points, never locked):** 1) Case Note snippet from reading material, 2) fill-in-the-blank query, 3) full solution.
- **Progress:** points, daily streak, ranks **Intern → Constable → Sub-Inspector → Inspector**, badges ("No-Hint Session", "Trap Spotter", "Speed Solver").
- **Old Case Files:** optional practice using the 788 existing coding questions + 13 course DBs, each with a one-line story wrapper.
- **Language:** English only (simple English, short sentences).
- **Stop and continue any time:** an unfinished session is saved on the device and resumes at the same step, with no time limit.
- **Reset progress at every stage:** each session has **↺ Reset progress** (intro, during play, and on the done screen, with a confirmation). It clears that session's saved place, points and clues; other sessions are untouched.
- **Look:** each session has its own illustrated night-sky banner and accent colour (6 PM dusk → midnight stage lights), with motifs that hint at the stage without revealing answers (`app/src/ui/theme.ts`, `app/src/ui/art/SceneArt.tsx`).
- **Shareable card:** rank + badges only, no personal data.

---

## 7. Platform architecture (no LMS access yet)

Goal: build now without LMS auth or user DB. Later the move to the LMS is an adapter swap, not a rewrite.

### 7.1 Ports & adapters
```
AuthProvider            ProgressStore
 ├─ GuestAuth   (now)    ├─ LocalProgressStore  (now: IndexedDB)
 ├─ PilotAuth   (pilot)  ├─ ApiProgressStore    (pilot: our small backend)
 └─ LmsAuth     (later)  └─ LmsProgressStore    (later: LMS APIs/DB)
```
- Game UI only talks to these interfaces.
- **GuestAuth:** anonymous ID on the device — for development and demos.
- **PilotAuth:** simple sign-in for the pilot cohort (invite code or phone OTP) — pilot backend is confirmed.
- **LmsAuth:** LMS SSO token when available.

### 7.2 Migration-ready design
- Every task / MCQ stores the **original course IDs** (`topic_id`, `unit_id`, `question_id`) → progress maps 1:1 to LMS units.
- `game_user_id` with nullable `lms_user_id`; guest/pilot progress merges into the LMS account on first LMS login.
- Progress stored as an **append-only event log** (actor, verb, object, result, time) with client-generated UUIDs → migration = replay events; duplicates are harmless.
- Events queue on the device if the connection drops and sync when it returns.

### 7.3 Interim platform schema (Postgres for pilot; same shape in IndexedDB locally)
```sql
users            (id uuid pk, display_name, auth_provider, lms_user_id null unique, created_at)
progress_events  (event_id uuid pk, user_id fk, verb, object_type, object_id,
                  course_ref_id,  -- topic/unit/question id from course JSON
                  result jsonb, client_ts, server_ts)
session_progress (user_id, session_id, status, points, hints_used, started_at, completed_at)  -- cache
task_attempts    (id, user_id, task_id, course_question_id, submitted_sql, is_correct,
                  attempt_no, duration_ms, created_at)
mcq_responses    (id, user_id, course_question_id, option_ids, is_correct, created_at)
badges           (user_id, badge_id, awarded_at)
```
The event log is the source of truth. `session_progress` is derived from it.

### 7.4 Grading integrity
- MVP: client-side grading — compare result sets of the reference query and the learner query in sql.js.
- Bundle ships **hashes of expected results**, not reference queries; tier-3 hint fetches the solution separately.
- Later, if the LMS gives credit: re-check on the server in a sandboxed SQLite worker.

---

## 8. Tech stack

| Layer | Pick |
|---|---|
| Frontend | React + TypeScript + Vite, responsive (desktop + mobile) |
| Case DB | sql.js (SQLite ≥ 3.39 build) in a Web Worker |
| Editor | CodeMirror 6 (SQL mode) + tap-to-insert keyword bar |
| ER board | React Flow |
| Local storage | IndexedDB (Dexie) |
| Pilot backend | Node (Fastify) + Postgres — confirmed; from Phase 3 |
| Content pipeline | Python: verbatim extract → session packs (game layer), case DB snapshots, validate every reference query + coverage |
| Tests | Vitest (grader, adapters), pytest (pipeline), Playwright (desktop + mobile viewport smoke) |

Repo layout: see `docs/IMPLEMENTATION_PLAN.md` §3.

---

## 9. Roadmap

| Phase | Scope | Platform DB state |
|---|---|---|
| 0 | Story bible, final culprit + clue graph, session specs, tone + safety guide | — |
| 1 | Content pipeline, case DB seed, all reference queries validated | — |
| 2 | Engine (console, grader, session runner, evidence board, hints) + **vertical slice S1–3** | GuestAuth + LocalProgressStore |
| 3 | Sessions 4–8 + pilot backend + playtest with ~50 learners (incl. rural / small-town learners) | PilotAuth + ApiProgressStore |
| 4 | Ch9 ER board, Ch10–12, finale | same |
| 5 | Old Case Files, badges, analytics, polish | same |
| 6 | **LMS integration:** LmsAuth, LmsProgressStore, migrate events, merge guest accounts | LMS DB |

Gate: playtest the vertical slice before building sessions 4–13. Detailed milestones: `docs/IMPLEMENTATION_PLAN.md` §8.

---

## 9b. Delivery

Each session ships as its own static site (`deploy/s01 … s13`) embedded in the LMS with an iframe; see `deploy/README.md`. Sessions are independent (each opens with "The case so far") but share one story, one night and one Evidence Board.

## 10. Decisions

Resolved (2026-10-04):
- **Language:** English only.
- **Sessions:** ~~one sitting each~~ → changed 2026-10-05: no time limit; continue any time; ↺ Reset progress per session.
- **Pilot hosting:** yes — small Postgres + API for the pilot.
- **Team:** 2 front-end devs, 1 content/story writer, 1 part-time designer, 1 backend dev from the pilot milestone.

Open:
1. **Placement:** replace course units, or sit alongside the course as a companion?
2. **Art style:** illustrated static scenes recommended for the playtest (cheaper, quick to change). The M4 build uses chat avatars and story cards; scene beats can take an illustration later.
3. **Mode:** single-player only for v1, or a leaderboard too?
