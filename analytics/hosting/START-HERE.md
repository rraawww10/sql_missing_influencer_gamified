# START HERE - the simple checklist

Put the game's server on AWS and get it ready for students. About one hour.
Tick each step as you go. Detail and troubleshooting: `README.md` next to this file.

Replace these two things everywhere below with your own:
- `nxtwave-tmi.duckdns.org`  → the name you pick in Step 5
- `13.233.44.55`             → the IP you get in Step 4

---

## Part 0 - On your computer (5 min)

- [ ] **Step 1. Make `node` work in your terminal.**
      Paste this line into the terminal. Do it once in every new terminal window you open.
      ```powershell
      $env:Path = "C:\Users\Hp\AppData\Roaming\fnm\node-versions\v24.22.3\installation;$env:Path"
      ```
      Check: `node -v` → `v24.22.3`

      *(Do not restart VS Code. It is not needed, and this line does the same job.)*

- [ ] **Step 2. Check the project still passes.**
      ```powershell
      cd D:\missing_influencer\sql-missing-influencer\sql_missing_influencer_gamified\app
      npm test
      ```
      Expect: `125 passed`

---

## Part 1 - Make the server (25 min)

**Links to keep open** (sign in to Oracle Cloud first. If a link lands somewhere odd, start from
the console home and use the hamburger menu.)

| What | Link |
|---|---|
| Oracle Cloud sign-up (once) | https://signup.oraclecloud.com/ |
| Console home | https://cloud.oracle.com/ |
| Instances | https://cloud.oracle.com/compute/instances |
| Networks (to open ports) | https://cloud.oracle.com/networking/vcns |
| DuckDNS (free name) | https://www.duckdns.org/ |

**Two things that bite people on Oracle - read before Step 3:**
1. Your **home region cannot be changed later**. Pick **India South (Mumbai)** or **India West (Hyderabad)**
   at sign-up. Always Free resources only exist in your home region.
2. You must pick an **"Always Free-eligible"** shape. The sign-up also gives 30 days of trial credits;
   when those expire, anything that is NOT Always-Free-eligible is **stopped**. The label is shown
   right on the shape in the console - check it says *Always Free-eligible*.

- [ ] **Step 3. Create the machine.** https://cloud.oracle.com/compute/instances → **Create instance**
      - **Name:** `tmi-analytics`
      - **Image:** Change image → **Canonical Ubuntu** → **24.04**
      - **Shape:** Change shape → **Ampere** → `VM.Standard.A1.Flex` → 1 OCPU, 6 GB
        (must say **Always Free-eligible**. If you get *"Out of capacity"*, switch to
        **AMD** → `VM.Standard.E2.1.Micro` - smaller but always available, and plenty for this.)
      - **Networking:** leave the defaults; make sure **Assign a public IPv4 address** is **Yes**
      - **Add SSH keys:** choose **Generate a key pair for me** → **Save private key**
        (it downloads as `ssh-key-….key` - keep it, you need it in Steps 7 and 8)
      - **Create**. Wait for the big square to turn **green / RUNNING**, then copy the **Public IP address**.

- [ ] **Step 3b. Lock down the key file** (Windows refuses to use a key that is too open):
      ```powershell
      icacls "C:\Users\Hp\Downloads\ssh-key.key" /inheritance:r /grant:r "$env:USERNAME:R"
      ```
      Use the real filename that downloaded.

- [ ] **Step 4. Open ports 80 and 443.**
      On the instance page click the **subnet** link → click the **Security List** (usually
      "Default Security List for …") → **Add Ingress Rules**. Add these two, one at a time:
      | Source CIDR | IP Protocol | Destination Port |
      |---|---|---|
      | `0.0.0.0/0` | TCP | `80` |
      | `0.0.0.0/0` | TCP | `443` |
      *Port 80 is required or the HTTPS certificate in Step 8 cannot be issued.*
      *(The second, hidden firewall inside the machine is handled automatically by setup.sh.)*

- [ ] **Step 5. A name on the internet.** https://www.duckdns.org/
      - **sign in with Google**
      - type a name like `nxtwave-tmi` → **add domain**
      - paste your instance's **Public IP** into that row's `current ip` box → **update ip**
      Your address is now `nxtwave-tmi.duckdns.org`.
      *Why: browsers refuse to send student data to a bare IP address.*

- [ ] **Step 6. Check you can reach the machine.**
      ```powershell
      ssh -i C:\Users\Hp\Downloads\ssh-key.key ubuntu@<your-public-ip>
      ```
      Type `yes` if it asks about authenticity. You should land at a `ubuntu@tmi-analytics:~$` prompt.
      Type `exit` to come back.

- [ ] **Step 7. Send the project to the server.**
      ```powershell
      $env:Path = "C:\Users\Hp\AppData\Roaming\fnm\node-versions\v24.22.3\installation;$env:Path"
      cd D:\missing_influencer\sql-missing-influencer\sql_missing_influencer_gamified\analytics\hosting
      .\push.ps1 -Server <your-public-ip> -KeyFile C:\Users\Hp\Downloads\ssh-key.key
      ```
      Expect: `installed: 14 files in content/sessions`

- [ ] **Step 8. Install it.** SSH in again, then paste the command (your own duckdns name):
      ```powershell
      ssh -i C:\Users\Hp\Downloads\ssh-key.key ubuntu@<your-public-ip>
      ```
      ```bash
      sudo bash /opt/tmi/analytics/hosting/setup.sh nxtwave-tmi.duckdns.org
      ```
      Takes about 3 minutes.

- [ ] **Step 9. SAVE THE PASSWORD** it prints at the end. It is never shown again.

- [ ] **Step 10. Check it.** Open `https://nxtwave-tmi.duckdns.org` and log in.
      An **empty dashboard with a padlock in the address bar is correct** - nobody has played yet.
      Padlock = HTTPS worked = the hard part is done.

---

## Part 2 - Connect the game (20 min)

- [ ] **Step 11. Rebuild with the server's address.**
      ```powershell
      cd D:\missing_influencer\sql-missing-influencer\sql_missing_influencer_gamified\app
      $env:VITE_ANALYTICS_URL = "https://nxtwave-tmi.duckdns.org"
      npm run build:s3
      ```
      **You MUST see `analytics: ON → https://...`**
      If it says `analytics: OFF`, stop and do this step again - the upload would save nothing.

- [ ] **Step 12. Upload to S3.** The **whole** `missing-influencer-v4` folder, replacing what is there.
      - upload the entire folder, not just changed files (file names change every build)
      - `.wasm` files must be served as `application/wasm`
      - keep the same folder structure

---

## Part 3 - Test like a student (15 min)

- [ ] **Step 13. Play it.** Open an episode from the **real S3 address** in an incognito window.
      Sign in as name `Test Teacher`, ID `NWCHECK01`. Play a few steps, run one SQL task,
      finish a chapter and send the check-in.

- [ ] **Step 14. Check the dashboard.** Students tab → `NWCHECK01` with progress, time and the check-in.

- [ ] **Step 15. THE IMPORTANT TEST - second device.** Open a *different* browser, same episode,
      **same ID**. Expect: *"Welcome back, Test! Your case file is restored"* and the episode
      continues at the same step.
      **If this works, everything works.**

- [ ] **Step 16. Remove the test data.** In the browser SSH terminal:
      ```bash
      sudo sqlite3 /var/lib/tmi/analytics.sqlite "DELETE FROM events WHERE student_id='NWCHECK01'; DELETE FROM students WHERE student_id='NWCHECK01';"
      ```

- [ ] **Step 17. Hand it over.** Give the LMS team:
      - briefing `https://<your-s3>/missing-influencer-v4/intro/index.html`
      - episodes `.../s01/index.html` … `.../s13/index.html`
      - each in an iframe with **`?user_id=<student's NxtWave ID>`**
      - the dashboard link + password (teachers only)

---

## After launch - 5 minutes

- [ ] **Off-site backups.** Backups run daily but sit on the same disk. In the SSH terminal:
      `sudo nano /etc/tmi-analytics.env` → add
      `BACKUP_S3_URI=s3://<your-bucket>/tmi-backups` → `Ctrl+O`, `Enter`, `Ctrl+X` →
      `sudo systemctl restart tmi-analytics`

- [ ] **No calendar reminder needed** - Oracle's Always Free tier does not expire. Two Oracle-specific
      things to know instead:
      - Oracle may **reclaim an Always Free machine that looks idle**. The off-site backup above is the
        real protection: if it ever happens, rebuild with this kit and restore the one database file.
      - The 30 days of trial credits at sign-up are separate. When they lapse nothing happens to an
        Always-Free-eligible shape - but if you accidentally picked a bigger shape, it gets stopped.
        Check the shape says *Always Free-eligible* on the instance page.

---

## If something goes wrong

| Problem | Do this |
|---|---|
| Dashboard won't load / no padlock | duckdns IP wrong, or port 80/443 missing in the **Security List** (Step 4). Fix, then `sudo systemctl restart caddy` |
| Ports look open in the console but still nothing | The machine's own firewall. `sudo iptables -S INPUT \| grep -E 'dport (80\|443)'` should show ACCEPT lines. If not, re-run `setup.sh` |
| `ssh` says UNPROTECTED PRIVATE KEY FILE | Run the `icacls` line from Step 3b |
| Dashboard loads but stays empty | The game was built without the address. Redo Step 11, watch for `analytics: ON` |
| All fine but no students appear | They are playing the **old** S3 upload. Redo Step 12 |
| `push.ps1` fails | Check the IP, and that the `.pem` path is exactly right |
| Useful anytime | `sudo journalctl -u tmi-analytics -f` (live log) · `sudo tmi-backup` (back up now) |

---

## Still open (not blocking)

- Git is not installed on the Windows laptop (`winget install Git.Git`). Today's content fixes and
  this hosting kit are on disk but not committed. Commit when you can so the work is not on one machine only.
- Episode 3's clue says "3 minutes after" the key card; it is really 2 min 25 s. One word, cosmetic.
