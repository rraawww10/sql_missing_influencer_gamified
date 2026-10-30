import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, loadCatalogue, ingest, parseRoster, Analytics } from './lib.mjs';

const cat = loadCatalogue(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content', 'sessions'));
const ep1 = cat.get(1);
let n = 0;
const ev = (user, verb, session, object = {}, result, ts = new Date().toISOString()) =>
  ({ event_id: `e${++n}`, user_id: user, sitting_id: 's', verb, object: { type: 'beat', id: object.beat ?? 'x', session, ...object }, course_ref: { topic_id: 't' }, ...(result ? { result } : {}), client_ts: ts });

function setup() {
  const db = openDb(':memory:');
  return { db, a: new Analytics(db, cat) };
}

test('catalogue has all 13 episodes and labels beats', () => {
  assert.equal(cat.sessions.length, 13);
  assert.ok(cat.totalBeats > 200);
  assert.match(ep1.beats.find((b) => b.type === 'note').label, /^Case Note: /);
  assert.equal(cat.workingOn(1, null), ep1.beats[0].id);
  assert.equal(cat.workingOn(1, ep1.beats[0].id), ep1.beats[1].id);
});

test('ingest is idempotent and rejects bad events', () => {
  const { db } = setup();
  const e = ev('lms:A', 'beat_viewed', 1, { beat: ep1.beats[0].id });
  assert.deepEqual(ingest(db, [e, e, { event_id: 'bad', verb: 'nope' }]), { added: 1, duplicates: 1, rejected: 1 });
  assert.deepEqual(ingest(db, [e]), { added: 0, duplicates: 1, rejected: 0 });
  assert.ok(ingest(db, 'x').error);
  const row = db.prepare('SELECT student_id, is_guest FROM events').get();
  assert.deepEqual({ ...row }, { student_id: 'A', is_guest: 0 });
});

test('progress, time and level per student; guests hidden by default', () => {
  const { db, a } = setup();
  const [b0, b1, b2] = ep1.beats;
  ingest(db, [
    ev('lms:A', 'session_started', 1, { type: 'session', id: 'S1' }),
    ev('lms:A', 'heartbeat', 1, {}, { seconds: 30 }),                    // on beat 0
    ev('lms:A', 'beat_viewed', 1, { beat: b0.id }),
    ev('lms:A', 'heartbeat', 1, { beat: b0.id }, { seconds: 30 }),       // on beat 1
    ev('lms:A', 'heartbeat', 1, { beat: b0.id }, { seconds: 9999 }),     // clamped to 120
    ev('lms:A', 'beat_viewed', 1, { beat: b1.id }),
    ev('lms:A', 'beat_viewed', 1, { beat: b1.id }),                     // same beat twice counts once
    ev('guest-uuid', 'beat_viewed', 1, { beat: b0.id }),
  ]);
  const rows = a.students();
  assert.equal(rows.length, 1);
  const s = rows[0];
  assert.equal(s.student_id, 'A');
  assert.equal(s.beats_done, 2);
  assert.equal(s.seconds, 180);
  assert.equal(s.level, 1);
  assert.equal(s.level_status, 'in progress');
  assert.equal(s.progress_pct, Math.round((2 / cat.totalBeats) * 1000) / 10);
  assert.equal(a.students({ guests: true }).length, 2);

  const d = a.student('A');
  const beats = d.episodes[0].beats;
  assert.equal(beats.find((b) => b.id === b0.id).seconds, 30);
  assert.equal(beats.find((b) => b.id === b1.id).seconds, 150);
  assert.equal(beats.find((b) => b.id === b2.id).done, false);

  const e = a.episode(1);
  assert.equal(e.started, 1);
  assert.equal(e.beats[2].here_now, 1);       // A's next step is beat 3
});

test('completion, funnel, batches and roster', () => {
  const { db, a } = setup();
  ingest(db, [
    ev('lms:A', 'session_started', 1, { type: 'session', id: 'S1' }),
    ev('lms:A', 'session_completed', 1, { type: 'session', id: 'S1' }, { points: 50 }),
    ev('lms:B', 'session_started', 1, { type: 'session', id: 'S1' }),
  ]);
  const r = parseRoster('Student ID,Name,Batch\nA,"Sharma, Aarav",Beta-A\nB,Diya,Beta-B\nC,Ravi,Beta-A\n');
  assert.equal(r.rows[0].name, 'Sharma, Aarav');
  assert.deepEqual(a.saveRoster(r.rows), { saved: 3, roster: 3, roster_played: 2, roster_not_started: 1 });
  const o = a.overview();
  assert.equal(o.totals.playing, 2);
  assert.equal(o.totals.not_started, 1);
  assert.equal(o.funnel[0].started, 2);
  assert.equal(o.funnel[0].completed, 1);
  assert.equal(a.students({ batch: 'Beta-A' }).map((s) => s.student_id).join(), 'A');
  assert.equal(a.students().find((s) => s.student_id === 'A').level_status, 'completed');
  const csv = a.exportCsv({ batch: 'Beta-A' }).split('\n');
  assert.equal(csv.length, 3);                // header, A, C (not started)
  assert.match(csv[1], /^A,"Sharma, Aarav",Beta-A/);
  assert.match(csv[2], /^C,Ravi,Beta-A,0,Not started/);
  assert.ok(parseRoster('name\nx').error);
});

test('CSV export neutralises spreadsheet formulas', () => {
  const { db, a } = setup();
  ingest(db, [ev('lms:X', 'session_started', 1, { type: 'session', id: 'S1' })]);
  a.saveRoster([{ student_id: 'X', name: '=HYPERLINK("evil")', batch: null }]);
  assert.match(a.exportCsv().split('\n')[1], /^X,"'=HYPERLINK\(""evil""\)"/);
});
