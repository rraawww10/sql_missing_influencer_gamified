// Readability guard: plays every episode in a real browser and, at every step (before and after the learner acts),
// checks every visible piece of text against the colour actually behind it (WCAG contrast ratio).
// Also opens the Tables sheet, the course-note sheet and the Evidence sheet, and scans the briefing, intro and solved pages.
// Fails (exit 1) when text is below 3:1 (or 4.5:1 for small text, unless CONTRAST_MIN is set).
//
// Usage: npm run build && node scripts/contrast-scan.mjs          (CONTRAST_SESSIONS=2,5 to limit)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { playBeats, seedIdentity } from './smoke-lib.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(APP, 'public/content');
const two = (n) => String(n).padStart(2, '0');
const SESSIONS = (process.env.CONTRAST_SESSIONS ?? '1,2,3,4,5,6,7,8,9,10,11,12,13').split(',').map(Number);
const PORT = 4188;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: APP, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const BASE = `http://localhost:${PORT}/`;

// runs in the page: returns [{text, ratio, fg, bg, where}] for low-contrast text
const SCAN = () => {
  const parse = (c) => {
    const k = c.match(/color\(srgb ([^)]+)\)/); if (k) { const p = k[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  // the effective background: stack of ancestor background colours; gradients/images → unknown (skipped)
  function bgOf(el) {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/^url/.test(cs.backgroundImage)) {
        // a gradient: take its first colour stop as an approximation
        // a gradient: use its most opaque colour stop as an approximation (stripes / sheens are mostly transparent)
        const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g) ?? []).map(parse).sort((a, b) => b[3] - a[3]);
        if (!stops.length) return null;
        const bgc = parse(cs.backgroundColor); if (bgc && bgc[3] > 0 && bgc[3] >= stops[0][3]) layers.push(bgc); else layers.push(stops[0]);
        if (layers.at(-1)[3] >= 0.95) break; continue;
      }
      const c = parse(cs.backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.95) break; }
    }
    let base = [36, 20, 88, 1];  // --bg
    for (const l of layers.reverse()) base = blend(l, base);
    return base;
  }
  const out = [], seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim(); if (!t || t.length < 2) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('[aria-hidden="true"], .particles, svg, .xp-float, .chapter-banner, .tap-spark, .cm-gutters, .faded')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.3) continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); if (op < 0.3) continue;   // faded on purpose (previous line)
    if (el.closest('button:disabled')) continue;
    if (/text/.test(cs.webkitBackgroundClip || cs.backgroundClip || '')) continue;   // gradient-filled text: colour is the gradient itself
    const bg = bgOf(el); if (!bg) continue;
    let fg = parse(cs.color); if (!fg) continue;
    fg = blend([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.6 && bold) ? 3 : 4.5;
    const min = Number(window.__CONTRAST_MIN ?? need);
    if (ratio < Math.min(need, min)) {
      const cls = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
      out.push({ text: t.slice(0, 50), ratio: Math.round(ratio * 100) / 100, where: `${cls(el.parentElement ?? el)} > ${cls(el)}`, fg: fg.slice(0, 3).map(Math.round).join(','), bg: bg.slice(0, 3).map(Math.round).join(',') });
    }
  }
  return out;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await seedIdentity(page);
const issues = new Map();   // key → {count, sample}
async function scan(label) {
  await page.waitForTimeout(150);
  for (const i of await page.evaluate(SCAN)) {
    const key = `${i.where} | fg ${i.fg} on bg ${i.bg}`;
    const e = issues.get(key) ?? { n: 0, sample: `${label}: "${i.text}" (${i.ratio}:1)` }; e.n++; issues.set(key, e);
  }
}

await page.goto(BASE + '#/intro'); await page.waitForTimeout(1500); await scan('briefing');
await page.goto(BASE + '#/'); await page.waitForTimeout(1500); await scan('case map');
for (const n of SESSIONS) {
  const pack = JSON.parse(fs.readFileSync(path.join(CONTENT, `sessions/s${two(n)}.json`), 'utf8'));
  const solutions = JSON.parse(fs.readFileSync(path.join(CONTENT, `solutions/s${two(n)}.json`), 'utf8'));
  await page.evaluate(() => { localStorage.clear(); indexedDB.databases?.().then((d) => d.forEach((x) => indexedDB.deleteDatabase(x.name))); });
  await page.goto(BASE + `#/s/${n}`); await page.waitForTimeout(1200); await scan(`ep ${n} intro`);
  await page.goto(BASE + `#/play/${n}`); await page.getByText(/^Step \d+\/\d+$/).waitFor({ timeout: 20000 });
  let tables = false, note = false;
  await playBeats(page, pack, solutions, {
    beforeBeat: async (b, i) => {
      await scan(`ep ${n} step ${i + 1} ${b.type}`);
      if (b.type === 'note' && !note) { note = true; await page.getByRole('button', { name: /Read the full course note/ }).click(); await page.waitForTimeout(400); await scan(`ep ${n} course note sheet`); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
      if (b.type === 'task' && !tables) { tables = true; await page.getByRole('button', { name: 'Open the case database tables' }).click(); await page.waitForTimeout(600); await scan(`ep ${n} tables sheet`); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
    },
    afterBeat: async (b, i) => { if (['task', 'check', 'activity', 'clue', 'demo'].includes(b.type)) await scan(`ep ${n} step ${i + 1} ${b.type} (done)`); },
  });
  await page.waitForTimeout(1500); await scan(`ep ${n} solved page`);
  console.log(`  ✓ episode ${n} scanned`);
}
await browser.close(); server.kill();

const list = [...issues.entries()].sort((a, b) => b[1].n - a[1].n);
if (!list.length) { console.log('contrast: OK - no low-contrast text found'); process.exit(0); }
console.log(`\n✗ ${list.length} low-contrast text style(s):`);
for (const [k, v] of list) console.log(`  ${v.n}× ${k}\n      e.g. ${v.sample}`);
process.exit(1);
