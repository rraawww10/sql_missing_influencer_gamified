# Understanding the Server - SQL: The Missing Influencer

A simple reference: why the game needs a server, how to explain it, and how to ask for it.

---

## 1. The idea in one line

**S3 hands out the game. The server collects and keeps everything the students do.**

---

## 2. The two halves of the game

| Part | What it is | Like a... | What it does |
|---|---|---|---|
| **Game files** | The `missing-influencer-v4/` folder on **S3** | Notice board | Shows the game to every student. It **cannot** receive or save anything. |
| **Server** | The `analytics/` program + one database file, on a small **AWS server** | Office | Receives what every student does, **stores it in one database**, and shows it on the **dashboard**. |

The game runs inside each student's browser. Without the server, whatever a student does stays only on that one computer and nobody else ever sees it.

---

## 3. What the server does (3 jobs)

1. **Receives** small messages from every student's game:
   - "NxtWave ID NW123, name Asha, signed in"
   - "she solved step 14, ran this SQL, used a hint"
   - "she was actively playing 30 more seconds on step 15"
   - "she rated chapter 2 as Good and suggested more puzzles"
   - "here is her unfinished episode, in case she continues on another computer"
2. **Stores** all of it in one database (all 400-500 students in one place): student details, progress, time spent, feedback.
3. **Gives it back:**
   - **to the game** - a returning student on another computer gets "Welcome back" and continues where they left off;
   - **to us** - the password-protected **dashboard** shows every student by NxtWave ID: progress, time on each chapter and step, and their feedback.

```
   S3 (notice board)                               The server (office)
 ┌───────────────────────┐                 ┌──────────────────────────────────┐
 │ game files: pages,    │   download      │ receives  →  database            │
 │ pictures, music       │ ─────────────►  │ (all students in one place)      │
 └───────────────────────┘    Students'    │     ↓                    ↓        │
                              browsers ───►│ history back       dashboard     │
                              send data    │ to the game        for us        │
                                           └──────────────────────────────────┘
```

---

## 4. With and without the server

| Feature | Without server | With server |
|---|---|---|
| Playing the game | Works | Works |
| Name + NxtWave ID screen | Works, but remembered only on that computer | Saved centrally |
| Student data in a database | Nothing stored | Stored |
| Dashboard | Empty | Shows every student |
| Feedback from students | We never receive it | Collected and viewable |
| Time spent on each stage | Not tracked | Tracked |
| Continue on another computer | Starts from zero | Continues where they left off |

**Today we only have the first half (S3).** The game plays, but nothing is saved centrally.

---

## 5. Cost and effort

- **Where:** our company's existing **AWS** account (no personal card needed).
- **What:** one **AWS Lightsail** server - Ubuntu, $5-10/month plan, Mumbai region, static IP.
- **Cost:** about **$5-10 per month (roughly ₹450-850)**.
- **Effort:** the software is ready and tested. Once we have server access, setup takes about **one hour**.
- **Optional:** a subdomain such as `game-analytics.<our-domain>`. Without one, a free automatic HTTPS address can be used.

---

## 6. Message to the manager (copy and paste)

> **Subject: Small AWS server needed for the SQL game launch (~$5-10/month)**
>
> Hi [Manager's name],
>
> The SQL "Missing Influencer" game is ready for the launch to around 400-500 students. The game now records each student's name and NxtWave ID, their progress, time spent on each stage, and their feedback after every chapter and episode. All of this goes into one database, and we can view it student by student on an admin dashboard.
>
> To make this work, I need **one small server on our company AWS account**. Today the game files sit on S3, which can only *show* the game to students. It cannot *collect and store* their data. Without the server the game still plays, but we get no student data, no dashboard and no feedback.
>
> **What I need:**
> - An **AWS Lightsail** server (Ubuntu, $5-10/month plan, Mumbai region) with a static IP, or access for me to create it
> - Optional: a subdomain such as `game-analytics.<our-domain>` pointing to it
>
> **Cost:** about $5-10 per month (roughly ₹450-850).
> **What we get:** every student's progress, time spent and feedback, stored centrally and visible on a password-protected dashboard. Students can also continue on any computer using their NxtWave ID.
>
> The software is ready and tested. Once I have the server access, setup takes about an hour.
>
> Could you please approve this, or tell me whom to contact for AWS access?
>
> Thanks,
> [Your name]

---

## 7. If the manager asks...

**"Why not just S3?"**
S3 can only hand out files. It cannot receive and save data from 500 students.

**"Is it safe?"**
The dashboard is password protected. We store only the name, NxtWave ID, game activity and feedback. There are no passwords and no other personal details.

**"Can it handle 500 students?"**
Yes. It was load-tested with 500 students acting at the same moment, with zero failures.

**"What if the server stops?"**
It restarts on its own, and the database is backed up daily. Students can keep playing during a short outage, and their data is sent once it's back.

**"Is there a free option?"**
Yes, but it means more risk of losing data or a server that sleeps between uses. For about ₹500-800 a month on our existing AWS, this is the reliable choice.

---

## 8. What happens after approval

1. We get the server access: an AWS login with Lightsail permission, **or** the server's SSH key.
2. Claude (the developer side) installs the analytics server, sets up HTTPS, auto-restart and daily backups.
3. The game is rebuilt with the server's address: `VITE_ANALYTICS_URL=https://<server> npm run build:s3`.
4. We test that a sample student appears on the live dashboard.
5. We upload the new `missing-influencer-v4/` folder to S3 as usual.
6. We get the dashboard link and its password. Done.
