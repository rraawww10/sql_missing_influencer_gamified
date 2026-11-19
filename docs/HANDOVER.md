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

---

## 10. Rework log — v4 (Nov 2026) · branch `rework-v4`

**Goal (from the review):** noir detective visual overhaul with an animated companion, sound effects, better game flow,
easy sessions, a feedback dashboard, analytics hardened for ~500 students. **v1 due Thursday 5 Nov 2026, first half.**
Decisions (2026-11-02, with the user): companion = **Inspector Kaal**, a new character assigned to the learner as a helper
by their senior (SI Ira Menon); sound has an **on/off toggle** the student controls; all work on branch `rework-v4`; new
build goes to `missing-influencer-v4/` (v3 untouched). Kaal's lines live in the UI layer (no YAML changes → content build rules untouched).

Note: §1–§9 above predate commit `16c82db` (analytics). The v3 fixes in §7 *are* committed (`f91cfdc`).

### Log
| When | What | Files | Verified |
|---|---|---|---|
| 2026-11-02 | Branch `rework-v4` created; fonts `@fontsource/special-elite`, `@fontsource/oswald` added | `app/package.json` | — |
| 2026-11-02 | **Noir UI + Inspector Kaal + sound (game side).** New `noir.css` layer over `styles.css` (rain, film grain, vignette, headlight sweep, paper memos, dossier Case Notes, green-phosphor terminal with scanlines + syntax palette, rubber-stamp verdicts VERIFIED/DENIED/TRAP/ERROR, MATCH FOUND flash, polaroid clues, physical buttons with ripple). **Kaal** = SVG+CSS animated detective with 8 moods (`kaal/Kaal.tsx`), line banks + per-episode teasers (`kaal/lines.ts`), event bus that also fires sounds (`kaal/bus.ts`); docked in the Player, on episode intro / briefing / solved page (`kaal/KaalCard.tsx`, typewriter text); nudges after 50 s idle. **Hints** → three sealed envelopes ("Ask Kaal"). **Sound**: Web Audio synth, 11 effects, 🔊/🔇 toggle remembered per device (`sound.ts`, `components/SoundToggle.tsx`, global click fx `fx.ts`). **Flow**: 🎯 objective chip in HUD, "Previously on the case" polaroid reel + CONFIDENTIAL stamp on intro, solved screen = *City Night Times* front page + rank badge + NEXT LEAD teaser. **Feedback card** on solved screen (`components/FeedbackCard.tsx`, `feedback.ts`; posts `feedback` to parent + `POST /api/feedback`). | `app/src/ui/**`, `app/src/main.tsx`, `app/package.json` | `tsc` clean · 118/118 vitest · episode 3 played end-to-end in Chrome with screenshots |
| 2026-11-02 | **Analytics: feedback + 500-student hardening.** `feedback` table, `POST /api/feedback`, `GET /api/admin/feedback(.csv)`, `GET /api/admin/live`; dashboard **Feedback** tab + "N playing now" pill. Overview 2 980 → 429 ms at 500 students (correlated EXISTS removed), new index `ev_student_verb`, 20 s cache on overview/students. Seeder makes demo feedback. New `bench.mjs`, `loadtest.mjs`. | `analytics/lib.mjs`, `server.mjs`, `public/index.html`, `seed-demo.mjs`, `lib.test.mjs`, `README.md` | 7/7 node tests · bench at 500 students · load test 500×6 concurrent: 0 failures, p95 381 ms · Feedback tab screenshot-checked |
| 2026-11-02 | **Chapters + checkpoints, cork Evidence Board, v4 build.** Episodes are cut into chapters at each clue (`chapterOf` in `Player.tsx`); HUD shows "Ch. n/m"; leaving a clue shows "💾 Chapter n closed · progress saved" + a Kaal line. Evidence Board = cork with animated red string + KaalCard. Kaal stays quiet on routine steps on narrow screens; envelope wiggle runs 3× (endless animation broke automated clicks). Build output renamed to **`missing-influencer-v4/`** (`build-s3.mjs`, `smoke-deploy.mjs`); v3 folder left untouched. **Decision:** students play on laptop/desktop only — no phone work. | `app/src/ui/**`, `app/scripts/*`, `missing-influencer-v4/` | 118/118 vitest · hit-test ✓ (3 viewports) · `smoke:deploy` on v4: all 13 episodes solved in an iframe |
| 2026-11-04 | **Game juice v5: per-episode sound, Kaal's voice, animation.** `sound.ts` rewritten: 13 per-episode palettes (key, scale, timbre, motif), chapter = stage → taps climb the scale, tempo/brightness rise; separate tap sounds per control kind (`fx.ts`: primary, choice, pill, story-bar seg, envelope), query-run, typing blips, phone ping, chapter sting. Kaal speaks every line via Web Speech (`voice.ts`, 🎙️/🤐 toggle `components/VoiceToggle.tsx`). Screen fx on verdicts (`gamefx.ts`: flash, shake, "+1 ⭐" floaters), per-episode particles (`components/Particles.tsx`), CHAPTER n banner, step fade-ins, tap squash + sparks. **Lesson:** never animate `transform` on `.stage` or on step content - the hit-test then measures moving buttons (Continue on phone timed out); shake/zoom only `.stage-scroll`, step-in is opacity/blur only. | `app/src/ui/**` | tsc · 118/118 vitest · smoke OK · hit-test 26 overlaps (baseline before v5: 40, all Kaal-dock vs tables panel) |
| 2026-11-05 | **Feedback round: real music, Indian voice, vivid colours, lively Kaal, no em dashes.** Background = user-supplied track `app/src/assets/music/suspense-theme.mp3` (DesiFreeMusic, *funny suspenseful cartoon-style music*, ~4 min, 7.7 MB; replaced the synth drone that sounded like a buzz). Per episode: own start offset + tone filter (`FLAVOUR` in `sound.ts`); per chapter: +tempo (pitch kept) and brighter filter; ducks while Kaal talks; starts on first tap (autoplay rules). Square/saw waves removed from all effects (buzz); fail/trap are cartoon "uh-oh"/"wah-wah". Voice: ranked Indian voices first (Edge *Prabhat Natural* > Rishi/Ravi/Neerja/Heera > any en-IN > Chrome *Google हिन्दी*), natural rate ~1.0-1.1, pitch by mood. **Limit:** browser speech only - accent depends on the device's installed voices; a truly consistent Indian voice needs pre-recorded/cloud-TTS clips (open decision). Kaal redrawn: face, big eyes, brows, moustache, saffron scarf, blue trench coat; mouth + head animate while speaking (`onSpeaking` in `voice.ts`, `useTalking` in `Kaal.tsx`); lines rewritten livelier with light Hinglish (`lines.ts`). Vivid palette layer at the end of `noir.css` (v6) + brighter skies in `theme.ts`. All em dashes in learner-visible text replaced with hyphens. | `app/src/**`, `content/sessions/src/*.yaml` (315 em dashes → ` - `; `Markdown.tsx` also maps any em dash at render time, so the verbatim `reading_materials.json` stays untouched), `missing-influencer-v4/` (now 15.3 MB because of the music) | tsc · 118/118 vitest · `build_sessions` + `audit_clues` (0 flagged) · smoke OK · hit-test 31 overlaps (baseline 40, all Kaal dock / phone-only) · screenshots of ep 5 play + ep 7 intro. Voice not heard (headless browser has no voices) - **test on a real laptop in Edge and Chrome** |

| 2026-11-05 | **Kaal's voice: male only, deep cartoon delivery.** Feedback: voice sounded AI-like / female. `voice.ts`: a `FEMALE` name list (Neerja, Heera, Swara, Google हिन्दी, Zira, Samantha, …) is never picked; ranking = Prabhat Natural > Madhur > Prabhat > Rishi > Ravi > Hemant > other en-IN male > UK/US male names. Pitch 0.55-0.78 by mood (deep), rate 0.95-1.08. **Decision (user, 2026-11-05): stay on browser speech** - no recorded clips / cloud TTS. Known limit: still somewhat robotic on laptops without a natural voice; if a device has no male English voice the browser default is used. | `app/src/ui/voice.ts` | tsc · 118/118 vitest · smoke OK |
| 2026-11-05 | **Kaal introduces himself once; faster speech.** He used to introduce himself on the Briefing, the Episode 1 intro card and the first step of Episode 1. Now only the Briefing does (`Briefing.tsx`); the Episode 1 card is just the teaser (`SessionIntro.tsx`) and the `intro` lines are "let's go" lines with no introduction (`lines.ts`). Speech rate raised to 1.1-1.28 by mood (was 0.95-1.08), pitch unchanged (deep). | `screens/SessionIntro.tsx`, `kaal/lines.ts`, `voice.ts` | tsc · 118/118 vitest · smoke OK · v4 rebuilt |
| 2026-11-12 | **Student identity + everything in one database (game ⇄ DB ⇄ dashboard).** **Start screen** (`ui/identity/IdentityGate.tsx`) asks **name + NxtWave ID** once per device, no password; the ID (upper-cased) is the student key: `IdentityAuth` (`adapters/identity.ts`) makes the user id `lms:<ID>`, so every event/heartbeat/feedback lands under it. "👤 Name · ID · Not you?" chip on intro/briefing/solved/case map (`WhoChip.tsx`). **Name in the game**: `[[name]]` in story text (s01 "Welcome…, [[name]]") and `{you}` in Kaal's lines (all "partner" → `{you}`), resolved at render by `personalize()` (Markdown, Kaal bus, KaalCard); Briefing shows the name/initials. Rank "Intern" kept (it is a rank). **Server** (`analytics/lib.mjs`, `server.mjs`): `POST /api/identify` (students.entered_name/registered_at/last_login_at/logins, auto-migrated), `GET /api/history/:id` (exact events via new `events.raw`, feedback given, check-ins, sittings), `POST /api/sitting`, `POST /api/checkpoint` (new `checkpoint_feedback`, `sittings` tables). **Returning student**: gate pulls history into the device before the game opens (`adapters/serverSync.ts` `restoreFromServer`) - solved episodes, points, clues, the unfinished episode at the same step, "feedback already given"; stale local sittings dropped. Unfinished sittings mirrored to the server (`SyncedSittingKV`); feedback/check-ins/identify go through a retrying `Mailbox` (no longer lost offline). **Chapter check-in** after every chapter (`components/ChapterPulse.tsx`, 😕😐🙂🤩 + suggestion). **Dashboard**: time per chapter + per beat, student's feedback + check-ins on their page, NxtWave ID labels, Feedback tab "Chapter check-ins" + suggestions, CSV includes check-ins. Fix: on the case-map build heartbeats were charged to episode 0 (`remoteSync.ts`). `build:s3` now warns loudly when `VITE_ANALYTICS_URL` is not set. Browser scripts seed/fill the start screen (`smoke-lib.mjs` `seedIdentity`/`signIn`). | `app/src/**`, `analytics/**`, `content/sessions/src/s01.yaml`, `app/scripts/*`, `missing-influencer-v4/` | tsc · **125/125 vitest** (+7) · **10/10 analytics tests** (+3) · build_sessions + audit_clues ✓ · smoke ✓ (incl. real start-screen form) · hit-test: same Kaal-dock/phone overlaps as before (compared old vs new) · **new `npm run e2e:analytics`: real server + real Chrome, device A plays → dashboard API shows name/ID/progress/time/feedback → device B same ID restores everything ✓** · smoke:deploy: all 13 episodes solved in an iframe on the rebuilt v4 ✓ |

| 2026-11-12 | **Local test kit with sample data.** `npm run local-test` (app/) = test DB (`analytics/data/test.sqlite`: 60 random students NW100001… with names/check-ins + 6 test students) + analytics server :8787 (password `test`) + case-map game :5180 + S3-layout game :5181, all pointed at the local server. Test students NWTEST01-06 are made by the REAL engine (`src/test/makeTestStudents.test.ts`, `npm run make:test-students` → `analytics/test-data/test-students.json`; dates shifted to "recent" at seed time). `analytics/inspect.mjs` prints what is stored per table / per student. `analytics/test-data/sample_roster.csv`. Guide: **`docs/TESTING_GUIDE.md`** (stages A-K). Also `docs/understanding_server.md`. | `app/scripts/local-test.mjs`, `app/src/test/makeTestStudents.test.ts`, `analytics/seed-demo.mjs`, `analytics/inspect.mjs`, `analytics/test-data/*`, `docs/TESTING_GUIDE.md` | local-test run; in Chrome: NWTEST03 restored (3/13, ep 4 continues at step 15), NWTEST02 on the S3 build (ep 1 step 7), NWTEST05 19 clues, NWTEST01 welcome back; dashboard student page + Feedback tab rendered, 0 page errors |
| 2026-11-13 | **Free Render demo.** `render.yaml` Blueprint: `tmi-analytics-demo` (free Node 24 web service, analytics server + dashboard, ADMIN_PASSWORD asked at apply) and `tmi-game-demo` (static site, case-map build with `VITE_ANALYTICS_URL`). Demo only: free disk is wiped on sleep/redeploy. Steps in `docs/RENDER_DEMO.md`. | `render.yaml`, `docs/RENDER_DEMO.md` | not yet deployed (needs the user's Render login) |

| 2026-11-16 | **Render deploy check.** GitHub repo `rraawww10/sql_missing_influencer_gamified` (public) already matches the local folder, render.yaml included. `.gitignore` now also excludes `analytics/data/` and `*.sqlite*` (local only, not pushed). Render Blueprint apply still needs the user's Render login. Verdict: OK for a small internal test, not for student rollout (free disk wiped on sleep/redeploy, public repo includes docs/ANSWER_KEY.md). | `.gitignore` | app build OK · analytics tests 0 fail |

| 2026-11-16 | **AI test data removed from local databases.** Deleted `analytics/data/demo.sqlite` (500 seeded STU students + 6 automated guest runs) and `load.sqlite` (500 load-test LT students). `test.sqlite` now holds only Rishu (NW0007816, kept untouched) + the two latest AI test students NWTEST05/NWTEST06 (user asked to keep the latest one or two). Backup of all originals: `../analytics-backup-2026-11-16/`. `npm run local-test` now KEEPS the database by default; `--fresh` wipes and re-seeds (was the reverse). | `analytics/data/*`, `app/scripts/local-test.mjs`, `docs/TESTING_GUIDE.md` | row counts checked after cleanup |

| 2026-11-16 | **Case map top-right: student name instead of the rank chip.** Removed the static "🎖 Intern" chip from the case map nav (`Home.tsx`); the who-chip there now shows the student's full entered name (`<WhoChip full />`, long names cut with … on small screens). Rank still shows on the Solved screen and the Briefing. | `ui/screens/Home.tsx`, `ui/identity/WhoChip.tsx`, `ui/noir.css` | tsc · 125/125 vitest |

| 2026-11-17 | **Kaal's Briefing intro made simpler.** "Stuck? Ask me for an envelope. Right? I'll know. Wrong? I'll tell you why." → "Stuck on a query? Open one of my hint envelopes. Run your query and I'll tell you if it's right. If it's wrong, I'll show you what to fix." (user-approved wording). Not pushed yet - goes out with the planned UI + dashboard changes. | `app/src/ui/screens/Briefing.tsx` | tsc · 125/125 vitest |

| 2026-11-17 | **Ranks as achievements.** Solving the episode that reaches a rank (4 → Constable, 8 → Sub-Inspector, 13 → Inspector) shows a one-time **"Achievement unlocked · Promoted!"** card on the Solved screen (medal, new rank, episodes left to the next one) and Kaal congratulates by rank; shown once per student per rank (`localStorage tmi.promoted.<ID>.<rank>`). The rank now shows everywhere: Solved screen badge + "N more episodes to X", case map who-chip (name · 🛡️ Constable), Briefing "That's you! <rank>, Data Cell" and the ranks row (earned ranks lit, "You are here" on the current one). Story text "you are the new intern" kept (it is the opening). New `ui/ranks.ts` (icons, nextRank, takePromotion). Pushed 2026-11-17 (4b5667a). | `ui/ranks.ts`, `ui/ranks.test.ts`, `screens/SessionDone.tsx`, `screens/Briefing.tsx`, `screens/Home.tsx`, `identity/WhoChip.tsx`, `noir.css` | tsc · 127/127 vitest (+2) · build OK · not yet seen in a browser |

| 2026-11-17 | **Kaal's voice: steady pace, mood in the tone + plain-English lines.** Feedback: in-episode lines sped up (rate was per mood, up to 1.28) and Hindi words are not understood by many students. `voice.ts`: base `RATE = 1.05`, each mood a `TONE` [pitch, pace ±6%, volume]: cheer/happy brighter and a touch quicker, oops (wrong query / SQL error) lower, softer, slower = sympathetic, think/whisper calm. `lines.ts`: all Hinglish replaced with English (Shabash, Ekdum, Bilkul sahi, Koi baat nahi, Arre (wah), Chalo, Wah) and 11 vague lines simplified (user-approved table: scene, count-the-rows, clean query, hint 1/3, right on the money, Hehe trap, demo, ep 9 teaser); voice-on line says the student's name instead of "partner". Pushed 2026-11-17 (4b5667a). | `ui/voice.ts`, `ui/kaal/lines.ts` | tsc · 127/127 vitest · not yet heard in a browser |

| 2026-11-17 | **Brighter look + clearer story + playful taps (kept light, per user).** Each episode has its own bright animated gradient (`theme.ts` sky colours, `noir.css` v8 block: gradient shifts slowly, dark veil keeps text readable, reduced-motion off). SQL terminal untouched. Briefing: new **"What happened to Tara Sen?"** section (5 cards: who she is, 6 PM gone, no easy clues, midnight deadline, your job) and a clearer premise (`content/story/cast.json`). Tap sounds rewritten as bouncy rising "boops" (`sound.ts`). Last Hindi word ("chalo" in the episode greeting, `Player.tsx`) replaced. Pushed 2026-11-17 (4b5667a). | `ui/theme.ts`, `ui/noir.css`, `screens/Briefing.tsx`, `content/story/cast.json`, `ui/sound.ts`, `screens/Player.tsx` | tsc · 127/127 vitest · build OK · screenshots of Briefing / episode 4 intro / episode 5 play checked |

| 2026-11-17 | **Dashboard: simpler, colourful, feedback first + feedback required in the game.** Dashboard (`analytics/public/index.html`): colourful header, Overview cut to 5 bold tiles (students, active today, avg time, avg rating, feedback received) + **Latest feedback** cards (episode feedback + chapter check-ins, newest first, click → student) + daily activity + episodes completed; removed: progress distribution, where-students-are, hours chart, summary table, definitions (detail still in Episodes tab). Feedback tab opens with a 24-card feed. Roster tab, batch picker and guests checkbox hidden (students type their own name + ID; roster API kept). Game: end-of-episode feedback is **required** (stars + feeling + SQL difficulty) - Next episode / Back to map unlock only after it is sent (or already given); chapter check-in has no Skip button (still does not block play). Pushed 2026-11-17 (4b5667a). | `analytics/public/index.html`, `app/src/ui/components/FeedbackCard.tsx`, `ChapterPulse.tsx`, `screens/SessionDone.tsx` | 10/10 analytics tests · tsc · 127/127 vitest · dashboard screenshots (Overview, Feedback) on test data, 0 page errors |

| 2026-11-17 | **Pushed everything to `main` (4b5667a) → Render rebuilds both demo services.** Before pushing: rebuilt the episode packs (`node pipeline/build_sessions.mjs`) so the new premise reaches the case map (only `premise` changed in content/sessions + units); fixed the test scripts for required feedback (`smoke-lib.mjs` `giveFeedback`), the full-name chip, and an old e2e ready check (server prints 0.0.0.0, test waited for localhost). Push from `rework-v4` with `git push origin HEAD:main`. | `content/sessions/*.json`, `content/units/*.json`, `app/scripts/*` | tsc · 127/127 vitest · smoke OK · e2e:analytics OK · 10/10 analytics tests |

| 2026-11-17 | **UptimeRobot keep-alive set up (user's account).** One HTTP monitor on `tmi-analytics-demo.onrender.com`, every 5 min, so the free Render server no longer sleeps and loses data. Still lost on a push to `main` or a Render restart: export CSV + feedback CSV before pushing and daily during testing. | (no code) | monitor Up, server answers /health |

| 2026-11-18 | **Required email at sign-in + "Forgot your NxtWave ID?" (local only, not pushed).** Start screen now asks name, NxtWave ID and **personal email** (required, own validation message, visible note saying why). A device that signed in before this has no email: the gate shows a short **"Add your email"** step (name and ID kept, "Switch student" link), then continues as usual. **Recovery:** a "Forgot your NxtWave ID?" text button opens a small form; the email is looked up on the server and the student is signed in through the normal identify + restore path. Hidden when the build has no `VITE_ANALYTICS_URL` and when the platform passes `?user_id=`. **Server:** `students.email` added by an additive migration (`PRAGMA table_info` + `ALTER TABLE ADD COLUMN`, existing rows untouched); `POST /api/identify` takes an optional `email` (lower-cased; a request without one keeps the stored one; a bad one is refused); new public `POST /api/recover` `{email}` → `{found, student_id, name}` (most recently seen student with that email), limited to 30 lookups per IP per 15 minutes (the admin-login limiter with its own counter). The stored email is never sent back by public routes. **Dashboard:** email under the name in the students table (also in the "not started" view), in the single-student header, searchable, and as the LAST column of the students CSV. Test scripts type / seed an email. | `app/src/adapters/identity.ts`, `serverSync.ts`, `app/src/main.tsx` (gate deps only), `ui/identity/IdentityGate.tsx` (+ new `IdentityGate.test.tsx`), `analytics/lib.mjs`, `server.mjs`, `public/index.html`, `analytics/README.md`, `app/scripts/smoke-lib.mjs`, `smoke.mjs`, `e2e-analytics.mjs`, `local-test.mjs` | 14/14 analytics tests (+4) · tsc · 142/142 vitest · headless Chrome run of sign-in, add-email, recovery, dashboard and CSV on free ports with a throw-away database · `npm run smoke` and `e2e:analytics` NOT run yet |
| 2026-11-18 | **Branch `rework-v5`: the whole game rebuilt in the "Arcade Night" design (local only, not committed, not pushed).** The user rejected a first prototype (ink-on-paper) as too black and white and approved the second: the page itself is the episode's two colours over a night skyline, white chunky cards, buttons that press down, Fredoka / Nunito / JetBrains Mono. The old stylesheets (`ui/styles.css`, `ui/noir.css`, 118 kB) are deleted and replaced by `ui/design/` (`base`, `screens`, `player`, `stages`, `kaal`, `reader`, imported by `index.css`). Three surface contexts (`.surface` white card, `.night` dark panel, default = on the gradient) set `--fg / --fg-2 / --soft …` so one component looks right anywhere. **Case map:** a level trail of 13 round stops (6 PM → midnight) replaces the scrolling card list; tapping a stop shows that episode in the hero and recolours the page; solved = star, next = hops, locked = shakes. **Player:** bar with the Learn scroll, tables, pins, sound, voice, reset; one step on the stage; Back / Continue dock. **SQL task:** brief + one card with two tabs (Tables / Kaal's hints - the hint envelopes moved out of a side sheet) on the left, dark console on the right; verdicts are coloured banners. **Solved:** score, rank bar, promotion card, feedback card, then the next-episode card. Prototypes: `../ui-prototype/` (v1) and `../ui-prototype/v2/` (approved). | `app/src/ui/design/*` (new), every file in `ui/screens`, `ui/components`, `ui/game`, `ui/activities`, `ui/App.tsx`, `SessionApp.tsx`, `theme.ts` (`themeVars` → `--c1` / `--c2`), `main.tsx`; deleted `styles.css`, `noir.css`, `components/Particles.tsx`, `components/CourseNote.tsx`; `package.json` (3 `@fontsource` packages) | tsc · 359/359 vitest · 14/14 analytics tests · `smoke` OK (episodes 1-3) · `e2e:analytics` OK · `hit-test` OK (375 scans, 3 screen sizes) · screenshot tour of every screen at 1440, 1280 and 390 px wide (episodes 1 and 2 played end to end, no console errors, no sideways scroll) |
| 2026-11-18 | **Icons: the emoji are gone.** A custom icon set (`ui/design/Icon.tsx`: 55 sticker-style SVG icons on one 24 px grid + 6 feedback faces) replaces every emoji used as an icon (step kinds, tools, ranks, feedback moods, toggles). Outlines follow the text colour around them. Episode `emoji` fields and `episodeClock` removed. | `ui/design/Icon.tsx`, `ui/ranks.ts` (`rankIcon` now returns an icon name), `ui/game/StoryBar.tsx` (`ICON`), `ui/episodes.ts`, `ui/gamefx.ts` | tsc · tour screenshots |
| 2026-11-18 | **Reading material: one Learn scroll, the COMPLETE material, full screen, copy off.** "Read the full course note" (which opened only one section in a side sheet) is replaced by an animated scroll button, in the game bar on every step and on each Learn step. It opens `ui/reader/Reader.tsx`: every primary course unit of the episode (episode 13 has none of its own, so it shows all earlier ones), a contents column, "you are here" + "Jump to" for the topic the student came from, a reading-progress bar. It covers the whole screen. Copying is off: no text selection, copy / cut / right-click / drag blocked, Ctrl+C/X/A/S/P ignored, nothing prints (`reader/noCopy.ts`; also on the course-note hint). The course's own "Concepts in Focus" link lists are left out (the contents column replaces them; some of those links pointed at sections the unit does not have). Pasting into the SQL editor is NOT blocked (open question for the user). | `ui/reader/*` (new), `ui/game/StoryStages.tsx`, `ui/screens/Player.tsx`, `ui/components/TaskPanel.tsx`, `ui/design/reader.css` | `reader.test.tsx` (6) · smoke checks: full screen, a late section is present, `user-select: none` |
| 2026-11-18 | **Learning text and case text are separated.** Note beats got an optional `case` field (YAML → packs → `types.ts`). 12 of the 81 notes had case sentences mixed into the learning text; they are split (the other 69 had nothing case-specific). A Learn step now shows the course learning on a white card ("From your course · learn this") and the case link on its own dark card below ("Case file · how this fits tonight"). The step kind is called "Learn" (was "Case Note"). Build errors added: `case` on a non-note beat, empty `case`, empty note `body`. | `content/sessions/src/s01,02,03,04,09,12.yaml` + rebuilt packs / units, `pipeline/build_sessions.mjs`, `pipeline/audit_clues.py`, `app/src/content/types.ts`, `packs.test.ts`, `ui/game/StoryStages.tsx` | build 13/13 · `test_grader` 239/239 · the built diff is only `body` / `case` on those 12 notes |
| 2026-11-18 | **Kaal is the student's own assistant, and he answers questions.** He no longer says SI Ira Menon sent him (Briefing line, card titles "Kaal · your assistant", `lines.ts` header, one line reworded). His corner dock is now on every screen (mounted in `App.tsx` / `SessionApp.tsx`, not only in the player): he still speaks in a bubble, and tapping him opens **Ask Kaal**, a chat that answers questions about the game. The answers come from a local answer engine (`ui/kaal/chat/brain.ts`: game rules read from the code, SQL concepts looked up in the reading material, never the answer to a task) - no AI service, no cost, works offline. `ui/kaal/dock.ts` tells the dock which screen and step is behind it and lets a chat reply open the reader, tables, hints or evidence. | `ui/kaal/Kaal.tsx`, `ui/kaal/dock.ts` (new), `ui/kaal/chat/*` (new), `ui/kaal/lines.ts`, `ui/screens/Briefing.tsx` | `brain.test.ts` 211/211 · asked in a real browser on the map and in a task (answers, the reply button opening the reader, Esc closes, chat kept across screens) |
| 2026-11-18 | **No expected time per episode anywhere.** Removed "~25 min" from the case map, the episode intro ("minutes, about"), the briefing timeline and its "about N hours" sentence. `minutes_estimate` stays in the packs (the dashboard and pipeline still use it). | `ui/screens/Home.tsx`, `SessionIntro.tsx`, `Briefing.tsx` | smoke checks no "N min" on the map |
| 2026-11-18 | **Student accounts with a password (local only, not pushed).** The user's point: "another student cannot login with some other student account mischievously". The start screen is now **Log in** (NxtWave ID + password) / **Sign up** (name, ID, required personal email, password twice). `analytics/auth.mjs` (new): passwords stored as salted scrypt hashes in a new `accounts` table (kept apart from `students`, which a roster "replace" empties); a random session token per device (server keeps its SHA-256 in `student_sessions`); **once an ID has an account, its history, events, feedback, check-ins, saved place and name / email are refused with 401 unless the request carries that student's own token**; an ID with an account cannot be signed up again; 8 wrong passwords per ID per 15 min lock the ID. **Forgot password:** emailed 6-digit code (15 min, 5 tries) when `RESEND_API_KEY` + `MAIL_FROM` are set - written and unit-tested with a fake mailer, NOT tried against the real mail service; without them (the default) the game says "ask your teacher" and the dashboard's **Reset password** (student panel) / **Reset a student's password** (Students tab, any ID) gives a temporary password that logs in once and forces the student to choose their own. **Forgot your NxtWave ID?** now only shows the ID (the password is still needed). The game sends the token in the JSON body (no CORS preflight); history moved to `POST /api/history`. A refused token (password reset elsewhere) keeps queued events / feedback and sends the student back to Log in. A stored identity from before accounts is asked to create a password for the same ID; an old ID with an email on file can only be claimed with that email, one without goes to the first sign-up. Builds without a server keep the name + ID + email screen (nothing to log in to). "Switch" in the top bar is now **Log out** (ends the session on the server too). Kaal's chat answers updated (password, forgot password, log out). | `analytics/auth.mjs`, `auth.test.mjs` (new), `analytics/lib.mjs` (3 tables), `server.mjs` (account routes + token checks), `public/index.html` (reset buttons), `analytics/README.md`; `app/src/adapters/account.ts`, `session.ts` (new), `identity.ts`, `serverSync.ts`, `remoteSync.ts`, `main.tsx`, `ui/identity/IdentityGate.tsx` (+ test), `WhoChip.tsx`, `ui/design/screens.css`, `ui/kaal/chat/brain.ts`; `app/scripts/smoke-lib.mjs`, `e2e-analytics.mjs`, `local-test.mjs`; `docs/TESTING_GUIDE.md` | 26/26 analytics tests (12 new: rules + the routes on a real server, incl. every break-in path) · tsc · 382/382 vitest · `e2e:analytics` OK (sign up, wrong password and second sign-up refused, history unreadable without login, log in on a second device restores) · `smoke` OK (no-server build) · browser walk-through of sign up, log out, wrong password, forgot ID, forgot password, dashboard reset, temporary password, phone size |
| 2026-11-18 | **Review fixes on `rework-v5` (local only).** (1) The dock no longer says "Ready when you are" (it still says what is missing: "Pick an answer to continue" …). (2) **Finished steps keep their answers:** coming back to a solved activity (leaving the episode, Back, the step bar) showed an empty board because the placement lived only in the component; a finished activity now always shows its final arrangement (solved = the learner's answer = the key), a quick check remembers the option picked (`BeatState.picked`, new and optional), and a solved SQL task says "Solved. The query … is in the editor". (3) **Episode 1, relational / non-relational:** the "sort the evidence" activity asked what suits which database BEFORE the note that says so (and "the reel is non-relational" read as a fact, not a fit). New activity `S1.8b` right after "Types of Databases" checks only what that note taught (tables / rows and columns / non-tabular / four common types / most commonly used); the evidence sort (`S1.9`, same id) moved to AFTER the non-relational note, now asks which database "suits each one best", and has two non-relational items (reel video; fan posts and comments). Episode 1 is 20 steps. (4) Kaal's voice: researched, options given to the user (nothing built). | `app/src/ui/screens/Player.tsx`, `ui/activities/ActivityPanel.tsx`, `ui/components/CheckPanel.tsx`, `TaskPanel.tsx`, `engine/runner/sessionRunner.ts`, `ui/design/stages.css`, `ui/ui.test.tsx`; `content/sessions/src/s01.yaml` + rebuilt packs / units; `docs/ANSWER_KEY.md` | build 13/13 · `test_grader` 239/239 · tsc · 385/385 vitest · 26/26 analytics · `smoke` OK · `e2e:analytics` OK · browser check: answers still on the board after leaving and coming back, and after Back / Next |
| 2026-11-18 | **Kaal's custom voice: everything ready except the voice sample (local only).** The user chose their own voice, cloned with Chatterbox (MIT). **Game:** `ui/voice.ts` plays a recorded clip for a line when the build has a voice pack (`content/voice/manifest.json` + `<key>.mp3`, copied by `sync-content` and `build:s3`), else the browser voice as before; with a pack, a line that has no clip (Kaal's chat answers) is not spoken, so he never changes voice. A clip is found from the line's template (`ui/voiceKey.ts`: the student's name is turned back into `{you}`; recordings leave the name out). All lines the screens used to build inline now live in `lines.ts` (`SAY`, `allSpokenLines`); lines with a number are spoken through a fixed recording (`say`). **Tools:** `npm run voice:lines` writes `tools/kaal-voice/lines.json` (114 lines, ~6,100 characters); `tools/kaal-voice/generate.py` records them (mood → Chatterbox exaggeration / pace; trims, evens loudness; resumable; skips lines already recorded). Chatterbox 0.1.7 installed outside the repo (`../kaal-voice/venv`, CPU torch; needed `setuptools<81` for its watermarker) and tried with its built-in voice: ~12 s per short line on this computer, so the full set is about half an hour. **Waiting for:** the user's recording (`../kaal-voice/record.sh` → `my-voice.wav`). | `app/src/ui/voice.ts`, `voiceKey.ts` (new), `voice.test.ts` (new), `kaal/lines.ts`, `kaal/voiceLines.test.ts` (new), `kaal/bus.ts`, `KaalCard.tsx`, `Kaal.tsx`, `components/VoiceToggle.tsx`, the five screens that speak; `app/scripts/sync-content.mjs`, `build-s3.mjs`, `package.json`; `tools/kaal-voice/` (new) | tsc · 395/395 vitest (clip lookup for every line with 7 kinds of names, playback, fallbacks) · `smoke` OK · Chatterbox generated two test lines on CPU |
| 2026-11-19 | **Kaal's recorded voice installed (local only).** The user chose Chatterbox's built-in voice (no personal sample was ever recorded). All 114 lines recorded on the CPU in ~21 min (`content/voice/`, 3 MB, MP3). A speech-to-text check (`tools/kaal-voice/check.py`, Whisper base.en) found 6 garbled takes and "Kaal" said as "Kyle"; `generate.py --verify` now keeps the best-heard of up to 4 takes, and `spokenText()` respells Kaal as "Kahl" for the recording only. After re-recording 12 lines: 113 of 114 heard word for word (the 114th differs only in how the name is transcribed). The voice speaks briskly (median ~17.5 characters a second), so the manifest carries a playback rate per fast clip and the game plays 66 clips a little slower at the same pitch (never below 0.85). Browser check on the running local build: the game loads the pack and plays the clip for Kaal's line, no browser voice. | `content/voice/` (new), `tools/kaal-voice/generate.py`, `check.py` (new), `README.md`, `app/src/ui/voice.ts` (rates), `voiceKey.ts` (Kahl, forty thousand), `voice.test.ts` | 397/397 vitest · `smoke` OK · `check.py` 113/114 word for word · browser: clip played |
| 2026-11-19 | **Reading material renders cleanly (local only).** The user saw raw "##", "###Database" and tables as text in the scroll. Causes, all in the course's own Markdown: `<Section id="…">` (with an attribute) was not removed and swallowed the heading under it; `<IndexItem href="…">` was not converted; headings without a space (`###Database`, 58 lines in 16 units); tables inside `<details>` with no blank line after `</summary>`; `**bold **` with a space before the closing stars; table dash rows with the wrong column count or no leading "|"; text directly under `<br/>`; a sentence directly under a table drawn as a row. Fixes: the course-tag conversion now handles attributes and puts blank lines around every block (all Markdown views; story text has none of these tags), and a new `courseMarkdown()` repairs the rest, applied ONLY to course text (the Reader and hint envelope 1), never to story text (a line starting with "#" could be a hashtag). Fold-out boxes holding tables open by themselves; boxes hiding hints stay closed. The "Concepts in Focus" link list is also dropped when written as `<IndexList>`. The Contents column now lists headings written without a space too. New test renders all 37 units and fails on any raw "#", table row, "**" or course tag, any missing table, a sentence drawn as a table row, or a Contents/page heading mismatch. | `app/src/ui/components/Markdown.tsx`, `ui/reader/Reader.tsx`, `ui/components/TaskPanel.tsx` (hint 1), `ui/reader/readingMaterial.test.ts` (new) | 442/442 vitest (all 37 units clean) · `smoke` OK · browser check of episode 2's scroll: no raw Markdown, 15 tables, Contents links land on their heading |
| 2026-11-19 | **Kaal no longer stutters (local only).** The user heard his voice break at some moments. Causes in the app: clips were streamed through an `<audio>` element (a range request that stalls half-way = a gap mid-word), played at 0.85-0.99 speed (time-stretching makes speech warble), cut off hard when the next line started, and the passive step comments ("Your turn…") interrupted a line still playing. Now `ui/voice.ts` fetches every clip once in the background after the manifest loads (3 at a time), decodes it, and plays the decoded buffer through Web Audio at its own speed (the manifest `rates` are ignored on purpose); a new line fades the old one out over 120 ms; a passive line (scene, note, task, activity, check, clue, demo, hook, review, resume, running: `PASSIVE_EVENTS` in `kaal/lines.ts`) never interrupts a line that is still playing, while reactions (right, wrong, trap, solved…) do. `<audio>` stays as the fallback when Web Audio is missing. | `app/src/ui/voice.ts`, `voice.test.ts`, `ui/sound.ts` (`audioContext()`), `ui/kaal/lines.ts`, `kaal/bus.ts`, `kaal/Kaal.tsx` | tsc · 444/444 vitest (Web Audio path with a fake context: one fetch, start, fade, stop time; passive vs reaction) |
| 2026-11-19 | **Episode feedback on the 11-star scale (local only).** Aligned with Airbnb's 11-star framework (Slab notes, Brian Chesky) as the user asked: the card asks "How many stars out of 11?" with a ladder of 11 buttons, each with its own words (1 "I gave up" … 5 "It worked, as expected" … 7 "Felt made for me" … 11 "It changed how I see coding"; `LADDER` in `ui/feedback.ts`), and the comment box asks "What would make it one star better?". The card sends `scale: 11`. Server: `feedback.scale` column (additive migration, old rows = 5), a rating is checked against its own scale, the feedback CSV gains an `out_of` column after `rating`. Old 5-star answers are never mixed into the 11-star numbers (the 5-star average / histogram now count only `scale = 5` rows). | `app/src/ui/feedback.ts`, `components/FeedbackCard.tsx`, `design/screens.css`; `analytics/lib.mjs`, `lib.test.mjs`, `seed-demo.mjs`; `app/scripts/smoke-lib.mjs`, `e2e-analytics.mjs` | 29/29 analytics · `e2e:analytics` OK (7 of 11 stored with `scale` 11, on the ladder) |
| 2026-11-19 | **Dashboard rebuilt: less text, every interaction, feedback up front (local only).** The user: "less texty … see all the interactions by the students … their suggestions and feedback clearly … all the analytics", thinking in the 11-star direction. Four tabs, each starting from a decision. **Now:** 5 tiles (played, active today, time per student, stars out of 11, need you), **Need you** (who to reach out to and why: stuck = 4+ runs of one task in 2 days and not solved; leaning on answers = 3+ full answers in a week; low stars = 1-3 of 11 or 1-2 of 5 in the last week; lost in a chapter check-in; quiet 3+ days and not finished; signed up a day ago and never played), the latest written suggestions, where students are now, active students per day, when they play. **Students:** a 13-square journey strip per student (solved / opened / where they are now), latest stars, need-you icons; filters Everyone / Need you / Active / Quiet / Finished / Not started. **One student (drawer):** mini stats, journey, then **every interaction** newest first, grouped by day: each SQL run with the query and Correct / Wrong / Trap, solved tasks with tries and hints, hint envelopes, traps, activities, quick checks, clues, steps viewed, episode start / come back / solved / reset, the stars they gave with the comment, chapter check-ins, log-ins; filters Key moments / SQL / Hints & traps / Feedback / Steps / Everything; "Load older" pages back. Minutes per day and the step-by-step tables are below. **Feedback:** one hero number (average out of 11) with median, % at 6+ and % at 1-3; the ladder histogram with 6-7 shaded as the target; a dot strip per episode (every rating, median tick); the "one star better" wall (end-of-episode cards and chapter check-ins, filters Suggestions / Every answer / Not working / As expected / Delight / SQL too hard, search; newest 24 first); mood, SQL difficulty, what they liked; chapter check-ins as flagged chips. **Episodes:** opened vs solved, solved %, avg time, first-try SQL, hints, traps, median stars; click one for its steps. Charts follow the dataviz rules (one blue series, hairline grid, thin bars with a rounded end, hover tooltips on everything, status colours only with an icon and words, light and dark). Server: `Analytics.timeline(id, {limit, before})`, `attention(f)`, `ladder(f)`, `journeys(f)`; `students()` rows carry `journey` + `stars`; `overview()` carries `attention` + `ladder`; `student(id)` carries `timeline` + `attention`; new `GET /api/admin/students/:id/timeline?before=`. Note steps are labelled "Learn: …" (was "Case Note: …"). | `analytics/public/index.html` (rewritten), `analytics/lib.mjs`, `server.mjs`, `lib.test.mjs` (+3 tests), `app/scripts/e2e-analytics.mjs` (+3 checks) | 29/29 analytics · `e2e:analytics` OK · screenshots of every tab, the drawer and the phone layout in light and dark on a 60-student demo database, no page errors |
| 2026-11-19 | **Pushed `rework-v5` to `main` (8345bc6), then: log-in WITHOUT a password (pushed with the briefing story).** The user: "No password required. The student should be able to login using their nxtwave ids or mails only." Start screen: **Log in** = one box, "NxtWave ID or email"; an unknown one opens **Sign up** with it filled in; Sign up = name, NxtWave ID, personal email ("Start playing"). A device that played before is welcomed back with the ID filled in (one tap). Server: `auth.mjs` rewritten without passwords - `login({ who })` finds the student by ID or sign-up email (any case; a student from before accounts with a name and email on file counts and becomes an account), `signup` of an ID that already has an account just logs in; tokens and `authorize()` stay (data of an ID with an account still needs a token of that ID, but anyone who types the ID or email gets one - the team's choice). Removed: passwords, forgot-password codes and the mail service, the teacher's reset (dashboard buttons gone; the student panel shows "Signed up"), the per-ID lockout, "Forgot your NxtWave ID?" (the email logs in instead). Kaal's chat answers updated. The old `accounts.pw_hash / pw_salt / temp` and `password_resets` stay in the schema, unused. Kaal's pace: `tools/kaal-voice/pace.py` lengthens only the pauses (110 ms+) in the Chatterbox clips: median 17.6 → 14.7 characters a second, `check.py` 111/114 word for word, 3 close; originals in `../kaal-voice/as-recorded/chatterbox/`. Indian accent NOT done: the Indic Parler-TTS model is gated on Hugging Face (the user has to accept its terms and log in); `generate_parler.py` is ready. | `analytics/auth.mjs`, `auth.test.mjs` (rewritten), `server.mjs`, `public/index.html`; `app/src/adapters/account.ts`, `ui/identity/IdentityGate.tsx` (+ test), `adapters/serverSync.test.ts`, `ui/kaal/chat/brain.ts` (+ test); `app/scripts/smoke-lib.mjs`, `e2e-analytics.mjs`, `local-test.mjs`; `tools/kaal-voice/pace.py` (new), `generate.py` (`--cfg`, `--target`), `README.md`; `content/voice/*` | tsc · 435/435 vitest · 23/23 analytics · `e2e:analytics` OK (sign up, unknown ID → Sign up, history refused without login, log in with the EMAIL on a second device restores progress) · `smoke` NOT run (the user asked to skip it) |
| 2026-11-19 | **The briefing tells the story.** The user asked for "a small story about how Tara Sen is missing … followed by what the game is about in the briefing itself". New card at the top of the briefing (below the hero): **The story** (what is known at 6 PM only: singer from Chandpur, first stadium concert at midnight, 40,000 fans, gone at 6 PM, not in her hotel room, phone off, no CCTV, six hours) and **What this game is about** (the intern at the Data Cell with SI Ira Menon, the city's data, 13 episodes from 6 PM to midnight, every answer a clue, no SQL needed to start). The fact cards stay below as "At a glance". Hotel and stadium are not named (episode 1 does not name them). Pushed together with the password-free log-in. | `app/src/ui/screens/Briefing.tsx`, `ui/design/screens.css` | tsc · 435/435 vitest · no browser check (the user asked to skip them) |
| 2026-11-19 | **Slower Kaal, no email, all episodes open, uptime visible.** (1) "The pace of kaal is still too fast": `tools/kaal-voice/pace.py` now first slows the WORDS with WSOLA (audiotsm 0.1.2, MIT, in the Chatterbox venv; same pitch, never below 0.78 of the recorded speed) and then lengthens the pauses, from the recordings kept in `../kaal-voice/as-recorded/chatterbox/`. Target 12.5 characters a second (~125 words a minute): median 17.6 → 12.8. Five takes blurred when slowed fully: three are slowed less (`--mild`), two keep their words as recorded (`--plain`); `check.py` then 114/114 at 0.85 or better (the five re-checked word for word). (2) "Email is not required for now": Sign up = name + NxtWave ID; Log in = NxtWave ID; the server accepts sign-ups without an email (one given is still checked and kept; a stored one is never wiped), a student from before accounts with only a name on file can log in with the ID; the device stays logged in without an email (`loadIdentity` accepts a token instead). Email log-in is left for a later version (the server still finds a student by a stored email). (3) "Remove the locks from all the episodes": `ALL_EPISODES_OPEN = true` in `engine/progress/derive.ts` (set false to bring the order back); the case map calls the first unsolved episode "Up next" and the others "Open"; Kaal's answers about locks updated. (4) UptimeRobot: `/health` now returns `started_at` and `up_minutes`; a free Render server restarts when it wakes from sleep, so a `started_at` that stays the same for hours shows the keep-alive pings work. | `tools/kaal-voice/pace.py`, `README.md`, `content/voice/*`; `analytics/auth.mjs`, `auth.test.mjs`, `server.mjs`; `app/src/adapters/account.ts`, `identity.ts`, `main.tsx`, `ui/identity/IdentityGate.tsx` (+ test), `adapters/serverSync.test.ts`, `engine/progress/derive.ts`, `ui/screens/Home.tsx`, `ui/kaal/chat/brain.ts` (+ test); `app/scripts/smoke-lib.mjs`, `e2e-analytics.mjs`, `local-test.mjs` | tsc · 436/436 vitest · 24/24 analytics · `e2e:analytics` OK (sign up with name + ID, no email stored, log in with the ID on a second device) · `check.py` 114/114 · no smoke, no browser check (the user asked to skip them) |
| 2026-11-19 | **Kaal's new voice: "Raju", Indian English, via OpenRouter.** The user asked for an Indian accent at a slow pace and chose the ElevenLabs voice "Raju" (`pzxut4zZz4GImZNlqQ3H`) through OpenRouter (ElevenLabs voices are on OpenRouter since 2026-10; a voice-library ID works with only an OpenRouter key). After listening to samples (speeds 0.85 / 0.75 / 0.7, the name spelled "Kahl" / "Kaal", four moods) the user picked: Raju, "0.75 or slower" (0.72 used), "Kaal". New `tools/kaal-voice/generate_openrouter.py` (standard library only; key from `../kaal-voice/openrouter.key` or `$OPENROUTER_API_KEY`, never written elsewhere; model `elevenlabs/eleven-multilingual-v2`; resumable; refuses to mix voices without `--force`; `--respell Kahl=Kaal`). All 114 lines in 1.8 min, 6,156 characters (+ about 1,200 for samples and retakes). Pace: median 12.0 characters a second (~115 words a minute). `check.py` (Whisper base.en): 96 word for word + 12 close; 6 flagged, re-recorded with two other seeds and the clearest take kept: 4 now word for word; 3 left below 0.85, two of them only the American-trained checker hearing the accent ("Ooh" → "Oh", "Case" → "K's"), one "Let's see if that stuck." at 0.80. Pack 8.3 MB (44.1 kHz MP3; was 3 MB). The Chatterbox recordings stay in `../kaal-voice/as-recorded/chatterbox/`; samples in `../kaal-voice/raju-samples/`. The OpenRouter key appeared in the chat once: the user should replace it. | `tools/kaal-voice/generate_openrouter.py` (new), `README.md`, `content/voice/*` | `check.py` as above · no game code changed |
| 2026-11-19 | **A context story for every episode.** The user: "add the per episode context story such that the students are able to get the context of the episode in the briefing before they start playing". Each episode in `ui/episodes.ts` has a new `story` (2-3 sentences: the situation and the question, never the answer - every episode is open, so nothing found later is named). Shown in the briefing's "Tonight, 6 PM to midnight" timeline under each teaser, and on each episode's intro page under the teaser. New test: 13 stories, 2-4 sentences, under 330 characters, no em dashes, none of the spoilers (the culprit, the farm, the SUV, the tower, the booking, "charged", "custody"…). | `app/src/ui/episodes.ts`, `ui/screens/Briefing.tsx`, `ui/screens/SessionIntro.tsx`, `ui/design/screens.css`, `ui/episodes.story.test.ts` (new) | tsc · 437/437 vitest · no browser check |

### Next up (as of 2026-11-12)
1. Kaal's voice: decided to keep browser speech (2026-11-05). Revisit pre-recorded clips only if students find it robotic.
2. Music file is 7.7 MB (256 kbps); re-encode to ~96 kbps (~3 MB) when a tool is available - cuts the upload folder size.
2b. Kaal's corner dock still overlaps the tables panel on small laptops (hit-test lists ~26 spots; pre-existing).
3. Suspect files with suspicion meters — v1.1.
4. **Blocking for the database to be used in the real upload:** deploy the analytics server (needs a host + HTTPS URL + persistent disk), then rebuild with `VITE_ANALYTICS_URL=https://… npm run build:s3`. The committed `missing-influencer-v4/` is built WITHOUT it (no URL yet) - it works, but stores nothing on the server.
4b. Privacy trade-off of "no login": anyone who knows a student's NxtWave ID can load that student's game progress (`GET /api/history/:id`). Accepted for the pilot; add a PIN later if needed. **Closed on `rework-v5` (2026-11-18): accounts with a password; progress needs the student's own login.**
4c. Email sign-in (2026-11-18), before it goes out: run `npm run smoke` and `npm run e2e:analytics` (scripts were edited, not run); deploy the analytics server BEFORE the new game build (an old server ignores the email and has no `/api/recover`). Same trade-off as 4b: anyone who knows a student's email can learn their NxtWave ID and name (`POST /api/recover`). A roster upload with "replace" deletes the students table, so stored emails go with it. Not checked on Render: `clientIp` trusts `X-Forwarded-For` only from a loopback proxy, so behind Render's proxy the per-IP limits (admin login, recover) may count everyone as one address.
5. User review of the look → adjust → final build Thursday morning.
6. `rework-v5` (2026-11-18) is LOCAL ONLY: nothing committed or pushed; the user reviews it on their computer first (`cd app && npm run local-test`). Open with the user: (a) Kaal's custom voice - options given (pre-recorded clips made with Chatterbox are the recommendation; needs a voice sample and a GPU or patience); (b) block pasting into the SQL editor or not; (c) an AI-backed Ask Kaal (needs an API key and a server route) instead of the built-in answers; (d) the day streak shown in the prototype was not built. (e) accounts: emailed "Forgot password" codes need a mail service (`RESEND_API_KEY` + `MAIL_FROM`, untried against the real service) - until then teachers reset passwords on the dashboard; passwords are min 6 characters; deploy the analytics server BEFORE the new game build (an old server has no `/api/account/*` or `POST /api/history`). `scripts/contrast-scan.mjs` was updated for the new labels but not run (it reads solid background colours, and text now sits on gradients). Back / Continue is a band of its own under the step and Kaal stands in that band, so nothing floats over the work any more (this closes item 2b).
