// Fills a SEPARATE demo database with made-up students so the dashboard can be tried before real students play.
//   node seed-demo.mjs [students=80]  → data/demo.sqlite, then: DB_PATH=data/demo.sqlite ADMIN_PASSWORD=demo node server.mjs
// Never point this at the real database: every name and number here is invented.
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, loadCatalogue, ingest, Analytics } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, 'data', 'demo.sqlite');
const N = Number(process.argv[2] ?? 80);
for (const f of [FILE, `${FILE}-wal`, `${FILE}-shm`]) fs.rmSync(f, { force: true });

const db = openDb(FILE);
const cat = loadCatalogue(path.join(HERE, '..', 'content', 'sessions'));
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const FIRST = ['Aarav', 'Diya', 'Ishaan', 'Ananya', 'Rohan', 'Kavya', 'Arjun', 'Meera', 'Vikram', 'Sneha', 'Aditya', 'Pooja', 'Karthik', 'Nisha', 'Rahul', 'Priya', 'Sai', 'Lakshmi', 'Manoj', 'Divya'];
const LAST = ['Sharma', 'Reddy', 'Iyer', 'Patel', 'Naidu', 'Das', 'Khan', 'Singh', 'Rao', 'Gupta', 'Menon', 'Verma'];
const BATCHES = ['Beta-A', 'Beta-B', 'Batch-1'];

const roster = [];
const events = [];
const now = Date.now();
for (let i = 1; i <= N; i++) {
  const id = `STU${String(1000 + i)}`;
  roster.push({ student_id: id, name: `${pick(FIRST)} ${pick(LAST)}`, batch: BATCHES[i % 3] });
  if (rnd() < 0.12) continue;                                            // on the roster, never opened the game
  const keen = rnd();
  const reach = Math.max(1, Math.min(13, Math.round(1 + keen * keen * 13 + rnd() * 2)));
  let t = now - (4 + rnd() * 16) * 86400_000;
  const push = (verb, session, object, result, extra = 0) => {
    t += extra;
    events.push({ event_id: crypto.randomUUID(), user_id: `lms:${id}`, sitting_id: `${id}-s${session}`, verb,
      object: { session, ...object }, course_ref: { topic_id: 't' }, ...(result ? { result } : {}), client_ts: new Date(Math.min(t, now - 60_000)).toISOString() });
  };
  push('session_started', 0, { type: 'session', id: 'S0' });
  push('heartbeat', 0, { type: 'session', id: 'S0' }, { seconds: 30 }, 30_000);
  for (let n = 1; n <= reach; n++) {
    const ep = cat.get(n);
    t += (rnd() < 0.5 ? 0.1 : 0.4 + rnd() * 1.6) * 86400_000 * (1 - keen * 0.6);
    if (t > now) break;
    push('session_started', n, { type: 'session', id: `S${n}` });
    const last = n === reach && rnd() < 0.7 ? Math.floor(rnd() * ep.beats.length) : ep.beats.length;
    let prev = null;
    for (const b of ep.beats.slice(0, last)) {
      const slow = b.type === 'task' ? 60 + rnd() * 240 * (n / 6) : b.type === 'activity' ? 40 + rnd() * 80 : 10 + rnd() * 40;
      for (let s = slow; s > 0; s -= 30) push('heartbeat', n, { type: 'session', id: `S${n}`, ...(prev ? { beat: prev } : {}) }, { seconds: Math.round(Math.min(30, s)) }, Math.min(30, s) * 1000);
      if (b.type === 'task') {
        const tries = 1 + Math.floor(rnd() * rnd() * 5 * (n / 5));
        for (let a = 1; a <= tries; a++) {
          const ok = a === tries;
          push('task_attempted', n, { type: 'task', id: b.task_id, beat: b.id }, { attempt: a, status: ok ? 'pass' : rnd() < 0.3 ? 'trap' : 'fail', sql: 'SELECT …' }, 20_000);
          if (!ok && rnd() < 0.25) push('trap_hit', n, { type: 'task', id: b.task_id, beat: b.id }, { attempt: a });
          if (!ok && a >= 2 && rnd() < 0.5) push('hint_used', n, { type: 'hint', id: `${b.task_id}#1`, beat: b.id }, { tier: 1 });
        }
        push('task_passed', n, { type: 'task', id: b.task_id, beat: b.id }, { attempts: tries });
      } else {
        const verb = { activity: 'activity_done', check: 'check_answered', clue: 'clue_pinned' }[b.type] ?? 'beat_viewed';
        push(verb, n, { type: verb === 'beat_viewed' ? 'beat' : b.type, id: b.id, beat: b.id });
      }
      prev = b.id;
    }
    if (last === ep.beats.length) push('session_completed', n, { type: 'session', id: `S${n}` }, { points: Math.round(40 + rnd() * 60) });
    else break;
  }
}
for (let i = 0; i < events.length; i += 500) ingest(db, events.slice(i, i + 500));
const r = new Analytics(db, cat).saveRoster(roster);
console.log(`demo: ${events.length} events, roster ${r.roster}, played ${r.roster_played} → ${FILE}`);
