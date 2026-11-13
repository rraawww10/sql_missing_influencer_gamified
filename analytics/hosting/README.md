# Putting the analytics server on AWS

Everything needed to take the game from "plays, but saves nothing" to "500 students, one database, live dashboard".
Follow the stages in order. Total time: about an hour, most of it waiting.

> **What this gives you:** every student's progress, time on each chapter and step, chapter check-ins and
> episode feedback, all in one database, on a password-protected dashboard - and students can continue on any
> computer with their NxtWave ID. Background and the manager email: `docs/understanding_server.md`.

```
   S3 (hands out the game)                      This server (collects and keeps)
 ┌────────────────────────┐   downloads   ┌───────────────────────────────────────┐
 │ missing-influencer-v4/ │ ────────────► │  Caddy (https)  →  node server.mjs    │
 └────────────────────────┘   students'   │                     ↓                 │
                               browsers ─►│      /var/lib/tmi/analytics.sqlite    │
                               send data  │       ↓                     ↓         │
                                          │  history back          dashboard      │
                                          │  to the game           for you        │
                                          └───────────────────────────────────────┘
```

## Before you start

| You need | Notes |
|---|---|
| An AWS account | The company account is best. A new personal one works but see **Stage 9** about the clock on it. |
| The episode packs built | `node pipeline/build_sessions.mjs` - the server reads `content/sessions/s01..s13.json` at boot |
| A hostname | A company subdomain (`game-analytics.<company>.com`) or a free DuckDNS one - Stage 2 |
| 30 minutes of patience | Stage 1 and Stage 6 are the slow parts |

---

## Stage 1 - Create the server (10 min)

**AWS Lightsail** is the easy path: fixed price, static IP included, a firewall you can see, and a browser
terminal so you never fight with SSH keys on Windows.

1. AWS console → search **Lightsail** → **Create instance**.
2. **Region:** Mumbai (`ap-south-1`). Closest to the students.
3. **Platform:** Linux/Unix → **Blueprint:** OS Only → **Ubuntu 24.04 LTS**.
4. **Plan:** the **$5/month** one (1 GB RAM, 2 vCPU, 40 GB SSD, 2 TB transfer). The server uses ~200 MB
   of RAM and under 1 GB of disk for a whole course run, so this is already generous.
5. Name it `tmi-analytics` → **Create instance**. Wait until it says *Running*.
6. Open the instance → **Networking** tab:
   - **Attach a static IP** (free while attached). Write it down - this is the address your hostname points at.
   - Under **IPv4 Firewall**, add two rules: **HTTP (80)** and **HTTPS (443)**, both from *Any IPv4 address*.
     Port 22 is already there.

<details>
<summary>Using EC2 instead?</summary>

`t3.micro`, Ubuntu 24.04 AMI, 20 GB gp3 volume, Mumbai. Attach an **Elastic IP**. Security group inbound:
22, 80, 443 from `0.0.0.0/0`. Default user is `ubuntu`. Everything from Stage 2 onward is identical.
EC2 also lets you attach an **IAM role** with S3 write access, which makes the off-box backup in Stage 8 a
one-line change instead of managing access keys.
</details>

---

## Stage 2 - Give it a hostname (5 min)

HTTPS needs a name, not an IP. Two options - pick one.

**A. Company subdomain (preferred).** Ask whoever runs DNS for an **A record**:
`game-analytics.<company>.com → <your static IP>`. Professional, and it survives a server rebuild.

**B. DuckDNS (free, instant, no approvals).** Go to <https://www.duckdns.org>, sign in with Google,
claim a subdomain such as `nxtwave-tmi`, and put your static IP in the box. You now own
`nxtwave-tmi.duckdns.org`. Perfectly fine for a pilot; swap to option A later by re-running Stage 4
with the new name.

Check it points at the right place before continuing - a wrong record is the #1 reason Stage 4 fails:

```bash
nslookup nxtwave-tmi.duckdns.org     # must print your static IP
```

---

## Stage 3 - Put the code on the server (5 min)

Open a terminal: Lightsail instance page → **Connect using SSH** (the browser button). No key needed.

**If the GitHub repo is public:**

```bash
sudo mkdir -p /opt/tmi && sudo chown $USER /opt/tmi
git clone --depth 1 https://github.com/rraawww10/sql_missing_influencer_gamified.git ~/tmi-src
cp -r ~/tmi-src/analytics /opt/tmi/analytics
mkdir -p /opt/tmi/content && cp -r ~/tmi-src/content/sessions /opt/tmi/content/sessions
ls /opt/tmi/content/sessions | wc -l      # must print 13 (+1 if coverage.json is there)
```

**If it is private**, skip the clone and run this from your Windows machine instead (needs the `.pem`
key from Lightsail → Account → SSH keys):

```powershell
cd D:\missing_influencer\sql-missing-influencer\sql_missing_influencer_gamified\analytics\hosting
.\push.ps1 -Server <static-ip> -KeyFile C:\Users\Hp\Downloads\LightsailDefaultKey.pem
```

---

## Stage 4 - Run the setup script (10 min, mostly automatic)

Back in the server terminal:

```bash
sudo bash /opt/tmi/analytics/hosting/setup.sh nxtwave-tmi.duckdns.org
```

(Use your own hostname. Add a second argument to choose the dashboard password; leave it out and a strong
one is generated and printed **once** - copy it immediately.)

It installs Node 24, Caddy, sqlite3, the systemd service, the firewall rules and the daily backup, then
starts everything. The HTTPS certificate is fetched automatically in the last few seconds.

> **Why Node 24 and not 22:** the server keeps everything in Node's *built-in* SQLite (it has no npm
> dependencies at all). On Node 22 that module is still behind `--experimental-sqlite`, so the service
> would refuse to boot. 24 is also the version the game was developed and tested on.

**Save the three lines it prints at the end** (dashboard URL, password, database path).

---

## Stage 5 - Check the server before touching the game (2 min)

```bash
curl -s https://nxtwave-tmi.duckdns.org/health                 # {"ok":true}
curl -s -X POST https://nxtwave-tmi.duckdns.org/api/identify \
     -H 'content-type: text/plain' \
     -d '{"student_id":"NWSETUP01","name":"Setup Check"}'      # {"ok":true,...,"returning":false}
curl -s https://nxtwave-tmi.duckdns.org/api/history/NWSETUP01  # {"student_id":"NWSETUP01",...}
```

Then open `https://<your hostname>` in a browser and log in with the password. An empty dashboard is the
correct result at this point.

If anything fails: `sudo journalctl -u tmi-analytics -n 50` and `sudo journalctl -u caddy -n 30`.
See **Troubleshooting** at the bottom.

---

## Stage 6 - Rebuild the game with the server's address (15 min)

The address is compiled into the game, so the build must be redone and the whole folder re-uploaded.
On your Windows machine:

```powershell
cd D:\missing_influencer\sql-missing-influencer\sql_missing_influencer_gamified\app
$env:VITE_ANALYTICS_URL = "https://nxtwave-tmi.duckdns.org"
npm run build:s3
```

The build prints `analytics: ON → https://…`. **If it prints the "analytics: OFF" warning instead, stop** -
the variable did not reach the build and the upload would store nothing (this is exactly how today's
committed build ended up empty).

Then upload **the whole `missing-influencer-v4/` folder** to S3 as one tree, replacing what is there.
Asset filenames change on every build, so never upload only the changed files. Keep `.wasm` served as
`application/wasm`.

Finally commit the rebuilt folder so the repo matches what students have:

```powershell
cd ..
git add missing-influencer-v4 analytics
git commit -m "Point the game at the analytics server and add the AWS hosting kit"
```

---

## Stage 7 - Prove the whole chain works (10 min)

Do this as a real student would, from the S3 URL, **before** sending it to anyone:

1. Open an episode in a fresh incognito window. Sign in as `NWCHECK01` / your name.
2. Play two or three steps, run one SQL task, finish a chapter and send the check-in.
3. Dashboard → **Students** → `NWCHECK01` appears with progress, time and the check-in.
4. Open a **different** browser, same ID → "Welcome back… your case file is restored", and the episode
   continues at the same step. That proves identify + history + sittings all work over HTTPS.
5. On the server: `sudo sqlite3 /var/lib/tmi/analytics.sqlite "SELECT COUNT(*) FROM events;"` - non-zero.

There is also an automated version of this chain that runs a real server and real Chrome locally:
`cd app && npm run e2e:analytics`.

Then delete the two test students if you want a clean start:

```bash
sudo sqlite3 /var/lib/tmi/analytics.sqlite \
  "DELETE FROM events WHERE student_id IN ('NWSETUP01','NWCHECK01');
   DELETE FROM students WHERE student_id IN ('NWSETUP01','NWCHECK01');"
```

---

## Stage 8 - Day to day

| Task | Command |
|---|---|
| Watch what's happening | `sudo journalctl -u tmi-analytics -f` |
| Restart | `sudo systemctl restart tmi-analytics` |
| Is it up? | `systemctl is-active tmi-analytics` and `curl -s https://<host>/health` |
| Back up now | `sudo tmi-backup` |
| What's stored, per table / per student | `cd /opt/tmi/analytics && node --no-warnings inspect.mjs --db /var/lib/tmi/analytics.sqlite` |
| Change the password | edit `/etc/tmi-analytics.env`, then restart |
| Update the code later | re-run Stage 3, then `sudo systemctl restart tmi-analytics` |

**Backups** run daily at 02:30 IST into `/var/backups/tmi`, 14 days kept. They are on the same disk as the
database, which protects you from a bad deploy but **not** from losing the instance. Add the off-box copy -
set `BACKUP_S3_URI=s3://<your-bucket>/tmi-backups` in `/etc/tmi-analytics.env` (EC2 with an IAM role, or
`aws configure` an IAM user limited to `PutObject` on that prefix). Restore instructions are at the bottom
of `backup.sh`.

**Roster:** upload `student_id,name,batch` CSV on the dashboard's Roster tab so real names and batches show
up and you can see who never started.

---

## Stage 9 - The clock on a new AWS account (read this once)

A **new** AWS account today gets a credit-based free plan (roughly $100 on signup plus up to $100 more for
setup activities, valid about six months) rather than the old 12-month always-free EC2. The $5/month
Lightsail instance is drawn from those credits.

So: **put a reminder in your calendar for five months from launch.** Before the window closes, either

- move the instance to the company AWS account (take a Lightsail snapshot, restore it there - the database
  is one file, so even a manual copy is quick), or
- get the ~₹450/month approved on the company card using the email in `docs/understanding_server.md`, or
- migrate to Oracle Cloud's Always Free tier, which has no expiry. This kit works there unchanged; only
  Stage 1 differs.

Whatever happens, **the daily backup is what makes any of those a non-event.** Keep the off-box copy on.

---

## Known limits (accepted for the pilot)

- **`GET /api/history/:id` is public.** Anyone who knows a student's NxtWave ID can read that student's game
  progress. That is the price of "no password" and was accepted. Nothing else is reachable without the admin
  cookie. If it ever matters, the fix is a short PIN on the start screen.
- **The dashboard is one password, shared.** It is HttpOnly, SameSite=Strict, 12 hours, and ten wrong
  guesses lock that IP out for 15 minutes.
- **Student SQL is stored as text** and always HTML-escaped on the dashboard; CSV exports neutralise
  spreadsheet formulas.
- **A brief outage loses nothing.** The game queues events, feedback and check-ins in the browser and
  retries, so a restart or a few minutes down is invisible to students.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Certificate never issues; Caddy log says challenge failed | DNS doesn't point at this machine yet, or port 80 is closed in the **Lightsail console firewall** (separate from `ufw`). Fix both, then `sudo systemctl restart caddy`. |
| `curl https://… /health` works but the game stores nothing | The game was built without the address. Re-do Stage 6 and watch for `analytics: ON`. |
| Browser console: *blocked mixed content* | The game is calling `http://`. `VITE_ANALYTICS_URL` must start with `https://`. |
| Service won't start, log says `No such built-in module: node:sqlite` | Node is older than 24 (on 22 that module needs a flag). `node -v`, then re-run `setup.sh`. |
| Service starts then exits immediately | Usually `ADMIN_PASSWORD` missing from `/etc/tmi-analytics.env`, or `CONTENT_DIR` has no episode packs. The log says which. |
| Dashboard loads but every number is zero | Students are playing an **old** S3 upload. Confirm the uploaded `index-*.js` filename matches your newest build. |
| "Too many attempts" when you know the password | Ten failed logins from your IP in 15 minutes. Wait it out, or `sudo systemctl restart tmi-analytics` to clear the counter. |

---

## Files in this folder

| File | What it does |
|---|---|
| `setup.sh` | One-time install: Node, Caddy, service, firewall, backups. Idempotent - safe to re-run. |
| `tmi-analytics.service` | systemd unit: restarts on crash and on boot, may only write to the database folder |
| `Caddyfile.example` | HTTPS + reverse proxy template (`{{DOMAIN}}` is substituted by `setup.sh`) |
| `backup.sh` | Daily consistent SQLite backup, 14 days, optional copy to S3. Restore steps at the bottom. |
| `push.ps1` | Uploads the server code + episode packs from Windows when the repo is private |
