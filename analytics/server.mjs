// Analytics server for SQL: The Missing Influencer — collects the game's progress events and serves the admin dashboard.
// Zero dependencies: Node 22+ (node:http + the built-in node:sqlite). One SQLite file holds everything.
//
//   STUDENT LOG-IN (auth.mjs, no password) - an ID with an account is read or written only with a token of that ID:
//   POST /api/account/signup         { student_id, name, email } → { token, … }   (an ID that has an account is just logged in)
//   POST /api/account/login          { who } = NxtWave ID or sign-up email → { token, student_id, name, email }   (404 = sign up first)
//   POST /api/account/logout         { token }
//
//   POST /api/events                 the game sends batches of events here ({ events, token }; idempotent by event_id)
//   POST /api/identify               builds without accounts: { student_id, name, email } → registers / welcomes back
//   POST /api/recover                "Forgot your NxtWave ID?": { email } → { found, student_id, name } (30 lookups per IP per 15 minutes)
//   POST /api/history                { student_id, token } → a returning student's saved progress (events, feedback given, unfinished sittings)
//   GET  /api/history/:id            the same, for an ID that has no account yet (or with Authorization: Bearer <token>)
//   POST /api/sitting                the unfinished attempt at an episode, mirrored so it continues on another device
//   POST /api/feedback               end-of-episode feedback card (public, one row per student per episode)
//   POST /api/checkpoint             quick check-in after each chapter (public, one row per student per chapter)
//   GET  /api/admin/feedback(.csv)   feedback dashboard / export
//   GET  /api/admin/live             students active in the last 5 minutes
//   POST /api/login | /api/logout    admin session cookie (password = ADMIN_PASSWORD)
//   GET  /api/admin/overview         headline numbers, daily activity, episode funnel
//   GET  /api/admin/students         one row per student: level, progress %, active time, last seen
//   GET  /api/admin/students/:id     one student: episode by episode, beat by beat, every interaction (timeline), why they need attention
//   GET  /api/admin/students/:id/timeline?before=<iso>   older interactions of one student (paging)
//   GET  /api/admin/episodes/:n      one episode: every beat with reach, time, attempts, hints, traps (where students get stuck)
//   POST /api/admin/roster           CSV student_id,name,batch → names and batches on the dashboard
//   GET  /api/admin/export.csv       the students table as CSV
//   GET  /                           the dashboard (public/index.html)
//
// Config (env): ADMIN_PASSWORD (required), PORT=8787, HOST=0.0.0.0 (set 127.0.0.1 when a reverse proxy fronts it),
// DB_PATH=./data/analytics.sqlite, SESSION_SECRET (random per boot if unset),
// TZ_OFFSET=+05:30 (what "today" means on the dashboard), CONTENT_DIR=../content/sessions.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, loadCatalogue, Analytics, ingest, ingestFeedback, ingestCheckpoint, identify, recover, history, saveSitting, parseRoster, normalizeId } from './lib.mjs';
import { signup, login, logout, authorize, hasAccount, studentOf } from './auth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
// In production a reverse proxy (Caddy) holds the certificate and forwards to this port on loopback only.
const HOST = process.env.HOST ?? '0.0.0.0';
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
// Who is really calling. Behind a reverse proxy on the same host every request arrives from 127.0.0.1, so a
// per-IP limit would count all admins as one and lock everybody out after 10 typos. X-Forwarded-For is trusted
// ONLY for loopback connections (in production HOST=127.0.0.1, so nothing but the proxy can reach us), and the
// LAST entry is used: a client can forge earlier entries, but the proxy appends the address it actually saw.
function clientIp(req) {
  const peer = req.socket.remoteAddress ?? '?';
  if (peer !== '127.0.0.1' && peer !== '::1' && peer !== '::ffff:127.0.0.1') return peer;
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return fwd.at(-1) ?? peer;
}

// Slow down guessing, per IP per 15 minutes: 10 wrong admin passwords (`tries`), 30 "forgot my ID" email lookups (`lookups`).
// The lookup limit is roomier because a whole classroom can sit behind one address.
const tries = new Map(), lookups = new Map();
// Student accounts, per 15 minutes: 8 wrong passwords per ID (so nobody can guess their way into a classmate's account),
// 3 "forgot password" emails per ID, and roomy per-address limits because a whole classroom shares one address.
const accountCalls = new Map();
const note = (log, key) => log.get(key).push(Date.now());
const LOGIN_REQUIRED = { error: 'login required' };
function tooManyTries(ip, log = tries, max = 10) {
  const now = Date.now(), t = (log.get(ip) ?? []).filter((x) => now - x < 15 * 60_000);
  if (log.size > 5000) for (const [k, v] of log) if (!v.some((x) => now - x < 15 * 60_000)) log.delete(k);   // forget addresses that went quiet
  log.set(ip, t);
  return t.length >= max;
}

// Heavy dashboard reads are cached for 20 s: with ~500 students and several admins refreshing, the numbers are computed once
const CACHE_MS = 20_000; const cache = new Map();
function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;
  const v = fn(); cache.set(key, { at: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}

// ---------------------------------------------------------------- http helpers
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' };
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
      // a student with an account: only their own logged-in game may add to their record
      const owners = new Set((Array.isArray(body?.events) ? body.events : []).map((e) => studentOf(e?.user_id)).filter(Boolean));
      for (const id of owners) if (!authorize(db, id, body.token)) return send(res, 401, LOGIN_REQUIRED, CORS);
      const r = ingest(db, body?.events);
      return send(res, r.error ? 400 : 200, r, CORS);
    }

    if (p === '/api/feedback') {
      if (req.method === 'OPTIONS') return send(res, 204, '', CORS);
      if (req.method !== 'POST') return send(res, 405, 'POST only', CORS);
      let body;
      try { body = JSON.parse(await readBody(req, 20_000)); } catch { return send(res, 400, 'bad body', CORS); }
      if (!authorize(db, studentOf(body?.user_id), body?.token)) return send(res, 401, LOGIN_REQUIRED, CORS);
      const r = ingestFeedback(db, body);
      return send(res, r.error ? 400 : 200, r, CORS);
    }

    // small public JSON posts from the game: same shape for each (body ≤ limit, CORS open)
    const PUBLIC_POSTS = { '/api/identify': [identify, 10_000], '/api/recover': [recover, 10_000], '/api/checkpoint': [ingestCheckpoint, 20_000], '/api/sitting': [saveSitting, 450_000] };
    if (PUBLIC_POSTS[p]) {
      if (req.method === 'OPTIONS') return send(res, 204, '', CORS);
      if (req.method !== 'POST') return send(res, 405, 'POST only', CORS);
      if (p === '/api/recover') {   // answers "is this email a student, and who": not something to ask thousands of times
        const ip = clientIp(req);
        if (tooManyTries(ip, lookups, 30)) return send(res, 429, { error: 'Too many tries. Try again in 15 minutes.' }, CORS);
        lookups.get(ip).push(Date.now());
      }
      const [fn, limit] = PUBLIC_POSTS[p];
      let body;
      try { body = JSON.parse(await readBody(req, limit)); } catch { return send(res, 400, 'bad body', CORS); }
      // identify could change the email "forgot password" codes go to, a sitting is the student's saved place: both are theirs alone
      const owner = p === '/api/identify' ? normalizeId(body?.student_id) : p === '/api/recover' ? null : studentOf(body?.user_id);
      if (owner && !authorize(db, owner, body?.token)) return send(res, 401, LOGIN_REQUIRED, CORS);
      const r = fn(db, body);
      return send(res, r.error ? 400 : 200, r, CORS);
    }

    // ---- student accounts
    if (p.startsWith('/api/account/')) {
      if (req.method === 'OPTIONS') return send(res, 204, '', CORS);
      if (req.method !== 'POST') return send(res, 405, 'POST only', CORS);
      const ip = clientIp(req);
      if (tooManyTries(ip, accountCalls, 300)) return send(res, 429, { error: 'too many' }, CORS);
      note(accountCalls, ip);
      let body;
      try { body = JSON.parse(await readBody(req, 10_000)); } catch { return send(res, 400, 'bad body', CORS); }
      const reply = (r) => send(res, r.error ? (r.error === 'no account' ? 404 : 400) : 200, r, CORS);
      if (p === '/api/account/signup') return reply(signup(db, body));
      if (p === '/api/account/login') return reply(login(db, body));
      if (p === '/api/account/logout') return reply(logout(db, body));
      return send(res, 404, { error: 'not found' }, CORS);
    }

    if (p === '/api/history') {
      if (req.method === 'OPTIONS') return send(res, 204, '', CORS);
      if (req.method !== 'POST') return send(res, 405, 'POST only', CORS);
      let body;
      try { body = JSON.parse(await readBody(req, 10_000)); } catch { return send(res, 400, 'bad body', CORS); }
      if (!authorize(db, body?.student_id, body?.token)) return send(res, 401, LOGIN_REQUIRED, { ...CORS, 'cache-control': 'no-store' });
      const r = history(db, body?.student_id);
      return send(res, r.error ? 400 : 200, r, { ...CORS, 'cache-control': 'no-store' });
    }
    let hm;
    if ((hm = /^\/api\/history\/([^/]+)$/.exec(p))) {
      if (req.method === 'OPTIONS') return send(res, 204, '', CORS);
      if (req.method !== 'GET') return send(res, 405, 'GET only', CORS);
      const bearer = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''))?.[1];
      if (!authorize(db, decodeURIComponent(hm[1]), bearer)) return send(res, 401, LOGIN_REQUIRED, { ...CORS, 'cache-control': 'no-store' });
      const r = history(db, decodeURIComponent(hm[1]));
      return send(res, r.error ? 400 : 200, r, { ...CORS, 'cache-control': 'no-store' });
    }

    if (p === '/api/login' && req.method === 'POST') {
      const ip = clientIp(req);
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
      if (p === '/api/admin/overview') return send(res, 200, cached(`o${JSON.stringify(f)}${u.searchParams.get('fresh') ?? ''}`, () => analytics.overview(f)));
      if (p === '/api/admin/students') return send(res, 200, cached(`s${JSON.stringify(f)}${u.searchParams.get('fresh') ?? ''}`, () => ({ students: analytics.students(f), not_started: analytics.notStarted(f) })));
      if (p === '/api/admin/batches') return send(res, 200, analytics.batches());
      if (p === '/api/admin/live') return send(res, 200, analytics.live(f));
      if (p === '/api/admin/feedback') return send(res, 200, analytics.feedback({ ...f, session: u.searchParams.get('session') || null }));
      if (p === '/api/admin/feedback.csv')
        return send(res, 200, analytics.feedbackCsv(f), { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="feedback.csv"' });
      let m;
      if ((m = /^\/api\/admin\/students\/(.+)\/timeline$/.exec(p)))
        return send(res, 200, analytics.timeline(decodeURIComponent(m[1]), { limit: Math.min(1000, Number(u.searchParams.get('limit')) || 300), before: u.searchParams.get('before') }));
      if ((m = /^\/api\/admin\/students\/(.+)$/.exec(p))) {
        const s = analytics.student(decodeURIComponent(m[1]));
        return s ? send(res, 200, { ...s, has_account: hasAccount(db, s.student_id) }) : send(res, 404, { error: 'no such student' });
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

server.listen(PORT, HOST, () => console.log(`Analytics: http://${HOST}:${PORT}  (db ${DB_PATH}, ${catalogue.totalBeats} beats in ${catalogue.sessions.length} episodes)`));
