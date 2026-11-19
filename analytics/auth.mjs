// Student log-in (since 2026-11-19, as the team asked): NO password. A student signs up once with name, NxtWave ID and
// personal email, and after that logs in with their NxtWave ID OR that email. Node built-ins only.
//
//   accounts            one row per student who signed up: name and email given at sign-up (kept apart from `students`,
//                       which a roster "replace" empties). pw_hash / pw_salt / temp are left empty (from the password version).
//   student_sessions    who is logged in where: a random token per device, stored as its SHA-256. Logging in on a second
//                       device adds a row.
//
// Each log-in gives the device a token, and an ID with an account is read or written only with a token of that ID
// (authorize()). Without passwords this only keeps out requests that never logged in: anyone who types a student's
// NxtWave ID or email gets in as that student (the team's choice).
import crypto from 'node:crypto';
import { normalizeEmail, normalizeId, normalizeName } from './lib.mjs';

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');

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

// Who is this? An NxtWave ID (any case) or the email they signed up with (any case) → { id, name, email } or null.
// A student from before accounts (only in `students`, with a name and an email) counts too.
function find(db, who) {
  const raw = typeof who === 'string' ? who.trim() : '';
  let id;
  if (raw.includes('@')) {
    const email = normalizeEmail(raw);
    if (!email) return null;
    id = db.prepare('SELECT student_id FROM accounts WHERE email = ? ORDER BY updated_at DESC LIMIT 1').get(email)?.student_id
      ?? db.prepare(`SELECT student_id FROM students WHERE email = ? ORDER BY COALESCE(last_login_at, registered_at, '') DESC LIMIT 1`).get(email)?.student_id;
  } else id = normalizeId(raw);
  if (!id) return null;
  const acc = db.prepare('SELECT name, email FROM accounts WHERE student_id = ?').get(id);
  if (acc) return { id, name: acc.name, email: acc.email };
  const st = db.prepare('SELECT COALESCE(entered_name, name) AS name, email FROM students WHERE student_id = ?').get(id);
  return st?.name && st.email ? { id, name: st.name, email: st.email } : null;
}

// Log in with the NxtWave ID or the email: { who } (or the older { student_id }) → a token for this device
export function login(db, body) {
  const me = find(db, body?.who ?? body?.student_id);
  if (!me) return { error: typeof (body?.who ?? body?.student_id) === 'string' && (body?.who ?? body?.student_id).trim() ? 'no account' : 'bad id' };
  const now = new Date().toISOString();
  if (!hasAccount(db, me.id))   // from before accounts: it becomes an account now
    db.prepare("INSERT OR IGNORE INTO accounts (student_id, name, email, pw_hash, pw_salt, created_at, updated_at) VALUES (?,?,?,'','',?,?)").run(me.id, me.name, me.email, now, now);
  welcome(db, me.id, me.name, me.email, now);
  return { ok: true, student_id: me.id, name: me.name, email: me.email, token: newSession(db, me.id), returning: true };
}

// First time: name, NxtWave ID, personal email. An ID that already has an account is simply logged in.
export function signup(db, body) {
  const id = normalizeId(body?.student_id), name = normalizeName(body?.name), email = normalizeEmail(body?.email);
  if (!id) return { error: 'bad id' };
  if (!name) return { error: 'bad name' };
  if (!email) return { error: 'bad email' };
  if (hasAccount(db, id)) return login(db, { who: id });
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO accounts (student_id, name, email, pw_hash, pw_salt, created_at, updated_at) VALUES (?,?,?,'','',?,?)").run(id, name, email, now, now);
  const returning = welcome(db, id, name, email, now);
  return { ok: true, student_id: id, name, email, token: newSession(db, id), returning };
}
