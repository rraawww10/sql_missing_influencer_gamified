// END-TO-END: game ⇄ database ⇄ dashboard, with the real analytics server and a real Chrome.
//   1. starts the analytics server on a throw-away database, builds the game pointed at it (VITE_ANALYTICS_URL)
//   2. device A: a student types name + NxtWave ID, sees their name in the story, solves episode 1, sends the episode
//      feedback, plays into episode 2, answers the chapter check-in with a suggestion, leaves mid-episode
//   3. the DASHBOARD API (admin login) must show that student by NxtWave ID with name, progress, time per beat and
//      chapter, the feedback and the check-in - all read from the same database the game wrote to
//   4. device B (fresh browser, nothing stored): the same student types the same ID → "welcome back", episode 1 solved,
//      the clue on the board, no second feedback ask, and episode 2 continues at the exact step they left on device A
// Usage: node scripts/e2e-analytics.mjs          (needs Chrome + Node 22.5+; ~2 minutes)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { playBeats, signIn, stepOf } from './smoke-lib.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANALYTICS = path.join(APP, '..', 'analytics');
const CONTENT = path.join(APP, 'public/content');
const pack = (n) => JSON.parse(fs.readFileSync(path.join(CONTENT, `sessions/s${String(n).padStart(2, '0')}.json`), 'utf8'));
const solutions = (n) => JSON.parse(fs.readFileSync(path.join(CONTENT, `solutions/s${String(n).padStart(2, '0')}.json`), 'utf8'));

const API_PORT = 8799, WEB_PORT = 4181;
const API = `http://localhost:${API_PORT}`, BASE = `http://localhost:${WEB_PORT}`;
const STUDENT = { id: 'NW-E2E-1', name: 'Asha Verma' };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmi-e2e-'));
const children = [];
const start = (cmd, args, opts, ready) => new Promise((resolve, reject) => {
  const c = spawn(cmd, args, { ...opts, stdio: 'pipe' });
  children.push(c);
  let out = '';
  const on = (d) => { out += d; if (ready(out)) resolve(c); };
  c.stdout.on('data', on); c.stderr.on('data', on);
  c.on('exit', (code) => reject(new Error(`${args.join(' ')} exited ${code}\n${out}`)));
  setTimeout(() => reject(new Error(`${args.join(' ')} did not start\n${out}`)), 30000);
});
const ok = (cond, msg) => { if (!cond) throw new Error(msg); console.log(`  ✓ ${msg}`); };

let failed = false;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  console.log('▶ analytics server + game build pointed at it');
  await start(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: ANALYTICS, env: { ...process.env, PORT: String(API_PORT), DB_PATH: path.join(tmp, 'e2e.sqlite'), ADMIN_PASSWORD: 'e2e' } },
    (o) => o.includes(`localhost:${API_PORT}`));
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist-e2e', '--emptyOutDir'],
    { cwd: APP, env: { ...process.env, VITE_ANALYTICS_URL: API }, stdio: 'pipe' });
  await start(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-e2e', '--port', String(WEB_PORT), '--strictPort'], { cwd: APP },
    (o) => o.includes(String(WEB_PORT)));

  // ------------------------------------------------------------ device A
  console.log('▶ device A: new student');
  const a = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pa = await a.newPage();
  const errors = [];
  pa.on('pageerror', (e) => errors.push(e.message));
  await pa.goto(`${BASE}/`);
  await signIn(pa, STUDENT);
  await pa.locator('.who-chip b').getByText('Asha', { exact: true }).first().waitFor();
  ok(await pa.evaluate(() => JSON.parse(localStorage.getItem('tmi.identity.v1')).id) === STUDENT.id, 'start screen: name + NxtWave ID stored (ID upper-cased)');

  await pa.goto(`${BASE}/#/s/1`);
  await pa.getByRole('button', { name: /Start the episode/ }).click();
  let named = false;
  await playBeats(pa, pack(1), solutions(1), { afterBeat: async (b) => {
    if (b.id === 'S1.2') { await pa.getByText(/Welcome to the City Police Data Cell, Asha\./).first().waitFor(); named = true; }
  } });
  ok(named, 'the story addresses the student by name (no "intern")');
  await pa.getByText(`Solved: ${pack(1).title}`, { exact: true }).waitFor();
  await pa.getByRole('radio', { name: '4 stars' }).click();
  await pa.getByRole('button', { name: /Fun/ }).click();
  await pa.getByRole('button', { name: /Just right/ }).click();
  await pa.locator('.feedback-card textarea').fill('Loved the story - more puzzles please');
  await pa.getByRole('button', { name: 'Send feedback' }).click();
  await pa.getByText(/Noted, Asha\. Thank you!/).waitFor();
  ok(true, 'episode 1 solved, end-of-episode feedback sent');

  const p2 = pack(2);
  const clueAt = p2.beats.findIndex((b) => b.type === 'clue');
  const STOP = new Error('stop');
  await pa.goto(`${BASE}/#/s/2`);
  await pa.getByRole('button', { name: /Start the episode/ }).click();
  let leftAt = -1;
  try {
    await playBeats(pa, p2, solutions(2), { beforeBeat: async (_b, i) => {
      if (i === clueAt + 1) {
        await pa.getByRole('group', { name: /How was chapter 1/ }).waitFor();
        await pa.getByRole('button', { name: /Good/ }).click();
        await pa.getByLabel('Your suggestion (optional)').fill('Chapter 1 was clear');
        await pa.getByRole('button', { name: 'Send', exact: true }).click();
        await pa.getByText(/Thanks, Asha! Noted for the team\./).waitFor();
      }
      if (i === clueAt + 3) { leftAt = i; throw STOP; }
    } });
  } catch (e) { if (e !== STOP) throw e; }
  ok(leftAt > 0, `chapter check-in answered; left episode 2 at step ${leftAt + 1}`);
  await pa.waitForTimeout(4500);                 // the sitting copy is sent ~3 s after the last change
  await pa.goto('about:blank');                  // pagehide → last heartbeat + queued posts
  await pa.waitForTimeout(2500);
  ok(!errors.length, `no page errors on device A${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await a.close();

  // ------------------------------------------------------------ dashboard (same database)
  console.log('▶ dashboard API reads what the game wrote');
  const login = await fetch(`${API}/api/login`, { method: 'POST', body: JSON.stringify({ password: 'e2e' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const admin = async (p) => (await fetch(`${API}${p}`, { headers: { cookie } })).json();
  const list = await admin('/api/admin/students?fresh=1');
  const row = list.students.find((s) => s.student_id === STUDENT.id);
  ok(row && row.name === STUDENT.name && !row.is_guest, 'student listed by NxtWave ID with the typed name');
  ok(row.episodes_done === 1 && row.level === 2 && row.beats_done > pack(1).beats.length, `progress: ${row.episodes_done} episode solved, ${row.beats_done} steps done, now on episode ${row.level}`);
  ok(row.seconds > 0, `active time recorded: ${row.seconds} s`);
  const d = await admin(`/api/admin/students/${STUDENT.id}`);
  ok(d.episodes[0].status === 'completed' && d.episodes[1].status === 'in progress', 'student page: episode 1 solved, episode 2 in progress');
  const e2 = d.episodes[1];
  ok(e2.seconds > 0 && d.episodes.slice(0, 2).every((e) => e.chapters.length > 0 && e.beats.length > 0)
     && e2.chapters.reduce((a, c) => a + c.seconds, 0) === e2.seconds && e2.beats.reduce((a, x) => a + x.seconds, 0) === e2.seconds,
    `student page: time per beat and per chapter add up (episode 2: ${e2.seconds} s over ${e2.chapters.length} chapters)`);
  ok(d.feedback.length === 1 && d.feedback[0].rating === 4 && d.feedback[0].comment.includes('more puzzles'), 'student page: episode feedback stored');
  ok(d.checkpoints.length === 1 && d.checkpoints[0].rating === 3 && d.checkpoints[0].comment === 'Chapter 1 was clear', 'student page: chapter check-in + suggestion stored');
  ok(d.logins === 1 && d.registered_at, 'registration recorded');
  const fb = await admin('/api/admin/feedback');
  ok(fb.responses.some((r) => r.student_id === STUDENT.id) && fb.checkpoints.list.some((r) => r.student_id === STUDENT.id), 'Feedback tab: both kinds of feedback listed');

  // ------------------------------------------------------------ device B
  console.log('▶ device B: same student, nothing stored on this computer');
  const b = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pb = await b.newPage();
  pb.on('pageerror', (e) => errors.push(e.message));
  await pb.goto(`${BASE}/`);
  await signIn(pb, { id: STUDENT.id.toLowerCase(), name: STUDENT.name });
  await pb.getByText(/Welcome back, Asha! Your case file is restored\./).waitFor();
  ok(true, 'returning student recognised by NxtWave ID ("welcome back")');
  await pb.getByText('1/13').first().waitFor();
  ok(true, 'episode 1 shows as solved on the new device');
  await pb.goto(`${BASE}/#/done/1`);
  await pb.getByText(`Solved: ${pack(1).title}`, { exact: true }).waitFor();
  await pb.waitForTimeout(800);
  ok(await pb.getByText('How was this episode?').count() === 0, 'episode 1 feedback is not asked again');
  await pb.goto(`${BASE}/#/s/2`);
  await pb.getByRole('button', { name: /Continue where I left off/ }).click();
  await pb.locator('.hud h1').getByText(p2.title).waitFor();
  const at = (await stepOf(pb)) - 1;
  ok(at === leftAt, `episode 2 continues at step ${at + 1} (left at ${leftAt + 1} on device A)`);
  await pb.getByRole('button', { name: /Evidence: \d+ clue/ }).waitFor();
  ok(!errors.length, 'no page errors on device B');
  await b.close();
  const again = (await admin(`/api/admin/students/${STUDENT.id}`));
  ok(again.logins === 2, 'second sign-in counted on the dashboard');
  console.log('\ne2e-analytics: OK - game, database and dashboard are connected end to end');
} catch (e) {
  failed = true;
  console.error(`\ne2e-analytics: FAIL - ${e.message}`);
} finally {
  await browser.close();
  for (const c of children) c.kill('SIGTERM');
  fs.rmSync(path.join(APP, 'dist-e2e'), { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
}
