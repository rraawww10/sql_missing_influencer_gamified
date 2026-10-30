# analytics/ — student engagement dashboard

A small server that **collects the game's progress events** and serves an **admin-only dashboard**: who played, how long,
how far each student got, and which beats (steps) they get stuck on. Zero dependencies: Node 22.5+ and one SQLite file.

```
game (S3, in the LMS iframe, ?user_id=STUDENT-ID)
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

## What the dashboard shows

* **Overview** — students who played (vs the roster), active today / 7 days, total and average active time, average progress,
  finished-all-13, inactive 7+ days; daily activity (30 days), episode funnel (started vs completed), where students are now,
  progress distribution, hour-of-day, and a per-episode table (completion, avg / median time vs planned minutes, SQL accuracy, hints, traps).
* **Students** — search, filter (active / inactive / finished / not started), sort; name, batch, current level, progress %,
  episodes done, time played, active days, SQL accuracy, hints, last active. Click a student for episode-by-episode progress,
  **time on every beat**, daily minutes, and their recent actions including the SQL they ran.
* **Episodes & beats** — every beat of an episode: % of students who completed it, average time on it, SQL runs, hints, traps,
  and **how many unfinished students stopped there** (highlighted = stuck point).
* **Roster** — upload a CSV `student_id,name,batch` so names and batches appear, and see who **never started**.
* Batch filter and **Export CSV** on every view. Guests (opened without `?user_id=`) are hidden unless "Include guests" is ticked.

## How the numbers are defined

* **Beat** — one step of an episode (chat scene, Case Note, activity, SQL task, quick check, clue). 286 beats in 13 episodes.
* **Progress %** — distinct beats completed ÷ all beats. A completed beat stays counted if the student later resets the episode.
* **Active time** — the game counts time only while its tab is visible **and** the student tapped, typed or scrolled in the last
  60 s; reported every 30 s and when the tab is hidden or closed. Each heartbeat is charged to the beat the student was on.
* **Current level** — the furthest episode opened, and whether it was solved.

## Privacy and safety

* The student id comes from the platform (`?user_id=`); names live only in the roster you upload to this server.
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
