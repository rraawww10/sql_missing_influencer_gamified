// Student log-in without a password (since 2026-11-19): sign up once (name, NxtWave ID, email), then log in with the
// NxtWave ID or the email. The rules (auth.mjs) and the routes (server.mjs, on a spare port with a throw-away database).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, ingest, identify, Analytics, loadCatalogue } from './lib.mjs';
import { signup, login, logout, authorize, sessionOf, hasAccount, studentOf } from './auth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRIYA = { student_id: 'nw1001', name: 'Priya Sharma', email: 'Priya@Gmail.com' };
const ev = (user, id) => ({ event_id: id, user_id: user, sitting_id: 's', verb: 'beat_viewed', object: { type: 'beat', id: 'S1.1', session: 1 }, course_ref: { topic_id: 't' }, client_ts: new Date().toISOString() });

test('sign up: name, ID and email make the account and log the student in; no password anywhere', () => {
  const db = openDb(':memory:');
  const r = signup(db, PRIYA);
  assert.deepEqual({ ...r, token: 'x' }, { ok: true, student_id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: 'x', returning: false });
  assert.match(r.token, /^[0-9a-f]{64}$/);
  assert.equal(db.prepare('SELECT token_hash FROM student_sessions').get().token_hash === r.token, false);   // only the token's hash is stored
  const st = db.prepare('SELECT entered_name, email, logins FROM students WHERE student_id = ?').get('NW1001');
  assert.deepEqual({ ...st }, { entered_name: 'Priya Sharma', email: 'priya@gmail.com', logins: 1 });
  assert.equal(sessionOf(db, r.token), 'NW1001');
  for (const [patch, error] of [[{ student_id: 'x' }, 'bad id'], [{ name: '<b>' }, 'bad name'], [{ email: 'nope' }, 'bad email']])
    assert.equal(signup(openDb(':memory:'), { ...PRIYA, ...patch }).error, error, JSON.stringify(patch));
  // signing up again with the same ID just logs in (the first name and email stay)
  const again = signup(db, { student_id: 'NW1001', name: 'Other Name', email: 'other@x.com' });
  assert.deepEqual([again.ok, again.name, again.email, again.returning], [true, 'Priya Sharma', 'priya@gmail.com', true]);
});

test('log in: with the NxtWave ID or the email, any case; unknown ones are told to sign up', () => {
  const db = openDb(':memory:');
  signup(db, PRIYA);
  for (const who of [' nw1001 ', 'NW1001', 'priya@gmail.com', ' PRIYA@GMAIL.COM ']) {
    const r = login(db, { who });
    assert.deepEqual({ ...r, token: 'x' }, { ok: true, student_id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: 'x', returning: true }, who);
  }
  assert.equal(login(db, { student_id: 'nw1001' }).ok, true);           // the older field name works too
  assert.equal(login(db, { who: 'NW9999' }).error, 'no account');
  assert.equal(login(db, { who: 'nobody@x.com' }).error, 'no account');
  assert.equal(login(db, { who: '' }).error, 'bad id');
  assert.equal(login(db, {}).error, 'bad id');
  assert.equal(db.prepare('SELECT logins FROM students WHERE student_id = ?').get('NW1001').logins, 6);
});

test('no email needed: sign up with name + ID, log in with the ID; a stored email is kept', () => {
  const db = openDb(':memory:');
  const r = signup(db, { student_id: 'nw6006', name: 'Kiran Rao' });
  assert.deepEqual({ ...r, token: 'x' }, { ok: true, student_id: 'NW6006', name: 'Kiran Rao', email: '', token: 'x', returning: false });
  assert.equal(login(db, { who: 'NW6006' }).name, 'Kiran Rao');
  identify(db, { student_id: 'NW5005', name: 'Meera Iyer', email: 'meera@x.com' });   // from before accounts, email on file
  assert.equal(login(db, { who: 'NW5005' }).email, 'meera@x.com');
  assert.equal(signup(db, { student_id: 'NW5005', name: 'Meera Iyer' }).email, 'meera@x.com');
  assert.equal(db.prepare('SELECT email FROM students WHERE student_id = ?').get('NW5005').email, 'meera@x.com');
});

test('a student from before accounts logs in with the ID (a name on file is enough); their progress is still theirs', () => {
  const db = openDb(':memory:');
  identify(db, { student_id: 'NW0007816', name: 'Rishu Kumar' });
  ingest(db, [ev('lms:NW0007816', 'old-1')]);
  const r = login(db, { who: 'nw0007816' });
  assert.deepEqual([r.ok, r.name, r.returning], [true, 'Rishu Kumar', true]);
  assert.equal(hasAccount(db, 'NW0007816'), true);
  assert.equal(login(db, { who: 'NW404404' }).error, 'no account');
});

test('authorize: once an ID has an account, its data needs a token of that ID', () => {
  const db = openDb(':memory:');
  const priya = signup(db, PRIYA);
  const ravi = signup(db, { student_id: 'NW2002', name: 'Ravi', email: 'ravi@x.com' });
  assert.equal(authorize(db, 'NW1001', priya.token), true);
  assert.equal(authorize(db, 'nw1001', priya.token), true);
  assert.equal(authorize(db, 'NW1001', ravi.token), false);
  assert.equal(authorize(db, 'NW1001', undefined), false);
  assert.equal(authorize(db, 'NW1001', 'f'.repeat(64)), false);
  assert.equal(authorize(db, 'NW3003', undefined), true);        // nobody signed up with this ID yet
  assert.equal(studentOf('lms:nw1001'), 'NW1001');
  assert.equal(studentOf('guest:abc'), null);
  const second = login(db, { who: 'NW1001' });                   // a second device
  logout(db, { token: priya.token });
  assert.equal(authorize(db, 'NW1001', priya.token), false);
  assert.equal(authorize(db, 'NW1001', second.token), true);
});

test('accounts survive a roster upload with "replace", and a restart', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tmi-auth-')), 'a.sqlite');
  let db = openDb(file);
  signup(db, PRIYA);
  new Analytics(db, loadCatalogue(path.join(HERE, '..', 'content', 'sessions'))).saveRoster([{ student_id: 'NW7', name: 'Roster Kid', batch: 'B1' }], true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students WHERE student_id = ?').get('NW1001').n, 0);
  db.close();
  db = openDb(file);
  const again = login(db, { who: 'priya@gmail.com' });
  assert.deepEqual([again.ok, again.student_id, again.name], [true, 'NW1001', 'Priya Sharma']);
  db.close();
});

// ---------------------------------------------------------------- the routes, on a real server
const PORT = 18791, API = `http://127.0.0.1:${PORT}`;
let server, tmp;
const post = async (p, body, headers = {}) => {
  const res = await fetch(`${API}${p}`, { method: 'POST', headers: { 'content-type': 'text/plain', ...headers }, body: JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* text */ }
  return { status: res.status, json };
};
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmi-auth-http-'));
  server = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', 'server.mjs'], { cwd: HERE, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB_PATH: path.join(tmp, 'db.sqlite'), ADMIN_PASSWORD: 'teacher', SESSION_SECRET: 'test', RESEND_API_KEY: '', MAIL_FROM: '' } });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${API}/health`)).ok) return; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => { server?.kill('SIGTERM'); });

test('HTTP: log in by ID or email; a student\'s record is read or written only with a token of that student', async () => {
  const priya = (await post('/api/account/signup', PRIYA)).json;
  const ravi = (await post('/api/account/signup', { student_id: 'NW2002', name: 'Ravi', email: 'ravi@x.com' })).json;
  assert.equal(priya.ok, true);
  assert.equal((await post('/api/account/login', { who: 'NW4040' })).status, 404);
  const byEmail = (await post('/api/account/login', { who: 'priya@gmail.com' })).json;
  assert.deepEqual([byEmail.ok, byEmail.student_id], [true, 'NW1001']);

  assert.equal((await post('/api/events', { events: [ev('lms:NW1001', 'p-1')], token: priya.token })).status, 200);
  assert.equal((await post('/api/history', { student_id: 'NW1001', token: priya.token })).json.events.length, 1);
  assert.equal((await post('/api/history', { student_id: 'NW1001', token: byEmail.token })).json.events.length, 1);
  for (const token of [undefined, ravi.token, 'f'.repeat(64)]) assert.equal((await post('/api/history', { student_id: 'NW1001', token })).status, 401, String(token));
  for (const token of [undefined, ravi.token]) {
    assert.equal((await post('/api/events', { events: [ev('lms:NW1001', `x-${token}`)], token })).status, 401);
    assert.equal((await post('/api/feedback', { user_id: 'lms:NW1001', session: 1, rating: 1, token })).status, 401);
  }
  assert.equal((await post('/api/events', { events: [ev('lms:NW7777', 'legacy-1'), ev('guest:abc', 'g-1')] })).status, 200);
  const cookie = (await fetch(`${API}/api/login`, { method: 'POST', body: JSON.stringify({ password: 'teacher' }) })).headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(`${API}/api/admin/students/NW1001`, { headers: { cookie } })).json()).has_account, true);
  assert.equal((await post('/api/account/logout', { token: priya.token })).status, 200);
  assert.equal((await post('/api/history', { student_id: 'NW1001', token: priya.token })).status, 401);
});
