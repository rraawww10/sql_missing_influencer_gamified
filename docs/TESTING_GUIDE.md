# Testing Guide - game, database and dashboard (local, with sample data)

Everything runs on **your own computer**: no AWS, no internet server needed. One command starts the database server,
the dashboard and two versions of the game, all connected to **one test database** that is pre-filled with sample data.

---

## 0. One-time setup

You need **Node.js 23.4 or newer** (`node -v`; 24 is what this was built on) and Google Chrome.
On Node 22 the local server will not start - it uses the built-in `node:sqlite`, which is still flag-gated there.

```bash
cd sql_missing_influencer_gamified/app
npm install
```

(The `analytics/` server has no packages to install.)

---

## 1. Start everything (one command)

```bash
cd sql_missing_influencer_gamified/app
npm run local-test
```

Wait about one minute, until it prints **READY**. Leave this terminal open; **Ctrl+C** stops everything.

| What | Address | Notes |
|---|---|---|
| **Dashboard** (admin) | http://localhost:8787 | password **`test`** |
| **Game: case map** (all 13 episodes on one page) | http://localhost:5180 | quickest for testing |
| **Game: exactly as on S3** (one site per episode) | http://localhost:5181/intro/index.html | episodes: `/s01/index.html` … `/s13/index.html` |
| **Database file** | `analytics/data/test.sqlite` | a fresh copy is made on every start |

* `npm run local-test` = fresh sample data every time (anything you recorded is wiped).
* `npm run local-test -- --keep` = keep what you recorded last time.

---

## 2. The sample data

### 2.1 Test students (sign in with these on the game's start screen)

These histories were produced by the **real game engine** (real SQL, real points, real clues), so the game
loads them exactly as if the student had played. The NxtWave ID can be typed in small or capital letters.

| NxtWave ID | Name | What is already stored | What you should see when you sign in |
|---|---|---|---|
| `NWTEST01` | Riya Kapoor | Registered, never played | "Welcome back, Riya! Good to see you again." 0/13 solved |
| `NWTEST02` | Arjun Mehta | Saw the briefing; episode 1 stopped at step 7 | Episode 1 → **Continue where I left off** → step 7 |
| `NWTEST03` | Sana Qureshi | Episodes 1-3 solved (345 pts, 3 clues), a trap, wrong queries, 1 hint; episode 4 unfinished at step 15; feedback for ep 1-3; chapter check-ins | "Welcome back, Sana! Your case file is restored." 3/13; Episode 4 continues at step 15; feedback not asked again for ep 1-3 |
| `NWTEST04` | Vikram Rao | Struggling: many wrong queries and hints, low ratings, "too hard", felt "lost" in check-ins; episode 3 unfinished at step 10; **inactive ~11 days** | 2/13; on the dashboard shows as **Inactive** with red/hot rows |
| `NWTEST05` | Meera Iyer | All 13 episodes solved, rank **Inspector**, 19 clues, feedback for every episode | 13/13, full Evidence Board, Inspector rank |
| `NWTEST06` | Kabir Singh | Solved episode 2, **reset it**, replayed it | 2/13; dashboard shows "reset 1×" on episode 2 |
| *anything new*, e.g. `NWNEW001` | any name | nothing | a brand-new student |

### 2.2 Random students (to fill the dashboard)
60 invented students, IDs `NW100001` … `NW100060`, with progress, time, mistakes, hints, episode feedback and chapter
check-ins spread over the last ~3 weeks. Some are registered but never played ("not started"). Some are on a roster
with a batch (`Beta-A`, `Beta-B`, `Batch-1`), the rest only typed their name.

### 2.3 Sample roster file
`analytics/test-data/sample_roster.csv` - upload it on the dashboard's **Roster** tab to test batches and the
"never started" list. It contains the test students, three new IDs (`NWNEW001-003`) and one student who never opens
the game (`NWROSTER9`).

### 2.4 SQL answers, wrong queries and traps
* **Correct answers for every step:** `docs/ANSWER_KEY.md`.
* **A wrong query** (any task): `SELECT 1;` → "not quite", counted as a wrong attempt.
* **A broken query:** `SELEC * FROM gate_log;` → an error message, counted as an attempt.
* **A trap** (episode 3 "Hotel Gate Log", step 18, task T3.8):
  `SELECT * FROM gate_log WHERE vehicle_colour = 'Grey' AND gate = 'SERVICE' OR gate = 'STAFF';`
  → a story reply about AND/OR precedence; recorded as `trap_hit`.
  Correct one: `SELECT * FROM gate_log WHERE vehicle_colour = 'Grey' AND (gate = 'SERVICE' OR gate = 'STAFF');`

### 2.5 Sample feedback to type
* Chapter check-in suggestion: `The table names confused me, show an example first`
* Episode comment: `Loved Kaal! The JOIN part was hard, please add one more practice query`

---

## 3. Looking inside the database

At any moment, in a second terminal:

```bash
cd sql_missing_influencer_gamified/analytics
node --no-warnings inspect.mjs --db data/test.sqlite              # every table: counts + latest rows
node --no-warnings inspect.mjs NWNEW001 --db data/test.sqlite     # one student: everything stored for them
```

What each table holds:

| Table | One row per… | Filled when |
|---|---|---|
| `students` | student (NxtWave ID) - typed name, roster name, batch, registered at, last sign-in, number of sign-ins | the student presses **Open the case file** (or a roster upload) |
| `events` | thing the student did: step viewed, SQL run (with the SQL text and result), task passed, hint, trap, activity, check, clue pinned, episode started/solved/reset, and **heartbeats** (active seconds) | continuously while playing |
| `feedback` | student per episode (stars, mood, difficulty, liked, comment) | the card on the "Solved" screen |
| `checkpoint_feedback` | student per chapter (1 lost / 2 okay / 3 good / 4 great + suggestion) | the strip after each chapter |
| `sittings` | student per unfinished episode (their exact position) | while playing, a few seconds after each change |

---

## 4. Test checklist, stage by stage

Tip: for each stage, keep the dashboard open in one tab and press **Refresh** there after acting in the game.
Most numbers appear within a few seconds; **time spent** appears in 30-second steps (see stage E).

### Stage A - Start screen (name + NxtWave ID)
Open http://localhost:5180 in a **new incognito window**.
1. Press **Open the case file →** with both boxes empty → both red messages appear.
2. Type name `A` → still refused (min 2 letters). Type `<b>` → refused (letters only).
3. Type ID `ab` → refused (min 3). Type `nw new 1` → refused (no spaces).
4. Type name `Tester One`, ID `nwnew001` → the game opens.
5. Top bar shows **👤 Tester · NWNEW001 · Not you?** (the ID is stored in capitals).

✅ In the DB: `inspect.mjs NWNEW001` → `students` row with `entered_name = Tester One`, `logins = 1`.
✅ Dashboard → Students → filter **Registered / on roster, not started** → Tester One is listed.

### Stage B - Name used in the game
1. Read the briefing (**Read the briefing**): "Welcome, **Tester**", "**Tester**, you are the new intern…", the
   cast shows **Tester One** with initials **TO**, "Ready, **Tester**?".
2. Play episode 1 "She's Gone": step 2 says "Welcome to the City Police Data Cell, **Tester**."
3. Inspector Kaal's lines say "**Tester**" instead of "partner" (also spoken, if the voice is on).

### Stage C - Playing and how it is recorded
Play episode 1 to the end (answers: `docs/ANSWER_KEY.md`). On purpose, get one activity wrong once.
1. After the clue at **step 16** and pressing Continue → a **"How was chapter 1?"** strip appears. Pick 🙂 Good,
   type a suggestion, **Send** → "Thanks, Tester! Noted for the team."
2. Finish the episode → **Solved** screen → the feedback card: 4 stars, "Fun", "Just right", tick "The story",
   type a comment, **Send feedback** → "Noted, Tester. Thank you!"
3. Start episode 3 "Hotel Gate Log": run `SELECT 1;` once (wrong), open hint envelope 1, then the correct answer.
   At step 18 run the **trap** query from 2.4 first, then the correct one.

✅ `inspect.mjs NWNEW001` shows: `beat_viewed`, `activity_done`, `check_answered`, `clue_pinned`,
`session_completed`, `task_attempted` (with the SQL you typed and `wrong` / `trap` / `pass`), `hint_used`,
`trap_hit`, the episode feedback row and the chapter check-in row.
✅ Dashboard → Students → click **Tester One**: progress %, episodes solved 1/13, SQL correct %, hints/traps,
episode 1 "Solved" with points, **Recent activity** lists your SQL; **Feedback from this student** lists both.

### Stage D - Unfinished episode carries over to "another device"
1. In episode 3, stop in the middle (e.g. at step 9). Wait **5 seconds**. Note the step number.
2. Open a **second, different incognito/private window** (or another browser): http://localhost:5180
3. Sign in with the **same ID** (`NWNEW001`, any case) and the name.
   → "Welcome back, Tester! Your case file is restored." Episode 1 shows as solved.
4. Open episode 3 → **Continue where I left off** → the **same step**. Evidence Board shows your clue.
5. Episode 1's **Solved** screen does **not** ask for feedback again.

✅ Dashboard → the student's page: **"entered their ID 2×"**.
✅ `inspect.mjs NWNEW001` → `sittings` shows `s3` at the step you left.

### Stage E - Time spent (per episode, chapter and step)
How it works: time counts only while the game tab is **visible** and the student did something (click, type,
scroll) in the **last 60 seconds**. It is sent every **30 seconds** of active time, and when the tab is hidden or closed.
1. Play actively for ~2 minutes. Then leave the tab untouched for 3 minutes (idle - should **not** count).
2. Switch to another tab (the partial time is sent).
3. Dashboard → student → **Active play time** grew by ~2 minutes, not 5.
4. Open the episode → **Time per chapter (stage)** and the per-step **Time on it** column.

✅ `inspect.mjs NWNEW001` → "time per episode" table; `heartbeat` rows with `seconds`.

### Stage F - Returning test students (pre-loaded history)
In a new incognito window each, sign in as the test students in 2.1 and check the "What you should see" column.
Best one: **`NWTEST03` Sana Qureshi** → 3/13, Evidence Board with 3 clues, episode 4 continues at step 15.

### Stage G - Reset an episode
Sign in as `NWNEW001`, open the solved episode 1 → **↺ Reset** → confirm → it is no longer solved, its clue leaves
the board. Dashboard → student → episode 1 shows **reset 1×**. (Compare with test student `NWTEST06`.)

### Stage H - Feedback when the internet drops
1. In the `npm run local-test` terminal press **Ctrl+C** (server stops = "offline").
2. In the game finish a chapter and send the check-in (the game does not complain).
3. Start again with `npm run local-test -- --keep`, reload the game page.
4. The check-in now appears on the dashboard (it waited in the game's queue and was sent later).

### Stage I - Switch student on a shared computer
Top bar → **Not you?** → confirm → the start screen appears again. Sign in as another ID: you see that student's
progress, not the previous one's.

### Stage J - The dashboard, tab by tab
Sign in at http://localhost:8787 (password `test`).

| Tab | What to check |
|---|---|
| **Overview** | totals (students, active today/7 days, hours, average progress), daily activity, episode funnel, where students are now, per-episode table |
| **Students** | search `NWTEST`; filters Active / Inactive (Vikram Rao) / Finished all 13 (Meera Iyer) / Registered-not-started (Riya Kapoor); click a row → the student page; sort by columns |
| **Episodes & beats** | pick episode 2 → every step with % completed, average time, SQL runs, hints, traps, "stopped here" (stuck points in red) |
| **Feedback** | average rating, charts, per-episode table (red = low rating or "too hard"), **Chapter check-ins** table (red = felt lost), **Suggestions from check-ins**, all responses; filters; **Export feedback CSV** |
| **Roster** | upload `analytics/test-data/sample_roster.csv` → batch "Test-Batch" / "Pilot-A" appear in the batch filter; `NWROSTER9` appears under "not started" |
| Header | batch filter, **Include guests**, **Export CSV** (students), "N playing now" (whoever played in the last 5 min) |

### Stage K - The S3 version (what students will really use)
Repeat stages A-D at http://localhost:5181/intro/index.html and http://localhost:5181/s01/index.html.
It is a different web address than the case map, so it asks for name + ID again (same as a new device);
with the same ID the history comes back.

---

## 5. Automated checks (optional)

| Command (in `app/`) | What it proves |
|---|---|
| `npm test` | 125 unit tests: game engine, grading, progress, identity, sync, restore |
| `npm run e2e:analytics` | real server + real Chrome: student plays → dashboard API shows everything → same ID on a fresh browser gets it all back |
| `npm run build && npm run smoke` | plays episodes 1-3 in Chrome incl. the start screen |
| `npm run build:s3 && cd .. && DEPLOY_DIR=missing-influencer-v4 node app/scripts/smoke-deploy.mjs sessions` | all 13 episodes in an LMS-style iframe |
| `cd ../analytics && npm test` | 10 server/database tests |
| `npm run make:test-students` | re-creates the test students (only needed if the episodes change) |

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| "port already in use" | an old run is still going: close that terminal, or `pkill -f local-test` |
| Game asks for the name again in another window | expected: each browser window type / address has its own storage. Same ID = same student |
| Dashboard numbers did not change | press **Refresh** on the dashboard (numbers are cached for up to 20 s); time arrives in 30-second steps |
| Nothing at all reaches the dashboard | make sure you use the addresses from section 1 (those builds point at the local server) |
| Want a clean start | stop and run `npm run local-test` again (without `--keep`) |
