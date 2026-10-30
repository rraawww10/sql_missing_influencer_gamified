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
    CREATE TABLE IF NOT EXISTS students (
      student_id TEXT PRIMARY KEY,
      name       TEXT,
      batch      TEXT
    );
  `);
  return db;
}

// ---------------------------------------------------------------- the beat catalogue (from the generated session packs)
const clean = (s) => String(s ?? '').replace(/\{\{[^}]*\}\}/g, '…').replace(/[*`#>|]/g, '').replace(/\s+/g, ' ').trim();
function beatLabel(b) {
  if (b.type === 'note' && b.rm_ref?.heading) return `Case Note: ${clean(b.rm_ref.heading)}`;
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
    sessions.push({
      n, title: pack.title, minutes: pack.est_minutes ?? pack.minutes_estimate ?? null,
      beats: pack.beats.map((b, i) => ({ id: b.id, index: i, type: b.type, task_id: b.task_id ?? null, label: beatLabel(b) })),
    });
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
    (event_id, student_id, is_guest, sitting_id, verb, session, beat, object_type, object_id, seconds, result, client_ts, received_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
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
      const beat = typeof o.beat === 'string' ? o.beat.slice(0, 40) : e.verb === 'beat_viewed' && typeof o.id === 'string' ? o.id.slice(0, 40) : null;
      const seconds = e.verb === 'heartbeat' ? Math.max(0, Math.min(MAX_HEARTBEAT_SECONDS, Math.round(Number(e.result?.seconds) || 0))) : null;
      const result = e.result && typeof e.result === 'object' ? JSON.stringify(e.result).slice(0, 8000) : null;
      // a client clock far in the future would break "last seen": cap it at the receive time
      const ts = new Date(Math.min(Date.parse(e.client_ts), Date.now() + 5 * 60_000)).toISOString();
      const r = ins.run(e.event_id, lms ? e.user_id.slice(4) : e.user_id, lms ? 0 : 1, typeof e.sitting_id === 'string' ? e.sitting_id.slice(0, 100) : null,
        e.verb, session, beat, String(o.type ?? '').slice(0, 20), String(o.id ?? '').slice(0, 60), seconds, result, ts, now);
      added += Number(r.changes);
    }
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return { added, duplicates: events.length - added - rejected, rejected };
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
    const names = new Map(this.all('SELECT student_id, name, batch FROM students').map((r) => [r.student_id, r]));
    const completed = this.completedBySession(f);
    const total = this.cat.totalBeats;
    return rows.map((r) => {
      const n = names.get(r.student_id);
      const level = r.level ?? 0;
      const done = completed.get(r.student_id) ?? new Set();
      return {
        student_id: r.student_id, name: n?.name ?? null, batch: n?.batch ?? null, is_guest: !!r.is_guest,
        level, level_title: this.cat.get(level)?.title ?? (r.saw_briefing ? 'Briefing' : '—'),
        level_status: !level ? 'briefing' : done.has(level) ? 'completed' : 'in progress',
        episodes_done: r.episodes_done, beats_done: r.beats_done, progress_pct: pct(r.beats_done, total),
        seconds: r.seconds, active_days: r.active_days,
        attempts: r.attempts, tasks_passed: r.tasks_passed, hints: r.hints, traps: r.traps, clues: r.clues,
        accuracy_pct: pct(r.tasks_passed, r.attempts),
        first_seen: r.first_seen, last_seen: r.last_seen,
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
    for (const r of this.all(`
      SELECT e.session, e.student_id, SUM(e.seconds) AS seconds FROM events e
      WHERE e.verb = 'heartbeat' AND e.session > 0 ${s.sql}
        AND EXISTS (SELECT 1 FROM events c WHERE c.student_id = e.student_id AND c.session = e.session AND c.verb = 'session_completed')
      GROUP BY e.session, e.student_id`, s.params)) {
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
        beats: mine.length ? ep.beats.map((b) => ({ id: b.id, type: b.type, label: b.label, done: done.has(b.id), seconds: time.get(b.id) ?? 0,
          attempts: per('task_attempted', b), hints: per('hint_used', b), traps: per('trap_hit', b) })) : [],
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
    return { ...base, episodes, daily: [...days].map(([date, seconds]) => ({ date, minutes: Math.round(seconds / 60) })), recent };
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
    return this.all(`SELECT student_id, name, batch FROM students s
      WHERE ${f.batch ? 'batch = ? AND' : ''} NOT EXISTS (SELECT 1 FROM events e WHERE e.student_id = s.student_id) ORDER BY name`, params);
  }

  exportCsv(f = {}) {
    const cols = ['student_id', 'name', 'batch', 'level', 'level_title', 'level_status', 'episodes_done', 'progress_pct', 'minutes', 'active_days',
      'attempts', 'tasks_passed', 'accuracy_pct', 'hints', 'traps', 'clues', 'first_seen', 'last_seen'];
    const q = (v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) || /^[=+\-@]/.test(t) ? `"${t.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : t; };
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
