// Replays every reference answer and every trap through the game's grader, using only the
// public packs (content/sessions/sNN.json) + snapshots. Solutions are read only to get the SQL.
//
// Usage: node pipeline/test_grader.mjs
// Expect: each reference → pass, each trap → trap (with the right id), each "wrong" probe → not pass.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { gradeTask } from '../shared/grader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESS = path.join(ROOT, 'content/sessions');
const SQL = await initSqlJs();

// A few plausible wrong answers that must NOT pass
const WRONG_PROBES = {
  'T2.5': 'SELECT name FROM suspects;',
  'T2.6': "SELECT * FROM hotel_guests WHERE room_no = 705;",
  'T3.3a': "SELECT * FROM gate_log WHERE vehicle_no LIKE '%BH%';",
  'T3.5': "SELECT * FROM gate_log WHERE gate = 'SERVICE' AND direction = 'OUT';",
  'T3.8': "SELECT * FROM gate_log WHERE vehicle_colour = 'Grey';",
};

let failed = 0, total = 0;
const expect = (ok, msg) => { total++; if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

for (const f of fs.readdirSync(SESS).filter((x) => /^s\d\d\.json$/.test(x)).sort()) {
  const pack = JSON.parse(fs.readFileSync(path.join(SESS, f), 'utf8'));
  const sol = JSON.parse(fs.readFileSync(path.join(SESS, 'solutions', f), 'utf8'));
  const bytes = fs.readFileSync(path.join(ROOT, 'content/case_db/snapshots', `${pack.snapshot}.sqlite`));
  const openDb = () => { const db = new SQL.Database(new Uint8Array(bytes)); db.exec('PRAGMA foreign_keys = ON;'); return db; };

  for (const task of pack.beats.filter((b) => b.type === 'task')) {
    const s = sol[task.task_id];
    const v = await gradeTask(task, s.ref, openDb);
    expect(v.status === 'pass', `${task.task_id} reference → ${v.status} ${v.error ?? ''}`);
    for (const t of s.traps) {
      const tv = await gradeTask(task, t.sql, openDb);
      expect(tv.status === 'trap' && tv.trap.id === t.id, `${task.task_id} trap ${t.id} → ${tv.status}${tv.trap ? ' ' + tv.trap.id : ''}`);
    }
    if (WRONG_PROBES[task.task_id]) {
      const wv = await gradeTask(task, WRONG_PROBES[task.task_id], openDb);
      expect(wv.status !== 'pass', `${task.task_id} wrong probe passed`);
    }
    // keywords in lower case must still pass (RM #6: SQLite is case insensitive)
    const lower = s.ref.replace(/\b(SELECT|FROM|WHERE|AND|OR|NOT|LIKE|UPDATE|SET|INSERT|INTO|VALUES|DELETE|CREATE|TABLE|ALTER|ADD|RENAME|COLUMN|TO|DROP|PRAGMA)\b/g, (k) => k.toLowerCase());
    const lv = await gradeTask(task, lower, openDb);
    expect(lv.status === 'pass', `${task.task_id} lower-case keywords → ${lv.status} ${lv.error ?? ''}`);
  }
}
console.log(`${total - failed}/${total} grader expectations met`);
process.exit(failed ? 1 : 0);
