// End-to-end smoke test of the TEAM build (case map, npm run dev / build): plays Sessions 1–3 in order in Chrome,
// with extra checks — course note, a reported query, table tabs, leaving and resuming, one trap, Evidence Board.
// Usage: npm run build && node scripts/smoke.mjs        (or SMOKE_URL=http://localhost:5173 for a dev server)
//        SHOTS=/some/dir … also saves screenshots for design review
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { playBeats, runSql } from './smoke-lib.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(APP, 'public/content');
const pack = (n) => JSON.parse(fs.readFileSync(path.join(CONTENT, `sessions/s${String(n).padStart(2, '0')}.json`), 'utf8'));
const solutions = (n) => JSON.parse(fs.readFileSync(path.join(CONTENT, `solutions/s${String(n).padStart(2, '0')}.json`), 'utf8'));

const PORT = 4179;
const BASE = process.env.SMOKE_URL ?? `http://localhost:${PORT}`;
const server = process.env.SMOKE_URL ? null
  : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { cwd: APP, stdio: 'pipe' });
const stopServer = () => new Promise((resolve) => {
  if (!server || server.exitCode !== null) return resolve();
  server.once('exit', resolve);
  server.kill('SIGTERM');
  setTimeout(() => server.kill('SIGKILL'), 2000).unref();
});
if (server) await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview did not start')), 20000);
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const SHOTS = process.env.SHOTS;
const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
const tabs = () => page.getByRole('group', { name: 'Tables' });

async function playSession(n, { trap, leaveAt } = {}) {
  const p = pack(n), sol = solutions(n);
  await page.getByRole('button', { name: /Start the episode|Continue where I left off/ }).click();
  await page.locator('.hud h1').getByText(p.title).waitFor();
  await playBeats(page, p, sol, {
    beforeBeat: async (b, i) => {
      if (b.id === 'S1.3') {
        await page.getByRole('button', { name: /Read the full course note/ }).click();
        await page.getByRole('dialog', { name: 'Course note' }).waitFor();
        await page.getByText('Any sort of information that is stored is called data.').waitFor();
        await page.keyboard.press('Escape');
        console.log('  📖 course note opens with the reading-material section');
      }
      if (b.id === leaveAt) {
        await page.goto(`${BASE}/`);                                         // leave the session…
        await page.getByRole('button', { name: 'Play' }).first().waitFor();
        await page.goto(`${BASE}/#/s/${n}`);                                 // …and come back later
        await page.getByRole('button', { name: '↺ Reset progress' }).waitFor();
        await page.getByRole('button', { name: /Continue where I left off/ }).click();
        await page.getByText(`Step ${i + 1}/${p.beats.length}`).waitFor();   // same step, no time limit
        console.log(`  ↻ left at ${b.id} and came back: resumed at the same step (reset offered)`);
      }
    },
    beforeTask: async (b) => {
      if (b.task_id === 'T2.1') {
        await runSql(page, 'CREATE table suspects (\n  name VARCHAR(200),\n  role VARCHAR(200),\n  phone VARCHAR(15),\n  age INT\n);');
        await page.getByText('✓ Correct.').waitFor({ timeout: 10000 });
        await tabs().getByRole('button', { name: 'suspects' }).waitFor();
        console.log('  ✓ reported T2.1 query (role VARCHAR(200)) passes; "suspects" tab appears');
      }
      if (b.task_id === 'T2.7') {
        await tabs().getByRole('button', { name: 'suspects' }).waitFor();
        console.log('  ✓ "suspects" tab shown at T2.7 (from the task setup)');
      }
      if (b.task_id === 'T3.1') {
        // the console header advertises Ctrl+Enter: it must run the query, not insert a blank line
        await page.locator('.cm-content').fill(sol[b.task_id].ref);
        await page.locator('.cm-content').press('Control+Enter');
        await page.getByText('✓ Correct.').waitFor({ timeout: 10000 });
        console.log('  ⌨ Ctrl+Enter runs the query');
        // and the editor autocompletes the case tables, not just SQL keywords
        await page.locator('.cm-content').fill('');
        await page.locator('.cm-content').pressSequentially('SELECT * FROM gat', { delay: 60 });
        await page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({ hasText: 'gate_log' }).first().waitFor({ timeout: 5000 });
        await page.keyboard.press('Escape');
        console.log('  ⌨ autocomplete offers the table "gate_log"');
      }
      if (trap?.task === b.task_id) {
        await runSql(page, sol[b.task_id].traps.find((t) => t.id === trap.id).sql);
        await page.locator('.verdict.trap').waitFor();
        await shot(`s${n}-trap`);
        console.log(`  ⚠ trap ${trap.id} on ${b.task_id}: story reply shown`);
      }
    },
  });
  await page.getByText(`Solved: ${p.title}`, { exact: true }).waitFor();
  await page.waitForTimeout(1200);   // the points count up for ~1 s
  await shot(`s${n}-done`);
  console.log(`  ✓ "${p.title}" solved — ${(await page.locator('.result-hero .stats').first().innerText()).replace(/\s+/g, ' ').trim()}`);
}

let failed = false;
try {
  await page.goto(`${BASE}/`);
  await page.getByText(pack(1).headline).waitFor();
  await page.getByRole('button', { name: 'Play' }).first().waitFor();   // progress loads from IndexedDB
  if (await page.getByRole('button', { name: 'Play' }).count() !== 1) throw new Error('a new guest should see exactly one playable episode');

  // the briefing (the page before the first episode) lists every episode by name and the cast
  await page.getByRole('button', { name: /Read the briefing/ }).click();
  await page.getByRole('heading', { name: 'SQL: The Missing Influencer' }).waitFor();
  for (const n of [1, 2, 3]) await page.locator('.ep-row').getByText(pack(n).title, { exact: true }).waitFor();
  await page.getByText('Ira Menon', { exact: true }).first().waitFor();
  await shot('briefing');
  await page.getByRole('button', { name: /Start the first episode/ }).click();
  await page.getByRole('button', { name: /Start the episode/ }).waitFor();
  console.log('  📋 briefing: episodes + cast shown, leads into the first episode');

  await playSession(1);
  await page.getByRole('button', { name: /Next episode/ }).click();
  await playSession(2, { leaveAt: 'S2.17' });
  await page.getByRole('button', { name: /Next episode/ }).click();
  await playSession(3, { trap: { task: 'T3.8', id: 'precedence' } });

  // reset episode 3 from its done screen → it is no longer solved, its clue leaves the board
  await page.getByRole('button', { name: '↺ Reset this episode and play again' }).click();
  await page.getByRole('button', { name: 'Yes, reset' }).click();
  await page.getByRole('button', { name: /Start the episode/ }).waitFor();
  await page.goto(`${BASE}/`);
  await page.getByText('2/13').waitFor();
  console.log(`  ↺ reset "${pack(3).title}": back to 2/13 solved`);
  await page.goto(`${BASE}/#/s/3`);
  await page.getByRole('button', { name: /Start the episode/ }).click();
  await playBeats(page, pack(3), solutions(3));
  await page.getByText(`Solved: ${pack(3).title}`).waitFor();
  console.log(`  ✓ "${pack(3).title}" replayed after reset`);
  await page.getByRole('button', { name: 'Back to the case map' }).click();
  await page.getByText('3/13').waitFor();
  await page.getByRole('button', { name: /clues pinned/ }).click();
  await page.locator('.evidence article').first().waitFor();
  const cards = await page.locator('.evidence article').count();
  if (cards !== 3) throw new Error(`evidence board shows ${cards} clues, expected 3`);
  if (!(await page.locator('.evidence').innerText()).includes("vehicle_colour = 'Grey' AND (gate")) throw new Error('evidence card is missing the proving query');
  console.log('  📌 evidence board: 3 clues with proving queries');
  await shot('evidence');
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log('smoke: OK');
} catch (e) {
  failed = true;
  console.error('smoke: FAIL —', e.message.split('\n')[0]);
  await page.screenshot({ path: '/tmp/smoke-fail.png' }).catch(() => {});
  console.error('screenshot: /tmp/smoke-fail.png');
} finally {
  await browser.close();
  await stopServer();
}
process.exit(failed ? 1 : 0);
