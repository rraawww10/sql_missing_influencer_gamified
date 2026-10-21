# Session content

| Path | What | Edit? |
|---|---|---|
| `src/sNN.yaml` | **Authored** session: story beats, notes, activities, tasks with reference SQL, traps | ✅ Yes — this is the source |
| `sNN.json` | Public pack the game loads (no reference SQL; expected results as hashes) | ❌ Generated |
| `solutions/sNN.json` | Reference + trap SQL, loaded only for hint tier 3 | ❌ Generated |
| `coverage.json` | Which reading-material headings each session covers (and, per unit, `sNN.units`) | ❌ Generated |
| `../units/uNN.json` + `index.json` | **Units**: one pack per reading material, sliced from its session by the `units:` block | ❌ Generated |

Session flow and story: `docs/SESSION_PLAN.md`. Course text: `content/reading_materials.json` (never edited).

## Build

```bash
cd pipeline && npm install && cd ..        # once
node pipeline/build_sessions.mjs           # all sessions (or --only 3)
node pipeline/test_grader.mjs              # replay answers + traps through the game's grader
cd pipeline && npm run ci                  # case DB checks + build + grader test
```

The build **fails** if: a heading in `rm_ref` doesn't exist in that reading material · any non-generic RM heading of the session is never referenced · a reference query errors / returns no rows / returns a different row count than `expect_rows` · a reference query uses SQL taught in a later session · a trap gives the same result as the answer or doesn't trigger · a clue isn't wired · the session is over 60 minutes.

## Units — one deployable pack per reading material

The course configures every reading material as its own unit, so each session is also cut into **contiguous slices**, one per
primary RM, by a `units:` block at the end of the YAML. A duplicate RM (same text, `role: subset`) is `same_as` its twin and gets an
alias pack. The finale (no RM) is `{ finale: true }`. Each unit may add an `opener` (a scene: "Previously…") and a `closer` (a hook),
so it reads as a story on its own; use `{{placeholders}}` as everywhere.

```yaml
units:
  - unit_id: ba96ed66-…      # RM #3 Create Table
    from: S2.1
    to: S2.7
    closer: { speaker: mentor, body: "Table ready. Next: put the five names into it." }
  - unit_id: 2f13bf2f-…      # RM #4 Inserting Rows
    from: S2.8
    to: S2.9
    opener: { speaker: mentor, body: "Previously: we created an empty `suspects` table…" }
  - unit_id: 5db3ad70-…      # RM #8 Alter Table — same text as RM #9
    same_as: d9b767b9-…
```

Rules the build enforces: slices are contiguous, in order, and cover every beat · every RM of the session is sliced or aliased ·
`exit` is split by slice (a unit needs only its own clues and beats) · `previously` of a unit = earlier sessions' clues **plus the
clues of earlier parts of the same session** (shown as *briefed* unless earned) · unit numbers = RM `global_sequence`, finale = 38.
A heading of a unit's RM that is only referenced from another slice (a later task that looks back) gives a **warning**, not an error:
the session still covers it. Tasks never depend on an earlier task's result (each has its own `setup`), so any unit can start cold.

## Beat types

| type | Required fields | Optional |
|---|---|---|
| `scene` | `body` | `speaker`, `minutes` |
| `note` | `rm_ref`, `body` | `see_also` (more rm_refs), `minutes` |
| `activity` | `kind`, `prompt` + kind fields | `rm_ref`, `feedback` |
| `task` | `task_id`, `ask`, `ref`, hints tier 1 (`rm_ref`) + tier 2 (`skeleton`) | `setup`, `grading`, `traps`, `on_pass.clue`, `reply_on_pass`, `rm_ref` |
| `clue` | `clue_id`, `title`, `body` | `requires_task` |
| `check` | `prompt`, `options` (exactly one `correct: true`), `explain` | `source: authored` (swap for course MCQ later) |
| `hook` | `body` | `speaker` |

Activity kinds: `sort_into` (buckets + items), `match` (pairs), `order` (steps, in correct order), `pick_cell` (tables + answer), `multi_select` (options).

Speakers: `narrator`, `system`, or any person key in `content/story/cast.json` (`mentor`, `analyst`, `guard`, `driver`, `sister`, `star`, `manager`, …).

## Names, places and plates: always placeholders

Never type a character, place or plate into a session — use the cast (`content/story/cast.json`), so a rename is one edit:

| Write | Becomes (today) |
|---|---|
| `{{star}}` / `{{star.first}}` / `{{manager.last}}` | Tara Sen / Tara / Arora |
| `{{manager.login}}` | darora (first initial + surname) |
| `{{hotel}}`, `{{stadium}}`, `{{hometown}}`, `{{farm}}`, `{{toll}}` | The Grand Residency, City Stadium, Chandpur, … |
| `{{suv}}`, `{{suv_near_miss}}` | 26 BH 4471 EX, 26 BH 4417 EY |

Placeholders work everywhere (story text, asks, reference SQL, traps). An unknown placeholder fails the build. Exception: Session 3's LIKE puzzles spell out plate *patterns* (`'26 BH%'`, `'%EX'`, `'26 BH 4471 E_'`) — if you change plates in the cast, update those patterns and the plate rules in `pipeline/build_case_db.py`.

Default minutes: scene 0.5 · note 1.5 · activity 2 · task 3 · clue 0.5 · check 1 · hook 0.5 (override with `minutes`).

## Tasks

```yaml
- id: S3.18
  type: task
  task_id: T3.8
  ask: "Show grey vehicles that used the service gate or the staff gate."
  setup: []                      # SQL run first (state from earlier tasks); visible to the client
  ref: "SELECT * FROM gate_log WHERE vehicle_colour = 'Grey' AND (gate = 'SERVICE' OR gate = 'STAFF');"
  grading:
    ordered: false               # true when the task asks for an order
    inspect: "SELECT …"          # for DDL/DML: query whose result is compared after the learner's SQL
    expect_rows: 4               # build-time sanity check
    allow_empty: false
  hints:
    - { tier: 1, rm_ref: { unit_id: …, heading: "Precedence" } }
    - { tier: 2, skeleton: "… (gate = 'SERVICE' ____ gate = 'STAFF');" }
  traps:
    - id: precedence
      rm_ref: { unit_id: …, heading: "Precedence" }   # the RM "Possible Mistake" / note it comes from
      sql: "… AND gate = 'SERVICE' OR gate = 'STAFF';"
      match: result               # or: error  (+ error_regex)
      inspect: "SELECT …"         # optional: compare this query's result instead
      sql_regex: "…"              # optional: learner SQL must also match (tells apart traps with the same error)
      reply: "Story reply shown instead of a plain 'wrong'."
  on_pass: { clue: S3-C1 }
```

Grading compares results by **value**, ignoring column names but not column count or order of columns. Ask for exact columns or say "all the details" (`SELECT *`).

## Writing rules

- Teach only what the session's reading materials contain (`docs/SESSION_PLAN.md` Appendix A). The build's feature audit enforces this for reference SQL.
- Simple English: short sentences, one idea per line.
- Safety: say "missing", never "kidnap"; no violence; fans are respected; see `PLAN.md` §3.

## Evidence chain — a clue is earned, never told (`docs/SESSION_PLAN.md` §0.5)

Every `clue` beat is the last of four beats, in this order:

1. **Lead** (`scene`): names the data source and the open question ("`key_card_last_location` — where was her card tapped last?").
2. **Task**: its `ask` is that question; its result must show **every** fact the clue states. Need a second fact (a note, a date)? Add a small second task.
3. **Read it** (`activity` `pick_cell` on a copy of the result, or a `check`): the learner reads the result before the card. `reply_on_pass` says which columns to read.
4. **Clue** (`requires_task` = the task): starts "Your query…", states only what was shown, cites earlier clues by id (`S2-C1`). Witness statements are labelled *Witness*, apart from *Data*.

Check it: `python3 pipeline/audit_clues.py [session…]` — prints each clue with its unlocking task, the real result rows and the beats before it; exits 1 if a time / plate / amount in a clue was never shown in a result or an earlier clue.
