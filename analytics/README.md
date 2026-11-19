# analytics/ — student engagement dashboard

A small server that **collects the game's progress events** and serves an **admin-only dashboard**: who played, how long,
how far each student got, and which beats (steps) they get stuck on. Zero dependencies: **Node 23.4+** (it uses the
built-in `node:sqlite`, which is still behind `--experimental-sqlite` on Node 22) and one SQLite file.

**Putting it on a real server for students:** `hosting/README.md` - AWS stage by stage, HTTPS, auto-restart, daily backups.

```
game (S3, in the LMS iframe; the student types name + NxtWave ID on the start screen, ?user_id= only prefills the ID)
   │  POST /api/events   every progress event + a heartbeat per 30 s of active play
   ▼
analytics server (server.mjs)  ── data/analytics.sqlite
   │
   ▼
admin dashboard  http://<server>/   (password-protected)
```

## Try it now with made-up data

```bash
cd analytics
npm run demo          # 80 invented students in data/demo.sqlite → http://localhost:8787, password: demo
npm test
```

## Run it for real

```bash
cd analytics
ADMIN_PASSWORD='<a long password>' npm start      # http://localhost:8787
```

| Env | Default | |
|---|---|---|
| `ADMIN_PASSWORD` | — (required) | the dashboard password |
| `PORT` | `8787` | |
| `DB_PATH` | `data/analytics.sqlite` | **put this on a persistent disk and back it up** |
| `SESSION_SECRET` | random per start | set it so admin logins survive a restart |
| `RESEND_API_KEY`, `MAIL_FROM` | — | optional: switches the "Forgot password" email on ([resend.com](https://resend.com); `MAIL_FROM` must be an address on a domain verified there). Without them teachers reset passwords from the dashboard |
| `TZ_OFFSET` | `+05:30` | what "today" and the hour-of-day chart mean |

Host it anywhere that runs Node with a persistent disk (a small VM, Render/Railway with a volume, an EC2 instance) behind
**HTTPS** (the game is served over HTTPS, so the browser refuses to send events to plain `http://`). 400 students produce
roughly 1–2 million rows over a course run; SQLite handles that comfortably on the smallest instance.

Then **build the game pointed at it** and upload as usual:

```bash
cd app
VITE_ANALYTICS_URL=https://analytics.example.com npm run build:s3
```

Without `VITE_ANALYTICS_URL` the game behaves exactly as before (nothing is sent).

## Students: accounts with a password (v8)

The game opens with a start screen: **Sign up** (name, NxtWave ID, personal email, password twice) or **Log in**
(NxtWave ID + password). The NxtWave ID is the student's key everywhere: every event is sent as `user_id: "lms:<ID>"` and
stored under `student_id = <ID>` (upper-cased, so `nw123` and `NW123` are the same student). The name replaces "intern" in
the story and in Kaal's lines. The email is required: "Forgot password" codes go to it and "Forgot your NxtWave ID?" looks it up.

**What protects a student** (`auth.mjs`, tests in `auth.test.mjs`):
- The password is stored as a salted **scrypt** hash (`accounts.pw_hash`, `pw_salt`), never as text. At least 6 characters.
- Logging in gives the game a random **session token** (the server keeps only its SHA-256, in `student_sessions`). The game
  sends it with everything. Once an ID has an account, its history, events, feedback, check-ins, saved place and
  name / email can be read or changed **only with that student's own token**: every such route answers
  `401 {error: "login required"}` otherwise.
- An ID that already has an account cannot be signed up again (`409 taken`).
- **8 wrong passwords** for an ID in 15 minutes lock that ID (429), so a classmate cannot guess their way in.
- Accounts live in their own table, so a roster upload with "replace" does not remove them.

| Endpoint (public, CORS open) | |
|---|---|
| `POST /api/account/signup` `{student_id, name, email, password}` | creates the account and logs in: `{ok, student_id, name, email, token, returning}`. `409 taken` when the ID has an account; `409 email mismatch` when the ID was used before accounts with a different email on file |
| `POST /api/account/login` `{student_id, password}` | `{ok, …, token}` · `401 wrong` · `404 no account` · `428 new password needed` (a temporary password: send it again with `new_password`) · `429 too many` |
| `POST /api/account/logout` `{token}` | ends that device's session |
| `POST /api/account/forgot` `{student_id}` | emails a 6-digit code to the account's email: `{sent: true, to: "p****@gmail.com"}`. Needs `RESEND_API_KEY` + `MAIL_FROM`; without them `{sent: false, reason: "no-mail"}` and the game says "ask your teacher". 3 per ID per 15 minutes |
| `POST /api/account/reset` `{student_id, code, password}` | sets the new password (code lives 15 minutes, 5 tries), ends every old session, logs in |
| `POST /api/history` `{student_id, token}` | the student's events (heartbeats excluded, stored exactly as sent in `events.raw`), the episodes they already gave feedback on, their chapter check-ins and unfinished sittings - the game loads these into the device, so solved episodes, points, clues, the episode in progress (same step) and feedback state carry over |
| `POST /api/events` `{events, token}` · `/api/feedback` · `/api/checkpoint` · `/api/sitting` (`…, token`) | what the game records; refused with 401 for an ID with an account unless the token is that student's |
| `POST /api/recover` `{email}` | "Forgot your NxtWave ID?": `{found: true, student_id, name}` for the student seen most recently with that email, else `{found: false}`. The game shows the ID; the student still needs their password. 30 lookups per IP per 15 minutes, then 429 |
| `POST /api/identify`, `GET /api/history/:id` | for an ID that has **no account** (a game build without accounts, old data); refused with 401 once the ID has one |

**When a student forgets the password.** With a mail service set up, they tap "Forgot password?" and get a code by email.
Without one (the default), the teacher opens the student on the dashboard and presses **Reset password**
(`POST /api/admin/students/:id/reset-password`): it shows a temporary password to pass on. The student logs in with it
once and the game makes them choose their own. Every other device of that student is logged out.

**Old data.** A student who played before accounts (progress under an ID, no password) signs up with the same ID to
take the account over. If that ID has an email on file, the sign-up must give the same email; if it has none, the
first sign-up gets it (ask those students to sign up early, or use Reset password to hand them the account).

**Still open to anyone:** `/api/recover` tells whoever knows a student's email that student's ID and name (not their
progress). Nothing else is reachable without the password or the dashboard login.

A roster name (CSV upload) takes precedence over the typed name on the dashboard; registered students who have not played
a step yet appear under "not started".

**Check the whole chain:** `cd app && npm run e2e:analytics` starts this server on a throw-away database, builds the game
pointed at it, plays as one student on "device A" (start screen, episode 1, feedback, chapter check-in, leaves mid-episode
2), checks every number through the admin API, then signs in as the same student on a fresh "device B" and checks the
history came back (episode solved, no second feedback ask, episode 2 continues at the same step).

## Feedback (v4)

Two kinds, both in the `Feedback` tab, in the CSV export and on each student's page: the quick **chapter check-in** after
every chapter (😕 lost · 😐 okay · 🙂 good · 🤩 great + an optional suggestion → `checkpoint_feedback` table, one row per student
per chapter), and the episode card: the game's solved screen asks for a 1–5 star rating, a mood, "the SQL was too easy / just right / too hard", what they liked,
and an optional comment → `POST /api/feedback` (one row per student per episode; a resend replaces it). The dashboard's
**Feedback** tab shows the average rating, rating / mood / difficulty / "liked" charts, a per-episode table (red rows = rating
under 3.5 or a third saying "too hard"), every response with search and filters, and **Export feedback CSV**.
The header also shows **"N playing now"** (any event in the last 5 minutes; refreshes every 30 s).

## Scale (measured 2026-11-02, for ~500 students)

* `npm run demo` seeds 80 students; `node --no-warnings seed-demo.mjs 500` seeds 500 (~400k events).
* `node --no-warnings bench.mjs` times every admin query on that database. At 500 students / 250k events the overview went from
  **2 980 ms → 429 ms** (the "median time to finish" used a correlated `EXISTS`; now computed in JS) — others ≤ 140 ms.
  Overview and students responses are also cached for 20 s on the server, so many admins refreshing cost one computation.
* `node loadtest.mjs <url> 500 6` — 500 students posting at the same instant, 6 rounds: **3 000 requests / 24 000 events in
  2.8 s, 0 failures, p95 381 ms**, plus 500 feedback posts. Real traffic is spread over 30 s heartbeats, so this is the worst case.
* Don't rate-limit `/api/events` per IP: a whole campus can sit behind one NAT address.

## What the dashboard shows

* **Overview** — students who played (vs the roster), active today / 7 days, total and average active time, average progress,
  finished-all-13, inactive 7+ days; daily activity (30 days), episode funnel (started vs completed), where students are now,
  progress distribution, hour-of-day, and a per-episode table (completion, avg / median time vs planned minutes, SQL accuracy, hints, traps).
* **Students** — search, filter (active / inactive / finished / not started), sort; name, batch, current level, progress %,
  episodes done, time played, active days, SQL accuracy, hints, last active. Click a student for episode-by-episode progress,
  **time on every chapter (stage) and every beat**, their feedback and check-ins, daily minutes, and their recent actions including the SQL they ran.
* **Episodes & beats** — every beat of an episode: % of students who completed it, average time on it, SQL runs, hints, traps,
  and **how many unfinished students stopped there** (highlighted = stuck point).
* **Roster** — upload a CSV `student_id,name,batch` so names and batches appear, and see who **never started**.
* Batch filter and **Export CSV** on every view. Guests (older builds opened without an ID) are hidden unless "Include guests" is ticked.

## How the numbers are defined

* **Beat** — one step of an episode (chat scene, Case Note, activity, SQL task, quick check, clue). 286 beats in 13 episodes.
* **Progress %** — distinct beats completed ÷ all beats. A completed beat stays counted if the student later resets the episode.
* **Active time** — the game counts time only while its tab is visible **and** the student tapped, typed or scrolled in the last
  60 s; reported every 30 s and when the tab is hidden or closed. Each heartbeat is charged to the beat the student was on.
* **Current level** — the furthest episode opened, and whether it was solved.

## Privacy and safety

* The student id is the NxtWave ID the student types on the start screen; the name they type is stored with it (`students.entered_name`). A roster upload can add batches and override names.
* `/api/events` is public by necessity (the game posts to it), validates every event, ignores duplicates and caps sizes.
  Everything under `/api/admin` needs the admin cookie (HttpOnly, SameSite=Strict, 12 h); 10 wrong passwords per 15 min locks the IP out.
* Student SQL is stored as text and always HTML-escaped on the dashboard; the CSV export neutralises spreadsheet formulas.

## Files

| File | |
|---|---|
| `server.mjs` | HTTP routes, admin login |
| `lib.mjs` | database schema, event ingestion, every dashboard number (with definitions) |
| `public/index.html` | the dashboard (one page, no build step) |
| `seed-demo.mjs` | invented demo data → `data/demo.sqlite` (never the real db) |
| `lib.test.mjs` | tests (`npm test`) |
| Game side | `app/src/adapters/remoteSync.ts` (outbox + heartbeat), wired in `app/src/main.tsx` |
