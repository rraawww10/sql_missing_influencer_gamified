// END-TO-END: game ⇄ database ⇄ dashboard, with the real analytics server and a real Chrome.
//   1. starts the analytics server on a throw-away database, builds the game pointed at it (VITE_ANALYTICS_URL)
//   2. device A: a student types name + NxtWave ID, sees their name in the story, solves episode 1, sends the episode
//      feedback, plays into episode 2, answers the chapter check-in with a suggestion, leaves mid-episode
//   3. the DASHBOARD API (admin login) must show that student by NxtWave ID with name, email, progress, time per beat and
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
import { playBeats, signUp, logIn, stepOf } from './smoke-lib.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANALYTICS = path.join(APP, '..', 'analytics');
const CONTENT = path.join(APP, 'public/content');
const pack = (n) => JSON.parse(fs.readFileSync(path.join(CONTENT, `sessions/s${String(n).padStart(2, '0')}.json`), 'utf8'));
const solutions = (n) => JSON.parse(fs.readFileSync(path.join(CONTENT, `solutions/s${String(n).padStart(2, '0')}.json`), 'utf8'));

const API_PORT = 8799, WEB_PORT = 4181;
const API = `http://localhost:${API_PORT}`, BASE = `http://localhost:${WEB_PORT}`;
const STUDENT = { id: 'ASHA.VERMA@EXAMPLE.COM', name: 'Asha Verma', email: 'asha.verma@example.com' };   // sign up is name + email; the ID is made from the email
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
    (o) => o.includes(`:${API_PORT}`));
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
  pa.__noSkipIntro = true;                                                // this test plays the intro instead of skipping it
  await signUp(pa, STUDENT);                                              // a new student signs up once: name + email
  // first visit: the "How to play" intro opens by itself; play it, see the scenes and captions move on, then close it
  await pa.getByRole('button', { name: 'Play the intro' }).click();
  await pa.locator('.iv-caption').getByText(/I'm your assistant on this case/).waitFor();
  if (process.env.E2E_SHOTS) { await pa.waitForTimeout(1500); await pa.locator('.iv-frame').screenshot({ path: `${process.env.E2E_SHOTS}/intro-1.png` }); }
  await pa.getByRole('button', { name: 'Next scene' }).click();
  await pa.getByRole('button', { name: 'Next scene' }).click();
  await pa.locator('.iv-caption').getByText(/This is your case map/).waitFor();
  if (process.env.E2E_SHOTS) for (const [n, wait] of [[3, 4500], [5, 5000], [8, 3500]]) {
    if (n > 3) for (let k = 0; k < (n === 5 ? 2 : 3); k++) await pa.getByRole('button', { name: 'Next scene' }).click();
    await pa.waitForTimeout(wait); await pa.locator('.iv-frame').screenshot({ path: `${process.env.E2E_SHOTS}/intro-${n}.png` });
  }
  await pa.getByRole('button', { name: 'Close the intro' }).click();
  await pa.locator('.iv').waitFor({ state: 'detached' });
  ok(true, 'first visit: the "How to play" intro opens by itself, plays its scenes with captions, and closes');
  await pa.locator('.who-chip b').getByText(STUDENT.name, { exact: true }).first().waitFor();
  ok(await pa.evaluate(() => JSON.parse(localStorage.getItem('tmi.identity.v1')).id) === STUDENT.id, 'start screen: name + email stored (the ID is the upper-cased email)');

  await pa.goto(`${BASE}/#/s/1`);
  await pa.getByRole('button', { name: /Start the episode/ }).click();
  let named = false;
  await playBeats(pa, pack(1), solutions(1), { afterBeat: async (b) => {
    if (b.id === 'S1.2') { await pa.getByText(/Welcome to the City Police Data Cell, Asha\./).first().waitFor(); named = true; }
  } });
  ok(named, 'the story addresses the student by name (no "intern")');
  await pa.getByText(`Solved: ${pack(1).title}`, { exact: true }).waitFor();
  // the episode score out of 100 % and its badge; pinning puts it on the case map's badge wall
  const scoreCard = pa.locator('.score-card');
  await scoreCard.waitFor();
  ok(/\d+%/.test(await scoreCard.locator('.score-pct').innerText()) && /First Night/.test(await scoreCard.innerText()), 'solved screen: episode score in % and the "First Night" badge');
  await pa.waitForTimeout(1300);
  if (process.env.E2E_SHOTS) await scoreCard.screenshot({ path: `${process.env.E2E_SHOTS}/score-card.png` });
  await scoreCard.getByRole('button', { name: /Pin to my badge wall/ }).click();
  await scoreCard.getByRole('button', { name: /Pinned to your badge wall/ }).waitFor();
  await pa.getByRole('radio', { name: /^7 of 11/ }).click();
  await pa.getByRole('button', { name: /Fun/ }).click();
  await pa.getByRole('button', { name: /Just right/ }).click();
  await pa.locator('.feedback-card textarea').fill('Loved the story - more puzzles please');
  await pa.getByRole('button', { name: /Send feedback/ }).click();
  await pa.getByText(/Noted, Asha\. Thank you!/).waitFor();
  ok(true, 'episode 1 solved, end-of-episode feedback sent');
  await pa.goto(`${BASE}/#/`);
  await pa.locator('.badge-wall').getByText('1 pinned').waitFor();
  ok(await pa.locator('.iv').count() === 0, 'the intro does not open again once seen');
  await pa.getByRole('button', { name: /How to play/ }).first().click();
  await pa.getByRole('button', { name: 'Play the intro' }).waitFor();
  await pa.keyboard.press('Escape');
  await pa.locator('.iv').waitFor({ state: 'detached' });
  ok(true, 'the "How to play" button opens the intro again; Esc closes it');
  ok(true, 'case map: the pinned badge is on the badge wall');
  if (process.env.E2E_SHOTS) { await pa.locator('.badge-wall').scrollIntoViewIfNeeded(); await pa.waitForTimeout(500); await pa.locator('.badge-wall').screenshot({ path: `${process.env.E2E_SHOTS}/badge-wall.png` }); }

  // locks: Episode 3 waits for Episode 2; a typed link to it goes back to the case map, which says how to open it
  await pa.goto(`${BASE}/#/s/3`);
  await pa.waitForURL(/#\/$/);
  await pa.getByRole('button', { name: /^Episode 3:.*locked/ }).click();
  await pa.getByText(/Solve Episode 2 with at least 50% to open this one/).waitFor();
  ok(true, 'locks: Episode 3 stays locked until Episode 2 is passed; a typed link goes back to the case map');
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
  ok(row && row.name === STUDENT.name && !row.is_guest, 'student listed (ID made from the email) with the typed name');
  ok(row.email === STUDENT.email, 'the personal email from sign-up is stored (lower-cased)');
  ok(row.episodes_done === 1 && row.level === 2 && row.beats_done > pack(1).beats.length, `progress: ${row.episodes_done} episode solved, ${row.beats_done} steps done, now on episode ${row.level}`);
  ok(row.seconds > 0, `active time recorded: ${row.seconds} s`);
  ok(row.scores[0] && row.scores[0].pct > 0 && row.scores[0].max === 21 && row.score_pct > 0, `dashboard: episode 1 score ${row.scores[0]?.pct}% (${row.scores[0]?.tier} badge), game score ${row.score_pct}%`);
  const d = await admin(`/api/admin/students/${STUDENT.id}`);
  ok(d.episodes[0].status === 'completed' && d.episodes[1].status === 'in progress', 'student page: episode 1 solved, episode 2 in progress');
  const e2 = d.episodes[1];
  ok(e2.seconds > 0 && d.episodes.slice(0, 2).every((e) => e.chapters.length > 0 && e.beats.length > 0)
     && e2.chapters.reduce((a, c) => a + c.seconds, 0) === e2.seconds && e2.beats.reduce((a, x) => a + x.seconds, 0) === e2.seconds,
    `student page: time per beat and per chapter add up (episode 2: ${e2.seconds} s over ${e2.chapters.length} chapters)`);
  ok(d.feedback.length === 1 && d.feedback[0].rating === 7 && d.feedback[0].scale === 11 && d.feedback[0].comment.includes('more puzzles'), 'student page: episode feedback stored');
  ok(d.checkpoints.length === 1 && d.checkpoints[0].rating === 3 && d.checkpoints[0].comment === 'Chapter 1 was clear', 'student page: chapter check-in + suggestion stored');
  ok(d.logins === 1 && d.registered_at, 'registration recorded');
  const fb = await admin('/api/admin/feedback');
  ok(fb.responses.some((r) => r.student_id === STUDENT.id) && fb.checkpoints.list.some((r) => r.student_id === STUDENT.id), 'Feedback tab: both kinds of feedback listed');
  ok(fb.ladder.responses === 1 && fb.ladder.levels[6].n === 1 && fb.ladder.episodes[0].ratings[0] === 7, 'Feedback tab: the 7 of 11 is on the 11-star ladder (episode 1)');
  const kinds = new Set(d.timeline.items.map((i) => i.kind));
  ok(['login', 'start', 'step', 'feedback', 'checkin', 'finish'].every((k) => kinds.has(k)) && !kinds.has('heartbeat'),
    `student page: every interaction in one timeline (${[...kinds].join(', ')})`);
  const sqlRun = d.timeline.items.find((i) => i.kind === 'sql');
  ok(!sqlRun || (typeof sqlRun.sql === 'string' && sqlRun.sql.length > 0), 'student page: SQL runs carry the query the student typed');

  // ------------------------------------------------------------ device B
  console.log('▶ device B: same student, nothing stored on this computer');
  const b = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pb = await b.newPage();
  pb.on('pageerror', (e) => errors.push(e.message));
  await pb.goto(`${BASE}/`);
  // an unknown email is sent to Sign up (nothing stored), and the server refuses her history without a login
  await logIn(pb, STUDENT, 'nobody.99@example.com');
  await pb.getByText(/We don't know nobody.99@example.com yet/).waitFor();
  ok(await pb.evaluate(() => localStorage.getItem('tmi.identity.v1')) === null, 'an unknown email goes to Sign up; nothing is stored');
  const peek = await fetch(`${API}/api/history`, { method: 'POST', body: JSON.stringify({ student_id: STUDENT.id }) });
  ok(peek.status === 401, 'her progress cannot be read from the server without logging in');
  await pb.getByRole('tab', { name: 'Log in' }).click();
  await logIn(pb, STUDENT, 'Asha.Verma@Example.com');                    // the real student: just her email, any case, no OTP
  await pb.getByText(/Welcome back, Asha! Your case file is restored\./).waitFor();
  ok(true, 'returning student logs in with her personal email ("welcome back")');
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
