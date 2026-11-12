// Fills a SEPARATE demo/test database with made-up students so the dashboard and the game can be tried before real students play.
//   node seed-demo.mjs [students=80] [--out data/test.sqlite]   (default data/demo.sqlite)
//   then: DB_PATH=data/demo.sqlite ADMIN_PASSWORD=demo node server.mjs
// Two kinds of students:
//   * N random students, NxtWave IDs NW100001…, most of them registered through the start screen (typed name), with
//     progress, time, episode feedback and chapter check-ins - to fill the dashboard
//   * the six TEST STUDENTS NWTEST01…06 from test-data/test-students.json (made by the real game engine,
//     npm run make:test-students in app/) - sign in as them in the game to test "welcome back" (docs/TESTING_GUIDE.md)
// Never point this at the real database: every name and number here is invented.
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, loadCatalogue, ingest, ingestFeedback, ingestCheckpoint, identify, saveSitting, Analytics } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const outAt = process.argv.indexOf('--out');
const FILE = outAt > 0 ? path.resolve(process.argv[outAt + 1]) : path.join(HERE, 'data', 'demo.sqlite');
const N = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 80);
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
const feedback = [];
const checkpoints = [];
const registered = [];
const now = Date.now();
for (let i = 1; i <= N; i++) {
  const id = `NW${String(100000 + i)}`;
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  // 70%: only typed their name on the start screen (no roster row) · 30%: also on the uploaded roster (batch)
  if (rnd() < 0.3) roster.push({ student_id: id, name, batch: BATCHES[i % 3] });
  if (rnd() < 0.12) { if (rnd() < 0.5) registered.push({ student_id: id, name }); continue; }   // never played (some registered)
  registered.push({ student_id: id, name });
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
      if (b.type === 'clue' && rnd() < 0.45) {
        const chapter = ep.beats.slice(0, ep.beats.indexOf(b) + 1).filter((x) => x.type === 'clue').length;
        if (chapter < ep.chapters) checkpoints.push({ user_id: `lms:${id}`, session: n, chapter, rating: Math.max(1, Math.min(4, Math.round(2.9 + (rnd() - 0.4) * 2 - (n > 9 ? 0.5 : 0)))),
          comment: rnd() < 0.25 ? pick(['More examples please', 'This chapter was fun', 'I got lost in the table names', 'Kaal hints helped', 'Too long', 'Loved the twist']) : undefined, client_ts: new Date(t).toISOString() });
      }
      prev = b.id;
    }
    if (last === ep.beats.length) {
      push('session_completed', n, { type: 'session', id: `S${n}` }, { points: Math.round(40 + rnd() * 60) });
      if (rnd() < 0.55) feedback.push({ user_id: `lms:${id}`, session: n, rating: Math.max(1, Math.min(5, Math.round(3.6 + (rnd() - 0.3) * 2.6 - (n > 9 ? 0.6 : 0)))),
        mood: pick(['Loved it', 'Fun', 'Fun', 'Okay', 'Confusing', 'Boring']), difficulty: pick(n > 8 ? ['right', 'hard', 'hard'] : ['easy', 'right', 'right']),
        liked: ['The story', 'Inspector Kaal', 'SQL tasks', 'Case Notes', 'Puzzles', 'Sounds', 'The look'].filter(() => rnd() < 0.35),
        comment: rnd() < 0.3 ? pick(['Kaal is so cool!', 'The JOIN task was confusing', 'Loved the newspaper at the end', 'Too many steps before the SQL', 'Sounds are fun', 'Hint envelopes helped a lot', 'Please add more puzzles', 'The story is getting interesting!']) : undefined,
        sound_on: rnd() < 0.7, client_ts: new Date(t).toISOString() });
    }
    else break;
  }
}
for (const s of registered) identify(db, s);
for (let i = 0; i < events.length; i += 500) ingest(db, events.slice(i, i + 500));
for (const f of feedback) ingestFeedback(db, f);
for (const c of checkpoints) ingestCheckpoint(db, c);
new Analytics(db, cat).saveRoster(roster);

// the six test students (exact game-engine histories)
const FIX = path.join(HERE, 'test-data', 'test-students.json');
let fixed = 0;
if (fs.existsSync(FIX)) {
  const fx = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  // the file was generated at some point in the past: move every date forward so the histories end "recently"
  const shift = Math.max(0, now - Date.parse(fx.generated_at));
  const mv = (iso) => new Date(Date.parse(iso) + shift).toISOString();
  for (const s of fx.students) {
    s.registered_at = mv(s.registered_at);
    s.events = s.events.map((e) => ({ ...e, client_ts: mv(e.client_ts) }));
    s.feedback = s.feedback.map((f) => ({ ...f, client_ts: mv(f.client_ts) }));
    s.checkpoints = s.checkpoints.map((c) => ({ ...c, client_ts: mv(c.client_ts) }));
    s.sittings = s.sittings.map((x) => { const v = JSON.parse(x.value); v.savedAt += shift; v.state.startedAt = mv(v.state.startedAt); return { ...x, saved_at: v.savedAt, value: JSON.stringify(v) }; });
  }
  for (const s of fx.students) {
    identify(db, { student_id: s.id, name: s.name });
    db.prepare('UPDATE students SET batch = ?, registered_at = ? WHERE student_id = ?').run(s.batch, s.registered_at, s.id);
    for (let i = 0; i < s.events.length; i += 500) ingest(db, s.events.slice(i, i + 500));
    for (const f of s.feedback) ingestFeedback(db, { user_id: `lms:${s.id}`, ...f });
    for (const c of s.checkpoints) ingestCheckpoint(db, { user_id: `lms:${s.id}`, ...c });
    for (const x of s.sittings) saveSitting(db, { op: 'save', user_id: `lms:${s.id}`, scope: x.scope, saved_at: x.saved_at, value: x.value });
    fixed++;
  }
}
console.log(`seeded ${FILE}: ${N} random students (${events.length} events, ${feedback.length} episode feedback, ${checkpoints.length} chapter check-ins) + ${fixed} test students NWTEST01-0${fixed}`);
