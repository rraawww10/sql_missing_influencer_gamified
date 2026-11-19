// Storage, ingestion and every number on the dashboard. Pure functions over one SQLite database, so tests can run in memory.
//
// Definitions (shown on the dashboard too):
//   beat            one step of an episode (scene, Case Note, activity, SQL task, check, clue …), in pack order
//   beat completed  the learner finished it: beat_viewed (scene/note/hook), task_passed, activity_done, check_answered, clue_pinned
//   progress %      distinct beats completed ÷ all beats in the 13 episodes (per episode: ÷ that episode's beats).
//                   Once completed, a beat stays counted even if the learner later resets the episode.
//   active time     sum of heartbeats: the game counts time only while the tab is visible and the learner did something in
//                   the last 60 s. Each heartbeat is charged to the beat the learner was working on (the one after the last
//                   beat they completed in that episode).
//   current level   the highest episode the learner has opened.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const VERBS = new Set(['session_started', 'session_resumed', 'session_abandoned', 'session_completed', 'session_reset',
  'beat_viewed', 'task_attempted', 'task_passed', 'trap_hit', 'hint_used', 'activity_done', 'check_answered', 'clue_pinned', 'heartbeat']);
const DONE_VERBS = ['beat_viewed', 'task_passed', 'activity_done', 'check_answered', 'clue_pinned'];
const DONE_SQL = DONE_VERBS.map((v) => `'${v}'`).join(',');
const MAX_HEARTBEAT_SECONDS = 120;     // the game sends ≤ 30 s; anything bigger is clamped
const SESSION_COUNT = 13;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS events (
      event_id    TEXT PRIMARY KEY,
      student_id  TEXT NOT NULL,          -- user_id without the 'lms:' prefix
      is_guest    INTEGER NOT NULL,       -- opened without ?user_id= (anonymous device id)
      sitting_id  TEXT,
      verb        TEXT NOT NULL,
      session     INTEGER NOT NULL,       -- episode 1-13, 0 = briefing
      beat        TEXT,                   -- beat the event belongs to (for heartbeats: the last completed beat)
      object_type TEXT,
      object_id   TEXT,
      seconds     INTEGER,                -- heartbeats only
      result      TEXT,                   -- JSON
      client_ts   TEXT NOT NULL,
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ev_student ON events(student_id, session);
    CREATE INDEX IF NOT EXISTS ev_verb ON events(verb, session);
    CREATE INDEX IF NOT EXISTS ev_ts ON events(client_ts);
    CREATE INDEX IF NOT EXISTS ev_student_verb ON events(student_id, session, verb);
    -- one row per student per episode (a resend replaces it): the end-of-episode feedback card
    CREATE TABLE IF NOT EXISTS feedback (
      student_id  TEXT NOT NULL,
      is_guest    INTEGER NOT NULL,
      session     INTEGER NOT NULL,
      rating      INTEGER NOT NULL,       -- 1-5 stars
      mood        TEXT,
      difficulty  TEXT,                   -- easy | right | hard
      liked       TEXT,                   -- JSON array
      comment     TEXT,
      sound_on    INTEGER,
      client_ts   TEXT NOT NULL,
      received_at TEXT NOT NULL,
      PRIMARY KEY (student_id, session)
    );
    CREATE TABLE IF NOT EXISTS students (
      student_id TEXT PRIMARY KEY,
      name       TEXT,                    -- from the roster CSV (wins on the dashboard when set)
      batch      TEXT
    );
    -- quick check-in after every chapter (between full episode feedback cards): one row per student per chapter
    CREATE TABLE IF NOT EXISTS checkpoint_feedback (
      student_id  TEXT NOT NULL,
      is_guest    INTEGER NOT NULL,
      session     INTEGER NOT NULL,
      chapter     INTEGER NOT NULL,
      rating      INTEGER NOT NULL,       -- 1-4: 😕 lost · 😐 okay · 🙂 good · 🤩 great
      comment     TEXT,                   -- optional suggestion
      client_ts   TEXT NOT NULL,
      received_at TEXT NOT NULL,
      PRIMARY KEY (student_id, session, chapter)
    );
    -- the unfinished attempt at an episode, so a student can continue mid-episode on another device
    CREATE TABLE IF NOT EXISTS sittings (
      student_id TEXT NOT NULL,
      scope      TEXT NOT NULL,           -- 's3' (episode 3) or 's3.u11' (a unit)
      state      TEXT NOT NULL,           -- JSON { savedAt, state } exactly as the game keeps it
      saved_at   INTEGER NOT NULL,        -- ms, from the game
      PRIMARY KEY (student_id, scope)
    );
  `);
  // student accounts (auth.mjs): kept apart from `students`, which a roster upload with "replace" empties
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      student_id TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,           -- given at sign-up; "forgot password" codes go here
      pw_hash    TEXT NOT NULL,           -- scrypt, hex; the password itself is never stored
      pw_salt    TEXT NOT NULL,
      temp       INTEGER NOT NULL DEFAULT 0,   -- 1 = a temporary password from the teacher: must be changed at the next log-in
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_sessions (
      token_hash TEXT PRIMARY KEY,        -- SHA-256 of the token the game holds
      student_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS student_sessions_by_student ON student_sessions (student_id);
    CREATE TABLE IF NOT EXISTS password_resets (
      student_id TEXT PRIMARY KEY,
      code_hash  TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      tries      INTEGER NOT NULL DEFAULT 0
    );
  `);
  // migrations for databases created before student identification (columns can't be added with IF NOT EXISTS)
  const cols = (t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
  const st = cols('students');
  if (!st.has('entered_name')) db.exec('ALTER TABLE students ADD COLUMN entered_name TEXT');      // typed by the student at the start
  if (!st.has('registered_at')) db.exec('ALTER TABLE students ADD COLUMN registered_at TEXT');    // first time they entered their id
  if (!st.has('last_login_at')) db.exec('ALTER TABLE students ADD COLUMN last_login_at TEXT');    // last time they entered it
  if (!st.has('logins')) db.exec('ALTER TABLE students ADD COLUMN logins INTEGER NOT NULL DEFAULT 0');
  if (!st.has('email')) db.exec('ALTER TABLE students ADD COLUMN email TEXT');                    // typed at the start (lower-case); "forgot my ID" looks it up
  if (!cols('events').has('raw')) db.exec('ALTER TABLE events ADD COLUMN raw TEXT');              // the event as sent, to restore it on another device
  if (!cols('feedback').has('scale')) db.exec('ALTER TABLE feedback ADD COLUMN scale INTEGER NOT NULL DEFAULT 5');  // 5 = the old 5-star card, 11 = the 11-star ladder
  return db;
}

// ---------------------------------------------------------------- student identity (no login: NxtWave ID + name + email)
// The id is case-insensitive (stored upper-case); letters, digits and . _ @ - only.
export function normalizeId(v) {
  const id = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z0-9][A-Z0-9._@-]{2,63}$/.test(id) ? id : null;
}
export function normalizeName(v) {
  const n = typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  return n.length >= 2 && n.length <= 60 && /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(n) ? n : null;
}
// Trimmed and lower-cased; something@domain.tld with no spaces, at most 120 characters. Same rule as the game.
export function normalizeEmail(v) {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return e.length <= 120 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(e) ? e : null;
}
// The email is optional here (a game build from before it was asked sends none): a request without one keeps the
// stored email, a request with one replaces it. The stored email is never sent back (this route is public).
export function identify(db, body) {
  const id = normalizeId(body?.student_id), name = normalizeName(body?.name);
  if (!id) return { error: 'bad id' };
  if (!name) return { error: 'bad name' };
  const given = body.email != null && body.email !== '';
  const email = given ? normalizeEmail(body.email) : null;
  if (given && !email) return { error: 'bad email' };
  const now = new Date().toISOString();
  const before = db.prepare('SELECT entered_name, registered_at FROM students WHERE student_id = ?').get(id);
  const played = !!db.prepare('SELECT 1 FROM events WHERE student_id = ? LIMIT 1').get(id);
  db.prepare(`INSERT INTO students (student_id, entered_name, email, registered_at, last_login_at, logins) VALUES (?,?,?,?,?,1)
    ON CONFLICT(student_id) DO UPDATE SET entered_name = excluded.entered_name, email = COALESCE(excluded.email, students.email),
      last_login_at = excluded.last_login_at, registered_at = COALESCE(students.registered_at, excluded.registered_at),
      logins = students.logins + 1`).run(id, name, email, now, now);
  return { ok: true, student_id: id, name, returning: played || !!before?.registered_at, previous_name: before?.entered_name ?? null };
}

// "Forgot your NxtWave ID?": the student who signed in with this email. When several did (one student, two IDs), the
// one seen most recently: the later of their last sign-in and their last event.
export function recover(db, body) {
  const email = normalizeEmail(body?.email);
  if (!email) return { error: 'bad email' };
  const row = db.prepare(`SELECT s.student_id, COALESCE(s.entered_name, s.name) AS name FROM students s WHERE s.email = ?
    ORDER BY MAX(COALESCE(s.last_login_at, ''), COALESCE((SELECT MAX(e.client_ts) FROM events e WHERE e.student_id = s.student_id AND e.is_guest = 0), '')) DESC,
      s.student_id LIMIT 1`).get(email);
  return row ? { found: true, student_id: row.student_id, name: row.name } : { found: false };
}

// Everything the game needs to rebuild a student's progress on a new device: the event log (heartbeats excluded),
// which episodes already got feedback, and unfinished sittings.
export function history(db, rawId) {
  const id = normalizeId(rawId);
  if (!id) return { error: 'bad id' };
  const st = db.prepare('SELECT entered_name, name FROM students WHERE student_id = ?').get(id);
  const rows = db.prepare(`SELECT event_id, sitting_id, verb, session, beat, object_type, object_id, result, client_ts, raw
    FROM events WHERE student_id = ? AND is_guest = 0 AND verb <> 'heartbeat' ORDER BY client_ts LIMIT 50000`).all(id);
  const events = rows.map((r) => {
    if (r.raw) { try { const e = JSON.parse(r.raw); e.user_id = `lms:${id}`; return e; } catch { /* fall through */ } }
    return { event_id: r.event_id, user_id: `lms:${id}`, sitting_id: r.sitting_id ?? 'restored', verb: r.verb,
      object: { type: r.object_type || 'beat', id: r.object_id ?? '', session: r.session, ...(r.beat ? { beat: r.beat } : {}) },
      course_ref: { topic_id: '' }, ...(r.result ? { result: JSON.parse(r.result) } : {}), client_ts: r.client_ts };
  });
  return {
    student_id: id, name: st?.entered_name ?? st?.name ?? null, events,
    feedback: db.prepare('SELECT session FROM feedback WHERE student_id = ? AND is_guest = 0').all(id).map((r) => r.session),
    checkpoints: db.prepare('SELECT session, chapter FROM checkpoint_feedback WHERE student_id = ? AND is_guest = 0').all(id).map((r) => ({ session: r.session, chapter: r.chapter })),
    sittings: db.prepare('SELECT scope, state, saved_at FROM sittings WHERE student_id = ?').all(id).map((r) => ({ scope: r.scope, saved_at: r.saved_at, value: r.state })),
  };
}

// The game mirrors its unfinished sitting here (debounced). op 'save' keeps the newest copy; op 'clear' removes it.
const SCOPE_RE = /^s(1[0-3]|[1-9])(\.u\d{1,2})?$/;
export function saveSitting(db, b) {
  const id = normalizeId(typeof b?.user_id === 'string' && b.user_id.startsWith('lms:') ? b.user_id.slice(4) : null);
  if (!id || typeof b.scope !== 'string' || !SCOPE_RE.test(b.scope)) return { error: 'bad sitting' };
  if (b.op === 'clear') {
    const at = Number(b.saved_at) || Date.now();
    db.prepare('DELETE FROM sittings WHERE student_id = ? AND scope = ? AND saved_at <= ?').run(id, b.scope, at);
    return { ok: true };
  }
  const savedAt = Number(b.saved_at);
  if (b.op !== 'save' || typeof b.value !== 'string' || b.value.length > 400_000 || !Number.isFinite(savedAt)) return { error: 'bad sitting' };
  try { JSON.parse(b.value); } catch { return { error: 'bad sitting' }; }
  db.prepare(`INSERT INTO sittings (student_id, scope, state, saved_at) VALUES (?,?,?,?)
    ON CONFLICT(student_id, scope) DO UPDATE SET state = excluded.state, saved_at = excluded.saved_at WHERE excluded.saved_at >= sittings.saved_at`)
    .run(id, b.scope, b.value, savedAt);
  return { ok: true };
}

// ---------------------------------------------------------------- the beat catalogue (from the generated session packs)
const clean = (s) => String(s ?? '').replace(/\{\{[^}]*\}\}/g, '…').replace(/\[\[name\]\]/g, '(student)').replace(/[*`#>|]/g, '').replace(/\s+/g, ' ').trim();
function beatLabel(b) {
  if (b.type === 'note' && b.rm_ref?.heading) return `Learn: ${clean(b.rm_ref.heading)}`;
  for (const k of ['title', 'ask', 'prompt', 'question', 'body', 'text']) {
    const v = typeof b[k] === 'string' ? b[k] : b[k]?.text;
    if (v) { const t = clean(v); return t.length > 80 ? `${t.slice(0, 77)}…` : t; }
  }
  return '';
}

export function loadCatalogue(dir) {
  const sessions = [];
  for (let n = 1; n <= SESSION_COUNT; n++) {
    const file = path.join(dir, `s${String(n).padStart(2, '0')}.json`);
    if (!fs.existsSync(file)) continue;
    const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
    // chapters: same cut as the game (app/src/ui/screens/Player.tsx chapterOf) - a chapter ends at every clue
    let ch = 1;
    const beats = pack.beats.map((b, i) => {
      const x = { id: b.id, index: i, type: b.type, task_id: b.task_id ?? null, label: beatLabel(b), chapter: ch };
      if (b.type === 'clue' && i < pack.beats.length - 1) ch++;
      return x;
    });
    sessions.push({ n, title: pack.title, minutes: pack.est_minutes ?? pack.minutes_estimate ?? null, beats, chapters: ch });
  }
  const byN = new Map(sessions.map((s) => [s.n, s]));
  return {
    sessions,
    totalBeats: sessions.reduce((a, s) => a + s.beats.length, 0),
    get: (n) => byN.get(n),
    // heartbeats name the last COMPLETED beat; the time belongs to the next one
    workingOn(n, lastDone) {
      const s = byN.get(n);
      if (!s || !s.beats.length) return null;
      if (!lastDone) return s.beats[0].id;
      const i = s.beats.findIndex((b) => b.id === lastDone);
      return i < 0 ? lastDone : s.beats[Math.min(i + 1, s.beats.length - 1)].id;
    },
  };
}

// ---------------------------------------------------------------- ingestion
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export function ingest(db, events) {
  if (!Array.isArray(events) || events.length > 500) return { error: 'events must be an array of at most 500' };
  const ins = db.prepare(`INSERT OR IGNORE INTO events
    (event_id, student_id, is_guest, sitting_id, verb, session, beat, object_type, object_id, seconds, result, client_ts, received_at, raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = new Date().toISOString();
  let added = 0, rejected = 0;
  db.exec('BEGIN');
  try {
    for (const e of events) {
      const o = e?.object;
      const session = Number(o?.session);
      if (!e || !str(e.event_id, 100) || !str(e.user_id, 220) || !VERBS.has(e.verb) || !o || !Number.isInteger(session)
          || session < 0 || session > SESSION_COUNT || !str(e.client_ts, 40) || Number.isNaN(Date.parse(e.client_ts))) { rejected++; continue; }
      const lms = e.user_id.startsWith('lms:');
      // identified students: the NxtWave ID is case-insensitive, stored upper-case
      const sid = lms ? (normalizeId(e.user_id.slice(4)) ?? e.user_id.slice(4)) : e.user_id;
      const beat = typeof o.beat === 'string' ? o.beat.slice(0, 40) : e.verb === 'beat_viewed' && typeof o.id === 'string' ? o.id.slice(0, 40) : null;
      const seconds = e.verb === 'heartbeat' ? Math.max(0, Math.min(MAX_HEARTBEAT_SECONDS, Math.round(Number(e.result?.seconds) || 0))) : null;
      const result = e.result && typeof e.result === 'object' ? JSON.stringify(e.result).slice(0, 8000) : null;
      // a client clock far in the future would break "last seen": cap it at the receive time
      const ts = new Date(Math.min(Date.parse(e.client_ts), Date.now() + 5 * 60_000)).toISOString();
      const raw = e.verb === 'heartbeat' ? null : JSON.stringify(e).slice(0, 16000);
      const r = ins.run(e.event_id, sid, lms ? 0 : 1, typeof e.sitting_id === 'string' ? e.sitting_id.slice(0, 100) : null,
        e.verb, session, beat, String(o.type ?? '').slice(0, 20), String(o.id ?? '').slice(0, 60), seconds, result, ts, now,
        raw && raw.length < 16000 ? raw : null);
      added += Number(r.changes);
    }
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return { added, duplicates: events.length - added - rejected, rejected };
}

// a CSV cell, with spreadsheet formulas neutralised
export const csvCell = (v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) || /^[=+\-@]/.test(t) ? `"${t.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : t; };

// ---------------------------------------------------------------- feedback
const MOODS = new Set(['Loved it', 'Fun', 'Okay', 'Confusing', 'Boring']);
const DIFFICULTY = new Set(['easy', 'right', 'hard']);
// rating: 1 to 11 on the 11-star ladder (scale 11, the card since 2026-11-19), or 1 to 5 (scale 5, older game builds)
export function ingestFeedback(db, f) {
  const session = Number(f?.session), rating = Number(f?.rating), scale = Number(f?.scale) === 11 ? 11 : 5;
  if (!f || !str(f.user_id, 220) || !Number.isInteger(session) || session < 1 || session > SESSION_COUNT
      || !Number.isInteger(rating) || rating < 1 || rating > scale) return { error: 'bad feedback' };
  const lms = f.user_id.startsWith('lms:');
  const liked = Array.isArray(f.liked) ? f.liked.filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)).slice(0, 12) : [];
  const ts = Number.isNaN(Date.parse(f.client_ts)) ? new Date().toISOString() : new Date(Math.min(Date.parse(f.client_ts), Date.now())).toISOString();
  db.prepare(`INSERT OR REPLACE INTO feedback (student_id, is_guest, session, rating, scale, mood, difficulty, liked, comment, sound_on, client_ts, received_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    lms ? (normalizeId(f.user_id.slice(4)) ?? f.user_id.slice(4)) : f.user_id, lms ? 0 : 1, session, rating, scale,
    MOODS.has(f.mood) ? f.mood : null, DIFFICULTY.has(f.difficulty) ? f.difficulty : null, JSON.stringify(liked),
    typeof f.comment === 'string' && f.comment.trim() ? f.comment.trim().slice(0, 1000) : null,
    typeof f.sound_on === 'boolean' ? Number(f.sound_on) : null, ts, new Date().toISOString());
  return { ok: true };
}

// quick chapter check-in: 1-4 + an optional suggestion; a resend for the same chapter replaces it
export function ingestCheckpoint(db, f) {
  const session = Number(f?.session), chapter = Number(f?.chapter), rating = Number(f?.rating);
  if (!f || !str(f.user_id, 220) || !Number.isInteger(session) || session < 1 || session > SESSION_COUNT
      || !Number.isInteger(chapter) || chapter < 1 || chapter > 40 || !Number.isInteger(rating) || rating < 1 || rating > 4) return { error: 'bad checkpoint' };
  const lms = f.user_id.startsWith('lms:');
  const ts = Number.isNaN(Date.parse(f.client_ts)) ? new Date().toISOString() : new Date(Math.min(Date.parse(f.client_ts), Date.now())).toISOString();
  db.prepare(`INSERT OR REPLACE INTO checkpoint_feedback (student_id, is_guest, session, chapter, rating, comment, client_ts, received_at)
              VALUES (?,?,?,?,?,?,?,?)`).run(
    lms ? (normalizeId(f.user_id.slice(4)) ?? f.user_id.slice(4)) : f.user_id, lms ? 0 : 1, session, chapter, rating,
    typeof f.comment === 'string' && f.comment.trim() ? f.comment.trim().slice(0, 1000) : null, ts, new Date().toISOString());
  return { ok: true };
}

// ---------------------------------------------------------------- roster CSV
export function parseRoster(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { error: 'The file is empty' };
  const cells = (l) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const head = cells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (names) => head.findIndex((h) => names.includes(h));
  const id = col(['studentid', 'userid', 'id']), name = col(['name', 'studentname', 'fullname']), batch = col(['batch', 'batchname', 'cohort']);
  if (id < 0) return { error: 'Need a header row with a student_id column (and optionally name, batch)' };
  const rows = [];
  for (const l of lines.slice(1)) {
    const c = cells(l);
    if (!c[id]) continue;
    rows.push({ student_id: c[id].slice(0, 200), name: name >= 0 ? (c[name] || null) : null, batch: batch >= 0 ? (c[batch] || null) : null });
  }
  return { rows };
}

// ---------------------------------------------------------------- the dashboard numbers
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export class Analytics {
  constructor(db, catalogue, tzOffset = '+05:30') {
    this.db = db; this.cat = catalogue;
    const m = /^([+-])(\d\d):(\d\d)$/.exec(tzOffset) ?? ['', '+', '05', '30'];
    this.tzMod = `${m[1]}${Number(m[2]) * 60 + Number(m[3])} minutes`;   // SQLite date modifier
    this.tzMs = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
  }

  // students matching the filters (guests excluded unless asked for); returns a SQL fragment + params
  scope(f = {}, alias = 'e') {
    const where = []; const params = [];
    if (!f.guests) where.push(`${alias}.is_guest = 0`);
    if (f.batch) { where.push(`${alias}.student_id IN (SELECT student_id FROM students WHERE batch = ?)`); params.push(f.batch); }
    return { sql: where.length ? ` AND ${where.join(' AND ')}` : '', params };
  }

  all(sql, params = []) { return this.db.prepare(sql).all(...params); }
  get(sql, params = []) { return this.db.prepare(sql).get(...params); }

  today() { return new Date(Date.now() + this.tzMs).toISOString().slice(0, 10); }

  batches() {
    return this.all(`SELECT batch, COUNT(*) AS students FROM students WHERE batch IS NOT NULL AND batch <> '' GROUP BY batch ORDER BY batch`);
  }

  // Per-student rollup used by the overview, the students table and the export
  students(f = {}) {
    const s = this.scope(f);
    const rows = this.all(`
      SELECT e.student_id, MAX(e.is_guest) AS is_guest,
        MIN(e.client_ts) AS first_seen, MAX(e.client_ts) AS last_seen,
        COALESCE(SUM(e.seconds), 0) AS seconds,
        MAX(CASE WHEN e.session > 0 THEN e.session END) AS level,
        COUNT(DISTINCT CASE WHEN e.verb IN (${DONE_SQL}) AND e.session > 0 THEN e.session || ':' || e.beat END) AS beats_done,
        COUNT(DISTINCT CASE WHEN e.verb = 'session_completed' THEN e.session END) AS episodes_done,
        COUNT(DISTINCT CASE WHEN e.verb <> 'heartbeat' OR e.seconds > 0 THEN date(e.client_ts, '${this.tzMod}') END) AS active_days,
        SUM(e.verb = 'task_attempted') AS attempts, SUM(e.verb = 'task_passed') AS tasks_passed,
        SUM(e.verb = 'hint_used') AS hints, SUM(e.verb = 'trap_hit') AS traps,
        SUM(e.verb = 'clue_pinned') AS clues,
        COUNT(DISTINCT CASE WHEN e.session = 0 THEN e.event_id END) > 0 AS saw_briefing
      FROM events e WHERE 1=1 ${s.sql}
      GROUP BY e.student_id`, s.params);
    const names = new Map(this.all('SELECT student_id, COALESCE(name, entered_name) AS name, batch, entered_name, registered_at, last_login_at, logins, email FROM students').map((r) => [r.student_id, r]));
    const completed = this.completedBySession(f);
    const journeys = this.journeys(f);
    const total = this.cat.totalBeats;
    return rows.map((r) => {
      const n = names.get(r.student_id);
      const level = r.level ?? 0;
      const done = completed.get(r.student_id) ?? new Set();
      return {
        student_id: r.student_id, name: n?.name ?? null, batch: n?.batch ?? null, is_guest: !!r.is_guest,
        entered_name: n?.entered_name ?? null, email: n?.email ?? null, registered_at: n?.registered_at ?? null, logins: n?.logins ?? 0,
        level, level_title: this.cat.get(level)?.title ?? (r.saw_briefing ? 'Briefing' : '—'),
        level_status: !level ? 'briefing' : done.has(level) ? 'completed' : 'in progress',
        episodes_done: r.episodes_done, beats_done: r.beats_done, progress_pct: pct(r.beats_done, total),
        seconds: r.seconds, active_days: r.active_days,
        attempts: r.attempts, tasks_passed: r.tasks_passed, hints: r.hints, traps: r.traps, clues: r.clues,
        accuracy_pct: pct(r.tasks_passed, r.attempts),
        first_seen: r.first_seen, last_seen: r.last_seen,
        journey: journeys.get(r.student_id)?.episodes ?? Array(SESSION_COUNT).fill(0),
        stars: journeys.get(r.student_id)?.stars ?? [],
      };
    }).sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));
  }

  completedBySession(f = {}) {
    const s = this.scope(f);
    const map = new Map();
    for (const r of this.all(`SELECT DISTINCT e.student_id, e.session FROM events e WHERE e.verb = 'session_completed' ${s.sql}`, s.params)) {
      if (!map.has(r.student_id)) map.set(r.student_id, new Set());
      map.get(r.student_id).add(r.session);
    }
    return map;
  }

  overview(f = {}) {
    const s = this.scope(f);
    const students = this.students(f);
    const today = this.today();
    const daysAgo = (d) => new Date(Date.parse(`${today}T00:00:00Z`) - d * 86400_000).toISOString().slice(0, 10);
    const local = (ts) => new Date(Date.parse(ts) + this.tzMs).toISOString().slice(0, 10);
    const totalSeconds = students.reduce((a, r) => a + r.seconds, 0);
    const players = students.filter((r) => r.level > 0);

    // daily activity, last 30 days (local dates)
    const daily = new Map();
    for (let i = 29; i >= 0; i--) daily.set(daysAgo(i), { date: daysAgo(i), students: 0, minutes: 0 });
    for (const r of this.all(`
      SELECT date(e.client_ts, '${this.tzMod}') AS d, COUNT(DISTINCT e.student_id) AS students, COALESCE(SUM(e.seconds), 0) AS seconds
      FROM events e WHERE e.client_ts >= ? ${s.sql} GROUP BY d`, [new Date(Date.parse(`${daysAgo(30)}T00:00:00Z`) - this.tzMs).toISOString(), ...s.params])) {
      const row = daily.get(r.d);
      if (row) { row.students = r.students; row.minutes = Math.round(r.seconds / 60); }
    }

    // hour-of-day heat (local), from heartbeats
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, minutes: 0 }));
    for (const r of this.all(`SELECT CAST(strftime('%H', e.client_ts, '${this.tzMod}') AS INTEGER) AS h, SUM(e.seconds) AS seconds
                              FROM events e WHERE e.verb = 'heartbeat' ${s.sql} GROUP BY h`, s.params)) hours[r.h].minutes = Math.round(r.seconds / 60);

    return {
      generated_at: new Date().toISOString(), today,
      totals: {
        students: students.length,
        playing: players.length,
        active_today: students.filter((r) => local(r.last_seen) === today).length,
        active_7d: students.filter((r) => local(r.last_seen) >= daysAgo(6)).length,
        finished_game: students.filter((r) => r.episodes_done >= SESSION_COUNT).length,
        total_hours: Math.round(totalSeconds / 360) / 10,
        avg_minutes_per_student: students.length ? Math.round(totalSeconds / 60 / students.length) : 0,
        avg_progress_pct: students.length ? Math.round(students.reduce((a, r) => a + r.progress_pct, 0) / students.length * 10) / 10 : 0,
        inactive_7d: students.filter((r) => local(r.last_seen) < daysAgo(6)).length,
        roster: this.get(`SELECT COUNT(*) AS n FROM students ${f.batch ? 'WHERE batch = ?' : ''}`, f.batch ? [f.batch] : []).n,
        not_started: this.notStarted(f).length,
      },
      daily: [...daily.values()],
      hours,
      funnel: this.funnel(f),
      levels: this.cat.sessions.map((ep) => ({ n: ep.n, title: ep.title, students: players.filter((r) => r.level === ep.n).length })),
      attention: this.attention(f),
      ladder: this.ladder(f),
      progress_buckets: [0, 10, 25, 50, 75, 100].slice(0, -1).map((lo, i, a) => {
        const hi = [10, 25, 50, 75, 100.01][i];
        return { label: `${lo}–${Math.min(100, Math.floor(hi))}%`, students: students.filter((r) => r.progress_pct >= lo && r.progress_pct < hi).length };
      }),
      definitions: DEFINITIONS,
    };
  }

  funnel(f = {}) {
    const s = this.scope(f);
    const rows = new Map(this.all(`
      SELECT e.session,
        COUNT(DISTINCT e.student_id) AS started,
        COUNT(DISTINCT CASE WHEN e.verb = 'session_completed' THEN e.student_id END) AS completed,
        COALESCE(SUM(e.seconds), 0) AS seconds,
        COUNT(DISTINCT CASE WHEN e.verb = 'heartbeat' AND e.seconds > 0 THEN e.student_id END) AS timed,
        SUM(e.verb = 'task_attempted') AS attempts, SUM(e.verb = 'task_passed') AS passed,
        SUM(e.verb = 'hint_used') AS hints, SUM(e.verb = 'trap_hit') AS traps
      FROM events e WHERE e.session > 0 ${s.sql} GROUP BY e.session`, s.params).map((r) => [r.session, r]));
    // median minutes to finish, from students who completed it
    const finish = new Map();
    // (computed in JS: a correlated EXISTS here took ~3 s at 250k events)
    const completed = this.completedBySession(f);
    for (const r of this.all(`
      SELECT e.session, e.student_id, SUM(e.seconds) AS seconds FROM events e
      WHERE e.verb = 'heartbeat' AND e.session > 0 ${s.sql}
      GROUP BY e.session, e.student_id`, s.params)) {
      if (!completed.get(r.student_id)?.has(r.session)) continue;
      if (!finish.has(r.session)) finish.set(r.session, []);
      finish.get(r.session).push(r.seconds);
    }
    const median = (xs) => { if (!xs?.length) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    return this.cat.sessions.map((ep) => {
      const r = rows.get(ep.n) ?? { started: 0, completed: 0, seconds: 0, timed: 0, attempts: 0, passed: 0, hints: 0, traps: 0 };
      const med = median(finish.get(ep.n));
      return {
        n: ep.n, title: ep.title, beats: ep.beats.length, est_minutes: ep.minutes,
        started: r.started, completed: r.completed, completion_pct: pct(r.completed, r.started),
        total_minutes: Math.round(r.seconds / 60), avg_minutes: r.timed ? Math.round(r.seconds / 60 / r.timed) : 0,
        median_finish_minutes: med == null ? null : Math.round(med / 60),
        attempts: r.attempts, first_pass_pct: pct(r.passed, r.attempts), hints: r.hints, traps: r.traps,
      };
    });
  }

  student(id) {
    const base = this.students({ guests: true }).find((r) => r.student_id === id);
    if (!base) return null;
    const ev = this.all(`SELECT verb, session, beat, object_id, seconds, result, client_ts FROM events WHERE student_id = ? ORDER BY client_ts`, [id]);
    const episodes = this.cat.sessions.map((ep) => {
      const mine = ev.filter((e) => e.session === ep.n);
      const done = new Set(mine.filter((e) => DONE_VERBS.includes(e.verb) && e.beat).map((e) => e.beat));
      const time = new Map();
      for (const h of mine.filter((e) => e.verb === 'heartbeat')) {
        const b = this.cat.workingOn(ep.n, h.beat);
        time.set(b, (time.get(b) ?? 0) + h.seconds);
      }
      const per = (verb, b) => mine.filter((e) => e.verb === verb && e.beat === b.id).length;
      const completedAt = mine.find((e) => e.verb === 'session_completed')?.client_ts ?? null;
      const result = completedAt ? JSON.parse(mine.find((e) => e.verb === 'session_completed').result ?? '{}') : null;
      return {
        n: ep.n, title: ep.title, total_beats: ep.beats.length, beats_done: done.size, progress_pct: pct(done.size, ep.beats.length),
        status: completedAt ? 'completed' : mine.length ? 'in progress' : 'not started',
        started_at: mine[0]?.client_ts ?? null, completed_at: completedAt, points: result?.points ?? null,
        seconds: mine.reduce((a, e) => a + (e.seconds ?? 0), 0),
        attempts: mine.filter((e) => e.verb === 'task_attempted').length, hints: mine.filter((e) => e.verb === 'hint_used').length,
        traps: mine.filter((e) => e.verb === 'trap_hit').length, resets: mine.filter((e) => e.verb === 'session_reset').length,
        beats: mine.length ? ep.beats.map((b) => ({ id: b.id, type: b.type, label: b.label, chapter: b.chapter, done: done.has(b.id), seconds: time.get(b.id) ?? 0,
          attempts: per('task_attempted', b), hints: per('hint_used', b), traps: per('trap_hit', b) })) : [],
        chapters: mine.length ? Array.from({ length: ep.chapters }, (_, i) => {
          const bs = ep.beats.filter((b) => b.chapter === i + 1);
          return { chapter: i + 1, beats: bs.length, beats_done: bs.filter((b) => done.has(b.id)).length, seconds: bs.reduce((a, b) => a + (time.get(b.id) ?? 0), 0) };
        }) : [],
      };
    });
    const local = (ts) => new Date(Date.parse(ts) + this.tzMs).toISOString().slice(0, 10);
    const days = new Map();
    for (const e of ev) { const d = local(e.client_ts); days.set(d, (days.get(d) ?? 0) + (e.seconds ?? 0)); }
    const recent = ev.filter((e) => e.verb !== 'heartbeat').slice(-40).reverse().map((e) => {
      const r = e.result ? JSON.parse(e.result) : {};
      return { at: e.client_ts, verb: e.verb, session: e.session, beat: e.beat, id: e.object_id,
        detail: e.verb === 'task_attempted' ? { status: r.status, sql: r.sql } : e.verb === 'session_completed' ? { points: r.points } : e.verb === 'hint_used' ? { tier: r.tier } : null };
    });
    const fb = this.all('SELECT session, rating, scale, mood, difficulty, liked, comment, client_ts FROM feedback WHERE student_id = ? ORDER BY session', [id])
      .map((r) => ({ ...r, liked: JSON.parse(r.liked || '[]') }));
    const cps = this.all('SELECT session, chapter, rating, comment, client_ts FROM checkpoint_feedback WHERE student_id = ? ORDER BY session, chapter', [id]);
    return { ...base, episodes, feedback: fb, checkpoints: cps, daily: [...days].map(([date, seconds]) => ({ date, minutes: Math.round(seconds / 60) })), recent,
      timeline: this.timeline(id), attention: this.attention({ guests: true }).find((x) => x.student_id === id)?.reasons ?? [] };
  }

  episode(n, f = {}) {
    const ep = this.cat.get(n);
    if (!ep) return null;
    const s = this.scope(f);
    const rows = this.all(`SELECT e.student_id, e.verb, e.beat, e.seconds FROM events e WHERE e.session = ? ${s.sql}`, [n, ...s.params]);
    const started = new Set(rows.map((r) => r.student_id)).size;
    const stat = new Map(ep.beats.map((b) => [b.id, { reached: new Set(), done: new Set(), seconds: 0, timed: new Set(), attempts: 0, hints: 0, traps: 0, stuckNow: 0 }]));
    const lastDone = new Map();
    for (const r of rows) {
      if (r.verb === 'heartbeat') {
        const b = stat.get(this.cat.workingOn(n, r.beat));
        if (b) { b.seconds += r.seconds; b.timed.add(r.student_id); b.reached.add(r.student_id); }
        continue;
      }
      const b = r.beat && stat.get(r.beat);
      if (!b) continue;
      b.reached.add(r.student_id);
      if (DONE_VERBS.includes(r.verb)) {
        b.done.add(r.student_id);
        const idx = ep.beats.findIndex((x) => x.id === r.beat);
        if (idx > (lastDone.get(r.student_id) ?? -1)) lastDone.set(r.student_id, idx);
      }
      if (r.verb === 'task_attempted') b.attempts++;
      if (r.verb === 'hint_used') b.hints++;
      if (r.verb === 'trap_hit') b.traps++;
    }
    const completed = new Set(rows.filter((r) => r.verb === 'session_completed').map((r) => r.student_id));
    // where unfinished students currently are: the beat after their last completed one
    for (const id of new Set(rows.map((r) => r.student_id))) {
      if (completed.has(id)) continue;
      const i = lastDone.get(id) ?? -1;
      const at = ep.beats[Math.min(i + 1, ep.beats.length - 1)];
      stat.get(at.id).stuckNow++;
    }
    return {
      n, title: ep.title, started, completed: completed.size,
      beats: ep.beats.map((b) => {
        const x = stat.get(b.id);
        return { id: b.id, index: b.index, type: b.type, label: b.label, done: x.done.size, done_pct: pct(x.done.size, started),
          avg_seconds: x.timed.size ? Math.round(x.seconds / x.timed.size) : 0, attempts: x.attempts, hints: x.hints, traps: x.traps,
          here_now: x.stuckNow };
      }),
    };
  }

  // Who is playing right now: any event in the last 5 minutes, with the episode and beat they are on
  live(f = {}) {
    const s = this.scope(f);
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const rows = this.all(`SELECT e.student_id, MAX(e.client_ts) AS at,
        (SELECT x.session FROM events x WHERE x.student_id = e.student_id ORDER BY x.client_ts DESC LIMIT 1) AS session
      FROM events e WHERE e.client_ts >= ? ${s.sql} GROUP BY e.student_id ORDER BY at DESC`, [since, ...s.params]);
    const names = new Map(this.all('SELECT student_id, COALESCE(name, entered_name) AS name, batch, entered_name, registered_at, last_login_at, logins FROM students').map((r) => [r.student_id, r]));
    return { since, count: rows.length, students: rows.map((r) => ({ ...r, name: names.get(r.student_id)?.name ?? null, batch: names.get(r.student_id)?.batch ?? null,
      title: r.session ? this.cat.get(r.session)?.title ?? null : 'Briefing' })) };
  }

  // Feedback tab: headline numbers, per-episode ratings + difficulty split, mood and "liked" counts, every comment
  feedback(f = {}) {
    const where = []; const params = [];
    if (!f.guests) where.push('fb.is_guest = 0');
    if (f.batch) { where.push('fb.student_id IN (SELECT student_id FROM students WHERE batch = ?)'); params.push(f.batch); }
    if (f.session) { where.push('fb.session = ?'); params.push(Number(f.session)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.all(`SELECT fb.*, COALESCE(s.name, s.entered_name) AS name, s.batch FROM feedback fb LEFT JOIN students s USING (student_id) ${w} ORDER BY fb.client_ts DESC`, params);
    const count = (key, vals) => Object.fromEntries(vals.map((v) => [v, rows.filter((r) => r[key] === v).length]));
    const liked = {};
    for (const r of rows) for (const x of JSON.parse(r.liked || '[]')) liked[x] = (liked[x] ?? 0) + 1;
    const avg = (xs) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null;
    const five = (r) => r.scale !== 11;          // the star numbers here are the old 5-star card; the 11-star ones are in ladder
    return {
      totals: { responses: rows.length, students: new Set(rows.map((r) => r.student_id)).size, avg_rating: avg(rows.filter(five).map((r) => r.rating)),
        comments: rows.filter((r) => r.comment).length, sound_on_pct: pct(rows.filter((r) => r.sound_on === 1).length, rows.filter((r) => r.sound_on != null).length) },
      stars: [1, 2, 3, 4, 5].map((n) => ({ stars: n, responses: rows.filter((r) => five(r) && r.rating === n).length })),
      moods: count('mood', [...MOODS]),
      difficulty: count('difficulty', [...DIFFICULTY]),
      liked: Object.entries(liked).sort((a, b) => b[1] - a[1]).map(([what, n]) => ({ what, n })),
      episodes: this.cat.sessions.map((ep) => {
        const r = rows.filter((x) => x.session === ep.n);
        return { n: ep.n, title: ep.title, responses: r.length, avg_rating: avg(r.filter(five).map((x) => x.rating)),
          easy: r.filter((x) => x.difficulty === 'easy').length, right: r.filter((x) => x.difficulty === 'right').length, hard: r.filter((x) => x.difficulty === 'hard').length,
          confusing: r.filter((x) => x.mood === 'Confusing' || x.mood === 'Boring').length };
      }),
      responses: rows.slice(0, 2000).map((r) => ({ student_id: r.student_id, name: r.name, batch: r.batch, session: r.session, rating: r.rating, scale: r.scale, mood: r.mood,
        difficulty: r.difficulty, liked: JSON.parse(r.liked || '[]'), comment: r.comment, sound_on: r.sound_on, at: r.client_ts })),
      checkpoints: this.checkpoints(f),
      ladder: this.ladder(f),
    };
  }

  // chapter check-ins (1 lost · 2 okay · 3 good · 4 great): per episode + chapter, and every suggestion
  checkpoints(f = {}) {
    const where = []; const params = [];
    if (!f.guests) where.push('c.is_guest = 0');
    if (f.batch) { where.push('c.student_id IN (SELECT student_id FROM students WHERE batch = ?)'); params.push(f.batch); }
    if (f.session) { where.push('c.session = ?'); params.push(Number(f.session)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.all(`SELECT c.*, COALESCE(s.name, s.entered_name) AS name, s.batch FROM checkpoint_feedback c LEFT JOIN students s USING (student_id) ${w} ORDER BY c.client_ts DESC`, params);
    const by = new Map();
    for (const r of rows) {
      const k = `${r.session}:${r.chapter}`;
      if (!by.has(k)) by.set(k, { session: r.session, title: this.cat.get(r.session)?.title ?? null, chapter: r.chapter, responses: 0, sum: 0, lost: 0 });
      const x = by.get(k); x.responses++; x.sum += r.rating; if (r.rating === 1) x.lost++;
    }
    return {
      responses: rows.length,
      chapters: [...by.values()].sort((a, b) => a.session - b.session || a.chapter - b.chapter)
        .map(({ sum, ...x }) => ({ ...x, avg: Math.round(sum / x.responses * 10) / 10 })),
      list: rows.slice(0, 2000).map((r) => ({ student_id: r.student_id, name: r.name, batch: r.batch, session: r.session, chapter: r.chapter,
        rating: r.rating, comment: r.comment, at: r.client_ts })),
    };
  }

  feedbackCsv(f = {}) {
    const d = this.feedback(f);
    const head = ['student_id', 'name', 'batch', 'episode', 'rating', 'out_of', 'mood', 'difficulty', 'liked', 'comment', 'sound_on', 'at'];
    const lines = d.responses.map((r) => [r.student_id, r.name, r.batch, r.session, r.rating, r.scale, r.mood, r.difficulty, r.liked.join('; '), r.comment, r.sound_on, r.at].map(csvCell).join(','));
    const PULSE = ['', 'lost', 'okay', 'good', 'great'];
    const chap = d.checkpoints.list.map((r) => [r.student_id, r.name, r.batch, r.session, `chapter ${r.chapter}: ${PULSE[r.rating]}`, '', '', '', '', r.comment, '', r.at].map(csvCell).join(','));
    return [head.join(','), ...lines, ...chap].join('\n');
  }

  // ---------------------------------------------------------------- the 11-star ladder (feedback since 2026-11-19)
  // Answers on the old 5-star card (scale 5) are counted apart, never mixed into the 11-star numbers.
  ladder(f = {}) {
    const where = ['fb.scale = 11']; const params = [];
    if (!f.guests) where.push('fb.is_guest = 0');
    if (f.batch) { where.push('fb.student_id IN (SELECT student_id FROM students WHERE batch = ?)'); params.push(f.batch); }
    const rows = this.all(`SELECT fb.session, fb.rating FROM feedback fb WHERE ${where.join(' AND ')}`, params);
    const legacy = this.get(`SELECT COUNT(*) AS n FROM feedback fb WHERE ${where.join(' AND ').replace('fb.scale = 11', 'fb.scale <> 11')}`, params).n;
    const avg = (xs) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null;
    const median = (xs) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
    const band = (xs) => ({ low: xs.filter((r) => r <= 3).length, okay: xs.filter((r) => r >= 4 && r <= 5).length, delight: xs.filter((r) => r >= 6).length });
    const all = rows.map((r) => r.rating);
    return {
      responses: all.length, avg: avg(all), median: median(all), ...band(all),
      levels: Array.from({ length: 11 }, (_, i) => ({ level: i + 1, n: all.filter((r) => r === i + 1).length })),
      legacy,
      episodes: this.cat.sessions.map((ep) => {
        const xs = rows.filter((r) => r.session === ep.n).map((r) => r.rating);
        return { n: ep.n, title: ep.title, responses: xs.length, avg: avg(xs), median: median(xs), ratings: xs.sort((a, b) => a - b), ...band(xs) };
      }),
    };
  }

  // ---------------------------------------------------------------- every interaction of one student, newest first
  // One list for the student's page: steps, every SQL run (with the query), hints, traps, activities, checks, clues,
  // episode starts / finishes / resets, log-ins, the episode feedback and the chapter check-ins.
  timeline(id, { limit = 300, before = null } = {}) {
    const lbl = (n, beat) => this.cat.get(n)?.beats.find((b) => b.id === beat) ?? null;
    const items = [];
    const ev = this.all(`SELECT event_id, verb, session, beat, object_id, result, client_ts FROM events
      WHERE student_id = ? AND verb <> 'heartbeat' ${before ? 'AND client_ts < ?' : ''} ORDER BY client_ts DESC LIMIT ?`, before ? [id, before, limit] : [id, limit]);
    for (const e of ev) {
      const r = (() => { try { return e.result ? JSON.parse(e.result) : {}; } catch { return {}; } })();
      const b = lbl(e.session, e.beat), base = { at: e.client_ts, session: e.session, episode: this.cat.get(e.session)?.title ?? (e.session ? `Episode ${e.session}` : 'Briefing'),
        beat: e.beat, step: b ? b.index + 1 : null, label: b?.label ?? null };
      switch (e.verb) {
        case 'task_attempted': items.push({ ...base, kind: 'sql', status: r.status ?? null, sql: typeof r.sql === 'string' ? r.sql.slice(0, 4000) : null, attempt: r.attempt ?? null, task: b?.task_id ?? e.object_id, trap: r.trap ?? null }); break;
        case 'task_passed': items.push({ ...base, kind: 'solved', task: b?.task_id ?? e.object_id, attempts: r.attempts ?? null, hint: r.max_hint_tier ?? 0 }); break;
        case 'hint_used': items.push({ ...base, kind: 'hint', tier: r.tier ?? Number(String(e.object_id).split('#')[1]) ?? null, task: String(e.object_id).split('#')[0] }); break;
        case 'trap_hit': items.push({ ...base, kind: 'trap', trap: r.trap ?? null, task: b?.task_id ?? null }); break;
        case 'activity_done': items.push({ ...base, kind: 'activity', first_try: !!r.first_try, attempts: r.attempts ?? null, revealed: !!r.revealed }); break;
        case 'check_answered': items.push({ ...base, kind: 'check', correct: !!r.correct, option: r.option ?? null }); break;
        case 'clue_pinned': items.push({ ...base, kind: 'clue', title: r.title ?? e.object_id }); break;
        case 'beat_viewed': items.push({ ...base, kind: 'step', type: b?.type ?? null }); break;
        case 'session_started': items.push({ ...base, kind: 'start' }); break;
        case 'session_resumed': items.push({ ...base, kind: 'resume' }); break;
        case 'session_completed': items.push({ ...base, kind: 'finish', points: r.points ?? null }); break;
        case 'session_reset': items.push({ ...base, kind: 'reset' }); break;
        case 'session_abandoned': items.push({ ...base, kind: 'restart' }); break;
        default: break;
      }
    }
    const since = items.length === limit ? items[items.length - 1].at : null;   // older events exist: everything else stops there too
    const keep = (at) => (!before || at < before) && (!since || at >= since);
    for (const f of this.all('SELECT session, rating, scale, mood, difficulty, liked, comment, client_ts FROM feedback WHERE student_id = ?', [id]))
      if (keep(f.client_ts)) items.push({ at: f.client_ts, kind: 'feedback', session: f.session, episode: this.cat.get(f.session)?.title ?? null, rating: f.rating, scale: f.scale,
        mood: f.mood, difficulty: f.difficulty, liked: JSON.parse(f.liked || '[]'), comment: f.comment });
    for (const c of this.all('SELECT session, chapter, rating, comment, client_ts FROM checkpoint_feedback WHERE student_id = ?', [id]))
      if (keep(c.client_ts)) items.push({ at: c.client_ts, kind: 'checkin', session: c.session, episode: this.cat.get(c.session)?.title ?? null, chapter: c.chapter, rating: c.rating, comment: c.comment });
    for (const l of this.all('SELECT created_at FROM student_sessions WHERE student_id = ?', [id]))
      if (keep(l.created_at)) items.push({ at: l.created_at, kind: 'login' });
    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return { items, more: !!since, next: since };
  }

  // ---------------------------------------------------------------- who needs the team's attention, and why
  // Each reason comes with what to look at. Sorted: stuck now, then unhappy, then gone quiet, then never started.
  attention(f = {}) {
    const s = this.scope(f);
    const now = Date.now(), DAY = 86400_000;
    const names = new Map(this.all('SELECT student_id, COALESCE(name, entered_name) AS name, registered_at FROM students').map((r) => [r.student_id, r]));
    const out = new Map();
    const add = (id, reason) => { if (!out.has(id)) out.set(id, { student_id: id, name: names.get(id)?.name ?? null, reasons: [] }); out.get(id).reasons.push(reason); };
    // stuck: 4+ runs of one SQL task in the last 2 days, and still not solved
    for (const r of this.all(`SELECT e.student_id, e.session, e.beat, COUNT(*) AS tries, MAX(e.client_ts) AS at FROM events e
        WHERE e.verb = 'task_attempted' AND e.client_ts >= ? ${s.sql} GROUP BY e.student_id, e.session, e.beat HAVING tries >= 4`, [new Date(now - 2 * DAY).toISOString(), ...s.params])) {
      const solved = this.get(`SELECT 1 AS y FROM events WHERE student_id = ? AND session = ? AND beat = ? AND verb = 'task_passed' LIMIT 1`, [r.student_id, r.session, r.beat]);
      if (solved) continue;
      const b = this.cat.get(r.session)?.beats.find((x) => x.id === r.beat);
      add(r.student_id, { kind: 'stuck', rank: 0, at: r.at, text: `Stuck on ${b?.task_id ?? r.beat}`, detail: `${r.tries} tries, not solved`, session: r.session });
    }
    // used the full answer (envelope 3) 3+ times in a week: may be guessing their way through
    for (const r of this.all(`SELECT e.student_id, COUNT(*) AS n, MAX(e.client_ts) AS at FROM events e
        WHERE e.verb = 'hint_used' AND e.object_id LIKE '%#3' AND e.client_ts >= ? ${s.sql} GROUP BY e.student_id HAVING n >= 3`, [new Date(now - 7 * DAY).toISOString(), ...s.params]))
      add(r.student_id, { kind: 'answers', rank: 1, at: r.at, text: 'Leaning on answers', detail: `${r.n} full answers this week` });
    // unhappy: a low rating, or "lost" on a chapter, in the last week
    const recent = new Date(now - 7 * DAY).toISOString();
    for (const r of this.all(`SELECT student_id, session, rating, scale, client_ts FROM feedback WHERE client_ts >= ? AND is_guest = 0 AND ((scale = 11 AND rating <= 3) OR (scale = 5 AND rating <= 2))`, [recent]))
      add(r.student_id, { kind: 'low', rank: 2, at: r.client_ts, text: `${r.rating}/${r.scale} stars, episode ${r.session}`, detail: this.cat.get(r.session)?.title ?? '', session: r.session });
    for (const r of this.all(`SELECT student_id, session, chapter, client_ts FROM checkpoint_feedback WHERE client_ts >= ? AND is_guest = 0 AND rating = 1`, [recent]))
      add(r.student_id, { kind: 'lost', rank: 2, at: r.client_ts, text: `Lost in episode ${r.session}`, detail: `chapter ${r.chapter}`, session: r.session });
    // gone quiet: played, not finished, nothing for 3+ days
    for (const st of this.students(f)) {
      if (st.episodes_done >= SESSION_COUNT || !st.last_seen) continue;
      const days = Math.floor((now - Date.parse(st.last_seen)) / DAY);
      if (days >= 3) add(st.student_id, { kind: 'quiet', rank: 3, at: st.last_seen, text: `Quiet for ${days} days`, detail: `on ${st.level_title}` });
    }
    // signed up a day ago or more, never played a step
    for (const r of this.notStarted(f)) {
      if (!r.registered_at || now - Date.parse(r.registered_at) < DAY) continue;
      add(r.student_id, { kind: 'notstarted', rank: 4, at: r.registered_at, text: 'Signed up, never played', detail: '' });
    }
    return [...out.values()].map((x) => ({ ...x, reasons: x.reasons.sort((a, b) => a.rank - b.rank) }))
      .sort((a, b) => a.reasons[0].rank - b.reasons[0].rank || (a.reasons[0].at < b.reasons[0].at ? 1 : -1));
  }

  // per student: where they are in each of the 13 episodes, and the stars they gave (for the students table)
  journeys(f = {}) {
    const s = this.scope(f);
    const map = new Map();
    for (const r of this.all(`SELECT e.student_id, e.session, MAX(e.verb = 'session_completed') AS done FROM events e WHERE e.session > 0 ${s.sql} GROUP BY e.student_id, e.session`, s.params)) {
      if (!map.has(r.student_id)) map.set(r.student_id, { episodes: Array(SESSION_COUNT).fill(0), stars: [] });
      map.get(r.student_id).episodes[r.session - 1] = r.done ? 2 : 1;    // 0 not opened · 1 opened · 2 solved
    }
    for (const r of this.all(`SELECT student_id, session, rating, scale FROM feedback WHERE is_guest = 0 ORDER BY client_ts`)) {
      if (!map.has(r.student_id)) map.set(r.student_id, { episodes: Array(SESSION_COUNT).fill(0), stars: [] });
      map.get(r.student_id).stars.push({ session: r.session, rating: r.rating, scale: r.scale });
    }
    return map;
  }

  saveRoster(rows, replace = false) {
    const up = this.db.prepare(`INSERT INTO students (student_id, name, batch) VALUES (?,?,?)
      ON CONFLICT(student_id) DO UPDATE SET name = COALESCE(excluded.name, students.name), batch = COALESCE(excluded.batch, students.batch)`);
    this.db.exec('BEGIN');
    try {
      if (replace) this.db.exec('DELETE FROM students');
      for (const r of rows) up.run(r.student_id, r.name, r.batch);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    const played = this.get(`SELECT COUNT(DISTINCT student_id) AS n FROM events WHERE is_guest = 0 AND student_id IN (SELECT student_id FROM students)`).n;
    const roster = this.get('SELECT COUNT(*) AS n FROM students').n;
    return { saved: rows.length, roster, roster_played: played, roster_not_started: roster - played };
  }

  // roster students who never opened the game (so the admin can nudge them)
  notStarted(f = {}) {
    const params = f.batch ? [f.batch] : [];
    return this.all(`SELECT student_id, COALESCE(name, entered_name) AS name, batch, registered_at, email FROM students s
      WHERE ${f.batch ? 'batch = ? AND' : ''} NOT EXISTS (SELECT 1 FROM events e WHERE e.student_id = s.student_id) ORDER BY name`, params);
  }

  exportCsv(f = {}) {
    // new columns go at the END, so the positions of the existing ones never change
    const cols = ['student_id', 'name', 'batch', 'level', 'level_title', 'level_status', 'episodes_done', 'progress_pct', 'minutes', 'active_days',
      'attempts', 'tasks_passed', 'accuracy_pct', 'hints', 'traps', 'clues', 'first_seen', 'last_seen', 'email'];
    const q = csvCell;
    const rows = this.students(f).map((r) => ({ ...r, minutes: Math.round(r.seconds / 60) }));
    for (const r of this.notStarted(f)) rows.push({ ...r, level: 0, level_title: 'Not started', level_status: 'not started', episodes_done: 0, progress_pct: 0, minutes: 0 });
    return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
  }
}

export const DEFINITIONS = {
  beat: 'One step of an episode: a chat scene, a Case Note, an activity, a SQL task, a quick check or a clue.',
  progress: 'Beats completed ÷ all beats in the 13 episodes. A completed beat stays counted even if the student resets the episode.',
  active_time: 'Counted only while the game tab is visible and the student did something (tap, type, scroll) in the last minute. Idle or background time is not counted.',
  level: 'The furthest episode the student has opened, and whether they solved it.',
};
