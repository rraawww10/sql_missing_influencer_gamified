// Layout regression guard. Vitest runs in jsdom, which has no layout engine, so a floating element that
// covers the content underneath it (BUG-1: the dock swallowing clicks on Run ▶ and on the column chips)
// is invisible to the unit tests while the game feels completely dead in a real browser.
//
// The check: at several viewport sizes and several scroll positions, every visible interactive element
// must be the top-most element at its own centre — i.e. a real click there reaches it.
//
// Usage: npm run build && node scripts/hit-test.mjs            (or SMOKE_URL=http://localhost:5173)
//        HIT_SESSION=7 node scripts/hit-test.mjs               (walk a different episode)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { playBeats } from './smoke-lib.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(APP, 'public/content');
const N = Number(process.env.HIT_SESSION ?? 3);
const two = (n) => String(n).padStart(2, '0');
const pack = JSON.parse(fs.readFileSync(path.join(CONTENT, `sessions/s${two(N)}.json`), 'utf8'));
const solutions = JSON.parse(fs.readFileSync(path.join(CONTENT, `solutions/s${two(N)}.json`), 'utf8'));

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 780 },
  { name: 'small laptop', width: 1280, height: 620 },
  { name: 'desktop', width: 1600, height: 900 },
];
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

const PORT = 4181;
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

// Runs in the page: who actually receives a click at the centre of every visible interactive element?
const SCAN = ({ fraction }) => {
  const scroller = document.querySelector('.stage-scroll');
  if (scroller) {
    const was = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = 'auto';        // the stage scrolls smoothly: without this the jump is
    scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * fraction;   // still animating when we measure
    scroller.style.scrollBehavior = was;
  } else scrollTo({ top: (document.body.scrollHeight - innerHeight) * fraction, behavior: 'instant' });

  // where this element can actually be painted: the viewport, narrowed by every ancestor that clips
  const visibleBox = (el) => {
    const box = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let p = el.parentElement; p; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.overflowX === 'visible' && st.overflowY === 'visible') continue;
      const r = p.getBoundingClientRect();
      box.left = Math.max(box.left, r.left); box.top = Math.max(box.top, r.top);
      box.right = Math.min(box.right, r.right); box.bottom = Math.min(box.bottom, r.bottom);
    }
    return box;
  };
  const label = (el) => {
    if (!el) return 'nothing';
    const text = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const cls = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
    return `<${el.tagName.toLowerCase()}${cls}>${text ? ` "${text}"` : ''}`;
  };
  const dialog = document.querySelector('[role="dialog"]');
  const bad = [];
  const selector = 'button, a[href], input, select, textarea, [role="button"], [contenteditable="true"]';
  for (const el of document.querySelectorAll(selector)) {
    if (dialog && !dialog.contains(el)) continue;            // an open sheet is meant to cover the page
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.05) continue;
    if (style.pointerEvents === 'none') continue;            // decorative on purpose
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const box = visibleBox(el);
    if (x <= box.left || y <= box.top || x >= box.right || y >= box.bottom) continue;   // scrolled out of sight
    const hit = document.elementFromPoint(x, y);
    if (!hit || el.contains(hit) || hit.contains(el)) continue;
    bad.push({ element: label(el), covered_by: label(hit) });
  }
  return bad;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];
let scans = 0;

const check = async (page, where) => {
  for (const fraction of FRACTIONS) {
    const bad = await page.evaluate(SCAN, { fraction });
    scans++;
    for (const b of bad) failures.push(`${where} · scroll ${Math.round(fraction * 100)}%: ${b.element} is covered by ${b.covered_by}`);
  }
  await page.evaluate(SCAN, { fraction: 0 });   // leave the stage where the next step expects it
};

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on('pageerror', (e) => failures.push(`${vp.name}: page error ${e.message}`));
    console.log(`\n▶ ${vp.name} — ${vp.width}×${vp.height}`);

    await page.goto(`${BASE}/#/intro`);
    await page.getByRole('button', { name: /Start the first episode/ }).waitFor();
    await check(page, `${vp.name} · briefing`);

    await page.goto(`${BASE}/#/s/${N}`);
    await page.getByRole('button', { name: /Start the episode|Continue where I left off/ }).waitFor();
    await check(page, `${vp.name} · episode intro`);

    await page.getByRole('button', { name: /Start the episode|Continue where I left off/ }).click();
    await page.locator('.hud h1').getByText(pack.title).waitFor();
    await playBeats(page, pack, solutions, {
      beforeBeat: async (b, i) => check(page, `${vp.name} · step ${i + 1} (${b.type} ${b.id})`),
    });
    console.log(`  ✓ played all ${pack.beats.length} steps`);
    await page.close();
  }
} finally {
  await browser.close();
  await stopServer();
}

console.log(`\n${scans} hit-test scans across ${VIEWPORTS.length} viewports, episode ${N} ("${pack.title}").`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} interactive element(s) cannot be clicked where they are drawn:\n`);
  for (const f of [...new Set(failures)]) console.error('  ' + f);
  process.exit(1);
}
console.log('✓ every visible interactive element receives its own clicks.');
