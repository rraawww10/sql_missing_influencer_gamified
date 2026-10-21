# shared/

Plain ES modules used by **both** the content pipeline (`pipeline/`, Node) and the game (`app/`, browser).
No dependencies. Type declarations sit next to each module (`*.d.mts`).

| Module | What |
|---|---|
| `result.mjs` | Result normalisation + SHA-256 fingerprint (Web Crypto) |
| `grader.mjs` | Grades a learner's SQL against a public task (pass / trap / error / wrong) |
| `sql_features.mjs` | Which SQL feature is taught in which session (audit + in-game nudge) |

Changing `result.mjs` changes every expected hash: rebuild sessions (`node pipeline/build_sessions.mjs`).
