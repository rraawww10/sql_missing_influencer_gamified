# HANDOVER — SQL: The Missing Influencer

**Written:** 2026-10-26 (updated the same day, after the fix pass) · **Repo:** `D:\missing_influencer\sql-missing-influencer` · **Branch:** `main` @ `054c890`
**Purpose:** give a fresh session (human or Claude Code) everything needed to carry on without re-deriving the project.

> Read this file first, then jump to the docs it points at. **§7 is what the last session did; §9 is the current work queue.**
> Every bug the previous audit found is fixed and verified — the tree is green but **not yet committed** (§7.3).

---

## 1. What this project is, in one paragraph

A **story-driven SQL game** that teaches the NxtWave *Introduction to Databases* course. The learner is a new intern at the
fictional City Police Data Cell. Singer **Tara Sen** has vanished six hours before her first stadium concert; the only witness
is data. The night runs **6:00 PM → 12:00 AM** across **13 episodes**, one per course topic. Every clue in the case is the
result of a SQL query the learner writes themselves. Everything runs in the browser — SQLite compiled to WebAssembly
(`sql.js`) in a Web Worker — so there is **no server and no database to host**. The game ships as a folder of static sites,
one per episode, each embedded in the LMS in an `<iframe>`.

Audience: learners who just finished 12th class, many from small towns, SQL beginners. Design consequences (Indian setting,
₹/UPI/cabs/phone towers, simple English, no real timer, hints never locked) are in `PLAN.md` §1 and §3.

---

## 2. Repo map

| Path | What it is | Edit? |
|---|---|---|
| `PLAN.md` | Original concept: audience, story, safety rules, architecture, roadmap | reference |
| `docs/SESSION_PLAN.md` | **The design bible** (65 KB). §0.4 *case truth*, §0.5 *evidence-chain rule*, then a beat-by-beat spec for every episode, Appendix A (RM coverage map), Appendix B (trap catalogue) | keep in sync with the YAML |
| `docs/IMPLEMENTATION_PLAN.md` | Build details: repo layout, case-DB construction, milestones | reference |
| `docs/screenshots/after/` | Screenshots of every screen | reference |
| `content/sessions/src/sNN.yaml` | **The 13 episodes — the one thing you normally edit.** Story beats, Case Notes, activities, SQL tasks + reference SQL, hints, traps, clues | ✅ **source** |
| `content/story/cast.json` | Every character, place, number plate — referenced as `{{placeholders}}` from the YAML | ✅ source |
| `content/reading_materials.json` | Verbatim extract of the 37 course reading materials | ❌ never hand-edit |
| `content/curation.json` | The course team's cuts applied to that extract (2026-10-05) | ❌ |
| `content/case_db/` | The fictional case database: `schema.sql`, 28 seed files, 13 per-episode `.sqlite` snapshots | edit `pipeline/build_case_db.py`, then rebuild |
| `content/sessions/sNN.json` · `solutions/` · `coverage.json` · `content/units/` | **Generated** packs the game loads | ❌ generated |
| `pipeline/` | `build_sessions.mjs` (validate + build packs), `audit_clues.py` (evidence-chain check), `test_grader.mjs`, `build_case_db.py`, `check_case_db.mjs` | ✅ |
| `app/` | The game. React 18 + TypeScript + Vite. `src/ui` screens/components, `src/engine` (SQL worker, session runner, progress), `src/adapters` (auth/progress ports), `scripts/` (builds, smoke tests) | ✅ |
| `shared/` | Grader, result hashing, SQL feature map — used by **both** the pipeline and the app, so grading is identical | ✅ |
| `missing-influencer-v3/` | **The built upload folder** (briefing + 13 episodes, ~7.5 MB) | ❌ generated — rebuild, don't edit |

### Authored → generated flow

```
content/sessions/src/sNN.yaml   (+ cast.json, reading_materials.json, case_db snapshots)
          │  node pipeline/build_sessions.mjs      ← validates hard, see §4
          ▼
content/sessions/sNN.json       public pack: beats, expected-result HASHES (no answers)
content/sessions/solutions/sNN.json   reference + trap SQL (fetched only for hint tier 3)
content/units/uNN.json          same session re-sliced, one pack per reading material
          │  cd app && npm run build:s3
          ▼
missing-influencer-v3/          assets/ + content/ once, then intro/ and s01/…s13/index.html
```

---

## 3. How the game works

### 3.1 Screens and routes

Two shells share all the screens:

* `src/ui/App.tsx` — **dev / internal** shell. Hash routes: `#/` case map · `#/intro` briefing · `#/s/3` episode intro ·
  `#/play/3` playing · `#/done/3` solved · `#/evidence` Evidence Board · `#/dev` engine harness.
* `src/ui/SessionApp.tsx` — **the shipped shell**. One episode per static site, no case map and no links to other
  episodes (the embedding page decides what comes next). Routes: `#/` intro · `#/play` · `#/done` · `#/evidence`.
  `BriefingApp` is the standalone briefing site (`intro/index.html`).

Which one a page boots is decided by `<meta name="tmi-session">` / `<meta name="tmi-intro">` in the generated `index.html`,
read by `src/main.tsx`.

### 3.2 Inside an episode (`src/ui/screens/Player.tsx`)

An episode is a **flat list of beats**, played one at a time:

| Beat type | Icon | What the learner does | Done when |
|---|---|---|---|
| `scene` | 💬 | Reads a chat line / notification (previous line stays dimmed above; people "type…" first) | they move past it |
| `hook` | 🎬 | "Coming up next" teaser | they move past it |
| `note` | 📖 | A **Case Note** — one course idea in the words of the case, with a sheet holding the verbatim course section | they move past it |
| `activity` | 🧩 | `sort_into` / `match` / `order` / `pick_cell` / `multi_select` | answered right, or revealed after 3 wrong tries |
| `task` | 💻 | Writes SQL in a CodeMirror console against the real case DB | the query passes the grader |
| `check` | ❓ | One MCQ from the mentor | answered (right or wrong — the explanation is the lesson) |
| `clue` | 🔎 | Pins a piece of evidence to the Evidence Board | pinned (needs its `requires_task` passed) |
| `demo` | ⚡ | Runs a timed script (the S12 index demo) | run once |

The chrome around it: a **HUD** (episode name, story clock, Tables drawer, 📌 evidence counter, ↺ Reset), a **stories-style
progress bar** (one segment per beat — finished segments reopen read-only), and a **floating dock** at the bottom with
`← Back` · a status line · `Continue →`. Arrow keys work too. Finished steps can be revisited in **review mode** (banner at
the top, nothing is graded, a solved SQL task becomes a free practice console).

### 3.3 The SQL engine and grading

`src/engine/sql/` — `worker.ts` runs `sql.js` in a Web Worker; `client.ts` is the main-thread proxy; `engine.ts` grades.
Per attempt the engine loads a **fresh copy of the episode snapshot**, applies the task's `setup`, runs the learner's SQL,
and compares the result with the expected one.

* Comparison is **by value**: column names don't matter, column count and row order do (unless `grading.ordered: false`).
  Same rule as the course — never stricter.
* The pack ships **hashes** of expected results, not the reference SQL. Tier-3 hints fetch `solutions/sNN.json` separately.
* For DDL/DML tasks, `grading.inspect` is a query run after the learner's SQL; its result is what gets compared.
* **Traps**: authored wrong-but-plausible queries taken from the reading materials' "Possible Mistakes" sections. Hitting one
  gives a story reply instead of a flat "wrong".
* **Feature audit** (`shared/sql_features.mjs`): the build fails if reference SQL uses SQL taught in a *later* episode, and at
  runtime the learner gets a gentle "that comes later in the course" note.

Learner SQL **never** touches a real database — only the in-browser sandbox. No injection surface.

### 3.4 Hints and points

Three tiers, never locked, each costs points (`src/engine/progress/derive.ts`):
1. the Case Note section from the course reading material, 2. a fill-in-the-blank skeleton, 3. the full answer typed into
the editor (behind a confirm).

`POINTS`: task passed 10 · first-try bonus 3 · hint penalty 2/4/7 (floor 3) · activity first try 3, later 1 · check 2 ·
clue pinned 2. **Ranks** by sessions completed: Intern → Constable (4) → Sub-Inspector (8) → Inspector (13).

### 3.5 Progress, saving, and "per session"

This is the part people usually ask about, so in detail:

* **Everything the learner sees is derived from an append-only event log** (`deriveProgress` in
  `src/engine/progress/derive.ts`). Verbs: `session_started`, `beat_viewed`, `task_attempted`, `task_passed`, `trap_hit`,
  `hint_used`, `activity_done`, `check_answered`, `clue_pinned`, `session_completed`, `session_resumed`,
  `session_abandoned`, `session_reset`. Each event carries `course_ref: { topic_id, unit_id, learning_resource_id }` — the
  **original course IDs** — so progress maps 1:1 onto LMS units later (`PLAN.md` §7.2).
* The log lives in **IndexedDB** (`LocalProgressStore`, Dexie, keyed by `event_id` so replays are idempotent).
* The **unfinished attempt** ("sitting") is separate: `SittingStore` in `localStorage`, key
  `tmi.sitting.v1.<userId>.s<N>`. This is what makes "stop any time, continue later" work, with no time limit.
* **Who the learner is**: `UrlAuth` reads `?user_id=…` off the iframe URL (`id = "lms:<that>"`); without it, `GuestAuth`
  mints one anonymous id per device. The id is never sent anywhere — it only keys local storage and is echoed back inside
  progress events so the platform can match them.
* **How 13 separate static sites share one case**: they are uploaded under **one host and one path prefix**, so they share
  one browser origin → one IndexedDB and one `localStorage`. Give every episode the same `?user_id=` and the Evidence Board
  in episode 7 shows the clues pinned in episodes 1–6.
* **And when storage is empty** (another device, cleared cache): each pack also carries a static `previously` list — the
  clues from earlier episodes — shown as *briefed* rather than *earned*, on the episode intro and in the Evidence sheet.
  So an episode always opens with "the case so far" and can be played cold.
* **Iframe bridge** (`src/ui/embed.ts`): the game posts `ready`, `progress` (every event), `completed`, `resize` to
  `window.parent`; the parent may post back `{ source: 'tmi-host', type: 'restore', events: […] }` to replay a saved log.
  `?parent_origin=https://lms.example.com` restricts both directions.
* **Reset** is per episode, available at every stage (intro, during play, done screen), behind a confirm. It clears that
  episode's sitting, points and clues; other episodes are untouched.

### 3.6 Units — the second way to slice the same content

The course configures **each reading material as its own unit**, so every session is also cut into contiguous slices
(`units:` block at the end of each YAML) → `content/units/u01…u38.json`, numbered by reading-material order, finale = 38.
A unit can add an `opener` ("Previously…") and a `closer` so it reads on its own. `deriveProgress` treats a session as
completed either when a whole-session sitting finished it **or** when every one of its unit parts is completed.
**Unit sites are not currently shipped** (decision 2026-10-19); `npm run build:s3 -- --units` adds them back.

---

## 4. Content rules that the build enforces

`node pipeline/build_sessions.mjs` **fails** if any of these is violated — this is the project's real safety net:

* an `rm_ref` heading doesn't exist in that reading material;
* a non-generic heading of the session's reading material is never referenced (coverage);
* reference SQL errors, returns no rows, or returns a different row count than `expect_rows`;
* reference SQL uses a SQL feature taught in a **later** episode;
* a trap gives the same result as the answer, or doesn't trigger;
* a clue isn't wired to a task;
* the episode is over **60 minutes**;
* an unknown `{{placeholder}}` is used.

Plus the **evidence-chain rule** (`docs/SESSION_PLAN.md` §0.5), checked by `python pipeline/audit_clues.py`: a clue is never
narrated. Every clue is the 4th beat of **Lead (scene names the source + the open question) → Task (its result shows every
fact the clue will state) → Read-it (`pick_cell` on the learner's own result, or a check) → Clue card** (starts "Your
query…", states only what was shown, cites earlier clues by id).

Other hard rules: **teach only what the reading materials contain** · grading follows SQLite, never stricter than the course ·
**episode names, never numbers** (learners see "Hotel Gate Log · 7:00 PM", never "Session 3" — `app/src/ui/episodes.ts`) ·
names/places/plates only via `cast.json` placeholders · safety (Tara is *missing*, never hurt; no violence; fans respected;
everything fictional — `PLAN.md` §3) · simple English.

---

## 5. Episode ↔ course map

| # | Clock | Course topic | Episode | Teaches |
|---|---|---|---|---|
| 1 | 6:00 PM | Introduction to Database | **She's Gone** | Data, DB, DBMS + advantages, relational vs non-relational — **no SQL** |
| 2 | 6:30 PM | Introduction To SQL | **Build the Case File** | Data types, CREATE, PRAGMA, INSERT, SELECT, UPDATE, DELETE, DROP, ALTER |
| 3 | 7:00 PM | Querying with SQL | **Hotel Gate Log** | Comparison operators, LIKE, AND/OR/NOT, precedence trap |
| 4 | 7:30 PM | Querying with SQL - 2 | **The Last Cab** | IN, BETWEEN, ORDER BY, DISTINCT, LIMIT/OFFSET |
| 5 | 8:00 PM | Aggregations and Group By | **Follow the Money** | COUNT/SUM/MIN/MAX/AVG, aliases, GROUP BY |
| 6 | 8:30 PM | Group By with Having | **Phone Towers** | HAVING, WHERE vs HAVING |
| 7 | 9:00 PM | SQL Expressions and Functions | **Smartwatch Secrets** | Arithmetic, `\|\|`, strftime, CAST, FLOOR/CEIL/ROUND, UPPER/LOWER |
| 8 | 9:30 PM | Case Clause and Set Operations | **Clear the Innocent** | CASE, INTERSECT/EXCEPT/UNION/UNION ALL |
| 9 | 10:00 PM | Modelling Databases | **The Case Board** | ER model, entity→table, PK/FK, 1:1 / 1:N / M:N |
| 10 | 10:30 PM | Joins | **Connect the Dots** | NATURAL, INNER, LEFT JOIN |
| 11 | 11:00 PM | Querying with Joins | **The Toll Plaza** | Multi-table joins, RIGHT/FULL/CROSS/SELF JOIN |
| 12 | 11:30 PM | Views and Subqueries | **The Edited Contract** | Views, subqueries, transactions + ACID, index demo |
| 13 | 12:00 AM | SQL Course Quiz | **Showtime** | Case report: every claim backed by a query; rescue + concert |

Built sizes today (from `missing-influencer-v3/sessions.json`): 24, 56, 37, 34, 40, 18, 47, 36, 46, 23, 36, 53, 21 minutes.
Episode 2 (56 min) and 12 (53 min) are close to the 60-minute ceiling.

**Case truth** (what actually happened, and which table proves each step) is `docs/SESSION_PLAN.md` §0.4. Short version:
the manager **Dev Arora** profits from a "missed show" clause, takes Tara to a rented farmhouse (*Green Acres*), switches
her phone off, and edits the contract record. Tara keeps her **smartwatch** and leaves clues (a ₹1 UPI note `gReEn aCrEs`
to her sister, tower pings). Red herrings — rival singer, fan page, cab driver, event organiser — are all cleared **by data**.

---

## 6. Commands (verified on this machine, 2026-10-26, after the fixes in §7)

Requirements: Node 18+ (22 recommended; **v24.7.0 here**), Python 3 (case DB + the clue audit; **3.14.2 here**), npm 11.5.1.

```bash
# one-time
cd pipeline && npm install && cd ..
cd app && npm install && cd ..

# content
node pipeline/build_sessions.mjs            # all, or --only 3          ✅ (1 benign warning, below)
python pipeline/audit_clues.py              # evidence-chain audit      ✅ runs on Windows now (was BUG-6)
node pipeline/test_grader.mjs               # ✅ 239/239 grader expectations met
node pipeline/check_case_db.mjs             # ✅ 115/115 checks passed
python pipeline/build_case_db.py            # only if the story's data changes

# app
cd app
npm run dev                                 # http://localhost:5173
npm test                                    # ✅ 113 tests / 12 files (~17 s)
npm run typecheck                           # ✅ clean
npm run build:s3                            # rewrites ../missing-influencer-v3  (the name is now ONE const)
npm run build:s3 -- <path>                  # build somewhere else (useful for comparing)
npm run build && npm run smoke              # ✅ real Chrome plays episodes 1–3, incl. Ctrl+Enter + autocomplete
npm run build && npm run hit-test           # ✅ layout guard, see below
DEPLOY_DIR=missing-influencer-v3 node scripts/smoke-deploy.mjs sessions   # ✅ all 13 episodes in an iframe
```

**`npm run hit-test` is new** (`app/scripts/hit-test.mjs`). At 3 viewport sizes (390×780, 1280×620, 1600×900) and 5
scroll positions per step, it walks a whole episode and asserts that `document.elementFromPoint()` at the centre of
every visible interactive element returns that element. 375 scans per run. This is the guard the previous handover
asked for, and it was validated the only way that counts: re-injecting the old dock CSS at runtime makes it fail with
*"💡 Hints is covered by `<div.dock>`"*, while the shipped build passes.

`DEPLOY_DIR` resolves against the **repo root**, not `app/`. It used to pass silently when the folder did not exist
(`DEPLOY_DIR=../missing-influencer-v3` resolves outside the repo); it now fails loudly instead.

**To look at the built game locally**, serve it over HTTP — opening `index.html` from the file system gives a blank page
(ES-module + `crossorigin` scripts are blocked on `file://`):

```bash
python -m http.server 8731 --directory missing-influencer-v3
# then http://127.0.0.1:8731/intro/index.html  or  /s03/index.html
```

Known build warning (harmless): `Player.tsx is dynamically imported … but also statically imported by ResetControl.tsx`,
so the lazy split for the Player doesn't actually happen.
Known pipeline warning (harmless): `S7 unit u19 (RM #19): heading "Expressions in HAVING Clause" is only covered elsewhere
in the session`.

---

## 7. Session of 2026-10-26 (second half) — every open bug fixed

The first half of the day **found and documented** BUG-1…BUG-9. This session **fixed all nine**, added regression guards
so they cannot come back silently, and rebuilt the upload folder. Everything below was re-verified in a real browser.

### 7.1 What changed, file by file

| Bug | Fix | Files |
|---|---|---|
| **BUG-1** dock swallows clicks | The dock is now a **real flex row** at the bottom of `.stage`: it reserves its own height and can never overlap content. It keeps the floating-pill look **only** on full-bleed `scene`/`hook` beats (`.dock.floating`), where nothing sits underneath it. The `110px` bottom padding that was tuned to the old overlay is gone. | `app/src/ui/styles.css` (`.dock`, `.dock.floating`, `.stage-content`), `app/src/ui/screens/Player.tsx:166` |
| **BUG-1b** (found while fixing BUG-1) | On a phone, one long unwrapped SQL line in a Case Note widened the **whole stage** past the viewport (`.stage` measured 548 px in a 390 px window), carrying the dock off-screen — `Continue →` was literally outside the window and unclickable. `.stage` and `.stage-scroll` now carry `min-width: 0`, `.stage-scroll` may scroll horizontally, and at ≤640 px code blocks wrap instead of overflowing. | `app/src/ui/styles.css` |
| **BUG-2** dead "I'm ready →" | Both buttons are now one `readyButton()`. **Inside an iframe** nothing changes (post `completed`, let the host advance). **Opened directly** they become a link to `../s01/index.html` that carries the query string, so `?user_id=` survives. New `isEmbedded()` helper. | `app/src/ui/embed.ts`, `app/src/ui/screens/Briefing.tsx`, `a.btn` rules in `styles.css` |
| **BUG-3** Ctrl+Enter | The run binding is wrapped in `Prec.highest(…)` and listed **before** `basicSetup`, so it outranks CodeMirror's `defaultKeymap` (`insertBlankLine`). | `app/src/ui/components/SqlEditor.tsx` |
| **BUG-4** autocomplete | The SQL language extension now lives in a **`Compartment`**. When the schema arrives — and again after a run that creates a table — the editor is **reconfigured**, not remounted, so typed SQL survives. The reconfigure is keyed on a schema signature, so it fires only on a real change. | `app/src/ui/components/SqlEditor.tsx` |
| **BUG-5** v2/v3 name | Renamed through `README.md`, `app/README.md`, `scripts/build-s3.mjs`, `scripts/smoke-deploy.mjs`; the folder name is now a single `UPLOAD_DIR` const in `build-s3.mjs`. | 4 files |
| **BUG-6** audit crashes on Windows | Two halves. stdout/stderr are reconfigured to UTF-8, **and** the pack JSONs are opened with `encoding='utf-8'`. The second half was not in the original report: with only the print fix the script died in `json.load` on `content/sessions/s02.json`, and before that it was silently mojibaking (`—` → `â€"`). Same stdout fix applied to `extract_reading_materials.py`. | `pipeline/audit_clues.py`, `pipeline/extract_reading_materials.py` |
| **BUG-7** CRLF churn | `.gitattributes` added (`* text=auto eol=lf` plus binary types) and `git add --renormalize .` run once. The 60+ generated JSON files no longer show as modified; `content/sessions/s12.json`, `content/units/u34.json` and `u37.json` each lost the one genuine `\r\n` line that came from `index_demo.sql`. | `.gitattributes` |
| **BUG-8** SortInto take-back | A placed pill intercepts the click **only when nothing is picked** ("take this one back"). With an item picked, the click deliberately falls through to the bucket, because the whole box — pills included — means "drop it here". That second half matters: a naive `stopPropagation()` fixes the report but breaks dropping onto a bucket that already holds items, and **it broke the smoke test** on episode 1's sort activity. | `app/src/ui/activities/SortInto.tsx`, new case in `app/src/ui/ui.test.tsx` |
| **BUG-9** "~24 minutes" | Now reads `24` above `minutes, about` — no leading tilde to misread as a minus sign. | `app/src/ui/screens/SessionIntro.tsx` |

### 7.2 New regression guards

1. **`app/scripts/hit-test.mjs`** (`npm run hit-test`) — the layout guard described in §6. Catches the whole BUG-1 class,
   which is invisible to vitest because jsdom has no layout engine.
2. **`npm run smoke`** now also proves in real Chrome that **Ctrl+Enter runs the query** and that **autocomplete offers
   the table `gate_log`** (hooked on task T3.1) — BUG-3 and BUG-4.
3. **`smoke-deploy.mjs`** now opens `intro/index.html` **directly**, outside any iframe, and asserts that the button
   lands on `s01/index.html` — BUG-2, checked against the artifact we actually ship.
4. **`ui.test.tsx`** gained a SortInto case covering both directions of BUG-8 (113 tests now, was 112).
5. `smoke-deploy.mjs` fails loudly when `DEPLOY_DIR` points nowhere, instead of "passing" with zero sessions played.

### 7.3 State of the tree right now

* `missing-influencer-v3/` **has been rebuilt** from the fixed source (`npm run build:s3`, 7 530 KB) and all 13 episodes
  were played inside an iframe against it.
* The changes are **staged but not committed** (`git add --renormalize .` had to stage, to clear the CRLF churn).
  `git status` should show ~22 real files: the app fixes, the two pipeline scripts, the READMEs, `.gitattributes`,
  the three normalised JSONs, plus `missing-influencer-v3/` and `docs/HANDOVER.md`.
  Nothing has been pushed. **Commit message is up to you** — the work is one coherent change: *"fix the nine UI/packaging
  bugs from the audit, add a layout regression guard, rebuild the upload folder"*.

### 7.4 The original bug reports

Kept below as the record of what was wrong and why, in case a fix has to be revisited.
**All nine are fixed — this is history, not a work queue.**


### BUG-1 🔴 The floating dock swallows clicks on the content underneath it — "the clicks don't work"

> ✅ **Fixed** on 2026-10-26 — see §7.1 for what the fix was and which files changed.

**This is the headline bug.** It is the one you notice first and it looks like the whole game is dead.

**What happens.** The bottom dock (`← Back` · status · `Continue →`) is an **overlay** drawn on top of the scrolling stage,
not a bar that reserves its own space:

```css
/* app/src/ui/styles.css:294 */
.dock { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
        width: min(760px, calc(100% - 24px)); z-index: 6; … }
```

The only protection is `padding-bottom: 110px` on `.stage-content` (`styles.css:284`). That reserves space **at the very
bottom of the scrolled content** — so it helps only when the learner is scrolled all the way down. At **every other scroll
position**, whatever happens to sit in the bottom ~82 px band of the viewport is under the dock and unclickable. The dock's
`Continue →` is usually **disabled** while a task is unsolved, and a disabled button still eats the click, so the result is
not "the wrong thing happened" — it is **nothing happens at all**.

**Reproduced (phone width, 420 × 800 → viewport 502 × 651), episode 3, step 3 (task T3.1):** scroll the stage near the
bottom; the whole console action row — **`Run ▶`, `↺ Reset DB`, `Clear editor`, `💡 Hints`** — lands under the dock.
`document.elementFromPoint()` at the centre of `Run ▶` returns the dock's **`← Back`** button. A real click there **went
back a step** instead of running the query.

**Reproduced (laptop, 1280 × 720 → viewport 1267 × 571), same task:** at `stage-scroll.scrollTop ≈ 415` the tap-to-insert
column chips in the Case Database drawer (`entry_id`, `gate`, `vehicle_colour`, `person_name`) are covered by the dock's
`Continue →`. Tapping them does nothing. These chips are the *only* tap-to-insert affordance in the game (PLAN §6 calls it
out as the phone-friendly way to write SQL), so on a phone the feature is effectively unusable.

Same cause makes the dock sit **mid-sentence across Case Note prose** on short windows.

**Root cause.** A fixed overlay over a scroll container can always collide with scrollable content. Bottom padding only
fixes the end of the scroll, never the middle.

**Suggested fix (pick one).**
1. *Cleanest:* make the dock a real row. `.stage` is already `display: flex; flex-direction: column`, so give the dock
   `position: static` (and keep the pill styling) as the last flex child. It then reserves its own height and can never
   overlap. Keep `position: absolute` **only** for `fullBleed` beats (`scene` / `hook`, where it floats over the art and
   there is nothing to click underneath) — `Player.tsx:129` already computes `fullBleed`.
2. *Smaller change:* `position: sticky; bottom: 14px` on the dock as the last child **inside** `.stage-scroll`, which keeps
   the floating look but still reserves space.
3. *Band-aid, not recommended:* `pointer-events: none` on `.dock` + `pointer-events: auto` on its children. This does not
   help — the dock's own buttons are exactly what covers the content.

Whatever is chosen, also re-check the bottom padding: `110px` is tuned to the dock's current height (67.6 px + 14 px).

---

### BUG-2 🔴 The briefing's "I'm ready →" button does nothing when the page is opened directly

> ✅ **Fixed** on 2026-10-26 — see §7.1 for what the fix was and which files changed.

`intro/index.html` is the first page of the whole experience, and its big primary button is dead outside an iframe.

```tsx
// app/src/ui/screens/Briefing.tsx:55
const imReady = () => {
  setReady(true);
  postToParent('completed', { session: 0, intro: true, points: 0, hints: 0, traps: 0 });
  onStart?.();                       // standalone → undefined
};
```

`postToParent` returns immediately when `window.parent === window` (`src/ui/embed.ts:19,23`), and `BriefingApp`
(`SessionApp.tsx:46`) renders `<Briefing standalone />` with **no `onStart`**. So on a direct visit the click posts nothing
and navigates nowhere.

Worse, the page has **two** "I'm ready →" buttons with different behaviour:
* the hero one (`Briefing.tsx:82`) ignores `ready` → it keeps saying "I'm ready →" forever and never gives feedback;
* the bottom one (`Briefing.tsx:165`) becomes a disabled "✓ Briefing complete".

**Verified:** clicked the hero button on `http://127.0.0.1:8731/intro/index.html` — the page did not change in any way,
while the bottom button had already flipped to "✓ Briefing complete".

**Suggested fix.** Make both buttons share one state, and when not embedded give the learner somewhere to go (link to
`../s01/index.html`, or at minimum show "Briefing complete — open the first episode from your course page"). The
LMS-iframe behaviour (post `completed` and let the host advance) should stay.

---

### BUG-3 🟠 `Ctrl + Enter` in the SQL console inserts a blank line instead of running the query

> ✅ **Fixed** on 2026-10-26 — see §7.1 for what the fix was and which files changed.

The console header advertises a `Ctrl + Enter` shortcut (`TaskPanel.tsx:116`), and the binding is registered:

```tsx
// app/src/ui/components/SqlEditor.tsx
extensions: [
  basicSetup,                                                   // ← includes defaultKeymap
  sql({ dialect: SQLite, schema, upperCaseKeywords: true }),
  keymap.of([{ key: 'Mod-Enter', run: () => { run.current(); return true; } }]),
  …
]
```

But CodeMirror's `defaultKeymap` (inside `basicSetup`) already binds `Mod-Enter` → `insertBlankLine`
(confirmed in `node_modules/@codemirror/commands/dist/index.js`). In CodeMirror 6, **extensions listed earlier have higher
precedence**, so `basicSetup` wins and the custom handler never runs.

**Verified:** typed the reference query for T3.1 and pressed Ctrl+Enter — the editor went from 1 to 2 lines, nothing ran,
the dock still said "Run a correct query to continue". Clicking `Run ▶` then worked and graded correctly.

**Suggested fix.** `import { Prec } from '@codemirror/state'` and wrap the custom keymap:
`Prec.highest(keymap.of([{ key: 'Mod-Enter', run: … }]))`, or simply list it **before** `basicSetup`.

---

### BUG-4 🟠 Table/column autocomplete in the SQL editor never works

> ✅ **Fixed** on 2026-10-26 — see §7.1 for what the fix was and which files changed.

`TaskPanel` loads the schema asynchronously (`TaskPanel.tsx:53-55`) and passes it to `SqlEditor`. But the editor is built
in a `useEffect` with an **empty dependency array** (`SqlEditor.tsx:51`), and the comment says "schema/initial changes
remount via `key`" — while the key actually used is `key={beat.id}` (`TaskPanel.tsx:118`), which does **not** change when
the schema arrives. So CodeMirror is always constructed with `schema = {}`.

**Verified:** on episode 3 task T3.1, typing `gat` offered only the keyword **`GRANT`** — not `gate_log`, the table shown
right next to the editor.

**Suggested fix.** Either add `schema` to a `useEffect` that reconfigures the editor
(`view.dispatch({ effects: StateEffect.reconfigure… })`), or key the editor on the schema:
`key={`${beat.id}:${Object.keys(schema).join(',')}`}` (simplest, remounts once when the schema lands — but it would discard
typed text, so prefer reconfiguration).

Related, smaller: the drawer's **table name** tabs only switch the preview; only **column** names insert into the editor
(`TablesDrawer.tsx:61` vs `:86`). `PLAN.md` §6 promises "tap-to-insert table/column names". Consider making the table tab
insert its name too (or long-press / a small `+`).

---

### BUG-5 🟡 The upload folder is named `v3` but README and the build script both say `v2`

> ✅ **Fixed** on 2026-10-26 — see §7.1 for what the fix was and which files changed.

* Commit `054c890` ("update version") renamed `missing-influencer-v2/` → `missing-influencer-v3/` and changed **nothing else**.
* `README.md` still documents `missing-influencer-v2/` throughout.
* `app/scripts/build-s3.mjs:30` still defaults to `path.join(ROOT, 'missing-influencer-v2')`.

So running the documented `npm run build:s3` today creates a **second, parallel folder** `missing-influencer-v2/` and leaves
the committed `missing-influencer-v3/` stale — an easy way to ship the wrong build.

**Suggested fix.** Decide the name once, then update `build-s3.mjs` (the `OUT` default and the header comment),
`README.md` (3 places), and `app/README.md` if it mentions it. Better still, read the name from one constant.

---

### BUG-6 🟡 `pipeline/audit_clues.py` crashes on Windows

> ✅ **Fixed** on 2026-10-26 — see §7.1 for what the fix was and which files changed.

```
UnicodeEncodeError: 'charmap' codec can't encode character '\u2190' … (audit_clues.py:55)
```

The script prints `←`, `—` etc. to a `cp1252` console. It dies on the **first clue of session 1**, so the documented
evidence-chain audit cannot be run on this machine at all.

**Suggested fix.** At the top of the script:
`sys.stdout.reconfigure(encoding='utf-8', errors='replace')` (Python 3.7+), or set `PYTHONIOENCODING=utf-8` and document it.
Same treatment for any other Python script that prints non-ASCII.

---

### BUG-7 🟡 No `.gitattributes` — Windows line endings churn every generated file

> ✅ **Fixed** on 2026-10-26 — see §7.1 for what the fix was and which files changed.

`core.autocrlf=true` locally and there is no `.gitattributes`, so:

* every `node pipeline/build_sessions.mjs` marks **all 60+ generated JSON files as modified** with no real content change;
* `content/case_db/runtime/index_demo.sql` is checked out with CRLF and then **embedded verbatim** into the pack JSON, so
  `content/sessions/s12.json`, `content/units/u34.json` and `u37.json` get genuine `\r\n` diffs — the Windows build is not
  byte-reproducible against the Linux one;
* the committed bundle `missing-influencer-v3/assets/index-sgMpc5si.js` is **132 bytes larger** than a fresh build of the
  same source (CRLF injected on checkout), even though the Vite content hash matches. Harmless at runtime, but it means the
  committed artifacts are not what the build produces, and every Windows contributor sees a dirty tree.

**Suggested fix.** Add a `.gitattributes`:

```gitattributes
* text=auto eol=lf
*.sqlite binary
*.woff binary
*.woff2 binary
*.wasm binary
```

then re-normalise (`git add --renormalize .`) once.

---

### BUG-8 🟢 `SortInto`: taking a placed item back while another item is selected does the wrong thing

> ✅ **Fixed** on 2026-10-26 — see §7.1 for what the fix was and which files changed.

`app/src/ui/activities/SortInto.tsx:41` puts the item pills **inside** the bucket `<div role="button" onClick={put}>`.
Clicking a placed pill fires the pill's handler (remove from `placement`) **and then** bubbles to the bucket's handler.
Both call `setPlacement` from the same stale `placement` closure, so when an item is currently `picked` the bucket's write
overwrites the removal — the "tap a placed item to take it back" affordance silently fails.

Harmless when nothing is picked (the bucket handler returns early). Fix with `e.stopPropagation()` on the pill, or move the
drop target out of the element that contains the pills.

Also worth noting: nesting a `<button>` inside `role="button"` is invalid for assistive tech.

---

### BUG-9 🟢 "~24 minutes" reads as "-24 minutes"

> ✅ **Fixed** on 2026-10-26 — see §7.1 for what the fix was and which files changed.

`SessionIntro.tsx:71` renders `~{Math.round(pack.minutes_estimate)}`. In the Unbounded 900-weight display font the tilde
sits low and short, so the episode intro stat reads like a **negative number**. Use the word "about", or `≈`, or drop the
prefix.

---

### Not a bug, but worth knowing

* **Opening the built `index.html` from the file system gives a blank page.** The generated pages use
  `<script type="module" crossorigin src="../assets/…">`, which browsers refuse on `file://`. Always serve over HTTP
  (§6). If someone reports "nothing loads", check this first.
* **`.wasm` must be served as `application/wasm`** on the real host, or the SQL engine won't start.
* **Asset filenames change on every build** — always re-upload the whole folder, never individual files.
* **Episode 1 has no SQL task.** Its single clue `S1-C1` has no `requires_task`, so `canPin` returns `true` — that's
  intentional, not a bug.

---

## 8. What is verified healthy (don't re-investigate)

Checked on 2026-10-26 **after** the fixes:

* `npm test` — **113 tests, 12 files, all pass**. Includes "plays every built session to completion, in order",
  "all 38 units on one device = every session completed, every clue earned, rank Inspector", and the new SortInto case.
* `npm run typecheck` — clean.
* `npm run smoke` — real Chrome plays episodes 1–3: briefing → episodes, a reported query, a trap, leave-and-resume,
  reset-and-replay, Evidence Board with 3 clues, **Ctrl+Enter**, **table autocomplete**.
* `npm run hit-test` — 375 scans, 3 viewports, episode 3: every visible interactive element receives its own clicks.
* `DEPLOY_DIR=missing-influencer-v3 node scripts/smoke-deploy.mjs sessions` — **all 13 episodes** solved inside an
  iframe against the built folder, with `ready` / `progress` / `completed` / `resize` messages and the evidence carried
  across episodes, plus the standalone briefing hand-off.
* `node pipeline/build_sessions.mjs` — 13 sessions + 38 units, coverage complete, 1 benign warning.
* `node pipeline/test_grader.mjs` — **239/239**. `node pipeline/check_case_db.mjs` — **115/115**.
* `python pipeline/audit_clues.py` — runs clean on Windows, exit 0.

### Two audit flags that are NOT bugs

`audit_clues.py` prints `!! NO TASK unlocks this clue` twice. Both are fine:

* **S1-C1** — episode 1 has no SQL task at all (by design), so its clue has no `requires_task`; `canPin` returns `true`.
* **S4-C2** — the clue *is* wired, via `requires_task: T4.7`. What it lacks is `on_pass.clue` on beat `S4.18`, which is
  the field the audit follows to print the proving result. So the clue is pinnable and the chain is sound; the audit
  simply cannot show the query behind it. If you want the audit fully quiet, add `on_pass: { clue: "S4-C2" }` to
  `S4.18` in `content/sessions/src/s04.yaml` and rebuild — but check `docs/SESSION_PLAN.md` §0.5 first, because S4-C2
  deliberately mixes query evidence with Sunny's witness statement.

---

## 9. Suggested next steps

The bug queue is empty. What is worth doing next, in order:

1. **Commit and push.** The tree is verified but uncommitted (§7.3). Do this before anything else so the fixes are not
   sitting loose on one machine.
2. **Play it on a real phone.** Everything above was Chrome at phone *dimensions*; the dock, the wrapped code blocks and
   the tap-to-insert chips deserve one pass on actual hardware with a thumb.
3. **Tap-to-insert for table names.** Still open from the old BUG-4 note: in the Case Database drawer, **column** chips
   insert into the editor but a **table** tab only switches the preview (`TablesDrawer.tsx:61` vs `:86`), while
   `PLAN.md` §6 promises both. Needs a design decision (a small `+` on the tab, or long-press) rather than a patch.
4. **Widen the hit-test.** It walks episode 3 (`HIT_SESSION=7 node scripts/hit-test.mjs` walks another). Consider running
   it over 2–3 episodes in CI, and adding the done screen and the Evidence Board to the screens it scans.
5. **Episode length.** Episode 2 (56 min) and 12 (53 min) are close to the 60-minute ceiling the build enforces.
6. **The product decisions in §11** are still unresolved and are the only things blocking a pilot.

## 10. Where to read more

| Question | File |
|---|---|
| Why the game is designed this way; audience; safety rules; platform architecture; roadmap | `PLAN.md` |
| Exactly what happens in episode N, beat by beat; the case truth; the evidence-chain rule; RM coverage; trap catalogue | `docs/SESSION_PLAN.md` |
| Repo layout, case-DB construction, milestones | `docs/IMPLEMENTATION_PLAN.md` |
| How to edit an episode; every beat type and its fields; placeholder rules; the build's failure conditions | `content/sessions/README.md` |
| How the case database is built and what's in it | `content/case_db/README.md` |
| The grader, result hashing, the SQL feature map | `shared/README.md` |
| Deploying, the iframe messages (`ready` / `progress` / `completed` / `reset`), progress-sharing rules | `app/README.md`, `README.md` §Shipping |
| What every screen looks like | `docs/screenshots/after/` |

---

## 11. Open product decisions (from `PLAN.md` §10, still unresolved)

1. **Placement** — does the game replace course units, or sit alongside the course as a companion?
2. **Art style** — illustrated static scenes for the playtest; current build uses generated SVG scene art + chat avatars.
3. **Mode** — single-player only for v1, or a leaderboard too?

Resolved earlier: English only · no time limit, continue any time, per-episode reset (2026-10-05) · pilot hosting yes
(small Postgres + API) · unit sites not shipped (2026-10-19).
