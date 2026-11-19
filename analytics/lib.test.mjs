import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDb, loadCatalogue, ingest, ingestFeedback, ingestCheckpoint, identify, recover, normalizeEmail, history, saveSitting, parseRoster, Analytics } from './lib.mjs';

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
  assert.match(ep1.beats.find((b) => b.type === 'note').label, /^Learn: /);
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

test('identify with an email: validated, stored lower-case, shown on the dashboard and in the CSV (after the old columns); never sent back', () => {
  const { db, a } = setup();
  assert.equal(normalizeEmail('  Priya.Sharma+sql@Gmail.COM '), 'priya.sharma+sql@gmail.com');
  for (const bad of ['priya', 'priya@gmail', 'priya@.com', 'pri ya@gmail.com', 'a@b@c.com', `${'x'.repeat(112)}@gmail.com`, 42, null, undefined])
    assert.equal(normalizeEmail(bad), null, String(bad));
  assert.deepEqual({ ...identify(db, { student_id: 'NW1001', name: 'Priya Sharma', email: 'not-an-email' }) }, { error: 'bad email' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students').get().n, 0);       // a rejected request stores nothing
  const first = identify(db, { student_id: 'nw1001', name: 'Priya Sharma', email: ' Priya@Gmail.com ' });
  assert.deepEqual({ ...first }, { ok: true, student_id: 'NW1001', name: 'Priya Sharma', returning: false, previous_name: null });
  assert.equal(db.prepare('SELECT email FROM students WHERE student_id = ?').get('NW1001').email, 'priya@gmail.com');
  assert.equal('email' in history(db, 'NW1001'), false);                           // the public history does not carry it

  // registered, not played yet: listed as not started, with the email, and in the export
  assert.deepEqual(a.notStarted().map((r) => [r.student_id, r.email]), [['NW1001', 'priya@gmail.com']]);
  ingest(db, [ev('lms:NW1001', 'session_started', 1, { type: 'session', id: 'S1' }), ev('lms:NW9', 'session_started', 1, { type: 'session', id: 'S1' })]);
  identify(db, { student_id: 'NW0002', name: 'Ravi', email: 'ravi@mail.college.ac.in' });
  assert.equal(a.students().find((s) => s.student_id === 'NW1001').email, 'priya@gmail.com');
  assert.equal(a.students().find((s) => s.student_id === 'NW9').email, null);       // played, never gave an email
  assert.equal(a.student('NW1001').email, 'priya@gmail.com');
  const csv = a.exportCsv().split('\n').map((l) => l.split(','));
  assert.deepEqual(csv[0].slice(-2), ['email', 'score_pct']);              // new columns go at the end
  assert.deepEqual(csv[0].slice(0, 4), ['student_id', 'name', 'batch', 'level']);   // the old columns stay where they were
  assert.equal(csv[0].length, 20);
  assert.equal(csv.find((r) => r[0] === 'NW1001').at(-2), 'priya@gmail.com');
  assert.equal(csv.find((r) => r[0] === 'NW9').at(-2), '');
  assert.equal(csv.find((r) => r[0] === 'NW0002').at(-2), 'ravi@mail.college.ac.in');   // not started, still exported with the email
});

test('identify without an email keeps the stored one; a new email replaces it', () => {
  const { db } = setup();
  const email = () => db.prepare('SELECT email FROM students WHERE student_id = ?').get('NW1001').email;
  identify(db, { student_id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com' });
  assert.ok(identify(db, { student_id: 'NW1001', name: 'Priya S' }).ok);            // an older game build: no email
  assert.equal(email(), 'priya@gmail.com');
  assert.ok(identify(db, { student_id: 'NW1001', name: 'Priya S', email: '' }).ok);
  assert.ok(identify(db, { student_id: 'NW1001', name: 'Priya S', email: null }).ok);
  assert.equal(email(), 'priya@gmail.com');
  assert.ok(identify(db, { student_id: 'NW1001', name: 'Priya S', email: 'bad' }).error);
  assert.equal(email(), 'priya@gmail.com');
  assert.equal(db.prepare('SELECT entered_name, logins FROM students').get().logins, 4);   // the rejected one changed nothing
  identify(db, { student_id: 'NW1001', name: 'Priya S', email: 'priya.new@gmail.com' });
  assert.equal(email(), 'priya.new@gmail.com');
  // a student who never gave one has none
  identify(db, { student_id: 'NW2002', name: 'Ravi' });
  assert.equal(db.prepare('SELECT email FROM students WHERE student_id = ?').get('NW2002').email, null);
  // the roster upload does not touch it
  new Analytics(db, cat).saveRoster([{ student_id: 'NW1001', name: 'Priya Sharma', batch: 'B1' }]);
  assert.equal(email(), 'priya.new@gmail.com');
});

test('recover: finds the student by email (any case), the most recently seen one when several share it; else not found', () => {
  const { db } = setup();
  assert.deepEqual({ ...recover(db, { email: 'priya@gmail.com' }) }, { found: false });
  for (const bad of [{}, null, { email: 'priya' }, { email: 7 }]) assert.deepEqual({ ...recover(db, bad) }, { error: 'bad email' });
  identify(db, { student_id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com' });
  identify(db, { student_id: 'NW2002', name: 'Ravi', email: 'ravi@gmail.com' });
  identify(db, { student_id: 'NW3003', name: 'Asha' });                             // no email: never found
  assert.deepEqual({ ...recover(db, { email: '  PRIYA@Gmail.com ' }) }, { found: true, student_id: 'NW1001', name: 'Priya Sharma' });
  assert.deepEqual({ ...recover(db, { email: 'ravi@gmail.com' }) }, { found: true, student_id: 'NW2002', name: 'Ravi' });
  assert.deepEqual({ ...recover(db, { email: 'nobody@gmail.com' }) }, { found: false });

  // the same email under a second ID: whoever was seen last wins - by sign-in ...
  const at = (id, iso) => db.prepare('UPDATE students SET last_login_at = ? WHERE student_id = ?').run(iso, id);
  identify(db, { student_id: 'NW1001B', name: 'Priya S', email: 'priya@gmail.com' });
  at('NW1001', '2026-11-01T10:00:00.000Z'); at('NW1001B', '2026-11-05T10:00:00.000Z');
  assert.equal(recover(db, { email: 'priya@gmail.com' }).student_id, 'NW1001B');
  // ... or by playing: NW1001 signed in earlier but played after NW1001B's sign-in
  ingest(db, [ev('lms:NW1001', 'beat_viewed', 1, { beat: ep1.beats[0].id }, undefined, '2026-11-09T10:00:00.000Z')]);
  assert.deepEqual({ ...recover(db, { email: 'priya@gmail.com' }) }, { found: true, student_id: 'NW1001', name: 'Priya Sharma' });
  // once a student moves to another email, the old one no longer finds them
  identify(db, { student_id: 'NW2002', name: 'Ravi', email: 'ravi.k@gmail.com' });
  assert.deepEqual({ ...recover(db, { email: 'ravi@gmail.com' }) }, { found: false });
});

test('migration: a database file from before the email column gets it added; every existing row stays as it was', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmi-analytics-test-'));
  try {
    // (1) the schema as it is in use today: everything except students.email
    const file = path.join(dir, 'before-email.sqlite');
    const old = new DatabaseSync(file);
    old.exec(`
      CREATE TABLE students (student_id TEXT PRIMARY KEY, name TEXT, batch TEXT, entered_name TEXT, registered_at TEXT, last_login_at TEXT, logins INTEGER NOT NULL DEFAULT 0);
      INSERT INTO students VALUES ('NW1001', 'Priya S.', 'B1', 'Priya Sharma', '2026-11-01T10:00:00.000Z', '2026-11-02T10:00:00.000Z', 3);
      INSERT INTO students VALUES ('NW2002', NULL, NULL, 'Ravi', '2026-11-03T10:00:00.000Z', '2026-11-03T10:00:00.000Z', 1);
      CREATE TABLE events (event_id TEXT PRIMARY KEY, student_id TEXT NOT NULL, is_guest INTEGER NOT NULL, sitting_id TEXT, verb TEXT NOT NULL, session INTEGER NOT NULL,
        beat TEXT, object_type TEXT, object_id TEXT, seconds INTEGER, result TEXT, client_ts TEXT NOT NULL, received_at TEXT NOT NULL, raw TEXT);
      INSERT INTO events VALUES ('e-old', 'NW1001', 0, 's', 'beat_viewed', 1, 'S1.1', 'beat', 'S1.1', NULL, NULL, '2026-11-02T10:05:00.000Z', '2026-11-02T10:05:01.000Z', NULL);
    `);
    const cols = (db) => db.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
    const rows = (db) => db.prepare('SELECT student_id, name, batch, entered_name, registered_at, last_login_at, logins FROM students ORDER BY student_id').all().map((r) => ({ ...r }));
    assert.equal(cols(old).includes('email'), false);
    const before = rows(old);
    old.close();

    let db = openDb(file);
    assert.deepEqual(cols(db), ['student_id', 'name', 'batch', 'entered_name', 'registered_at', 'last_login_at', 'logins', 'email']);   // added at the end
    assert.deepEqual(rows(db), before);
    assert.deepEqual(db.prepare('SELECT student_id, email FROM students ORDER BY student_id').all().map((r) => ({ ...r })),
      [{ student_id: 'NW1001', email: null }, { student_id: 'NW2002', email: null }]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 1);
    assert.deepEqual({ ...recover(db, { email: 'priya@gmail.com' }) }, { found: false });
    // the student comes back with the new game and adds their email: same row, now findable
    assert.equal(identify(db, { student_id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com' }).returning, true);
    assert.deepEqual({ ...db.prepare('SELECT name, batch, registered_at, logins, email FROM students WHERE student_id = ?').get('NW1001') },
      { name: 'Priya S.', batch: 'B1', registered_at: '2026-11-01T10:00:00.000Z', logins: 4, email: 'priya@gmail.com' });
    assert.deepEqual({ ...recover(db, { email: 'priya@gmail.com' }) }, { found: true, student_id: 'NW1001', name: 'Priya Sharma' });
    assert.equal(new Analytics(db, cat).students().find((s) => s.student_id === 'NW1001').email, 'priya@gmail.com');
    db.close();

    // opening it again changes nothing (the column is added once)
    db = openDb(file);
    assert.equal(cols(db).filter((c) => c === 'email').length, 1);
    assert.equal(db.prepare('SELECT email FROM students WHERE student_id = ?').get('NW1001').email, 'priya@gmail.com');
    db.close();

    // (2) the very first schema (roster only): all the later columns arrive together
    const file2 = path.join(dir, 'first.sqlite');
    const first = new DatabaseSync(file2);
    first.exec(`CREATE TABLE students (student_id TEXT PRIMARY KEY, name TEXT, batch TEXT); INSERT INTO students VALUES ('STU1', 'Aarav', 'Beta-A');`);
    first.close();
    db = openDb(file2);
    assert.ok(cols(db).includes('email') && cols(db).includes('logins'));
    assert.deepEqual({ ...db.prepare('SELECT student_id, name, batch, email FROM students').get() }, { student_id: 'STU1', name: 'Aarav', batch: 'Beta-A', email: null });
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('11-star ladder: its own numbers per episode; old 5-star answers counted apart, never averaged in', () => {
  const { db, a } = setup();
  assert.ok(ingestFeedback(db, { user_id: 'lms:A', session: 1, rating: 11, scale: 11 }).ok);
  assert.ok(ingestFeedback(db, { user_id: 'lms:A', session: 2, rating: 12, scale: 11 }).error);
  assert.ok(ingestFeedback(db, { user_id: 'lms:B', session: 1, rating: 7, scale: 5 }).error);      // 7 is not a 5-star answer
  ingestFeedback(db, { user_id: 'lms:B', session: 1, rating: 3, scale: 11 });
  ingestFeedback(db, { user_id: 'lms:C', session: 1, rating: 6, scale: 11 });
  ingestFeedback(db, { user_id: 'lms:D', session: 2, rating: 4 });                                   // the old card
  ingestFeedback(db, { user_id: 'guest-1', session: 1, rating: 1, scale: 11 });
  const l = a.ladder();
  assert.equal(l.responses, 3);
  assert.equal(l.legacy, 1);
  assert.equal(l.median, 6);
  assert.deepEqual([l.low, l.okay, l.delight], [1, 0, 2]);
  assert.equal(l.levels[10].n, 1);
  assert.deepEqual(l.episodes[0].ratings, [3, 6, 11]);
  assert.equal(l.episodes[1].responses, 0);
  assert.equal(a.ladder({ guests: true }).responses, 4);
  const fb = a.feedback();
  assert.equal(fb.totals.avg_rating, 4);                     // only the 5-star answer
  assert.equal(fb.responses.find((r) => r.student_id === 'C').scale, 11);
  assert.match(a.feedbackCsv(), /^student_id,name,batch,episode,rating,out_of,/);
  assert.match(a.feedbackCsv(), /\nA,,,1,11,11,/);
});

test('timeline: every interaction of one student, newest first, with the SQL they ran; heartbeats left out', () => {
  const { db, a } = setup();
  identify(db, { student_id: 'NW5', name: 'Ria' });
  const tep = cat.sessions.find((e) => e.beats.some((b) => b.task_id)), task = tep.beats.find((b) => b.task_id);
  const t = (m) => new Date(Date.now() - (60 - m) * 60000).toISOString();
  ingest(db, [
    ev('lms:NW5', 'session_started', tep.n, { type: 'session', id: 'S1' }, undefined, t(1)),
    ev('lms:NW5', 'beat_viewed', tep.n, { beat: tep.beats[0].id }, undefined, t(2)),
    ev('lms:NW5', 'heartbeat', tep.n, {}, { seconds: 30 }, t(3)),
    ev('lms:NW5', 'task_attempted', tep.n, { beat: task.id, id: task.task_id }, { attempt: 1, status: 'wrong', sql: 'SELECT * FROM people' }, t(4)),
    ev('lms:NW5', 'hint_used', tep.n, { beat: task.id, id: `${task.task_id}#2` }, { tier: 2 }, t(5)),
    ev('lms:NW5', 'task_passed', tep.n, { beat: task.id, id: task.task_id }, { attempts: 2, max_hint_tier: 2 }, t(6)),
  ]);
  ingestFeedback(db, { user_id: 'lms:NW5', session: tep.n, rating: 8, scale: 11, comment: 'more clues', client_ts: t(7) });
  const tl = a.timeline('NW5');
  assert.deepEqual(tl.items.map((i) => i.kind), ['feedback', 'solved', 'hint', 'sql', 'step', 'start']);
  const sql = tl.items.find((i) => i.kind === 'sql');
  assert.equal(sql.sql, 'SELECT * FROM people');
  assert.equal(sql.status, 'wrong');
  assert.equal(sql.episode, tep.title);
  assert.equal(sql.task, task.task_id);
  assert.equal(tl.items.find((i) => i.kind === 'hint').tier, 2);
  assert.equal(tl.items[0].comment, 'more clues');
  assert.equal(tl.more, false);
  const page = a.timeline('NW5', { limit: 2 });
  assert.equal(page.more, true);
  assert.deepEqual(page.items.filter((i) => i.kind !== 'feedback').map((i) => i.kind), ['solved', 'hint']);
  assert.deepEqual(a.timeline('NW5', { before: page.next }).items.map((i) => i.kind), ['sql', 'step', 'start']);
  assert.equal(a.student('NW5').timeline.items.length, 6);
});

test('attention: stuck on a task, low stars, lost in a chapter, gone quiet, never started; solved tasks drop off', () => {
  const { db, a } = setup();
  const tep = cat.sessions.find((e) => e.beats.some((b) => b.task_id)), task = tep.beats.find((b) => b.task_id);
  const runs = (u, k, ts) => Array.from({ length: k }, (_, i) => ev(`lms:${u}`, 'task_attempted', tep.n, { beat: task.id, id: task.task_id }, { attempt: i + 1, status: 'wrong', sql: 'x' }, ts));
  const now = new Date().toISOString(), old = new Date(Date.now() - 5 * 86400000).toISOString();
  for (const id of ['STK1', 'STK2', 'QUI1', 'NEW1', 'LOW1', 'HAP1']) identify(db, { student_id: id, name: 'Student' });
  ingest(db, ['LOW1', 'HAP1'].map((u) => ev(`lms:${u}`, 'beat_viewed', 1, { beat: ep1.beats[0].id }, undefined, now)));
  ingest(db, runs('STK1', 5, now));                                                                   // stuck
  ingest(db, [...runs('STK2', 5, now), ev('lms:STK2', 'task_passed', tep.n, { beat: task.id }, { attempts: 6 }, now)]);   // solved in the end
  ingest(db, [ev('lms:QUI1', 'beat_viewed', 1, { beat: ep1.beats[0].id }, undefined, old)]);           // quiet 5 days
  ingestFeedback(db, { user_id: 'lms:LOW1', session: 1, rating: 2, scale: 11 });
  ingestFeedback(db, { user_id: 'lms:HAP1', session: 1, rating: 5, scale: 11 });                       // fine
  ingestCheckpoint(db, { user_id: 'lms:HAP1', session: 1, chapter: 2, rating: 1 });                   // ...but lost in chapter 2
  db.prepare('UPDATE students SET registered_at = ? WHERE student_id = ?').run(old, 'NEW1');
  const list = a.attention();
  const why = Object.fromEntries(list.map((x) => [x.student_id, x.reasons.map((r) => r.kind)]));
  assert.deepEqual(why.STK1, ['stuck']);
  assert.equal(why.STK2, undefined);
  assert.deepEqual(why.QUI1, ['quiet']);
  assert.deepEqual(why.LOW1, ['low']);
  assert.deepEqual(why.HAP1, ['lost']);
  assert.deepEqual(why.NEW1, ['notstarted']);
  assert.equal(list[0].student_id, 'STK1');                    // stuck first
  assert.equal(a.overview().attention.length, list.length);
  const st = a.students().find((x) => x.student_id === 'STK1');
  assert.equal(st.journey[tep.n - 1], 1);
  assert.equal(st.journey.length, 13);
});

test('episode score: best completed attempt out of the episode maximum, with the badge tier; a reset wipes the earlier attempts', () => {
  const { db, a } = setup();
  const tep = cat.sessions.find((e) => e.beats.some((b) => b.task_id));
  identify(db, { student_id: 'NW77', name: 'Score Kid' });
  const t = (m) => new Date(Date.now() - (100 - m) * 60000).toISOString();
  const sit = (sid, verb, result, m) => ({ ...ev('lms:NW77', verb, tep.n, { type: 'beat', beat: tep.beats[0].id }, result, t(m)), sitting_id: sid });
  ingest(db, [
    sit('A', 'task_passed', { attempts: 1, max_hint_tier: 0 }, 1),      // 13
    sit('A', 'task_passed', { attempts: 3, max_hint_tier: 3 }, 2),      // 3
    sit('A', 'clue_pinned', {}, 3),                                     // 2
    sit('A', 'session_completed', {}, 4),
    sit('B', 'task_passed', { attempts: 1, max_hint_tier: 0 }, 5),      // a replay that is not finished: does not count
  ]);
  let sc = a.episodeScores().get('NW77').get(tep.n);
  assert.deepEqual({ points: sc.points, max: sc.max }, { points: 18, max: tep.max_points });
  assert.equal(sc.pct, Math.round(18 / tep.max_points * 100));
  assert.equal(sc.tier, 'bronze');
  assert.equal(a.student('NW77').episodes[tep.n - 1].score_pct, sc.pct);
  assert.equal(a.students().find((x) => x.student_id === 'NW77').scores[tep.n - 1].points, 18);
  ingest(db, [sit('C', 'session_reset', {}, 6)]);
  assert.equal(a.episodeScores().get('NW77'), undefined);              // reset: nothing solved any more
  assert.equal(cat.sessions.reduce((x, e) => x + e.max_points, 0), 1488);
});
