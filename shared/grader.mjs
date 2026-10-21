// Grades a learner's SQL for one task, using only the PUBLIC session pack (no reference SQL).
// Shared by the game (app/) and the pipeline (pipeline/). Dependency-free apart from result.mjs.
//
//   const verdict = await gradeTask(task, learnerSql, openDb)
//   openDb() must return a fresh sql.js Database for the session snapshot (foreign keys ON).
//
// verdict.status:
//   'pass'  — result matches the expected hash
//   'trap'  — a known mistake from the reading material; verdict.trap has the story reply
//   'error' — SQLite error that isn't a known trap; verdict.error has the message
//   'wrong' — ran fine, different result

import { hashResult } from './result.mjs';

function runOnce(openDb, setup, sql, inspect) {
  const db = openDb();
  try {
    for (const s of setup ?? []) db.exec(s);
    let res;
    try { res = db.exec(sql); } catch (e) { return { error: e.message }; }
    if (inspect) res = db.exec(inspect);
    return { result: res.at(-1) };
  } finally {
    db.close();
  }
}

const sqlMatches = (trap, sql) => !trap.match.sql_regex || new RegExp(trap.match.sql_regex, 'i').test(sql);

export async function gradeTask(task, learnerSql, openDb) {
  const g = task.grading ?? {};
  const ordered = !!g.ordered;
  // more specific traps (those that also match the learner's SQL text) are tried first
  const traps = [...(task.traps ?? [])].sort((a, b) => !!b.match.sql_regex - !!a.match.sql_regex);
  const run = runOnce(openDb, task.setup, learnerSql, g.inspect);

  if (run.error) {
    const trap = traps.find((t) => t.match.error_regex && new RegExp(t.match.error_regex).test(run.error) && sqlMatches(t, learnerSql));
    return trap ? { status: 'trap', trap, error: run.error } : { status: 'error', error: run.error };
  }

  const hash = await hashResult(run.result, { ordered });
  if (hash === g.expected_hash) return { status: 'pass', result: run.result };

  for (const t of traps) {
    if (!t.match.result_hash || !sqlMatches(t, learnerSql)) continue;
    let h = hash;
    if (t.match.inspect) {
      const r = runOnce(openDb, task.setup, learnerSql, t.match.inspect);
      if (r.error) continue;
      h = await hashResult(r.result, { ordered });
    }
    if (h === t.match.result_hash) return { status: 'trap', trap: t, result: run.result };
  }
  return { status: 'wrong', result: run.result };
}
