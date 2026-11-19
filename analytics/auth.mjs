// Student accounts: sign up, log in, stay logged in, forgot password. Node built-ins only.
//
//   accounts            one row per student who signed up: the password is stored as a salted scrypt hash, never as text.
//                       It also keeps the name and email given at sign-up, so a roster "replace" (which empties the
//                       students table) cannot lose them.
//   student_sessions    who is logged in where: a random token per device, stored as its SHA-256. Logging in on a second
//                       device adds a row; resetting the password removes them all.
//   password_resets     the 6-digit code emailed for "Forgot password" (hash, 15-minute life, 5 tries).
//
// Once an ID has an account, nothing of that student can be read or written without their token (authorize()): not their
// progress, not their feedback, not their saved place. An ID that only exists from before accounts (no password yet) is
// claimed by signing up with it; if it already has an email on file, the sign-up must give the same email.
import crypto from 'node:crypto';
import { normalizeEmail, normalizeId, normalizeName } from './lib.mjs';

export const PASSWORD_MIN = 6, PASSWORD_MAX = 100;
export const RESET_MINUTES = 15, RESET_TRIES = 5;

export const validPassword = (p) => typeof p === 'string' && p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX;
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
// scrypt runs on Node's thread pool, so a classroom logging in together does not freeze the server
const scrypt = (password, salt) => new Promise((resolve, reject) =>
  crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return { hash: (await scrypt(password, salt)).toString('hex'), salt: salt.toString('hex') };
}
export async function verifyPassword(password, hash, salt) {
  if (typeof password !== 'string' || password.length > PASSWORD_MAX) return false;
  const got = await scrypt(password, Buffer.from(salt, 'hex')), want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// ---------------------------------------------------------------- sessions
const tokenCache = new WeakMap();   // db -> Map(token hash -> student id): events arrive every few seconds per student
const cacheOf = (db) => { let m = tokenCache.get(db); if (!m) tokenCache.set(db, (m = new Map())); return m; };

function newSession(db, id) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO student_sessions (token_hash, student_id, created_at) VALUES (?,?,?)').run(sha(token), id, new Date().toISOString());
  return token;
}
// The student this token belongs to, or null
export function sessionOf(db, token) {
  if (typeof token !== 'string' || token.length !== 64) return null;
  const h = sha(token), cache = cacheOf(db);
  if (cache.has(h)) return cache.get(h);
  const row = db.prepare('SELECT student_id FROM student_sessions WHERE token_hash = ?').get(h);
  if (!row) return null;
  if (cache.size > 5000) cache.clear();
  cache.set(h, row.student_id);
  return row.student_id;
}
function endSessions(db, id) {
  db.prepare('DELETE FROM student_sessions WHERE student_id = ?').run(id);
  cacheOf(db).clear();
}
export function logout(db, body) {
  if (typeof body?.token === 'string' && body.token.length === 64) {
    db.prepare('DELETE FROM student_sessions WHERE token_hash = ?').run(sha(body.token));
    cacheOf(db).clear();
  }
  return { ok: true };
}

export const hasAccount = (db, id) => !!db.prepare('SELECT 1 FROM accounts WHERE student_id = ?').get(id);
// May this request act as this student? Yes with their token; also yes while the ID has no account yet (nobody owns it).
export function authorize(db, rawId, token) {
  const id = normalizeId(rawId);
  if (!id) return true;   // not a student ID (a guest id): nothing to protect
  if (!hasAccount(db, id)) return true;
  return sessionOf(db, token) === id;
}
// the NxtWave ID inside a game user id ("lms:NW1001"), or null for guests
export const studentOf = (userId) => (typeof userId === 'string' && userId.startsWith('lms:') ? normalizeId(userId.slice(4)) : null);

// ---------------------------------------------------------------- sign up / log in
function welcome(db, id, name, email, now) {
  const before = db.prepare('SELECT registered_at FROM students WHERE student_id = ?').get(id);
  const played = !!db.prepare('SELECT 1 FROM events WHERE student_id = ? LIMIT 1').get(id);
  db.prepare(`INSERT INTO students (student_id, entered_name, email, registered_at, last_login_at, logins) VALUES (?,?,?,?,?,1)
    ON CONFLICT(student_id) DO UPDATE SET entered_name = excluded.entered_name, email = excluded.email,
      last_login_at = excluded.last_login_at, registered_at = COALESCE(students.registered_at, excluded.registered_at),
      logins = students.logins + 1`).run(id, name, email, now, now);
  return played || !!before?.registered_at;
}

export async function signup(db, body) {
  const id = normalizeId(body?.student_id), name = normalizeName(body?.name), email = normalizeEmail(body?.email);
  if (!id) return { error: 'bad id' };
  if (!name) return { error: 'bad name' };
  if (!email) return { error: 'bad email' };
  if (!validPassword(body.password)) return { error: 'bad password' };
  if (hasAccount(db, id)) return { error: 'taken' };
  // an ID that was used before accounts existed and has an email on file can only be claimed with that email
  const old = db.prepare('SELECT email FROM students WHERE student_id = ?').get(id);
  if (old?.email && old.email !== email) return { error: 'email mismatch' };
  const { hash, salt } = await hashPassword(body.password);
  const now = new Date().toISOString();
  try {
    db.prepare('INSERT INTO accounts (student_id, name, email, pw_hash, pw_salt, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(id, name, email, hash, salt, now, now);
  } catch { return { error: 'taken' }; }   // two sign-ups for the same ID at the same moment: the first one wins
  const returning = welcome(db, id, name, email, now);
  return { ok: true, student_id: id, name, email, token: newSession(db, id), returning };
}

export async function login(db, body) {
  const id = normalizeId(body?.student_id);
  if (!id) return { error: 'bad id' };
  const acc = db.prepare('SELECT name, email, pw_hash, pw_salt, temp FROM accounts WHERE student_id = ?').get(id);
  if (!acc) return { error: 'no account' };
  if (!(await verifyPassword(body.password, acc.pw_hash, acc.pw_salt))) return { error: 'wrong' };
  // a temporary password from the teacher opens the door once: the student has to choose their own before going in
  if (acc.temp) {
    if (body.new_password == null) return { error: 'new password needed' };
    if (!validPassword(body.new_password) || body.new_password === body.password) return { error: 'bad password' };
    await setPassword(db, id, body.new_password);
  }
  welcome(db, id, acc.name, acc.email, new Date().toISOString());
  return { ok: true, student_id: id, name: acc.name, email: acc.email, token: newSession(db, id), returning: true };
}

// ---------------------------------------------------------------- forgot password
const maskEmail = (e) => e.replace(/^(.)([^@]*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(6, Math.max(2, b.length))) + c);

// Emails a 6-digit code to the address the account was made with. `mailer` is async ({ to, name, code }) => void;
// null when the server has no mail service, and then the answer is "ask your teacher" (adminResetPassword).
export async function requestReset(db, body, mailer) {
  const id = normalizeId(body?.student_id);
  if (!id) return { error: 'bad id' };
  const acc = db.prepare('SELECT name, email FROM accounts WHERE student_id = ?').get(id);
  if (!acc) return { sent: false, reason: 'no-account' };
  if (!mailer) return { sent: false, reason: 'no-mail' };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(`INSERT INTO password_resets (student_id, code_hash, expires_at, tries) VALUES (?,?,?,0)
    ON CONFLICT(student_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0`)
    .run(id, sha(`${id}:${code}`), Date.now() + RESET_MINUTES * 60_000);
  try { await mailer({ to: acc.email, name: acc.name, code }); } catch { return { sent: false, reason: 'mail-failed' }; }
  return { sent: true, to: maskEmail(acc.email) };
}

async function setPassword(db, id, password, temp = 0) {
  const { hash, salt } = await hashPassword(password);
  db.prepare('UPDATE accounts SET pw_hash = ?, pw_salt = ?, temp = ?, updated_at = ? WHERE student_id = ?').run(hash, salt, temp, new Date().toISOString(), id);
  db.prepare('DELETE FROM password_resets WHERE student_id = ?').run(id);
  endSessions(db, id);   // every device has to log in again with the new password
}

export async function resetPassword(db, body) {
  const id = normalizeId(body?.student_id);
  if (!id) return { error: 'bad id' };
  if (!validPassword(body.password)) return { error: 'bad password' };
  const acc = db.prepare('SELECT name, email FROM accounts WHERE student_id = ?').get(id);
  const row = db.prepare('SELECT code_hash, expires_at, tries FROM password_resets WHERE student_id = ?').get(id);
  if (!acc || !row || row.expires_at < Date.now() || row.tries >= RESET_TRIES) return { error: 'bad code' };
  const given = Buffer.from(sha(`${id}:${String(body.code ?? '').trim()}`)), want = Buffer.from(row.code_hash);
  if (!crypto.timingSafeEqual(given, want)) {
    db.prepare('UPDATE password_resets SET tries = tries + 1 WHERE student_id = ?').run(id);
    return { error: 'bad code' };
  }
  await setPassword(db, id, body.password);
  welcome(db, id, acc.name, acc.email, new Date().toISOString());
  return { ok: true, student_id: id, name: acc.name, email: acc.email, token: newSession(db, id), returning: true };
}

// The teacher's way (dashboard): gives the student a temporary password. It logs them in once, and the game then makes
// them choose their own. Works for a student who has progress but never made an account too (the account is created
// with the name and email on file, if any).
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
export async function adminResetPassword(db, rawId) {
  const id = normalizeId(rawId);
  if (!id) return { error: 'bad id' };
  const st = db.prepare('SELECT entered_name, name, email FROM students WHERE student_id = ?').get(id);
  const known = st || db.prepare('SELECT 1 FROM events WHERE student_id = ? LIMIT 1').get(id);
  const acc = db.prepare('SELECT 1 FROM accounts WHERE student_id = ?').get(id);
  if (!acc && !known) return { error: 'no such student' };
  const temp = Array.from({ length: 8 }, () => TEMP_ALPHABET[crypto.randomInt(0, TEMP_ALPHABET.length)]).join('');
  if (acc) await setPassword(db, id, temp, 1);
  else {
    const { hash, salt } = await hashPassword(temp);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO accounts (student_id, name, email, pw_hash, pw_salt, temp, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)')
      .run(id, st?.entered_name ?? st?.name ?? id, st?.email ?? '', hash, salt, now, now);
  }
  return { ok: true, student_id: id, temp_password: temp };
}

// ---------------------------------------------------------------- mail
// The one place that talks to a mail service. Set RESEND_API_KEY and MAIL_FROM (an address on a domain verified with
// Resend) to switch "Forgot password" emails on; without them makeMailer() returns null and teachers reset passwords.
export function makeMailer(env = process.env, send = fetch) {
  const key = env.RESEND_API_KEY, from = env.MAIL_FROM;
  if (!key || !from) return null;
  return async ({ to, name, code }) => {
    const res = await send('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `${code} is your code for SQL: The Missing Influencer`,
        text: `Hello ${name},\n\nYour code to set a new password is ${code}\n\nIt works for ${RESET_MINUTES} minutes. If you did not ask for it, ignore this email - your password stays the same.\n` }),
    });
    if (!res.ok) throw new Error(`mail service answered ${res.status}`);
  };
}
