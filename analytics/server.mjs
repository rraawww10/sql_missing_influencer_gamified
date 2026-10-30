// Analytics server for SQL: The Missing Influencer — collects the game's progress events and serves the admin dashboard.
// Zero dependencies: Node 22+ (node:http + the built-in node:sqlite). One SQLite file holds everything.
//
//   POST /api/events                 the game sends batches of events here (public, CORS open, idempotent by event_id)
//   POST /api/login | /api/logout    admin session cookie (password = ADMIN_PASSWORD)
//   GET  /api/admin/overview         headline numbers, daily activity, episode funnel
//   GET  /api/admin/students         one row per student: level, progress %, active time, last seen
//   GET  /api/admin/students/:id     one student: episode by episode, beat by beat, recent activity
//   GET  /api/admin/episodes/:n      one episode: every beat with reach, time, attempts, hints, traps (where students get stuck)
//   POST /api/admin/roster           CSV student_id,name,batch → names and batches on the dashboard
//   GET  /api/admin/export.csv       the students table as CSV
//   GET  /                           the dashboard (public/index.html)
//
// Config (env): ADMIN_PASSWORD (required), PORT=8787, DB_PATH=./data/analytics.sqlite, SESSION_SECRET (random per boot if unset),
// TZ_OFFSET=+05:30 (what "today" means on the dashboard), CONTENT_DIR=../content/sessions.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, loadCatalogue, Analytics, ingest, parseRoster } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString('hex');
const DB_PATH = process.env.DB_PATH ?? path.join(HERE, 'data', 'analytics.sqlite');
const CONTENT_DIR = process.env.CONTENT_DIR ?? path.join(HERE, '..', 'content', 'sessions');
const TZ_OFFSET = process.env.TZ_OFFSET ?? '+05:30';
const SESSION_HOURS = 12;

if (!ADMIN_PASSWORD) { console.error('Set ADMIN_PASSWORD to start the analytics server.'); process.exit(1); }

const db = openDb(DB_PATH);
const catalogue = loadCatalogue(CONTENT_DIR);
const analytics = new Analytics(db, catalogue, TZ_OFFSET);
const dashboard = path.join(HERE, 'public', 'index.html');

// ---------------------------------------------------------------- admin session (signed cookie, no server state)
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const makeToken = () => { const exp = String(Date.now() + SESSION_HOURS * 3600_000); return `${exp}.${sign(exp)}`; };
function isAdmin(req) {
  const m = /(?:^|;\s*)tmi_admin=([^;]+)/.exec(req.headers.cookie ?? '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(exp)), got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
const passwordOk = (p) => {
  const a = crypto.createHash('sha256').update(String(p ?? '')).digest(), b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
};
// Slow down password guessing: 10 tries per IP per 15 minutes
const tries = new Map();
function tooManyTries(ip) {
  const now = Date.now(), t = (tries.get(ip) ?? []).filter((x) => now - x < 15 * 60_000);
  tries.set(ip, t);
  return t.length >= 10;
}

// ---------------------------------------------------------------- http helpers
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
function send(res, status, body, headers = {}) {
  const isStr = typeof body === 'string';
  res.writeHead(status, { 'content-type': isStr ? 'text/plain; charset=utf-8' : 'application/json', ...SECURITY, ...headers });
  res.end(isStr ? body : JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const filters = (u) => ({ batch: u.searchParams.get('batch') || null, guests: u.searchParams.get('guests') === '1' });

// ---------------------------------------------------------------- routes
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    if (p === '/api/events') {
      if (req.method === 'OPTIONS') return send(res, 204, '', CORS);
      if (req.method !== 'POST') return send(res, 405, 'POST only', CORS);
      let body;
      try { body = JSON.parse(await readBody(req, 2_000_000)); } catch { return send(res, 400, 'bad body', CORS); }
      const r = ingest(db, body?.events);
      return send(res, r.error ? 400 : 200, r, CORS);
    }

    if (p === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress ?? '?';
      if (tooManyTries(ip)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
      let body = {};
      try { body = JSON.parse(await readBody(req, 10_000)); } catch { /* empty */ }
      if (!passwordOk(body.password)) { tries.get(ip).push(Date.now()); return send(res, 401, { error: 'Wrong password' }); }
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return send(res, 200, { ok: true }, { 'set-cookie': `tmi_admin=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}` });
    }
    if (p === '/api/logout' && req.method === 'POST')
      return send(res, 200, { ok: true }, { 'set-cookie': 'tmi_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });

    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'login required' });
      const f = filters(u);
      if (p === '/api/admin/overview') return send(res, 200, analytics.overview(f));
      if (p === '/api/admin/students') return send(res, 200, { students: analytics.students(f), not_started: analytics.notStarted(f) });
      if (p === '/api/admin/batches') return send(res, 200, analytics.batches());
      let m;
      if ((m = /^\/api\/admin\/students\/(.+)$/.exec(p))) {
        const s = analytics.student(decodeURIComponent(m[1]));
        return s ? send(res, 200, s) : send(res, 404, { error: 'no such student' });
      }
      if ((m = /^\/api\/admin\/episodes\/(\d+)$/.exec(p))) {
        const e = analytics.episode(Number(m[1]), f);
        return e ? send(res, 200, e) : send(res, 404, { error: 'no such episode' });
      }
      if (p === '/api/admin/roster' && req.method === 'POST') {
        const r = parseRoster(await readBody(req, 5_000_000));
        if (r.error) return send(res, 400, r);
        return send(res, 200, analytics.saveRoster(r.rows, u.searchParams.get('replace') === '1'));
      }
      if (p === '/api/admin/export.csv')
        return send(res, 200, analytics.exportCsv(f), { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="students.csv"' });
      return send(res, 404, { error: 'not found' });
    }

    if (p === '/' || p === '/index.html') {
      return send(res, 200, fs.readFileSync(dashboard, 'utf8'), { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' });
    }
    if (p === '/health') return send(res, 200, { ok: true });
    return send(res, 404, 'not found');
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => console.log(`Analytics: http://localhost:${PORT}  (db ${DB_PATH}, ${catalogue.totalBeats} beats in ${catalogue.sessions.length} episodes)`));
