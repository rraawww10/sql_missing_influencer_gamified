// Student accounts: the rules (auth.mjs) and the routes that enforce them (server.mjs, started on a spare port with a
// throw-away database). The point of all of it: one student can never get into another student's account.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, ingest, identify, Analytics, loadCatalogue } from './lib.mjs';
import { signup, login, logout, authorize, sessionOf, hasAccount, requestReset, resetPassword, adminResetPassword, makeMailer, studentOf, RESET_TRIES } from './auth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRIYA = { student_id: 'nw1001', name: 'Priya Sharma', email: 'Priya@Gmail.com', password: 'secret1' };
const ev = (user, id) => ({ event_id: id, user_id: user, sitting_id: 's', verb: 'beat_viewed', object: { type: 'beat', id: 'S1.1', session: 1 }, course_ref: { topic_id: 't' }, client_ts: new Date().toISOString() });

test('sign up: makes the account, stores no password, logs the student in', async () => {
  const db = openDb(':memory:');
  const r = await signup(db, PRIYA);
  assert.deepEqual({ ...r, token: 'x' }, { ok: true, student_id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: 'x', returning: false });
  assert.match(r.token, /^[0-9a-f]{64}$/);
  const row = db.prepare('SELECT * FROM accounts WHERE student_id = ?').get('NW1001');
  assert.notEqual(row.pw_hash, 'secret1');
  assert.equal(JSON.stringify(row).includes('secret1'), false);                       // the password is nowhere in the row
  assert.equal(db.prepare('SELECT token_hash FROM student_sessions').get().token_hash === r.token, false);   // nor is the token itself
  const st = db.prepare('SELECT entered_name, email, logins FROM students WHERE student_id = ?').get('NW1001');
  assert.deepEqual({ ...st }, { entered_name: 'Priya Sharma', email: 'priya@gmail.com', logins: 1 });   // what the dashboard shows
  assert.equal(sessionOf(db, r.token), 'NW1001');
});

test('sign up: every field is checked', async () => {
  const db = openDb(':memory:');
  for (const [patch, error] of [[{ student_id: 'x' }, 'bad id'], [{ name: '<b>' }, 'bad name'], [{ email: 'nope' }, 'bad email'], [{ email: undefined }, 'bad email'],
    [{ password: '12345' }, 'bad password'], [{ password: 'x'.repeat(101) }, 'bad password'], [{ password: 123456 }, 'bad password']])
    assert.equal((await signup(db, { ...PRIYA, ...patch })).error, error, JSON.stringify(patch));
  assert.equal(hasAccount(db, 'NW1001'), false);
});

test('an ID with an account cannot be signed up again - by anyone, with any email', async () => {
  const db = openDb(':memory:');
  await signup(db, PRIYA);
  assert.equal((await signup(db, { student_id: 'NW1001', name: 'Someone Else', email: 'other@x.com', password: 'hacker12' })).error, 'taken');
  assert.equal((await signup(db, { ...PRIYA, password: 'another1' })).error, 'taken');
  assert.equal((await login(db, { student_id: 'NW1001', password: 'hacker12' })).error, 'wrong');     // and the first password still stands
  assert.equal((await login(db, { student_id: 'NW1001', password: 'secret1' })).ok, true);
});

test('log in: the right password gets a token, anything else gets nothing', async () => {
  const db = openDb(':memory:');
  await signup(db, PRIYA);
  const ok = await login(db, { student_id: ' nw1001 ', password: 'secret1' });
  assert.deepEqual({ ...ok, token: 'x' }, { ok: true, student_id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: 'x', returning: true });
  for (const password of ['secret', 'secret1 ', 'SECRET1', '', undefined, null, 'x'.repeat(500)]) {
    const r = await login(db, { student_id: 'NW1001', password });
    assert.equal(r.error, 'wrong', String(password));
    assert.equal(r.token, undefined);
  }
  assert.equal((await login(db, { student_id: 'NW9999', password: 'secret1' })).error, 'no account');
  assert.equal(db.prepare('SELECT logins FROM students WHERE student_id = ?').get('NW1001').logins, 2);   // sign-up + one good log-in
});

test('authorize: an account is opened only by its own token', async () => {
  const db = openDb(':memory:');
  const priya = await signup(db, PRIYA);
  const ravi = await signup(db, { student_id: 'NW2002', name: 'Ravi', email: 'ravi@x.com', password: 'ravipass' });
  assert.equal(authorize(db, 'NW1001', priya.token), true);
  assert.equal(authorize(db, 'nw1001', priya.token), true);
  assert.equal(authorize(db, 'NW1001', ravi.token), false);      // another student's valid token
  assert.equal(authorize(db, 'NW1001', undefined), false);
  assert.equal(authorize(db, 'NW1001', 'f'.repeat(64)), false);  // a made-up token
  assert.equal(authorize(db, 'NW1001', priya.token.slice(0, 63)), false);
  assert.equal(authorize(db, 'NW3003', undefined), true);        // nobody owns this ID yet
  assert.equal(studentOf('lms:nw1001'), 'NW1001');
  assert.equal(studentOf('guest:abc'), null);
  // logging out ends that device's session only
  const second = await login(db, { student_id: 'NW1001', password: 'secret1' });
  logout(db, { token: priya.token });
  assert.equal(authorize(db, 'NW1001', priya.token), false);
  assert.equal(authorize(db, 'NW1001', second.token), true);
});

test('an ID from before accounts is claimed by signing up; one with an email on file needs that email', async () => {
  const db = openDb(':memory:');
  identify(db, { student_id: 'NW0007816', name: 'Rishu Kumar' });                                  // no email on file
  identify(db, { student_id: 'NW5005', name: 'Meera Iyer', email: 'meera@x.com' });                // an email on file
  ingest(db, [ev('lms:NW0007816', 'old-1')]);
  const rishu = await signup(db, { student_id: 'NW0007816', name: 'Rishu Kumar', email: 'rishu@x.com', password: 'rishupass' });
  assert.equal(rishu.ok, true);
  assert.equal(rishu.returning, true);                                                             // their progress is still theirs
  assert.equal((await signup(db, { student_id: 'NW5005', name: 'Not Meera', email: 'thief@x.com', password: 'thief123' })).error, 'email mismatch');
  assert.equal(hasAccount(db, 'NW5005'), false);
  assert.equal((await signup(db, { student_id: 'NW5005', name: 'Meera Iyer', email: 'MEERA@x.com', password: 'meerapass' })).ok, true);
});

test('forgot password: a 6-digit code goes to the sign-up email; it works once, for the right student, a few tries only', async () => {
  const db = openDb(':memory:');
  const first = await signup(db, PRIYA);
  await signup(db, { student_id: 'NW2002', name: 'Ravi', email: 'ravi@x.com', password: 'ravipass' });
  const sent = [];
  const mailer = async (m) => { sent.push(m); };
  assert.deepEqual(await requestReset(db, { student_id: 'nw1001' }, mailer), { sent: true, to: 'p****@gmail.com' });
  assert.equal(sent[0].to, 'priya@gmail.com');                                                     // the address on the account, never one the caller names
  assert.match(sent[0].code, /^\d{6}$/);
  assert.deepEqual(await requestReset(db, { student_id: 'NW9999' }, mailer), { sent: false, reason: 'no-account' });
  assert.deepEqual(await requestReset(db, { student_id: 'NW1001' }, null), { sent: false, reason: 'no-mail' });
  assert.deepEqual(await requestReset(db, { student_id: 'NW1001' }, async () => { throw new Error('smtp down'); }), { sent: false, reason: 'mail-failed' });
  assert.deepEqual(await requestReset(db, { student_id: 'NW1001' }, mailer), { sent: true, to: 'p****@gmail.com' });
  const code = sent.at(-1).code;
  assert.equal((await resetPassword(db, { student_id: 'NW2002', code, password: 'newpass1' })).error, 'bad code');   // Priya's code does not open Ravi's account
  assert.equal((await resetPassword(db, { student_id: 'NW1001', code, password: '123' })).error, 'bad password');
  const done = await resetPassword(db, { student_id: 'NW1001', code: ` ${code} `, password: 'newpass1' });
  assert.equal(done.ok, true);
  assert.equal((await resetPassword(db, { student_id: 'NW1001', code, password: 'again123' })).error, 'bad code');   // used up
  assert.equal(authorize(db, 'NW1001', first.token), false);                                       // every old session is ended
  assert.equal(authorize(db, 'NW1001', done.token), true);
  assert.equal((await login(db, { student_id: 'NW1001', password: 'secret1' })).error, 'wrong');
  assert.equal((await login(db, { student_id: 'NW1001', password: 'newpass1' })).ok, true);

  // guessing: after RESET_TRIES wrong codes even the right one is dead; an expired code is dead too
  await requestReset(db, { student_id: 'NW1001' }, mailer);
  const right = sent.at(-1).code, wrong = right === '000000' ? '111111' : '000000';
  for (let i = 0; i < RESET_TRIES; i++) assert.equal((await resetPassword(db, { student_id: 'NW1001', code: wrong, password: 'guess123' })).error, 'bad code');
  assert.equal((await resetPassword(db, { student_id: 'NW1001', code: right, password: 'guess123' })).error, 'bad code');
  await requestReset(db, { student_id: 'NW1001' }, mailer);
  db.prepare('UPDATE password_resets SET expires_at = ? WHERE student_id = ?').run(Date.now() - 1, 'NW1001');
  assert.equal((await resetPassword(db, { student_id: 'NW1001', code: sent.at(-1).code, password: 'late1234' })).error, 'bad code');
});

test("the teacher's reset: a temporary password that works once and must be replaced by the student's own", async () => {
  const db = openDb(':memory:');
  const first = await signup(db, PRIYA);
  const r = await adminResetPassword(db, 'nw1001');
  assert.match(r.temp_password, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.equal(authorize(db, 'NW1001', first.token), false);                                       // logged out everywhere
  assert.equal((await login(db, { student_id: 'NW1001', password: 'secret1' })).error, 'wrong');   // the old password is gone
  assert.equal((await login(db, { student_id: 'NW1001', password: r.temp_password })).error, 'new password needed');
  assert.equal((await login(db, { student_id: 'NW1001', password: r.temp_password, new_password: r.temp_password })).error, 'bad password');
  assert.equal((await login(db, { student_id: 'NW1001', password: r.temp_password, new_password: '123' })).error, 'bad password');
  assert.equal((await login(db, { student_id: 'NW1001', password: 'wrong-temp', new_password: 'my-own-pass' })).error, 'wrong');
  assert.equal((await login(db, { student_id: 'NW1001', password: r.temp_password, new_password: 'my-own-pass' })).ok, true);
  assert.equal((await login(db, { student_id: 'NW1001', password: r.temp_password })).error, 'wrong');   // the temporary one is spent
  assert.equal((await login(db, { student_id: 'NW1001', password: 'my-own-pass' })).ok, true);
  // a student with progress but no account yet gets one made, with the name and email on file
  identify(db, { student_id: 'NW5005', name: 'Meera Iyer', email: 'meera@x.com' });
  const m = await adminResetPassword(db, 'NW5005');
  const meera = await login(db, { student_id: 'NW5005', password: m.temp_password, new_password: 'meerapass' });
  assert.deepEqual([meera.name, meera.email], ['Meera Iyer', 'meera@x.com']);
  assert.equal((await adminResetPassword(db, 'NW0000')).error, 'no such student');
});

test('accounts survive a roster upload with "replace", and old databases gain the tables', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tmi-auth-')), 'a.sqlite');
  let db = openDb(file);
  await signup(db, PRIYA);
  new Analytics(db, loadCatalogue(path.join(HERE, '..', 'content', 'sessions'))).saveRoster([{ student_id: 'NW7', name: 'Roster Kid', batch: 'B1' }], true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students WHERE student_id = ?').get('NW1001').n, 0);   // the roster replaced the students table…
  db.close();
  db = openDb(file);                                                                               // …and a restart later
  const again = await login(db, { student_id: 'NW1001', password: 'secret1' });
  assert.deepEqual([again.ok, again.name, again.email], [true, 'Priya Sharma', 'priya@gmail.com']);
  db.close();
});

test('the mail service is off without a key, and sends the code to the account address with one', async () => {
  assert.equal(makeMailer({}), null);
  assert.equal(makeMailer({ RESEND_API_KEY: 'k' }), null);
  const calls = [];
  const mail = makeMailer({ RESEND_API_KEY: 'k', MAIL_FROM: 'Kaal <kaal@example.com>' }, async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; });
  await mail({ to: 'priya@gmail.com', name: 'Priya Sharma', code: '482913' });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].init.headers.authorization, 'Bearer k');
  assert.deepEqual(body.to, ['priya@gmail.com']);
  assert.ok(body.text.includes('482913'));
  await assert.rejects(makeMailer({ RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.co' }, async () => ({ ok: false, status: 403 }))({ to: 'x@y.com', name: 'X', code: '1' }));
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

test('HTTP: without the right password or token nobody reads or writes another student\'s record', async () => {
  const priya = (await post('/api/account/signup', PRIYA)).json;
  const ravi = (await post('/api/account/signup', { student_id: 'NW2002', name: 'Ravi', email: 'ravi@x.com', password: 'ravipass' })).json;
  assert.equal(priya.ok, true);
  assert.equal((await post('/api/account/signup', { ...PRIYA, password: 'takeover1' })).status, 409);
  assert.equal((await post('/api/account/login', { student_id: 'NW1001', password: 'nope' })).status, 401);
  assert.equal((await post('/api/account/login', { student_id: 'NW4040', password: 'nope' })).status, 404);

  // Priya plays
  assert.equal((await post('/api/events', { events: [ev('lms:NW1001', 'p-1')], token: priya.token })).status, 200);
  assert.equal((await post('/api/sitting', { op: 'save', user_id: 'lms:NW1001', scope: 's1', saved_at: 5, value: '{"savedAt":5}', token: priya.token })).status, 200);

  // reading her history: her token only
  assert.equal((await post('/api/history', { student_id: 'NW1001', token: priya.token })).json.events.length, 1);
  for (const token of [undefined, ravi.token, 'f'.repeat(64)]) assert.equal((await post('/api/history', { student_id: 'NW1001', token })).status, 401, String(token));
  assert.equal((await fetch(`${API}/api/history/NW1001`)).status, 401);
  assert.equal((await fetch(`${API}/api/history/NW1001`, { headers: { authorization: `Bearer ${ravi.token}` } })).status, 401);
  assert.equal((await fetch(`${API}/api/history/NW1001`, { headers: { authorization: `Bearer ${priya.token}` } })).status, 200);

  // writing as her: events, feedback, check-ins, her saved place, her name and email
  for (const token of [undefined, ravi.token]) {
    assert.equal((await post('/api/events', { events: [ev('lms:NW1001', `x-${token}`)], token })).status, 401);
    assert.equal((await post('/api/events', { events: [ev('lms:NW2002', `m-${token}`), ev('lms:NW1001', `y-${token}`)], token })).status, 401);   // mixed in with his own
    assert.equal((await post('/api/feedback', { user_id: 'lms:NW1001', session: 1, rating: 1, token })).status, 401);
    assert.equal((await post('/api/checkpoint', { user_id: 'lms:NW1001', session: 1, chapter: 1, rating: 1, token })).status, 401);
    assert.equal((await post('/api/sitting', { op: 'clear', user_id: 'lms:NW1001', scope: 's1', saved_at: 99, token })).status, 401);
    assert.equal((await post('/api/identify', { student_id: 'NW1001', name: 'Renamed', email: 'thief@x.com', token })).status, 401);   // would redirect her reset codes
  }
  const mine = (await post('/api/history', { student_id: 'NW1001', token: priya.token })).json;
  assert.deepEqual([mine.events.length, mine.sittings.length, mine.feedback.length], [1, 1, 0]);    // nothing of the above got in

  // an ID nobody has claimed yet still works as before (a build without accounts), and guests are untouched
  assert.equal((await post('/api/events', { events: [ev('lms:NW7777', 'legacy-1'), ev('guest:abc', 'g-1')] })).status, 200);
  assert.equal((await post('/api/history', { student_id: 'NW7777' })).status, 200);

  // forgot password without a mail service: the answer is "ask your teacher"
  assert.deepEqual((await post('/api/account/forgot', { student_id: 'NW1001' })).json, { sent: false, reason: 'no-mail' });

  // the teacher resets it from the dashboard (admin only)
  assert.equal((await post('/api/admin/students/NW1001/reset-password', {})).status, 401);
  const cookie = (await fetch(`${API}/api/login`, { method: 'POST', body: JSON.stringify({ password: 'teacher' }) })).headers.get('set-cookie').split(';')[0];
  const student = await (await fetch(`${API}/api/admin/students/NW1001`, { headers: { cookie } })).json();
  assert.equal(student.has_account, true);
  const reset = (await post('/api/admin/students/NW1001/reset-password', {}, { cookie })).json;
  assert.equal((await post('/api/history', { student_id: 'NW1001', token: priya.token })).status, 401);   // her old login no longer works
  assert.equal((await post('/api/account/login', { student_id: 'NW1001', password: reset.temp_password })).status, 428);
  const back = (await post('/api/account/login', { student_id: 'NW1001', password: reset.temp_password, new_password: 'my-own-pass' })).json;
  assert.equal((await post('/api/history', { student_id: 'NW1001', token: back.token })).json.events.length, 1);   // progress intact
  assert.equal((await post('/api/account/logout', { token: back.token })).status, 200);
  assert.equal((await post('/api/history', { student_id: 'NW1001', token: back.token })).status, 401);
});

test('HTTP: eight wrong passwords lock that ID for a while, even for the right password; other IDs are not affected', async () => {
  await post('/api/account/signup', { student_id: 'NW3003', name: 'Asha', email: 'asha@x.com', password: 'ashapass' });
  for (let i = 0; i < 8; i++) assert.equal((await post('/api/account/login', { student_id: 'NW3003', password: `guess${i}` })).status, 401);
  assert.equal((await post('/api/account/login', { student_id: 'NW3003', password: 'guess8' })).status, 429);
  assert.equal((await post('/api/account/login', { student_id: 'NW3003', password: 'ashapass' })).status, 429);
  assert.equal((await post('/api/account/login', { student_id: 'NW2002', password: 'ravipass' })).status, 200);
});
