# Case DB

Fictional data the learner queries in "SQL: The Missing Influencer". It runs only in the browser (sql.js).

| Path | What | Edit by hand? |
|---|---|---|
| `schema.sql` | Every case table | Yes |
| `../../pipeline/build_case_db.py` | Story rows (clue graph) + seeded background noise | Yes — the source of truth for data |
| `seed/*.sql` | Generated INSERTs, one file per table, for review | No (regenerated) |
| `snapshots/sNN.sqlite` | One DB per session, only the tables unlocked by then, plus the state the learner already produced | No (regenerated) |
| `runtime/index_demo.sql` | Fills `tower_pings_archive` (1 lakh rows) in the browser for the S12 index demo | Yes |
| `checks.json` | Reference queries, traps and clue checks for every task in `docs/SESSION_PLAN.md` | Yes |

## Build and check

```bash
python3 pipeline/build_case_db.py            # seeds + snapshots (deterministic)
cd pipeline && npm install && cd ..          # once: sql.js
node pipeline/check_case_db.mjs              # all checks, same SQLite build as the browser (3.49)
node pipeline/check_case_db.mjs --only S07 --show
```

Python's bundled SQLite (3.37) lacks RIGHT/FULL JOIN, so checks run on sql.js.

## Rules for changing data

- Story rows live in the `build_*` functions with explicit values. Noise must never create a second answer to a clue query; each generator has guards (reserved names, no `26 BH` / `…71` plates in noise, no noise at tower RRO-17, no `:00` seconds in noise pings, hotel pickups 17:30–18:30 story-only).
- After any change: rebuild, run the checks, and update counts in `docs/SESSION_PLAN.md` if a check's expected count changes.

## Snapshot contents

| Snapshot | Adds | Learner state baked in |
|---|---|---|
| s01 | hotel_guests | — |
| s02 | rumours | — (learner creates `suspects`) |
| s03 | gate_log, vehicles, suspects (canonical, post-S2 shape) | rumours dropped |
| s04 | cab_rides | |
| s05 | upi_payments | |
| s06 | tower_pings | |
| s07 | watch_log (evening distance in cm — the export bug) | |
| s08 | alibis, fan_dms | watch_log distance fixed (S7 TASK 7.6) |
| s09 | smartwatch | — (learner creates person/property/booking/booking_guest) |
| s10 | canonical S9 tables, people, upi_accounts, company, rehearsal_attendance, event_schedule, insurance_claims | |
| s11 | toll_crossings, police_units, routes | Nysa + Kunal alibis verified (S10) |
| s12 | contracts, label_payments, txn_log, view `draft_suspects` | |
| s13 | — | view removed |
