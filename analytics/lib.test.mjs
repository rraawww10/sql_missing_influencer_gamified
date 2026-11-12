import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, loadCatalogue, ingest, ingestFeedback, ingestCheckpoint, identify, history, saveSitting, parseRoster, Analytics } from './lib.mjs';

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

test('feedback: validated, one row per student per episode, summarised per episode', () => {
  const { db, a } = setup();
  assert.ok(ingestFeedback(db, { user_id: 'lms:A', session: 1, rating: 9 }).error);
  assert.ok(ingestFeedback(db, { user_id: 'lms:A', session: 99, rating: 4 }).error);
  assert.ok(ingestFeedback(db, { user_id: 'lms:A', session: 1, rating: 2, mood: 'Boring', difficulty: 'hard', client_ts: new Date().toISOString() }).ok);
  ingestFeedback(db, { user_id: 'lms:A', session: 1, rating: 5, mood: 'Loved it', difficulty: 'right', liked: ['Inspector Kaal'], comment: '=cmd()', sound_on: true });
  ingestFeedback(db, { user_id: 'lms:B', session: 1, rating: 3, mood: 'not-a-mood', difficulty: 'easy' });
  ingestFeedback(db, { user_id: 'guest-1', session: 2, rating: 1 });
  const d = a.feedback();
  assert.equal(d.totals.responses, 2);                      // A's resend replaced the first; guest hidden
  assert.equal(d.totals.avg_rating, 4);
  assert.equal(d.episodes[0].responses, 2);
  assert.equal(d.moods['Loved it'], 1);
  assert.equal(d.responses.find((r) => r.student_id === 'B').mood, null);
  assert.deepEqual(d.liked, [{ what: 'Inspector Kaal', n: 1 }]);
  assert.equal(a.feedback({ guests: true }).totals.responses, 3);
  assert.match(a.feedbackCsv(), /"'=cmd\(\)"/);
});

test('live: students with an event in the last 5 minutes', () => {
  const { db, a } = setup();
  ingest(db, [ev('lms:A', 'beat_viewed', 3, { beat: ep1.beats[0].id }), ev('lms:B', 'beat_viewed', 1, {}, undefined, new Date(Date.now() - 3600_000).toISOString())]);
  const l = a.live();
  assert.equal(l.count, 1);
  assert.equal(l.students[0].session, 3);
});

test('identify: NxtWave ID is the key (case-insensitive), name is stored, returning is detected', () => {
  const { db, a } = setup();
  assert.ok(identify(db, { student_id: 'x', name: 'Priya' }).error);            // too short
  assert.ok(identify(db, { student_id: 'NW1001', name: '<b>' }).error);         // not a name
  const first = identify(db, { student_id: ' nw1001 ', name: '  Priya   Sharma ' });
  assert.deepEqual({ ...first }, { ok: true, student_id: 'NW1001', name: 'Priya Sharma', returning: false, previous_name: null });
  assert.equal(identify(db, { student_id: 'NW1001', name: 'Priya Sharma' }).returning, true);
  // registered but not played yet → listed as not started, with the typed name
  assert.deepEqual(a.notStarted().map((r) => [r.student_id, r.name]), [['NW1001', 'Priya Sharma']]);
  // events sent with a lower-case id land under the same student
  ingest(db, [ev('lms:nw1001', 'beat_viewed', 1, { beat: ep1.beats[0].id })]);
  const s = a.students();
  assert.equal(s.length, 1);
  assert.equal(s[0].student_id, 'NW1001');
  assert.equal(s[0].name, 'Priya Sharma');
  assert.equal(s[0].logins, 2);
  // a roster name wins over the typed one
  a.saveRoster([{ student_id: 'NW1001', name: 'Priya S.', batch: 'B1' }]);
  assert.equal(a.students()[0].name, 'Priya S.');
});

test('history returns the exact events (no heartbeats), feedback given and sittings - for a returning student', () => {
  const { db } = setup();
  identify(db, { student_id: 'NW2002', name: 'Ravi' });
  const e1 = { ...ev('lms:NW2002', 'task_passed', 3, { beat: 'S3.5', unit: 7 }, { attempts: 1, sql: 'SELECT 1' }), course_ref: { topic_id: 'T3', unit_id: 'U' } };
  ingest(db, [e1, ev('lms:NW2002', 'heartbeat', 3, {}, { seconds: 30 }), ev('lms:OTHER1', 'beat_viewed', 3, { beat: 'S3.1' })]);
  ingestFeedback(db, { user_id: 'lms:NW2002', session: 3, rating: 4, client_ts: new Date().toISOString() });
  ingestCheckpoint(db, { user_id: 'lms:NW2002', session: 3, chapter: 2, rating: 1, comment: 'lost at LIKE', client_ts: new Date().toISOString() });
  assert.deepEqual(saveSitting(db, { op: 'save', user_id: 'lms:NW2002', scope: 's3', saved_at: 100, value: '{"savedAt":100,"state":{}}' }), { ok: true });
  saveSitting(db, { op: 'save', user_id: 'lms:NW2002', scope: 's3', saved_at: 50, value: '{"savedAt":50,"state":{"old":1}}' });   // older: ignored
  assert.ok(saveSitting(db, { op: 'save', user_id: 'lms:NW2002', scope: 's99', saved_at: 1, value: '{}' }).error);
  const h = history(db, 'nw2002');
  assert.equal(h.name, 'Ravi');
  assert.equal(h.events.length, 1);
  assert.deepEqual(h.events[0], e1);                 // course_ref, unit, result all preserved
  assert.deepEqual(h.feedback, [3]);
  assert.deepEqual(h.checkpoints, [{ session: 3, chapter: 2 }]);
  assert.deepEqual(h.sittings.map((s) => [s.scope, s.saved_at]), [['s3', 100]]);
  saveSitting(db, { op: 'clear', user_id: 'lms:NW2002', scope: 's3', saved_at: 200 });
  assert.equal(history(db, 'NW2002').sittings.length, 0);
  assert.ok(history(db, '../x').error);
});

test('student page: chapters with time, feedback and check-ins; feedback tab shows check-ins', () => {
  const { db, a } = setup();
  identify(db, { student_id: 'NW3003', name: 'Asha' });
  const ch2 = ep1.beats.find((b) => b.chapter === 2);
  const lastCh1 = [...ep1.beats].reverse().find((b) => b.chapter === 1);
  ingest(db, [
    ev('lms:NW3003', 'session_started', 1, { type: 'session', id: 'S1' }),
    ev('lms:NW3003', 'heartbeat', 1, {}, { seconds: 30 }),                          // chapter 1 (first beat)
    ev('lms:NW3003', 'heartbeat', 1, { beat: lastCh1.id }, { seconds: 20 }),        // working on the first beat of chapter 2
  ]);
  ingestCheckpoint(db, { user_id: 'lms:NW3003', session: 1, chapter: 1, rating: 4, comment: 'fun', client_ts: new Date().toISOString() });
  assert.ok(ingestCheckpoint(db, { user_id: 'lms:NW3003', session: 1, chapter: 1, rating: 5 }).error);
  const s = a.student('NW3003');
  const e = s.episodes[0];
  assert.ok(ch2, 'episode 1 has a second chapter');
  assert.equal(e.chapters[0].seconds, 30);
  assert.equal(e.chapters[1].seconds, 20);
  assert.equal(s.checkpoints.length, 1);
  assert.equal(s.registered_at != null, true);
  const fb = a.feedback({});
  assert.equal(fb.checkpoints.responses, 1);
  assert.deepEqual({ ...fb.checkpoints.chapters[0] }, { session: 1, title: ep1.title, chapter: 1, responses: 1, lost: 0, avg: 4 });
  assert.match(a.feedbackCsv({}), /chapter 1: great/);
});
