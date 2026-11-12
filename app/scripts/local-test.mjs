// ONE COMMAND to test everything on this computer: game + database + dashboard, connected, with sample data.
//   cd app && npm run local-test            (fresh test database every time)
//   cd app && npm run local-test -- --keep  (keep what you recorded in the last run)
//
// Starts:
//   1. the analytics server (database + dashboard) on http://localhost:8787   password: test   database: analytics/data/test.sqlite
//      filled with 60 random students + the six test students NWTEST01-06 (docs/TESTING_GUIDE.md)
//   2. the game, case-map version (all 13 episodes on one page)  http://localhost:5180
//   3. the game exactly as uploaded to S3 (briefing + one site per episode) http://localhost:5181/intro/index.html
// Both game builds send everything to the local server. Ctrl+C stops all of it.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(APP, '..');
const ANALYTICS = path.join(ROOT, 'analytics');
const DB = path.join(ANALYTICS, 'data', 'test.sqlite');
const UPLOAD = path.join(ROOT, 'test-upload');
const API_PORT = 8787, MAP_PORT = 5180, SHIP_PORT = 5181;
const API = `http://localhost:${API_PORT}`;
const keep = process.argv.includes('--keep');
const node = process.execPath;
const env = { ...process.env, VITE_ANALYTICS_URL: API };
const step = (m) => console.log(`\n▶ ${m}`);

if (!keep || !fs.existsSync(DB)) {
  step('test database: 60 random students + test students NWTEST01-06');
  if (!fs.existsSync(path.join(ANALYTICS, 'test-data', 'test-students.json')))
    execFileSync('npx', ['vitest', 'run', 'src/test/makeTestStudents.test.ts'], { cwd: APP, env: { ...process.env, MAKE_TEST_STUDENTS: '1' }, stdio: 'inherit' });
  execFileSync(node, ['--no-warnings', 'seed-demo.mjs', '60', '--out', DB], { cwd: ANALYTICS, stdio: 'inherit' });
} else step(`keeping the test database from last time (${DB})`);

step('building the game pointed at the local server (about 1 minute)');
execFileSync(node, ['scripts/sync-content.mjs'], { cwd: APP, stdio: 'ignore' });
execFileSync(node, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist-test', '--emptyOutDir'], { cwd: APP, env, stdio: 'ignore' });
execFileSync(node, ['scripts/build-s3.mjs', UPLOAD], { cwd: APP, env, stdio: 'ignore' });

const kids = [];
const run = (args, cwd, extra = {}) => { const c = spawn(node, args, { cwd, env: { ...process.env, ...extra }, stdio: 'ignore' }); kids.push(c); return c; };
run(['--no-warnings', 'server.mjs'], ANALYTICS, { PORT: String(API_PORT), DB_PATH: DB, ADMIN_PASSWORD: 'test', SESSION_SECRET: 'local-test-only' });
run(['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-test', '--port', String(MAP_PORT), '--strictPort'], APP);

// the S3 upload folder, served like S3 would (correct .wasm type)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.sqlite': 'application/octet-stream' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(UPLOAD, path.normalize(p));
  if (!f.startsWith(UPLOAD) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(SHIP_PORT);

const stop = () => { for (const k of kids) k.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

setTimeout(() => console.log(`
================================================================================
 READY - everything is connected to ONE local test database
================================================================================
 Dashboard (admin)     ${API}/            password: test
 Game - case map       http://localhost:${MAP_PORT}/
 Game - as on S3       http://localhost:${SHIP_PORT}/intro/index.html   (episodes: /s01/index.html … /s13/index.html)

 Test students (type the NxtWave ID + name on the game's start screen):
   NWTEST01  Riya Kapoor   registered, never played          → fresh start
   NWTEST02  Arjun Mehta   episode 1 stopped at step 7       → "Continue where I left off"
   NWTEST03  Sana Qureshi  episodes 1-3 solved, ep 4 step 15 → welcome back, 3 clues, ep 4 continues
   NWTEST04  Vikram Rao    struggling, inactive 11 days      → many hints/mistakes, low ratings
   NWTEST05  Meera Iyer    all 13 solved, rank Inspector     → full Evidence Board
   NWTEST06  Kabir Singh   reset episode 2 and replayed it
   Any new ID (e.g. NWNEW001) → a brand-new student

 Look inside the database:   cd analytics && node --no-warnings inspect.mjs [NWTEST03] --db data/test.sqlite
 Step-by-step checklist:     docs/TESTING_GUIDE.md
 Stop everything:            Ctrl+C
================================================================================`), 2500);
