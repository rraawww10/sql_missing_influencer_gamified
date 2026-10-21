# SQL: The Missing Influencer — Session-wise Case Flow

Source of concepts: `content/reading_materials.json` (37 entries, referenced below as **RM #n** = `global_sequence`), **after course-team curation** (`content/curation.json`, 2026-10-05: compliance-only sections removed from RM #2, #9, #25, #26, #27, #34, #37).
Rule: every session teaches **only** what its reading materials contain — nothing more, nothing less. Every heading of every RM is mapped to at least one beat (see the coverage checklist in each session).

Built: all 13 sessions — `content/sessions/src/s01.yaml … s13.yaml` (this document is the design; the YAML files are the source of truth for exact wording).
Language: English only (simple English). Each session takes ≤ 60 min; learners can stop and continue any time.
Names, places and plates: `content/story/cast.json` (pan-Indian on purpose; sessions use `{{placeholders}}`).
Story clock: Saturday, **12 Dec 2026**, in an unnamed Indian city. All timestamps in the case DB use the course's datetime format `'YYYY-MM-DD HH:MM:SS'` (RM #3 note).

---

## 0. How to read this document

### 0.1 Beat types

| Tag | Meaning | Learner effort |
|---|---|---|
| 🎬 **SCENE** | Story moment (chat message, notification, short comic panel) | Read / tap |
| 📘 **NOTE** | Case Note — concept explained in story words, linked to the exact RM section | Read |
| 🧩 **ACTIVITY** | Non-SQL interaction (sort, match, drag, order, pick) | Tap / drag |
| 💻 **TASK** | Write and run SQL on the case DB; auto-graded | Type SQL |
| ⚠️ **TRAP** | A "Possible Mistake" from the RM, set up so the wrong query gives a wrong lead or an error | Fix SQL |
| 🔎 **CLUE** | Result pinned to Evidence Board | Tap "Pin" |
| 🎙️ **CHECK** | Mentor's quick question (MCQs from the course bank plug in here later) | Answer |
| ⏭️ **HOOK** | Cliffhanger that opens the next session | Read |

### 0.2 Per-task contract (used by the engine)

Every 💻 TASK below defines:
- **Ask** — what Ira asks, in plain words.
- **Ref** — reference query (never shown unless the learner opens hint 3).
- **Pass** — what the grader checks (result-set match / table-state match / expected error).
- **Hints** — H1 = Case Note pointer (RM section), H2 = fill-in-the-blank skeleton, H3 = full query.
- **Trap result** (optional) — a known wrong result the engine recognises and answers in-story.

### 0.3 Cast

| Character | Role in story | Role in concepts |
|---|---|---|
| **Tara Sen** (21) | Missing folk-pop reel singer from Chandpur, a small town | Active hero — leaves clues via her smartwatch |
| **SI Ira Menon** | Mentor, City Police Data Cell | Asks every question, gives hints |
| **Kabir** | Data Cell's database expert | Sends data, unlocks new tables each session |
| **You (the player)** | New intern, Data Cell | Writes every query |
| **Mahi Sen** | Tara's younger sister | Receives Tara's ₹1 UPI clue |
| **Dev Arora** | Tara's manager | Culprit (money/contract motive) |
| **Nysa Kapoor** | Rival singer | Suspect → cleared (rehearsal records) |
| **Ishita Das** (@tara_squad) | Runs the biggest fan page | Suspect → cleared (her DMs came from Chandpur); story says clearly that fans must respect privacy |
| **Sunny Gill** | Cab driver | Suspect → cleared → key witness |
| **Kunal Bajaj** | Event organiser | Suspect → cleared (insurance claim was system-generated) |

### 0.4 Case truth (what really happened — the clue graph is built from this)

| Time | Event | Where it shows in data |
|---|---|---|
| 16:10 | Dev pays ₹45,000 to *Green Acres Farm Stays* (Ring Road) | `upi_payments` |
| 17:00 | Tara is in Room 704 (5 PM printout of the guest table) | `hotel_guests` |
| 17:55 | Tara books a cab to the stadium for 18:15 | `cab_rides` |
| 18:05 | Dev edits Tara's contract (missed-show clause) — transaction **T7**, crash at 18:07 before commit | `txn_log` |
| 18:08 | Tara cancels cab — Dev says "come, I'll drive you, it's faster" | `cab_rides.status` |
| 18:12 | Grey SUV 26 BH 4471 EX exits by the **service gate** | `gate_log`, `vehicles` |
| 18:20 | Dev re-runs the edit as **T9**, commits | `txn_log` |
| 18:41 | SUV crosses Ring Road toll towards Ring Road | `toll_crossings` |
| 19:02 | Tara sends ₹1 to Mahi from her smartwatch: note `gReEn aCrEs` | `upi_payments` |
| 18:52–23:28 | Tara's watch pings tower RRO-17 every 6 min; Dev's phone too (18:52–19:22) | `tower_pings` |
| 19:30 | SUV crosses toll back towards city, Dev returns to hotel to fake an alibi | `toll_crossings`, `gate_log` |
| 23:40 | Police reach Green Acres; Tara safe | Finale |
| 00:15 | Show starts with Tara's song | Finale |

Motive: the contract's "missed show" clause lets Dev move Tara to *Skyline Records*, which pays him a personal bonus (₹25 lakh; advance ₹2,00,000 received on 11 Dec).

### 0.5 Evidence chain — how every clue is earned (rule since 2026-10-19)

A clue card is never narration. The intern must *find* every fact. Every 🔎 CLUE therefore follows the same four steps, in this order:

1. **Lead** — a 🎬 scene names the data source **and the open question** before the task ("the key-card system fills `key_card_last_location` on every guest row — where was her card tapped last?"). The question comes from an earlier pinned clue or a witness.
2. **Query / activity** — the learner's own task asks exactly that question. Its result must contain **every** fact the clue will state (times, names, amounts, plates). A fact that needs another lookup gets its own (small) task — e.g. T5.5b opens the Skyline → Dev payment so the *advance* note and date are seen, not told.
3. **Read it** — before the card, the learner reads the result: a `pick_cell` on a copy of their own result ("tap the cell that says **where**") or a ❓ check ("your two rows — what do they say?"). `reply_on_pass` points at the columns to read.
4. **Clue card** — starts with "Your query…", states only what the result showed, and cites earlier **pinned** clues by id (S2-C1) for any cross-reference. A witness statement is labelled **Witness** and kept apart from **Data** (S4-C2).

`python3 pipeline/audit_clues.py [session…]` prints, for every clue, the unlocking task, its reference SQL, the actual result rows, the beats before it, and flags any time / plate / amount in the clue text that is not visible in the result.

---

## Session 1 — 6:00 PM · "She's Gone"

| | |
|---|---|
| Course topic | Introduction to Database (`86ff2666…`) |
| Case Notes | **RM #1** + **RM #2** "Introduction to Databases" (#2 is the primary; after curation it covers data → DBMS → types → relational / non-relational DBMS) |
| SQL in session | None (concept session) |
| Est. time | ~24 min (built: `content/sessions/src/s01.yaml`) |
| Tables shown (read-only previews) | `hotel_guests` (two printouts) |

### Opening
🎬 S1.1 — Phone buzzes. Notification: *"MEGHNA RAO MISSING — 6 hrs before concert."* 40,000 fans, phone switched off.
🎬 S1.2 — Ira's chat: "Welcome, intern. No CCTV yet, phone switched off. But this city writes everything down. That's **data**."

### Beats
1. 📘 **NOTE — Data** (RM #2 › Data). "Any information that is stored is data." Hotel check-ins, cab bookings, UPI payments, tower pings (+ the RM's examples: WhatsApp, Amazon, telephone directory).
2. 🧩 **ACTIVITY — "Is it data?"** Sort 5 cards: a rumour nobody wrote down is not data.
3. 📘 **NOTE — Database** (RM #2 › Database). "An organised collection of data." Loose slips → the hotel register.
4. 📘 **NOTE — DBMS** (RM #2 › DBMS). Software to store and access data easily and securely.
5. 🧩 **ACTIVITY — Advantages** (RM #2 › Advantages). Match 4 of tonight's problems to Security / Ease of Use / Durability and Availability / Performance.
6. 📘 **NOTE — Types of databases** (RM #2). Relational = tables; non-relational = non-tabular (four common types). Choice depends on requirements; relational is most common.
7. 🧩 **ACTIVITY — Sort the evidence**: tables (register, cab bookings, UPI) vs non-tabular (reel video + comments).
8. 📘 **NOTE — Non-relational database** (RM #2).
9. 📘 **NOTE — Relational DBMS / Non-relational DBMS** (RM #2) with the RM's examples. Ira: "Our Data Cell uses **SQLite**."
10. 🎙️ **CHECK** — "Which of these is a Relational DBMS?"
11. 📘 **NOTE — Rows and columns** (RM #2 › Relational Database): a relational table has columns (what we store) and rows (one per guest).
12. 🧩 **ACTIVITY — Spot the change** (pick-cell): two printouts of the same `hotel_guests` table, 5 PM and 6 PM; learner taps Tara's `status` cell (`IN_ROOM` → `KEY_NOT_RETURNED`).
13. 🔎 **CLUE S1-C1** — "Tara left Room 704 between 5 and 6 PM; key card not returned."
14. 🎙️ **CHECK** — "Hotel staff add and find guests without opening database files. What do they use?" (a DBMS)
15. 📘 Recap note.

### Coverage checklist (RM #2 headings after curation)
Introduction ✔15 · Data ✔1–2 · Database ✔3 · DBMS ✔4,14 · Advantages ✔5 · Types ✔6–7 · Relational Database ✔7,11–12 · Non-Relational Database ✔8 · Relational DBMS / Non-Relational DBMS ✔9–10

⏭️ **HOOK** — Kabir: "I've given you access to the case database. First job: build our suspect list — in SQL."

### Exit criteria
All activities done; clue S1-C1 pinned.

---

## Session 2 — 6:30 PM · "Build the Case File"

| | |
|---|---|
| Course topic | Introduction To SQL (`9f5e3ac3…`) |
| Case Notes | RM #3 Create Table · RM #4 Inserting Rows · RM #5 Retrieving Data · RM #6 Update Rows · RM #7 Delete Rows · RM #8 + **RM #9** Alter Table |
| Tables | Player **creates** `suspects`. Pre-loaded: `hotel_guests`, `rumours` (Ira's rumour board) |
| Est. time | ~55 min (built: `content/sessions/src/s02.yaml`) |

### Opening
🎬 S2.1 — Ira: "Five names keep coming up. Put them in a proper table — no notebook scribbles."

### Beats
1. 📘 **NOTE — Data types** (RM #3). INTEGER/INT, FLOAT, VARCHAR, TEXT, DATE, TIME, DATETIME, BOOLEAN. Notes: boolean stored as 0/1; DATE `'YYYY-MM-DD'`; DATETIME `'YYYY-MM-DD HH:MM:SS'`.
2. 🧩 **ACTIVITY — Pick the type**: phone → VARCHAR, age → INTEGER, `is_verified` → BOOLEAN, `last_seen` → DATETIME.
3. 💻 **TASK 2.1 — Create the table** (RM #3 › Create Table)
   - Ask: create `suspects(name VARCHAR(200), role VARCHAR(100), phone VARCHAR(15), age INT)`.
   - Ref: `CREATE TABLE suspects (name VARCHAR(200), role VARCHAR(100), phone VARCHAR(15), age INT);`
   - Pass: table exists with these columns + types (schema check).
4. 💻 **TASK 2.2 — Check it** (RM #3 › PRAGMA)
   - Ref: `PRAGMA TABLE_INFO(suspects);` · Pass: result matches.
5. 💻 **TASK 2.3 — Insert the five suspects** (RM #4 › Inserting Rows)
   - Data card: Dev Arora (manager, 38), Nysa Kapoor (singer, 24), Ishita Das (fan page, 19), Sunny Gill (cab driver, 45), Kunal Bajaj (organiser, 41) + phones.
   - Ref: one `INSERT INTO suspects (name, role, phone, age) VALUES (...), (...), ...;`
   - Pass: table-state match (5 rows).
6. ⚠️ **TRAPS — Possible Mistakes** (RM #4, all four, shown as "Kabir's red stamps" if hit):
   - M1 values ≠ columns → `Error: 2 values for 3 columns` → Ira: "Count your columns."
   - M2 wrong table name (`suspect_list`) → `Error: no such table`.
   - M3 extra brackets after VALUES → error.
   - M4 age as `"Thirty-eight"` → **no error** (RM warning: SQLite doesn't raise one) → engine detects text in INT column, Ira: "SQLite let it in. That's why *you* must check types."
7. 💻 **TASK 2.4 — Look at the list** (RM #5 › Selecting All Columns) — `SELECT * FROM suspects;`
8. 💻 **TASK 2.5 — Only names and roles** (RM #5 › Selecting Specific Columns) — `SELECT name, role FROM suspects;`
9. 🎬 **LEAD (S2.13b)** — Kabir: hotel IT explains the two columns the key-card system fills on every guest row, `key_card_last_used` and `key_card_last_location`. Ira: "Her status went to KEY_NOT_RETURNED between 5 and 6 PM (S1-C1) — so the card left with her. **Where** was it tapped last, and **when**?"
   💻 **TASK 2.6 — Find her row** (RM #5 › Selecting Specific Rows)
   - Ask: from `hotel_guests`, all columns of Tara's row — then read the last two columns.
   - Ref: `SELECT * FROM hotel_guests WHERE name = "Tara Sen";` → one row: `… KEY_NOT_RETURNED | 2026-12-12 18:09:40 | Service Lift`.
   - 🧩 **READ IT (S2.14b, pick_cell)** — the learner's own result row is shown again: "tap the cell that says **where** her card was tapped last" → `key_card_last_location` = Service Lift. Feedback: staff lift, opens next to the service gate.
   - 🔎 **CLUE S2-C1**: "Your query on `hotel_guests`: key card last tapped **18:09:40** at the **Service Lift** — a staff lift near the service gate. Who was she with, and what left by that gate?"
10. 📘 **NOTE — Update rows** (RM #6 › Update All Rows / Update Specific Rows).
11. ⚠️ **TRAP — forgetting WHERE** (RM #6 › Update All Rows). Ask: Sunny's phone is wrong, fix it. If learner runs `UPDATE suspects SET phone = '9876500005';` → all five phones change → Ira: "Now everyone has Sunny's number! That's 'update all rows'." Sandbox **Reset Table** button.
12. 💻 **TASK 2.7 — Correct update** — `UPDATE suspects SET phone = '9876500005' WHERE name = 'Sunny Gill';` · Pass: table-state.
13. 🧩 **ACTIVITY — SQLite is case insensitive** (RM #6). Show `SELECT * FROM suspects;` vs `select * from suspects;` → same output; Best practice: uppercase keywords. Pick the preferred one.
14. 💻 **TASK 2.8 — Rumour board** (sets up DELETE/DROP). Pre-created by Ira: `rumours` table with 6 internet rumours ("She ran away for publicity", "Fan kidnapped her" …).
    - Delete specific (RM #7): `DELETE FROM rumours WHERE source = 'unverified_page';` → 4 rows removed.
    - Delete all (RM #7): `DELETE FROM rumours;` → table empty but exists.
    - Drop (RM #7): `DROP TABLE rumours;` → table gone.
15. 🧩 **ACTIVITY — DELETE vs DROP** (RM #7): which one keeps the table?
16. 💻 **TASK 2.9 — Add a column** (RM #9 › Add Column) — `ALTER TABLE suspects ADD alibi VARCHAR(250);`
17. 💻 **TASK 2.10 — Rename column** (RM #9 › Rename Column) — `ALTER TABLE suspects RENAME COLUMN role TO relation_to_case;`
18. 💻 **TASK 2.11 — Drop column** (RM #9 › Drop Column) — `ALTER TABLE suspects DROP COLUMN age;` ("Age doesn't matter for alibis.")
19. 💻 **TASK 2.12 — Fill an alibi** — Kabir has filled four claims; learner writes Dev's: `UPDATE suspects SET alibi = 'In hotel lobby all evening' WHERE name = 'Dev Arora';` (trap: forgetting WHERE again).
20. 🧩 **ACTIVITY — ALTER vs UPDATE** (RM #9): 4 change cards → structure (ALTER) or data (UPDATE).
21. 🎙️ **CHECK** — "Which command changes the table layout?"

### Coverage checklist
RM #3: Data Types ✔1–2, Create Table ✔3, PRAGMA ✔4 · RM #4: Inserting ✔5, Mistakes 1–4 ✔6 · RM #5: specific cols ✔8, all cols ✔7, specific rows ✔9 · RM #6: update all ✔11, specific ✔12, case-insensitive ✔13 · RM #7: delete all/specific ✔14, drop ✔14, DELETE vs DROP ✔15 · RM #8/#9: add/rename/drop ✔16–18, ALTER vs UPDATE ✔20

⏭️ **HOOK** — Hotel security mails the gate log: "300 entries since noon." Ira: "Find who used the service gate."

---

## Session 3 — 7:00 PM · "Hotel Gate Log"

| | |
|---|---|
| Course topic | Querying with SQL (`96f9178e…`) |
| Case Notes | RM #10 Comparison Operators · RM #11 String Operations · RM #12 Logical Operators |
| Built | `content/sessions/src/s03.yaml` (~36 min) |
| New table | `gate_log(entry_id, gate, direction, ts, vehicle_no, vehicle_colour, person_name)` — 300 rows · `vehicles(vehicle_no, owner_name, model, colour, company_id)` (lookup only, no joins yet; `company_id` used from S10) |
| Est. time | ~36 min |

### Beats
1. 📘 **NOTE — Comparison operators** (RM #10 table): `=`, `<>`, `<`, `<=`, `>`, `>=`.
2. 💻 **TASK 3.1** — Every gate entry from 6 PM onward (AND is not taught until beat 7, so one condition only).
   - Ref: `SELECT * FROM gate_log WHERE ts >= '2026-12-12 18:00:00';` → 154 rows.
3. 💻 **TASK 3.2** — Everything not at the main gate: `SELECT * FROM gate_log WHERE gate <> 'MAIN';` → 22 rows (service + staff gate).
4. 📘 **NOTE — LIKE** (RM #11 › Common Patterns): exact, starts-with `x%`, ends-with `%x`, contains `%x%`, `_` single character.
5. 💻 **TASK 3.3 — Half-seen number plate.** Watchman's statement: "Grey car… started with 26 BH… ended with 71."
   - Starts with: `SELECT * FROM gate_log WHERE vehicle_no LIKE '26 BH%';` → 9 rows.
   - Ends with: `… LIKE '%EX';` → 3 rows.
   - Pattern with `_`: watchman remembers "26 BH 4471 E?" → `… LIKE '26 BH 4471 E_';` → 2 rows: **26 BH 4471 EX** — service gate OUT 18:12:05, and back IN at 19:52:10. (Near-miss `26 BH 4417 EY` is correctly excluded.)
6. 💻 **TASK 3.4 — Contains** — staff entries whose `person_name LIKE '%Arora%'` → Dev badge-in at 19:52 (he "came back"?). Mark for later.
7. 📘 **NOTE — AND, OR, NOT** (RM #12 table).
8. 💻 **TASK 3.5 — AND**: service gate exits after 18:00: `SELECT * FROM gate_log WHERE gate = 'SERVICE' AND direction = 'OUT' AND ts >= '2026-12-12 18:00:00';`
9. 💻 **TASK 3.6 — OR**: entries at SERVICE or STAFF gate.
10. 💻 **TASK 3.7 — NOT**: entries not by the hotel shuttle: `… WHERE NOT vehicle_no LIKE 'HTL%'` → 186 rows (people on foot have no vehicle number, so they drop out too — Ira points this out).
11. 📘 **NOTE — Precedence** (RM #12): NOT → AND → OR.
12. ⚠️ **TRAP — precedence red herring.** Ask: "Grey vehicles that used the service gate **or** the staff gate."
    - Wrong: `WHERE vehicle_colour = 'Grey' AND gate = 'SERVICE' OR gate = 'STAFF'` → includes Ishita's **white fan-club van** at the staff gate at 17:40 → in-story: comments light up "#FanDidIt" — Ira: "Careful. AND runs before OR. Your query brought in every staff-gate vehicle, grey or not."
    - Right: `WHERE vehicle_colour = 'Grey' AND (gate = 'SERVICE' OR gate = 'STAFF')` — parentheses (RM best practice) → 4 rows (laundry van ×2, SUV ×2). Trap version → 18 rows.
    - Pass: result-set match; **trap result** recognised → red-herring dialogue, not a plain "wrong".
13. ❓ **READ IT (S3.18b)** — "Your 4 rows: two are a laundry van in the afternoon. What do the other two say?" → SUV 26 BH 4471 EX OUT 18:12:05, IN 19:52:10 with `person_name` Dev Arora.
    🔎 **CLUE S3-C1** — "Your gate-log query: grey SUV **26 BH 4471 EX** went OUT by the service gate at **18:12:05** — 3 min after her card at the service lift (S2-C1) — and came back IN at **19:52:10**; the guard wrote the driver's name: **Dev Arora**."
14. 💻 **TASK 3.9** — Lookup `SELECT * FROM vehicles WHERE vehicle_no = '26 BH 4471 EX';` → owner: *"DA Talent Management Pvt Ltd"* (Dev's company — not obvious yet; name shown, connection made in S10).
15. 🎙️ **CHECK** — "Which pattern finds names starting with 'a' and at least 2 characters long?" (`'a_%'`, RM example)

### Coverage checklist
RM #10 ✔1–3 · RM #11 LIKE ✔4, patterns ✔5–6 · RM #12 AND/OR/NOT ✔7–10, multiple operators + precedence ✔11–12

⏭️ **HOOK** — Cab app reply: "Tara booked a ride at 17:55. Status: **cancelled by rider**."

---

## Session 4 — 7:30 PM · "The Last Cab"

| | |
|---|---|
| Course topic | Querying with SQL - 2 (`1ce5cadd…`) |
| Case Notes | RM #13 IN & BETWEEN · RM #14 ORDER BY & DISTINCT · RM #15 Pagination |
| New table | `cab_rides(ride_id, rider_name, rider_phone, driver_name, pickup, drop_point, booked_at, status, status_updated_at, fare)` — 400 rows (today) |
| Est. time | 35–45 min |

### Beats
1. 📘 **NOTE — IN** (RM #13).
2. 💻 **TASK 4.1** — Rides booked by any suspect phone or Tara's phone.
   - Ref: `SELECT * FROM cab_rides WHERE rider_phone IN ('9876500001', '9876500002', '9876500003', '9876500004', '9876500005', '9876500006');` → 4 rows (Tara, Kunal, Nysa, Ishita).
3. 📘 **NOTE — BETWEEN** (RM #13).
4. 💻 **TASK 4.2** — Rides from the hotel booked between 17:30 and 18:30.
   - Ref: `SELECT * FROM cab_rides WHERE pickup = 'The Grand Residency' AND booked_at BETWEEN '2026-12-12 17:30:00' AND '2026-12-12 18:30:00';`
5. ⚠️ **TRAPS — BETWEEN Possible Mistakes** (RM #13, all three):
   - Reversed limits (`BETWEEN '18:30…' AND '17:30…'`) → **empty result** → Ira: "Empty doesn't mean nobody booked. Smaller value first."
   - Missing lower limit → `Error: near "AND": syntax error`.
   - Wrong data type (`fare BETWEEN 'abc' AND 'xyz'`-style) → meaningless result, explained.
6. 📘 **NOTE — ORDER BY** (RM #14) ASC/DESC.
7. 💻 **TASK 4.3** — Hotel rides 17:30–18:30, newest first: `… ORDER BY booked_at DESC;`
8. 💻 **TASK 4.4 — ORDER BY multiple columns** (RM #14): sort by `status ASC, booked_at DESC` → cancelled rides grouped on top.
9. 📘 **NOTE — DISTINCT** (RM #14).
10. 💻 **TASK 4.5** — Which drivers picked up from the hotel today? `SELECT DISTINCT driver_name FROM cab_rides WHERE pickup = 'The Grand Residency';`
11. 📘 **NOTE — LIMIT** (RM #15).
12. 💻 **TASK 4.6 — Tara's last booking**: `SELECT ride_id, driver_name, booked_at, status, status_updated_at FROM cab_rides WHERE rider_name = 'Tara Sen' ORDER BY booked_at DESC LIMIT 1;`
    - ❓ **READ IT (S4.14b)** — "What happened to her booking, and when?" → CANCELLED_BY_RIDER at 18:08:12.
    - 🔎 **CLUE S4-C1**: "Your query: ride **R-2291**, driver **Sunny Gill**, booked **17:55**, **CANCELLED_BY_RIDER** at **18:08:12** — one minute before her card hit the service lift (S2-C1). Why?"
13. 🎬 SCENE — Sunny is now a suspect in the comments ("driver did it!"). Ira: "Data first. Let's see Sunny's whole day."
14. 📘 **NOTE — OFFSET** (RM #15); default offset is 0.
15. 💻 **TASK 4.7 — Sunny's ride history, page 2** (5 rides per page): `SELECT * FROM cab_rides WHERE driver_name = 'Sunny Gill' ORDER BY booked_at LIMIT 5 OFFSET 5;` → page 2 shows Tara's cancelled 17:55 ride **and** the next one, R-2297 booked 18:10: Sunny took **another passenger (Farhan Ali) from the hotel to the railway station** → he couldn't have taken Tara.
16. ⚠️ **TRAPS — Pagination mistakes** (RM #15): OFFSET before LIMIT → syntax error; OFFSET alone → syntax error. (RM note: in SQLite OFFSET must follow LIMIT; PostgreSQL differs.)
17. ❓ **READ IT (S4.18b)** — "On page 2, what did Sunny do right after R-2291 was cancelled?" → R-2297 at 18:10, Farhan Ali, hotel → railway station.
    🎬 SCENE — **Witness statement**, Sunny's voice note: "I reached at 18:06. She came out, a man in a black jacket said *'Come, I'll drop you, faster'*. She cancelled the ride and got into a **grey SUV**. Then I took the station passenger."
18. 🔎 **CLUE S4-C2** — "**Data** (your page-2 query): at 18:10 Sunny drove Farhan Ali to the station (R-2297) — cleared. **Witness** (Sunny): Tara cancelled the cab herself and got into a **grey SUV** with a man she knew. A grey SUV left by the service gate at 18:12 (S3-C1)."
19. 🎙️ **CHECK** — "Get 5 top-fare rides starting from the 10th row" — choose correct LIMIT/OFFSET.

### Coverage checklist
RM #13 IN ✔1–2, BETWEEN ✔3–4, mistakes ✔5 · RM #14 ORDER BY ✔6–7, multi-col ✔8, DISTINCT ✔9–10 · RM #15 LIMIT ✔11–12, OFFSET ✔14–15, mistakes ✔16

⏭️ **HOOK** — Mahi calls, crying: "I got a weird **₹1** from Tara's watch at 7 PM!" Ira: "Get me the UPI records."

---

## Session 5 — 8:00 PM · "Follow the Money"

| | |
|---|---|
| Course topic | Aggregations and Group By (`eab97311…`) |
| Case Notes | RM #16 Aggregations · RM #17 Group By |
| New tables | `upi_payments(txn_id, from_name, to_name, amount, note, ts)` — ~600 rows (last 3 days) |
| Est. time | 35–45 min |

> Joins aren't taught yet, so `upi_payments` carries readable `from_name` / `to_name`. Normalised `upi_accounts` arrives in Session 10.

### Beats
1. 📘 **NOTE — Aggregation functions** (RM #16): COUNT, SUM, MIN, MAX, AVG; multiple in one query.
2. 💻 **TASK 5.1** — Dev's spending today: `SELECT SUM(amount), COUNT(amount), MAX(amount), MIN(amount), AVG(amount) FROM upi_payments WHERE from_name = 'Dev Arora' AND ts >= '2026-12-12 00:00:00';`
3. 📘 **NOTE — COUNT variants** (RM #16): `COUNT(*)`, `COUNT(1)`, `COUNT()` same; `COUNT(col)` skips NULLs.
4. ⚠️ **TRAP — COUNT(*) vs COUNT(note)**. Ask: "How many of Dev's payments today have a note?" `COUNT(*)` = 6 (wrong), `COUNT(note)` = 2 (right) — RM note on NULLs.
5. 📘 **NOTE — Special cases** (RM #16): SUM on text → `0.0` in SQLite; MIN/MAX on strings = lexicographic; NULLs ignored; all-NULL inputs.
6. 🧩 **ACTIVITY** — run `SELECT SUM(note) FROM upi_payments;` → `0.0` — "Not zero money — you summed words."
7. 📘 **NOTE — Alias** (RM #16): `AS`.
8. 💻 **TASK 5.2** — `SELECT MAX(amount) AS biggest_payment FROM upi_payments WHERE from_name = 'Dev Arora';`
9. 🎬 **LEAD (S5.9b)** — Ira: Mahi's call — "a strange ₹1 from Tara's watch at 7 PM". ₹1 is not money, it's a message; the table keeps sender, note and time. Find it.
   💻 **TASK 5.3 — the ₹1 payment**: `SELECT from_name, amount, note, ts FROM upi_payments WHERE to_name = 'Mahi Sen' AND amount = 1;` (S3–S4 skills reused)
   - 🧩 **READ IT (S5.10b, pick_cell)** — the result row again: "tap the **note**" → `gReEn aCrEs`.
   - 🔎 **CLUE S5-C1**: "Your query: at **19:02:30** *Tara Sen (Watch)* sent ₹1 to Mahi, note **`gReEn aCrEs`**. Her phone is off, her watch can pay — the capitals look deliberate." (decoded in S7)
10. 📘 **NOTE — GROUP BY** (RM #17).
11. 💻 **TASK 5.4** — total received per person today: `SELECT to_name, SUM(amount) AS total FROM upi_payments WHERE ts >= '2026-12-12 00:00:00' GROUP BY to_name;`
12. 💻 **TASK 5.5 — GROUP BY multiple columns** (RM #17), made readable: "who paid whom the most?" `SELECT from_name, to_name, SUM(amount) AS total FROM upi_payments GROUP BY from_name, to_name ORDER BY total DESC LIMIT 5;` → row 1: Skyline Records → Dev Arora ₹2,00,000; row 2: Dev → Green Acres ₹45,000. (Was 559 unsorted rows — the fact was never on screen.)
    💻 **TASK 5.5b — open that payment**: `SELECT * FROM upi_payments WHERE from_name = 'Skyline Records' AND to_name = 'Dev Arora';` → note *advance*, 11 Dec 21:30.
    - 🔎 **CLUE S5-C3**: "Your queries: biggest payment in three days is **Skyline Records → Dev Arora, ₹2,00,000**, 11 Dec 21:30, note *advance*. Tara sings for Folk Beats Label. Why does another label pay her manager an advance the night before her show?"
13. 💻 **TASK 5.6 — GROUP BY with WHERE** (RM #17): Dev's payments grouped by receiver → 7 receivers; reply points at Green Acres ₹45,000.
    💻 **TASK 5.6b — open that payment**: `SELECT * FROM upi_payments WHERE from_name = 'Dev Arora' AND to_name = 'Green Acres Farm Stays';` → 16:10:05, note *Green Acres - 2 guests*.
    - 🔎 **CLUE S5-C2**: "Your query: Dev paid **₹45,000** to **Green Acres Farm Stays** at **16:10:05**, note *2 guests*. Two hours before she vanished, her manager booked a farm stay for two on concert day."
14. 🎙️ **CHECK** — "What does COUNT(note) skip?"

### Coverage checklist
RM #16 functions ✔1–2, COUNT variants ✔3–4, special cases ✔5–6, alias ✔7–8 · RM #17 GROUP BY ✔10–11, multiple cols ✔12, with WHERE ✔13

⏭️ **HOOK** — Telecom team: "Tara's phone is off, but her **smartwatch** has an eSIM. We have tower pings."

---

## Session 6 — 8:30 PM · "Phone Towers"

| | |
|---|---|
| Course topic | Group By with Having (`5759bbee…`) |
| Case Notes | RM #18 Group By with Having |
| New tables | `tower_pings(ping_id, device_owner, device_type, tower_id, tower_area, ts)` — ~5,000 rows today |
| Est. time | 25–30 min |

### Beats
1. 🎬 **LEAD (S6.1)** — Her phone is off, but the watch has an eSIM (S5 hook). Each tower covers a few km². "We need the tower she *keeps* hitting since she left the hotel — that's where she is."
2. 💻 **TASK 6.1** (warm-up, GROUP BY) — pings per tower for Tara's watch: `SELECT tower_id, tower_area, COUNT(*) AS pings FROM tower_pings WHERE device_owner = 'Tara Sen' AND device_type = 'WATCH' GROUP BY tower_id, tower_area;`
3. 📘 **NOTE — HAVING** (RM #18): filter groups.
4. 💻 **TASK 6.2** — towers with more than 5 pings after 18:00, **with first and last ping** so the times are seen:
   - Ref: `SELECT tower_id, tower_area, COUNT(*) AS pings, MIN(ts), MAX(ts) FROM tower_pings WHERE device_owner = 'Tara Sen' AND ts >= '2026-12-12 18:00:00' GROUP BY tower_id, tower_area HAVING pings > 5;` → one row: RRO-17 · Ring Road outskirts · 47 · 18:52 · 23:28.
   - ❓ **READ IT (S6.4b)** — "Your one row — what does it tell us?" → since 18:52 only RRO-17, last ping 23:28 (now).
   - 🔎 **CLUE S6-C1**: "Your query: since **18:52** her watch has pinged only **RRO-17 · Ring Road outskirts** — 47 pings, last at **23:28**. She is still there now."
5. 📘 **NOTE — WHERE vs HAVING** (RM #18 note): WHERE filters rows *before* grouping, HAVING filters groups *after*.
6. ⚠️ **TRAP — missing the WHERE**. Without `ts >= 18:00`, the hotel tower (MGR-04, 62 pings all afternoon) also passes `HAVING > 5` → "She's still in the hotel!" red herring → Ira: "Those pings are from before she left. Filter rows first (WHERE), then groups (HAVING)."
7. 🎬 **LEAD (S6.6b)** — Ira: "You typed Dev's alibi yourself in Episode 2: *In hotel lobby all evening*. The hotel tower is MGR-04. If he never left, his phone shows one tower. Test it."
   💻 **TASK 6.3** — Dev's phone: `… WHERE device_owner = 'Dev Arora' AND ts >= '2026-12-12 18:00:00' GROUP BY tower_id, tower_area HAVING COUNT(*) > 3;` → **RRO-17 (6 pings, 18:52–19:22)** and MGR-04 (24 pings: 18:00–18:10, then again from 19:55).
   - ❓ **READ IT (S6.7b)** — "He said hotel lobby all evening. What do his two rows say?"
8. 🔎 **CLUE S6-C2** — "Your query: Dev's phone pinged **RRO-17** six times, **18:52 → 19:22** — same tower, same half hour as her watch (S6-C1). His alibi says hotel lobby all evening. The data says otherwise."
9. 🎙️ **CHECK** — "Which clause filters groups?"

### Coverage checklist
RM #18 HAVING ✔3–4, Try-it ✔7, WHERE vs HAVING ✔5–6

⏭️ **HOOK** — "RRO-17 covers 6 km². We need something more exact. Her watch logs steps and heart rate…"

---

## Session 7 — 9:00 PM · "Smartwatch Secrets"

| | |
|---|---|
| Course topic | SQL Expressions and Functions (`e4e8f7c2…`) |
| Case Notes | RM #19 SQL Expression · RM #20 SQL Functions · RM #21 Cast Functions · RM #22 Arithmetic Functions |
| New table | `watch_log(log_id, ts, steps, distance_m, heart_rate, resting_hr)` — 1 row per 5 min today |
| Est. time | 45–55 min |

### Beats — Expressions (RM #19)
1. 📘 **NOTE — Arithmetic operators**: `+ - * / %`.
2. 💻 **TASK 7.1 (+, −)** — heart rate above resting: `SELECT ts, heart_rate - resting_hr AS hr_rise FROM watch_log;`
3. 💻 **TASK 7.2 (*, /)** — distance in km: `SELECT ts, distance_m / 1000.0 AS distance_km FROM watch_log;`
4. 💻 **TASK 7.3 (%)** — every 3rd log (watch syncs every 15 min): `SELECT * FROM watch_log WHERE log_id % 3 = 0;`
5. 💻 **TASK 7.4 — Expression in SELECT + `||`** (RM note: `||` concatenates): `SELECT ts || ' - ' || heart_rate || ' bpm' AS reading FROM watch_log;`
6. 💻 **TASK 7.5 — Expression in WHERE**: spikes: `SELECT * FROM watch_log WHERE (heart_rate - resting_hr) >= 40;` → 2 rows: **18:10** (112 bpm — when she realised the car wasn't going to the stadium) and **19:00** (109 bpm — just before she sent the ₹1 clue).
7. 💻 **TASK 7.6 — Expression in UPDATE**: watch exported distance in **cm** for the evening (bug) → `UPDATE watch_log SET distance_m = distance_m / 100 WHERE ts >= '2026-12-12 18:00:00';` (table-state check)
8. 💻 **TASK 7.7 — Expression in HAVING**: per hour average rise > 25 (needs strftime → done after beat 10; order shown here for coverage, runs after step 11).

### Beats — Functions (RM #20, #21)
9. 📘 **NOTE — Function categories** (RM #20): Date, Cast, Arithmetic.
10. 📘 **NOTE — strftime()** formats `%Y %m %d %H` (RM #20 table); output is a string.
11. 💻 **TASK 7.8** — steps per hour: `SELECT strftime('%H', ts) AS hour, SUM(steps) AS steps FROM watch_log GROUP BY hour;` → after 19:00 steps ≈ 0 → "She's sitting in one place."
12. 💻 **TASK 7.7 (run now)** — `SELECT strftime('%H', ts) AS hour FROM watch_log GROUP BY hour HAVING AVG(heart_rate - resting_hr) > 25;`
13. 📘 **NOTE — CAST** (RM #21): `CAST(value AS data_type)`; e.g. `CAST(strftime('%H', ts) AS INTEGER)`.
14. 💻 **TASK 7.9** — logs from 18:00 onward using numbers: `SELECT * FROM watch_log WHERE CAST(strftime('%H', ts) AS INTEGER) >= 18;`
15. ⚠️ **TRAP — string vs integer** — `strftime('%H', ts) >= 18` compares text with a number → wrong rows → Ira: "strftime gives text. CAST it." (RM #20 note + RM #21)

### Beats — Arithmetic & String functions (RM #22)
16. 📘 **NOTE — FLOOR, CEIL, ROUND**.
17. 💻 **TASK 7.10** — distance walked from car to wherever she is now: `SELECT ROUND(SUM(distance_m) / 1000.0, 1) AS km, CEIL(SUM(distance_m)/1000.0) AS km_ceil, FLOOR(SUM(distance_m)/1000.0) AS km_floor FROM watch_log WHERE ts >= '2026-12-12 18:45:00';` → ~0.2 km → "She walked only 200 m from where the car stopped."
18. 📘 **NOTE — UPPER / LOWER** — case-insensitive search (RM #22).
19. 💻 **TASK 7.11 — Decode the ₹1 note** (lead in the ask: the capitals of S5-C1 hide a name, so ignore case). `SELECT from_name, to_name, amount, note, ts FROM upi_payments WHERE UPPER(note) LIKE UPPER('%green acres%');`
    - Result: **two rows** — Dev's ₹45,000 to Green Acres Farm Stays at 16:10 (*Green Acres - 2 guests*) **and** Tara's ₹1 to Mahi at 19:02 (`gReEn aCrEs`).
    - ❓ **READ IT (S7.22b)** — "Your two rows: who wrote *green acres*, and when?"
    - 🔎 **CLUE S7-C1**: "Your case-insensitive search: her **`gReEn aCrEs`** (19:02) matches **Green Acres Farm Stays** — the farm stay Dev paid ₹45,000 for at **16:10**, *2 guests* (S5-C2). She is telling us where she is."
20. 🎙️ **CHECK** — "ROUND(16.25, 1)?"

### Coverage checklist
RM #19 arithmetic ✔1–4, SELECT ✔5, WHERE ✔6, UPDATE ✔7, HAVING ✔12 · RM #20 categories ✔9, strftime ✔10–11 · RM #21 CAST ✔13–15 · RM #22 FLOOR/CEIL/ROUND ✔16–17, string functions ✔18–19

⏭️ **HOOK** — Social media explodes: "#IshitaKnows — fan page admin posted 'she's safe, trust me' at 8:55 PM." Ira: "Let's clear people properly, not by trending tags."

---

## Session 8 — 9:30 PM · "Clear the Innocent"

| | |
|---|---|
| Course topic | SQL Case Clause and Set Operations (`478ef25a…`) |
| Case Notes | RM #23 SQL Case · RM #24 + **RM #25** SQL Set Operations |
| New tables | `alibis(person_name, claim, verified_by, verified)` · `fan_dms(dm_id, sender_handle, sender_name, tower_area, ts, body)` · uses `tower_pings`, `upi_payments` |
| Est. time | 35–45 min |

### Beats — CASE (RM #23)
1. 📘 **NOTE — CASE** (like if-else / switch); first true WHEN wins; no ELSE → NULL; usable in SELECT, WHERE, HAVING, ORDER BY, GROUP BY.
2. 💻 **TASK 8.1** — suspicion level from pings at RRO-17 tonight:
   - Ref: `SELECT device_owner, COUNT(*) AS pings, CASE WHEN COUNT(*) >= 10 THEN 'High' WHEN COUNT(*) >= 1 THEN 'Medium' ELSE 'Low' END AS suspicion FROM tower_pings WHERE tower_id = 'RRO-17' AND ts >= '2026-12-12 18:00:00' GROUP BY device_owner;`
   - Result: Tara 47 High, Ramesh Pawar (Green Acres caretaker — lives there) 24 High, Dev 6 Medium. Ira: "High pings alone don't make anyone guilty — Ramesh lives there."
3. 💻 **TASK 8.2 — CASE with aggregates** (RM #23): per suspect, pings at RRO-17 vs elsewhere: `SELECT device_owner, COUNT(CASE WHEN tower_id = 'RRO-17' THEN 1 END) AS at_farm_area, COUNT(CASE WHEN tower_id <> 'RRO-17' THEN 1 END) AS elsewhere FROM tower_pings WHERE ts >= '2026-12-12 18:00:00' GROUP BY device_owner;`

### Beats — Set operations (RM #24/#25)
4. 📘 **NOTE — INTERSECT, MINUS (EXCEPT in SQLite), UNION, UNION ALL** with RM's Venn images.
5. 📘 **NOTE — Rules**: same number of columns, similar types, same order.
6. 🎬 **LEAD (S8.7b)** — Ira: "Two lists. Everyone whose device hit RRO-17 tonight — your CASE query showed three names (Tara, Ramesh the caretaker, Dev). Everyone who ever paid Green Acres. Being on **both** tonight needs an explanation."
   💻 **TASK 8.3 — INTERSECT**: `SELECT device_owner FROM tower_pings WHERE tower_id = 'RRO-17' AND ts >= '2026-12-12 18:00:00' INTERSECT SELECT from_name FROM upi_payments WHERE to_name = 'Green Acres Farm Stays';` → **Dev Arora** (reply: not Ramesh — lives there, never paid; not Tara — paid nobody).
   - 🔎 **CLUE S8-C1**: "Your INTERSECT: of the three people near RRO-17 tonight, only **Dev Arora** also paid **Green Acres Farm Stays**. One person booked the place and went there."
7. 💻 **TASK 8.4 — UNION**: everyone seen near the hotel exits (gate log names) or the cab bookings: `SELECT person_name FROM gate_log WHERE ts BETWEEN … UNION SELECT rider_name FROM cab_rides WHERE …;`
8. 💻 **TASK 8.5 — UNION ALL**: same query → duplicates appear → "UNION removes duplicates, UNION ALL keeps them."
9. 💻 **TASK 8.6 — EXCEPT (MINUS)**: suspects minus verified alibis: `SELECT name FROM suspects EXCEPT SELECT person_name FROM alibis WHERE verified = 1;` → Ishita (her DMs + alibi: at a Chandpur café, verified by café bill), Sunny (verified in S4) drop out → left: **Dev, Nysa, Kunal**.
10. 🎬 SCENE — Ishita cleared. `fan_dms` shows all her messages came from **Chandpur** tower area all evening; her "she's safe" post was a hopeful prayer, not knowledge. Ira: "Being a big fan isn't a crime. Following someone home would be. She didn't." (safety message)
11. ⚠️ **TRAP — column count mismatch** (RM rules): `SELECT name, phone FROM suspects EXCEPT SELECT person_name FROM alibis` → error → "Each SELECT needs the same number of columns."
12. 💻 **TASK 8.7 — ORDER BY in set ops** (RM): only once at the end, use column position: `… UNION … ORDER BY 1;`
13. 💻 **TASK 8.8 — Pagination in set ops** (RM): `… UNION … ORDER BY 1 DESC LIMIT 5;`
14. ⚠️ **TRAP** — ORDER BY inside the first SELECT → error.

### Wrap-up
15. (S8-C1 is pinned at beat 6, right after the query that proves it.)
16. 🎙️ **CHECK** — "Which set operator keeps duplicates?"

### Coverage checklist
RM #23 CASE ✔1–2, CASE with aggregates ✔3 · RM #24/#25 operators ✔4, rules ✔5,11, examples ✔6–9, ORDER BY ✔12,14, pagination ✔13

⏭️ **HOOK** — Ira: "Our evidence is scattered in ten tables. Before we accuse anyone, draw the full picture."

---

## Session 9 — 10:00 PM · "The Case Board"

| | |
|---|---|
| Course topic | Modelling Databases (`6f955426…`) |
| Case Notes | RM #26 Core Concepts of ER Model · RM #28 Applying ER Model Concepts · RM #27 + RM #29 ER Model to Relational Database (same e-commerce use case; #29 has the diagrams) · RM #30 Modelling Database - 2 |
| Session order used | #26 → #28 → #29/#27 → #30 (follows each RM's "in the previous cheatsheet…" references) |
| Player creates | `person`, `property`, `booking`, `booking_guest` (junction) |
| Est. time | 45–55 min |

### Beats — Core ER (RM #26)
1. 🎬 SCENE — Physical cork board with photos and red strings → "Let's turn this into an **ER model**."
2. 📘 **NOTE — Entity, attributes, key attribute, entity type.**
3. 🧩 **ACTIVITY — ER Board (drag-and-drop)**: create entity types *Person, Vehicle, Property, Booking, Payment*; attach attributes; mark key attribute (underline).
4. 📘 **NOTE — Relationships: 1:1, 1:N, M:N; cardinality ratio.**
5. 🧩 **ACTIVITY — Draw relationships**: Person–Smartwatch (1:1), Person–Vehicle (1:N, company owns many cars), Booking–Person as guests (M:N), Property–Booking (1:N).
### Beats — Applying ER (RM #28)
8. 📘 **NOTE** — RM #28 builds an e-commerce ER (customer–cart 1:1, customer–address 1:N, cart–product M:N). Ira: "Same pattern as ours." Side-by-side mapping card: customer↔person, address↔phone numbers, cart↔booking, product↔guest.
9. 🧩 **ACTIVITY** — complete the case ER from a half-filled board (entities + relationships + attributes).

### Beats — ER → Relational (RM #29, #27)
10. 📘 **NOTE — Entity type → table** (RM #29/#27 › Entity Type to Table): each entity type becomes a table; its key attribute becomes the primary key.
11. 📘 **NOTE — Relationships → tables** (RM #29/#27 › Relationships, E-commerce Usecase): 1:1 and 1:N → a foreign key column; M:N → a junction table (like `cart_product`).
12. 🧩 **ACTIVITY — Map it**: Person → `person` table · Property → `property` table · Property–Booking (1:N) → `property_id` column in `booking` · Booking–Person guests (M:N) → junction table `booking_guest`.
13. 🎙️ **CHECK** — "M:N relationship becomes …?" (a junction table)

### Beats — Creating the relational DB (RM #30)
14. 📘 **NOTE — PRIMARY KEY, FOREIGN KEY … REFERENCES … ON DELETE CASCADE; `PRAGMA foreign_keys = ON;`** (enabled by default on our platform — same in game).
15. 💻 **TASK 9.1** — `CREATE TABLE person (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(250), role VARCHAR(100));`
16. 💻 **TASK 9.2** — `CREATE TABLE property (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(250), area VARCHAR(250), district VARCHAR(100));`
17. 💻 **TASK 9.3** — `CREATE TABLE booking (id INTEGER NOT NULL PRIMARY KEY, property_id INTEGER, booked_by INTEGER, check_in DATETIME, FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE, FOREIGN KEY (booked_by) REFERENCES person(id) ON DELETE CASCADE);`
18. 💻 **TASK 9.4 — Junction table** — `CREATE TABLE booking_guest (id INTEGER NOT NULL PRIMARY KEY, booking_id INTEGER, person_id INTEGER, FOREIGN KEY (booking_id) REFERENCES booking(id) ON DELETE CASCADE, FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE);`
19. 💻 **TASK 9.5 — Insert evidence** — Green Acres caretaker's WhatsApp (image card): booking #B-88 for 12 Dec, booked by Dev, 2 guests: "Sir + 1 lady (name not given)". Learner inserts rows in correct order (parents first): person → property → booking → booking_guest `(1, 88, 2), (2, 88, NULL)`.
20. ⚠️ **TRAP — foreign key** — inserting `booking` before `property` → `FOREIGN KEY constraint failed` → Ira: "A foreign key can only hold values that exist in the referenced primary key (RM #30). Parent first, then child."
21. 💻 **TASK 9.6 — Query 1:N** (RM #30): bookings of Green Acres: `SELECT * FROM property JOIN booking ON property.id = booking.property_id WHERE property.name = 'Green Acres Farm Stays';` → reply points at booking 88: `booked_by` 2, `check_in` 2026-12-12 18:45:00.
22. 💻 **TASK 9.7 — Query 1:1** — person and their smartwatch (pre-seeded `smartwatch` table with `person_id` UNIQUE).
23. 💻 **TASK 9.8 — Query M:N** — guests of booking B-88 via `booking_guest` JOIN `person` → only **Dev Arora**. Ira: "Two guests booked, one name came back. Remember this."
    - ❓ **READ IT (S9.21b)** — "You inserted two `booking_guest` rows for 88, the join returned one name. Why?" → the second guest's `person_id` is NULL; JOIN drops it (paid off by RIGHT JOIN in S11).
24. 🔎 **CLUE S9-C1** — "Your tables: Green Acres booking **88** — `booked_by` **Dev Arora**, `check_in` **18:45** tonight, 2 guests in `booking_guest`: him and one guest with **no name** (NULL). The ₹45,000 note said *2 guests* (S5-C2). Who is the second guest?"
25. 🧩 **ACTIVITY — ON DELETE CASCADE demo**: delete a test property → its bookings disappear → "Never test on real evidence!" (sandbox reset).

### Coverage checklist
RM #26 entity/attributes/key/entity type ✔2–3, relationships 1:1/1:N/M:N ✔4–5, cardinality ✔4 · RM #28 ✔8–9 · RM #29/#27 entity→table, relationships ✔10–12 · RM #30 PK ✔14–15, FK ✔14,17, tables ✔15–18, junction ✔18, inserting ✔19, querying 1:N / 1:1 / M:N ✔21–23

⏭️ **HOOK** — Kabir: "I've loaded the full normalised city data: people, UPI accounts, vehicles, rehearsal logs, insurance. Time to **join** everything."

---

## Session 10 — 10:30 PM · "Connect the Dots"

| | |
|---|---|
| Course topic | Joins (`aeedb625…`) |
| Case Notes | RM #31 Joins Part 1 |
| New tables (normalised) | `people(person_id, name, occupation, role, venue)`, `upi_accounts(upi_id, person_id, bank)`, `company(company_id, name, owner_person_id)`, `vehicles` gains `company_id`, `rehearsal_attendance(person_id, venue, check_in, check_out)`, `insurance_claims(claim_id, event_id, filed_by_person_id, filed_at, reason, auto_generated)`, `event_schedule(event_id, artist_checkin_deadline, show_time)` |
| Est. time | 35–45 min |

### Beats
1. 📘 **NOTE — NATURAL JOIN** (joins on common columns).
2. 💻 **TASK 10.1** — UPI accounts with owner names: `SELECT people.name, upi_accounts.upi_id FROM people NATURAL JOIN upi_accounts;` (common column `person_id`).
3. ⚠️ **TRAP — NATURAL JOIN on multiple common columns** (RM #31): `people` and `rehearsal_attendance` both have `person_id` **and** `venue`(home venue vs rehearsal venue) → NATURAL JOIN matches both → Nysa disappears → wrong: "Nysa skipped rehearsal!" → Ira: "NATURAL JOIN used *every* common column. Be explicit."
4. 📘 **NOTE — INNER JOIN … ON** (any comparison operator allowed).
5. 💻 **TASK 10.2** — rehearsal attendance with names: `SELECT people.name, rehearsal_attendance.check_in, rehearsal_attendance.check_out FROM people INNER JOIN rehearsal_attendance ON people.person_id = rehearsal_attendance.person_id WHERE rehearsal_attendance.venue = 'City Stadium';`
    - 🎬 **Nysa cleared**: on stage rehearsing 16:00–21:30, 3,000 crew witnesses.
6. 💻 **TASK 10.3 — INNER JOIN with comparison other than `=`**: claims filed at or after the artist check-in deadline: `SELECT insurance_claims.claim_id, insurance_claims.filed_at, insurance_claims.auto_generated FROM insurance_claims INNER JOIN event_schedule ON insurance_claims.filed_at >= event_schedule.artist_checkin_deadline WHERE insurance_claims.event_id = event_schedule.event_id;` → Kunal's claim at 19:00:01, `auto_generated = 1` (system rule: artist not checked in by 19:00).
    - 🎬 **Kunal cleared**: insurance software files automatically — he didn't even know.
7. 📘 **NOTE — LEFT JOIN** (unmatched rows get NULL).
8. 💻 **TASK 10.4 — LEFT JOIN + IS NULL** (RM pattern "students not enrolled"): suspects with **no** verified alibi row: `SELECT people.name FROM people LEFT JOIN alibis ON people.name = alibis.person_name AND alibis.verified = 1 WHERE alibis.person_name IS NULL AND people.role = 'suspect';` → **Dev Arora** only.
9. 🎬 **LEAD (S10.8b)** — Ira: "In Episode 3 `vehicles` said the SUV's owner is *DA Talent Management Pvt Ltd* — a company, not a person. `company` has an `owner_person_id`. Two joins and we have a name."
   💻 **TASK 10.5 — the company link**, in two 2-table joins (RM #31 only covers two tables; chaining comes in S11):
   - a) `SELECT vehicles.vehicle_no, company.name, company.owner_person_id FROM vehicles INNER JOIN company ON vehicles.company_id = company.company_id WHERE vehicles.vehicle_no = '26 BH 4471 EX';` → DA Talent Management, owner_person_id = 2 (reply: "who is person 2?")
   - b) `SELECT company.name, people.name FROM company INNER JOIN people ON company.owner_person_id = people.person_id WHERE company.name = 'DA Talent Management Pvt Ltd';` → Dev Arora.
    - 🔎 **CLUE S10-C1**: "Your two joins: grey SUV **26 BH 4471 EX** (service gate 18:12, S3-C1) → **DA Talent Management Pvt Ltd** → owner person 2 = **Dev Arora**. The car she left in is her manager's."
10. 🎙️ **CHECK** — "LEFT JOIN with no match fills the right side with ___."

### Coverage checklist
RM #31 NATURAL ✔1–2, multiple common columns ✔3, INNER ✔4–6, LEFT ✔7–8, Try-it ✔9

⏭️ **HOOK** — "Car is Dev's. But where did it *go*? And why was Dev back at the hotel at 19:52?"

---

## Session 11 — 11:00 PM · "The Toll Plaza"

| | |
|---|---|
| Course topic | Querying with Joins (`d828fceb…`) |
| Case Notes | RM #32 Querying with Joins Part 2 · RM #33 Querying with Joins Part 3 |
| New tables | `toll_crossings(crossing_id, vehicle_no, plaza, direction, ts)`, `police_units(unit_id, name, base_area)`, `routes(route_id, name, km)` |
| Est. time | 45–55 min |

### Beats — Part 2 (RM #32)
1. 📘 **NOTE — Joins on multiple tables**, alias the combined table, alias table names (RM best practices).
2. 💻 **TASK 11.1** — toll crossings of Dev's company vehicles: `SELECT T.vehicle_no, people.name, toll_crossings.plaza, toll_crossings.direction, toll_crossings.ts FROM (vehicles INNER JOIN company ON vehicles.company_id = company.company_id) AS T INNER JOIN people ON T.owner_person_id = people.person_id INNER JOIN toll_crossings ON T.vehicle_no = toll_crossings.vehicle_no WHERE people.name = 'Dev Arora';`
3. 💻 **TASK 11.2 — Joins with other clauses** (WHERE, ORDER BY, LIMIT): same + `ORDER BY toll_crossings.ts;` → 18:41:20 OUTBOUND, 19:30:45 INBOUND.
   - ❓ **READ IT (S11.5b)** — "Your two rows in time order: what did the SUV do?" → out of the city and back in 49 minutes.
   - 🔎 **CLUE S11-C1**: "Your three-table join: the SUV crossed Ring Road Toll Plaza **OUTBOUND 18:41** and **INBOUND 19:30**. With S3-C1 (out of the hotel 18:12, back 19:52): a round trip to the outskirts — the direction of RRO-17 (S6-C1)."
4. 💻 **TASK 11.3 — Joins with aggregations**: crossings per vehicle per direction: `SELECT toll_crossings.vehicle_no, direction, COUNT(*) FROM toll_crossings INNER JOIN vehicles ON … GROUP BY toll_crossings.vehicle_no, direction;`

### Beats — Part 3 (RM #33)
5. 📘 **NOTE — RIGHT JOIN** (mirror of LEFT).
6. 💻 **TASK 11.4** — all guest rows of booking B-88, even those without a matching person: `SELECT booking_guest.booking_id, person.name FROM person RIGHT JOIN booking_guest ON person.id = booking_guest.person_id WHERE booking_guest.booking_id = 88;` → `(88, Dev Arora)` and `(88, NULL)`. The S9 INNER JOIN hid the second guest; RIGHT JOIN keeps it. The unregistered "+1 lady" is Tara.
7. 📘 **NOTE — FULL JOIN** (LEFT + RIGHT).
8. 💻 **TASK 11.5** — match hotel gate vehicles with toll crossings (FULL JOIN on vehicle_no): `SELECT DISTINCT gate_log.vehicle_no AS at_hotel_gate, toll_crossings.vehicle_no AS at_toll FROM gate_log FULL JOIN toll_crossings ON gate_log.vehicle_no = toll_crossings.vehicle_no;` → NULL on one side = seen at only one place; only **26 BH 4471 EX** has values on **both** sides.
9. 📘 **NOTE — CROSS JOIN** (every row of one table with every row of the other).
10. 💻 **TASK 11.6 — Plan the rescue**: `SELECT police_units.name, routes.name, routes.km FROM police_units CROSS JOIN routes WHERE police_units.base_area = 'Ring Road' ORDER BY routes.km LIMIT 1;` → nearest unit + shortest road to Green Acres.
11. 📘 **NOTE — SELF JOIN** (join a table with itself; any join type).
12. 💻 **TASK 11.7 — Were they together?** `SELECT p1.device_owner, p2.device_owner, p1.tower_id, p1.ts FROM tower_pings AS p1 INNER JOIN tower_pings AS p2 ON p1.tower_id = p2.tower_id AND p1.ts = p2.ts WHERE p1.device_owner < p2.device_owner AND p1.tower_id = 'RRO-17';` (RM pattern `sc1.student_id < sc2.student_id` to avoid duplicate pairs)
    - 🔎 **CLUE S11-C2**: "Your self join: her watch and his phone pinged RRO-17 at the **same six minutes** — 18:52, 18:58, 19:04, 19:10, 19:16, 19:22. They were together at the farm stay."
13. 🧩 **ACTIVITY — JOINS Summary** (RM table): match each join you used tonight to its picture.
14. 🎬 SCENE — Ira radios the Ring Road unit: "Green Acres, Booking B-88. Go quietly, she's safe in a room — her heart rate is calm." (calm tone; no danger shown)

### Coverage checklist
RM #32 multiple tables ✔1–2, other clauses ✔3, aggregations ✔4 · RM #33 RIGHT ✔5–6, FULL ✔7–8, CROSS ✔9–10, SELF ✔11–12, summary ✔13

⏭️ **HOOK** — Dev's lawyer: "My client was in the hotel. And Tara's contract says she *chose* to skip shows — check the label's system." Ira: "Then let's check how that contract changed."

---

## Session 12 — 11:30 PM · "The Edited Contract"

| | |
|---|---|
| Course topic | Views and Subqueries (`eedd3130…`) |
| Case Notes | RM #35 Views · RM #36 Subqueries · RM #37 Transaction and Indexes (after curation: transactions, ACID, indexes; RM #34 has the same content — both IDs logged) |
| Session order used | Views → Subqueries → Transactions & Indexes (live-unit order) |
| New tables | `contracts(contract_id, artist_name, manager_name, missed_show_clause, manager_bonus)` · `txn_log(lsn, txn_id, entry_type, data_item, old_value, new_value, ts)` · `label_payments(payment_id, payer, payee, amount, ts)` |
| Est. time | 45–55 min |

### Beats — Views (RM #35)
1. 📘 **NOTE — View** = saved query; `CREATE VIEW name AS SELECT …`; views are read-only.
2. 💻 **TASK 12.1** — build the court-ready timeline: `CREATE VIEW vikram_timeline AS SELECT 'gate' AS source, ts, gate AS place FROM gate_log WHERE vehicle_no = '26 BH 4471 EX' UNION ALL SELECT 'toll', ts, plaza FROM toll_crossings WHERE vehicle_no = '26 BH 4471 EX' UNION ALL SELECT 'tower', ts, tower_area FROM tower_pings WHERE device_owner = 'Dev Arora';`
3. 💻 **TASK 12.2 — Querying using a view**: `SELECT * FROM vikram_timeline ORDER BY ts;`
4. 💻 **TASK 12.3 — List all views** (RM): `SELECT name FROM sqlite_master WHERE type = 'view';`
5. 💻 **TASK 12.4 — Delete view**: drop an old draft view `DROP VIEW draft_suspects;`
6. ⚠️ **TRAP — writing through a view** → `UPDATE vikram_timeline …` fails → "Views are read-only."
7. 📘 **NOTE — Advantages**: complex queries reused; **restrict access** → Ira shares a limited view with the event organiser (no personal data).

### Beats — Subqueries (RM #36)
8. 📘 **NOTE — What & why subqueries.**
9. ⚠️ **TRAP — aggregate in WHERE** (RM §3): "Label payments above average": `SELECT * FROM label_payments WHERE amount > AVG(amount);` → `misuse of aggregate` error → explanation.
10. 💻 **TASK 12.5 — Subquery in WHERE**: `SELECT payer, payee, amount FROM label_payments WHERE amount > (SELECT AVG(amount) FROM label_payments);` → 9 rows; reply: Skyline → Dev ₹2,00,000 (the *advance* of S5-C3) towers over normal label fees.
    🎬 **LEAD (S12.9b)** — Dev's lawyer says the contract lets her *choose* to skip shows. Read the contract: `contracts` has `missed_show_clause` and `manager_bonus`.
    💻 **TASK 12.5b — Tara's contract row**: `SELECT * FROM contracts WHERE artist_name = 'Tara Sen';` → `missed_show_clause` Applicable, `manager_bonus` 2500000.
    - 🔎 **CLUE S12-C1**: "Your queries: Skyline paid Dev **₹2,00,000** (*advance*, 11 Dec) — the only label payment far above average. Her contract row: missed-show clause **Applicable**, manager bonus **₹25,00,000**. If she misses the show, he is paid twice." (pinned here, not at beat 16)
11. 📘 **NOTE — Subquery in other clauses** (WHERE, SELECT, FROM, HAVING).
12. 💻 **TASK 12.6 — Subquery in SELECT**: how far each payment is from the average: `SELECT payment_id, payer, payee, amount - (SELECT AVG(amount) FROM label_payments) AS above_avg FROM label_payments;`
13. ⚠️ **TRAP — subquery returns 2 columns** (RM §7, both forms) → `sub-select returns 2 columns - expected 1` / `Row value misused` → Correct Rule card.
14. 💻 **TASK 12.7 — CASE + subquery** (RM Q1 pattern): tag payments "Above Average"/"Below Average".
15. 💻 **TASK 12.8 — Subquery in FROM** (RM Q2 pattern): monthly totals received by Dev from labels: `SELECT payee, AVG(monthly_total) FROM (SELECT payee, strftime('%m', ts) AS month, SUM(amount) AS monthly_total FROM label_payments GROUP BY payee, month) AS monthly_totals GROUP BY payee;`
16. (S12-C1 is pinned at beat 10, right after the contract query.)

### Beats — Transactions & Indexes (RM #37) — concepts + plain SELECTs on the label system's log
17. 📘 **NOTE — Transaction** = a logical group of one or more SQL statements (banking, e-commerce, ticket booking…).
18. 📘 **NOTE — ACID**: Atomicity (all or none) · Consistency (always a consistent state) · Isolation (many at once without harming each other) · Durability (committed changes survive a crash).
19. 🧩 **ACTIVITY — ACID match**: 4 label-system situations → the property they show (e.g. "bonus and contract change saved together or not at all" → Atomicity; "the committed change was still there after the server crash" → Durability).
20. 💻 **TASK 12.9 — Read the log**: `SELECT * FROM txn_log WHERE txn_id IN ('T7', 'T9') OR entry_type = 'CRASH' ORDER BY lsn;` → 7 rows: `T7 START 18:05:10 (darora)` · `T7 WRITE missed_show_clause 'Not Applicable' → 'Applicable'` · **`CRASH 18:07`** · `T9 START 18:20:05 (darora)` · `T9 WRITE missed_show_clause` · `T9 WRITE manager_bonus '0' → '2500000'` · `T9 COMMIT 18:21`.
    - ❓ **READ IT (S12.19b)** — "Who changed `missed_show_clause`, from what, to what — and when?" → darora, Not Applicable → Applicable, 18:05 (lost in the crash) and 18:20 (committed).
21. 💻 **TASK 12.10 — Which transactions never committed?** `SELECT txn_id FROM txn_log WHERE entry_type = 'START' EXCEPT SELECT txn_id FROM txn_log WHERE entry_type = 'COMMIT';` → **T7**.
22. 🧩 **ACTIVITY — Apply ACID**: T7 never committed before the crash → by **atomicity** none of it was applied. T9 committed → by **durability** it survived. So Dev made the change *twice*, the second time after Tara was already in his car.
23. 📘 **NOTE — Indexes** = like the index of a dictionary: speeds up search.
24. 🧩 **ACTIVITY — Index demo**: the engine searches 1 lakh tower pings without and with an index (Kabir creates it behind the scenes); learner compares times (≈ 9 ms vs 0.2 ms). *(No CREATE INDEX syntax — the RM doesn't teach it.)*
25. 🔎 **CLUE S12-C2** — "Your log queries: the clause was **Not Applicable** until user **darora** wrote *Applicable* at 18:05 (T7, lost in the 18:07 crash) and again at **18:20** (T9, committed, bonus set to ₹25 lakh). Both writes came **after** she left the hotel in his SUV at 18:12 (S3-C1). She never agreed to skip the show."
26. 🎙️ **CHECK** — "A transaction crashed before COMMIT. Which ACID property says none of its changes are applied?" (Atomicity)

### Coverage checklist
RM #35 view ✔1, create ✔2, query ✔3, list ✔4, delete ✔5, read-only ✔6, advantages ✔7 · RM #36 intro/why ✔8, aggregate-in-WHERE ✔9–10, other clauses ✔11, SELECT ✔12, WHERE ✔10, mistakes ✔13, problem solving Q1 ✔14, Q2 ✔15 · RM #37 transactions ✔17, ACID ✔18–19, 22, indexes ✔23–24

⏭️ **HOOK** — Radio crackles: "Unit at Green Acres. We have her. She's okay. She's asking: *is the show still on?*"

---

## Session 13 — 12:00 AM · "Showtime" (finale)

| | |
|---|---|
| Course topic | SQL Course Quiz (`order 14` — no reading material) |
| Case Notes | None new — recap cards link back to every RM used |
| Est. time | 30–40 min |

### Beats
1. 🎬 SCENE — Tara on video call from the police jeep: "I saw the farm board when we turned in. I used my watch to pay Mahi ₹1 and typed the name in strange capitals so Dev wouldn't notice."
2. 🧩 **ACTIVITY — Build the case report**: 5 claims; for each, learner selects the pinned clue *and* re-runs (or writes fresh) the query that proves it:
   1. Tara left with Dev's SUV (S3-C1, S10-C1) — joins + LIKE
   2. The SUV went to Ring Road and came back (S11-C1) — multi-table join + ORDER BY
   3. Tara's watch stayed at RRO-17 (S6-C1) — GROUP BY + HAVING
   4. Dev booked Green Acres (S5-C2, S9-C1) — aggregation + join
   5. Dev changed the contract after she was taken (S12-C2) — set ops on `txn_log`
3. 💻 **TASK 13.1 — One final query**: everyone on the suspect list with status, using CASE + subquery + LEFT JOIN: `SELECT people.name, CASE WHEN people.name IN (SELECT person_name FROM alibis WHERE verified = 1) THEN 'Cleared' ELSE 'Charged' END AS status FROM people WHERE role = 'suspect' ORDER BY status;`
4. 🎙️ **CHECKS** — course final-quiz pool plugs in here (later phase).
5. 🎬 SCENE — 00:15, stadium: Tara walks on stage; first song dedicated to "everyone who looked for me with facts, not rumours". Mahi in front row. Sunny gets a VIP pass.
6. 🎬 SCENE — Ira: "Dev is in custody; the court decides the rest. Our job: **evidence, not noise**."
7. 🏅 Rank-up (Intern → Inspector), badges, shareable card (rank + badges only).

### Exit criteria
All 5 claims proven → course completion event.

---

## Appendix A — RM coverage map

| RM # | Title | Session | Note |
|---|---|---|---|
| 1 | Introduction to Databases | S1 | subset of #2 |
| 2 | Introduction to Databases | S1 | primary (curated) |
| 3 | Create Table | S2 | |
| 4 | Inserting Rows | S2 | all 4 mistakes used as traps |
| 5 | Retrieving Data | S2 | |
| 6 | Update Rows | S2 | |
| 7 | Delete Rows | S2 | |
| 8 | Alter Table | S2 | subset of #9 |
| 9 | Alter Table | S2 | primary (curated) |
| 10 | Comparison Operators | S3 | |
| 11 | String Operations | S3 | |
| 12 | Logical Operators | S3 | precedence trap |
| 13 | In and Between Operators | S4 | 3 BETWEEN mistakes |
| 14 | Order By and Distinct | S4 | |
| 15 | Pagination | S4 | 2 OFFSET mistakes |
| 16 | Aggregations | S5 | COUNT variants, special cases |
| 17 | Group By | S5 | |
| 18 | Group By with Having | S6 | WHERE vs HAVING |
| 19 | SQL Expression | S7 | |
| 20 | SQL Functions | S7 | strftime |
| 21 | Cast Functions | S7 | |
| 22 | Arithmetic Functions | S7 | FLOOR/CEIL/ROUND, UPPER/LOWER only |
| 23 | SQL Case | S8 | |
| 24 | SQL Set Operations | S8 | subset of #25 |
| 25 | SQL Set Operations | S8 | primary (curated) |
| 26 | Core Concepts of ER Model | S9 | curated |
| 27 | ER Model to Relational Database | S9 | curated: entity → table, relationships |
| 28 | Applying ER Model Concepts | S9 | |
| 29 | ER Model to Relational Database | S9 | diagrams; shown before #27 rules |
| 30 | Modelling Database - 2 | S9 | PK/FK, junction, JOIN-based queries |
| 31 | Joins Part 1 | S10 | |
| 32 | Querying with Joins Part 2 | S11 | |
| 33 | Querying with Joins Part 3 | S11 | RIGHT/FULL/CROSS/SELF |
| 34 | Transaction and Indexes | S12 | duplicate of #37 (curated) |
| 35 | Views | S12 | |
| 36 | Subqueries | S12 | |
| 37 | Transaction and Indexes | S12 | primary (curated): transactions, ACID, indexes |

## Appendix B — Trap catalogue (all from RM "Possible Mistakes" / notes)

| Session | Trap | RM source | Story effect |
|---|---|---|---|
| S2 | values ≠ columns, wrong table, extra brackets, wrong type (no error) | #4 | Kabir's red stamps |
| S2 | UPDATE without WHERE | #6 | everyone gets Sunny's number |
| S3 | AND/OR precedence | #12 | fan-van red herring (#FanDidIt) |
| S4 | BETWEEN reversed / missing bound / type mismatch | #13 | "empty ≠ nobody" |
| S4 | OFFSET before LIMIT / OFFSET alone | #15 | syntax error explained |
| S5 | COUNT(*) vs COUNT(col) | #16 | overcount of noted payments |
| S5 | SUM on text = 0.0 | #16 | "you summed words" |
| S6 | rows not filtered before grouping | #18 | "she's still in hotel" red herring |
| S7 | strftime text vs number | #20, #21 | wrong hours |
| S8 | column-count mismatch, ORDER BY inside SELECT | #25 | errors explained |
| S9 | child before parent insert | #30 | FK constraint failed |
| S10 | NATURAL JOIN on multiple common columns | #31 | "Nysa skipped rehearsal" red herring |
| S12 | writing through a view | #35 | read-only |
| S12 | aggregate in WHERE; multi-column subquery | #36 | errors explained |
