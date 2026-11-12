// Look inside the database: what exactly has been recorded, table by table. Read-only.
//   node --no-warnings inspect.mjs [--db data/test.sqlite]              every table: row counts + the latest rows
//   node --no-warnings inspect.mjs NWTEST03 [--db data/test.sqlite]     one student: everything stored under their NxtWave ID
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dbAt = args.indexOf('--db');
const FILE = dbAt >= 0 ? path.resolve(args[dbAt + 1]) : process.env.DB_PATH ?? path.join(HERE, 'data', 'test.sqlite');
const id = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--db')?.toUpperCase();
const db = new DatabaseSync(FILE, { readOnly: true });
const q = (sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r }));
const short = (v, n = 70) => { const t = String(v ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const table = (title, rows) => { console.log(`\n■ ${title}`); rows.length ? console.table(rows) : console.log('  (nothing)'); };

console.log(`Database: ${FILE}`);
if (!id) {
  for (const t of ['students', 'events', 'feedback', 'checkpoint_feedback', 'sittings'])
    console.log(`  ${t.padEnd(20)} ${q(`SELECT COUNT(*) AS n FROM ${t}`)[0].n} rows`);
  table('events by type', q(`SELECT verb, COUNT(*) AS rows, COUNT(DISTINCT student_id) AS students FROM events GROUP BY verb ORDER BY rows DESC`));
  table('latest 10 students to register', q(`SELECT student_id AS nxtwave_id, entered_name, name AS roster_name, batch, registered_at, logins FROM students WHERE registered_at IS NOT NULL ORDER BY registered_at DESC LIMIT 10`));
  table('latest 10 events', q(`SELECT student_id AS nxtwave_id, verb, session AS ep, beat, seconds, client_ts FROM events ORDER BY client_ts DESC LIMIT 10`));
  table('latest 5 episode feedback', q(`SELECT student_id AS nxtwave_id, session AS ep, rating, mood, difficulty, comment FROM feedback ORDER BY client_ts DESC LIMIT 5`).map((r) => ({ ...r, comment: short(r.comment, 50) })));
  table('latest 5 chapter check-ins', q(`SELECT student_id AS nxtwave_id, session AS ep, chapter, rating, comment FROM checkpoint_feedback ORDER BY client_ts DESC LIMIT 5`).map((r) => ({ ...r, comment: short(r.comment, 50) })));
  console.log('\nTip: add a NxtWave ID to see one student, e.g. node --no-warnings inspect.mjs NWTEST03');
} else {
  table(`students row for ${id}`, q(`SELECT student_id AS nxtwave_id, entered_name, name AS roster_name, batch, registered_at, last_login_at, logins FROM students WHERE student_id = ?`, id));
  table('what they did (events by type)', q(`SELECT verb, COUNT(*) AS rows, SUM(seconds) AS seconds FROM events WHERE student_id = ? GROUP BY verb ORDER BY rows DESC`, id));
  table('time per episode (active seconds from heartbeats)', q(`SELECT session AS ep, SUM(seconds) AS seconds, ROUND(SUM(seconds) / 60.0, 1) AS minutes FROM events WHERE student_id = ? AND verb = 'heartbeat' GROUP BY session`, id));
  table('SQL they ran (latest 10)', q(`SELECT session AS ep, object_id AS task, json_extract(result, '$.status') AS status, json_extract(result, '$.sql') AS sql, client_ts FROM events WHERE student_id = ? AND verb = 'task_attempted' ORDER BY client_ts DESC LIMIT 10`, id).map((r) => ({ ...r, sql: short(r.sql, 60) })));
  table('latest 15 events', q(`SELECT verb, session AS ep, beat, object_id, seconds, client_ts FROM events WHERE student_id = ? ORDER BY client_ts DESC LIMIT 15`, id));
  table('episode feedback', q(`SELECT session AS ep, rating, mood, difficulty, liked, comment, client_ts FROM feedback WHERE student_id = ? ORDER BY session`, id));
  table('chapter check-ins (1 lost · 2 okay · 3 good · 4 great)', q(`SELECT session AS ep, chapter, rating, comment, client_ts FROM checkpoint_feedback WHERE student_id = ? ORDER BY session, chapter`, id));
  table('unfinished episodes saved for another device', q(`SELECT scope, json_extract(state, '$.state.index') + 1 AS at_step, datetime(saved_at / 1000, 'unixepoch') AS saved_utc FROM sittings WHERE student_id = ?`, id));
}
