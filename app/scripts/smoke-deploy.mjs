// Smoke test for what we ship: every deploy/sNN session site and every deploy/uNN unit site, embedded in an
// iframe on a host page served from a sub-folder, played start to finish in real Chrome.
//   sessions: a FRESH profile per session (standalone play)
//   units:    ONE profile for all units, played in order — proves progress carries across units on a device
//             (same origin): "the case so far" turns from briefed into earned, and the session completes with
//             its last part. Also tries ?user_id and a 'restore' from the host page.
// Checks the parent page receives ready / progress / completed / resize messages.
// Usage: npm run build:deploy && node scripts/smoke-deploy.mjs [sessions|units|all] [--only 11 12]
//        DEPLOY_DIR=../missing-influencer-v2 node scripts/smoke-deploy.mjs …   (the compact S3 layout: shared assets + content)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { playBeats, runSql } from './smoke-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEPLOY = path.resolve(ROOT, process.env.DEPLOY_DIR ?? 'deploy');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.sqlite': 'application/octet-stream', '.sql': 'text/plain', '.woff2': 'font/woff2', '.woff': 'font/woff' };
// a site's content: next to its index.html (deploy/) or shared at the top (missing-influencer-v2/)
const contentFile = (id, rel) => [path.join(DEPLOY, id, 'content', rel), path.join(DEPLOY, 'content', rel)].find((f) => fs.existsSync(f));
const readJson = (id, rel) => JSON.parse(fs.readFileSync(contentFile(id, rel), 'utf8'));

// static server: deploy/ is mounted under /lms/games/ to prove relative paths work in any folder
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith('/lms/games/')) { res.writeHead(404); return res.end(); }
  const file = path.join(DEPLOY, url.slice('/lms/games/'.length));
  if (!file.startsWith(DEPLOY) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4190, r));

const args = process.argv.slice(2);
const mode = args[0] === 'sessions' ? 's' : args[0] === 'units' ? 'u' : 'all';
const only = args.includes('--only') ? args.slice(args.indexOf('--only') + 1).map(Number).filter(Boolean) : [];
const pick = (rows) => rows.filter((r) => !only.length || only.includes(r.n));
const readIndex = (f) => fs.existsSync(path.join(DEPLOY, f)) ? JSON.parse(fs.readFileSync(path.join(DEPLOY, f), 'utf8')) : [];
const sessions = mode === 'u' ? [] : pick(readIndex('sessions.json'));
const units = mode === 's' ? [] : pick(readIndex('units.json'));   // empty unless unit sites were built (`build:deploy -- units`)
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failed = false;
try {
  for (const s of sessions) {
    const pack = readJson(s.id, `sessions/${s.id}.json`);
    const sol = readJson(s.id, `solutions/${s.id}.json`);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });   // fresh storage = standalone
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:4190/lms/games/embed-demo.html`);
    await page.selectOption('#pick', s.id);
    const frame = await (await page.waitForSelector(`iframe[src="${s.id}/index.html"]`)).contentFrame();

    await frame.getByRole('button', { name: /Start the episode/ }).waitFor();
    if (pack.previously.length) {
      await frame.getByRole('region', { name: 'The case so far' }).waitFor();
      for (const c of pack.previously) await frame.getByText(c.title, { exact: true }).first().waitFor();
    }
    await frame.getByRole('button', { name: /Start the episode/ }).click();
    await frame.locator('.hud h1').getByText(pack.title).waitFor();
    await playBeats(frame, pack, sol, {
      beforeTask: async (b) => {
        const trap = sol[b.task_id].traps[0];
        if (trap && b.task_id === 'T3.8') { await runSql(frame, trap.sql); await frame.locator('.verdict.trap').waitFor(); }
      },
    });
    await frame.getByText(`Solved: ${pack.title}`, { exact: true }).waitFor();

    // Evidence board: earned (this session) + briefed (earlier sessions, never played in this profile)
    await frame.getByRole('button', { name: 'See the Evidence Board' }).click();
    await frame.locator('.evidence article').first().waitFor();
    const earned = await frame.locator('.evidence article.earned').count();
    const briefed = await frame.locator('.evidence article.briefed').count();
    const ownClues = pack.beats.filter((b) => b.type === 'clue').length;
    if (earned !== ownClues || briefed !== pack.previously.length) throw new Error(`${s.id}: evidence earned ${earned}/${ownClues}, briefed ${briefed}/${pack.previously.length}`);

    const msgs = await page.evaluate(() => window.tmiMessages ?? []);
    const types = new Set(msgs.map((m) => m.type));
    for (const t of ['ready', 'progress', 'completed']) if (!types.has(t)) throw new Error(`${s.id}: parent never got a "${t}" message`);
    const done = msgs.find((m) => m.type === 'completed');
    if (done.session !== s.n || typeof done.points !== 'number') throw new Error(`${s.id}: bad completed message ${JSON.stringify(done)}`);
    const resized = msgs.filter((m) => m.type === 'resize').length;
    if (errors.length) throw new Error(`${s.id}: page errors: ${errors.join(' | ')}`);
    if (s.n === 1) {   // reset from inside the iframe: progress for this session is cleared
      await frame.goto(frame.url().replace(/#.*$/, '') + '#/');
      await frame.getByRole('button', { name: '↺ Reset progress' }).click();
      await frame.getByRole('button', { name: 'Yes, reset' }).click();
      await frame.getByText('Progress reset. You can start fresh.').waitFor();
      const after = await page.evaluate(() => (window.tmiMessages ?? []).some((m) => m.type === 'reset' && m.session === 1));
      if (!after) throw new Error('s01: parent never got a "reset" message');
      console.log('  ↺ s01 reset inside the iframe (parent notified)');
    }
    console.log(`  ✓ ${s.id} in iframe: solved (${done.points} pts) · evidence ${earned} earned + ${briefed} briefed · ${msgs.filter((m) => m.type === 'progress').length} progress messages · ${resized} resize reports`);
    await context.close();
  }

  // ---------------------------------------------------------------- units: one learner, one device, every unit in order
  if (units.length) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:4190/lms/games/embed-demo.html');
    const earnedSoFar = new Set();
    const playedParts = new Map();   // session -> parts done
    let frameNow = null;
    for (const u of units) try {
      if (u.same_as && units.some((x) => x.unit_id === u.same_as)) {   // a twin: just check it opens as the same content
        await page.selectOption('#pick', u.id);
        const frame = await (await page.waitForSelector(`iframe[src^="${u.id}/index.html"]`)).contentFrame();
        await frame.getByRole('button', { name: /Start the episode|Play again|Continue where I left off/ }).waitFor();
        console.log(`  ✓ ${u.id} (alias of ${units.find((x) => x.unit_id === u.same_as).id}) opens`);
        continue;
      }
      const pack = readJson(u.id, `units/${u.id}.json`);
      const sol = readJson(u.id, `solutions/s${String(u.session).padStart(2, '0')}.json`);
      await page.evaluate(() => { document.getElementById('user').value = 'stu-42'; });   // set, not typed: a late change event would reload the iframe
      await page.selectOption('#pick', u.id);
      await page.evaluate(() => { window.tmiMessages = []; });
      const frame = await (await page.waitForSelector(`iframe[src^="${u.id}/index.html"]`)).contentFrame();
      frameNow = frame;
      await frame.getByRole('button', { name: /Start the episode/ }).waitFor();
      if (pack.unit.parts > 1) await frame.getByText(`Part ${pack.unit.part} of ${pack.unit.parts}`).first().waitFor();
      if (pack.previously.length) {
        await frame.getByRole('region', { name: 'The case so far' }).waitFor();
        for (const c of pack.previously) await frame.getByText(c.title, { exact: true }).first().waitFor();
      }
      await frame.getByRole('button', { name: /Start the episode/ }).click();
      await frame.locator('.hud h1').getByText(pack.title).waitFor();
      await playBeats(frame, pack, sol);
      await frame.getByText(pack.unit.parts > 1 ? `Part ${pack.unit.part} of ${pack.unit.parts} solved` : `Solved: ${pack.title}`, { exact: true }).waitFor();
      playedParts.set(u.session, (playedParts.get(u.session) ?? 0) + 1);
      const sessionDone = playedParts.get(u.session) === pack.unit.parts;
      if (sessionDone && pack.unit.parts > 1) await frame.getByText(`all ${pack.unit.parts} parts of ${pack.title} done`).waitFor();

      // Evidence board: everything earned so far on this device is purple; only never-played clues are briefed
      for (const b of pack.beats) if (b.type === 'clue') earnedSoFar.add(b.clue_id);
      await frame.getByRole('button', { name: 'See the Evidence Board' }).click();
      await frame.locator('.evidence article').first().waitFor();
      const earned = await frame.locator('.evidence article.earned').count();
      const briefed = await frame.locator('.evidence article.briefed').count();
      const expectBriefed = pack.previously.filter((c) => !earnedSoFar.has(c.clue_id)).length;
      const expectEarned = [...earnedSoFar].filter((id) => Number(id.match(/^S(\d+)/)[1]) <= u.session).length;
      if (earned !== expectEarned || briefed !== expectBriefed) throw new Error(`${u.id}: evidence earned ${earned}/${expectEarned}, briefed ${briefed}/${expectBriefed}`);

      const msgs = await page.evaluate(() => window.tmiMessages ?? []);
      const ready = msgs.find((m) => m.type === 'ready');
      if (!ready || ready.unit !== u.n || ready.unit_id !== u.unit_id) throw new Error(`${u.id}: bad ready message ${JSON.stringify(ready)}`);
      const done = msgs.find((m) => m.type === 'completed');
      if (!done || done.unit !== u.n || done.session !== u.session || typeof done.points !== 'number' || done.session_completed !== sessionDone)
        throw new Error(`${u.id}: bad completed message ${JSON.stringify(done)}`);
      const prog = msgs.filter((m) => m.type === 'progress');
      if (!prog.length || prog.some((m) => m.event.object.unit !== u.n || m.event.user_id !== 'lms:stu-42')) throw new Error(`${u.id}: progress events missing unit/user`);
      if (errors.length) throw new Error(`${u.id}: page errors: ${errors.join(' | ')}`);
      console.log(`  ✓ ${u.id} ${u.title} (S${u.session} ${pack.unit.part}/${pack.unit.parts}): solved (${done.points} pts) · evidence ${earned} earned + ${briefed} briefed${sessionDone ? ' · session complete' : ''}`);
    } catch (e) {
      const text = frameNow ? await frameNow.locator('body').innerText().catch(() => '') : '';
      throw new Error(`${u.id}: ${e.message.split('\n')[0]}\n--- page text ---\n${text.slice(0, 1500)}`);
    }
    // restore: a fresh profile gets the saved events from the host page and sees the clues as earned
    if (units.length > 1) {
      const saved = await page.evaluate(() => window.tmiSaved);
      const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page2 = await ctx2.newPage();
      await page2.goto('http://localhost:4190/lms/games/embed-demo.html');
      await page2.evaluate((ev) => { window.tmiSaved = ev; }, saved);
      const last = units.filter((u) => !u.same_as).at(-1);
      await page2.evaluate(() => { document.getElementById('user').value = 'stu-42'; });
      await page2.selectOption('#pick', last.id);
      const frame2 = await (await page2.waitForSelector(`iframe[src^="${last.id}/index.html"]`)).contentFrame();
      await frame2.getByRole('button', { name: /Start the episode/ }).waitFor();
      await page2.click('#restore');
      await page2.waitForFunction(() => (window.tmiMessages ?? []).some((m) => m.type === 'restored'));
      const restored = (await page2.evaluate(() => window.tmiMessages)).find((m) => m.type === 'restored');
      await frame2.getByRole('button', { name: /Play again/ }).waitFor();   // progress reloaded: the unit shows as solved
      console.log(`  ✓ restore on a fresh profile: ${restored.added} events replayed, ${last.id} shows as solved`);
      await ctx2.close();
    }
    await context.close();
  }
  console.log('smoke-deploy: OK');
} catch (e) {
  failed = true;
  console.error('smoke-deploy: FAIL —', e.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
