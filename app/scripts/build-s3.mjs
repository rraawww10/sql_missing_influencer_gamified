// Builds the COMPACT upload folder for S3 (or any static host): ../missing-influencer-v2
// The briefing + the 13 episodes (one site per course topic). The app bundle and the content are stored ONCE:
//
//   missing-influencer-v2/
//     assets/            the app (JS, CSS, SQLite wasm, fonts) — one copy
//     content/           snapshots, episode packs, solutions, course notes, cast — one copy
//     intro/index.html   the briefing            ← <meta name="tmi-intro">
//     s01/ … s13/        one episode each        ← <meta name="tmi-session">
//     embed-demo.html, sessions.json
//
// Every index.html points at ../assets and ../content, so the folder must be uploaded as one tree (any bucket, any prefix).
// Each site is opened by its own URL (…/s03/index.html) and embedded in an iframe.
// The per-reading-material unit sites (u01 … u38) are NOT shipped (decision 2026-10-19); `--units` adds them back.
//
// Usage: npm run build:s3                     (→ ../missing-influencer-v2)
//        npm run build:s3 -- /path            (another output folder)
//        npm run build:s3 -- --units          (also the 38 unit sites + units.json)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(APP, '..');
const CONTENT = path.join(ROOT, 'content');
const args = process.argv.slice(2);
const WITH_UNITS = args.includes('--units');
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'missing-influencer-v2'));
const pad = (n) => String(n).padStart(2, '0');
const SITE_SUFFIX = ' — SQL: The Missing Influencer';

const sessions = fs.readdirSync(path.join(CONTENT, 'sessions')).filter((f) => /^s\d\d\.json$/.test(f)).map((f) => Number(f.slice(1, 3))).sort((a, b) => a - b);
const units = WITH_UNITS ? fs.readdirSync(path.join(CONTENT, 'units')).filter((f) => /^u\d\d\.json$/.test(f)).map((f) => Number(f.slice(1, 3))).sort((a, b) => a - b) : [];
if (!sessions.length) throw new Error('no sessions — run node pipeline/build_sessions.mjs first');

const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const bytes = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((a, d) =>
  a + (d.isDirectory() ? bytes(path.join(dir, d.name)) : fs.statSync(path.join(dir, d.name)).size), 0);
const kb = (n) => `${Math.round(n / 1024)} KB`;

// 1. one bundle
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tmi-s3-'));
await build({ root: APP, configFile: path.join(APP, 'vite.config.ts'), base: './', publicDir: false, logLevel: 'warn',
  build: { outDir: dist, emptyOutDir: true, chunkSizeWarningLimit: 1200 } });
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(dist, 'assets'), path.join(OUT, 'assets'), { recursive: true });
fs.rmSync(dist, { recursive: true, force: true });

// 2. one content folder
const C = path.join(OUT, 'content');
for (const n of sessions) {
  copy(path.join(CONTENT, 'sessions', `s${pad(n)}.json`), path.join(C, 'sessions', `s${pad(n)}.json`));
  copy(path.join(CONTENT, 'sessions/solutions', `s${pad(n)}.json`), path.join(C, 'solutions', `s${pad(n)}.json`));
}
for (const n of units) copy(path.join(CONTENT, 'units', `u${pad(n)}.json`), path.join(C, 'units', `u${pad(n)}.json`));
const packs = new Map(sessions.map((n) => [n, JSON.parse(fs.readFileSync(path.join(CONTENT, 'sessions', `s${pad(n)}.json`), 'utf8'))]));
for (const p of packs.values()) copy(path.join(CONTENT, 'case_db/snapshots', `${p.snapshot}.sqlite`), path.join(C, 'snapshots', `${p.snapshot}.sqlite`));
copy(path.join(CONTENT, 'story/cast.json'), path.join(C, 'cast.json'));
const rm = JSON.parse(fs.readFileSync(path.join(CONTENT, 'reading_materials.json'), 'utf8'));
const notes = {};
for (const t of rm.topics) for (const m of t.reading_materials) notes[m.unit_id] = { rm: m.global_sequence, title: m.title, markdown: m.content_markdown };
fs.writeFileSync(path.join(C, 'reading_materials.json'), JSON.stringify(notes));
fs.writeFileSync(path.join(C, 'sessions/index.json'), JSON.stringify(sessions.map((n) => {
  const p = packs.get(n);
  return { session: p.session, title: p.title, minutes: Math.round(p.minutes_estimate), story_clock: p.story_clock, premise: p.premise, headline: p.headline };
})));

// 3. one tiny index.html per site
function site(id, title, meta) {
  const dir = path.join(OUT, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), template
    .replace(/<title>.*<\/title>/, `<title>${title}${SITE_SUFFIX}</title>`)
    .replace(/(src|href)="\.\/assets\//g, '$1="../assets/')
    .replace('</head>', `    ${meta}\n    <meta name="tmi-content" content="../content">\n  </head>`));
}
site('intro', 'Case briefing', '<meta name="tmi-intro" content="1">');
const sessionSummary = sessions.map((n) => {
  const p = packs.get(n);
  site(`s${pad(n)}`, p.title, `<meta name="tmi-session" content="${n}">`);
  return { n, id: `s${pad(n)}`, title: p.title, minutes: Math.round(p.minutes_estimate), topic: p.course_topic_id };
});
const unitSummary = units.map((n) => {
  const p = JSON.parse(fs.readFileSync(path.join(CONTENT, 'units', `u${pad(n)}.json`), 'utf8'));
  const u = p.unit;
  const label = u.finale ? p.title : `${u.title} · ${p.title}${u.parts > 1 ? ` (part ${u.part} of ${u.parts})` : ''}`;
  site(`u${pad(n)}`, label, `<meta name="tmi-unit" content="${n}">`);
  return { n, id: `u${pad(n)}`, unit_id: u.unit_id, learning_resource_id: u.learning_resource_id, topic_id: p.course_topic_id,
    title: u.title, session: p.session, session_title: p.title, part: u.part, parts: u.parts, minutes: Math.round(p.minutes_estimate),
    tasks: p.beats.filter((b) => b.type === 'task').length, clues: p.beats.filter((b) => b.type === 'clue').length,
    ...(u.same_as ? { same_as: u.same_as } : {}), ...(u.finale ? { finale: true } : {}) };
});
fs.writeFileSync(path.join(OUT, 'sessions.json'), JSON.stringify(sessionSummary, null, 2) + '\n');
if (WITH_UNITS) fs.writeFileSync(path.join(OUT, 'units.json'), JSON.stringify(unitSummary, null, 2) + '\n');

// 4. the demo host page (same as deploy/embed-demo.html)
const options = ['<option value="intro">intro · Case briefing (before the first episode)</option>',
  ...sessionSummary.map((s) => `<option value="${s.id}">${s.id} · ${s.title}</option>`),
  ...unitSummary.map((u) => `<option value="${u.id}">${u.id} · ${u.title} · ${u.session_title}${u.parts > 1 ? ` (part ${u.part} of ${u.parts})` : ''}</option>`)];
fs.writeFileSync(path.join(OUT, 'embed-demo.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Embed demo — SQL: The Missing Influencer</title>
<style>body{font:15px system-ui,sans-serif;margin:0;padding:16px;background:#f4f5f8;color:#1b1f2a}
select,button,input{font:inherit;padding:6px 10px}iframe{width:100%;border:1px solid #d9dde6;border-radius:12px;background:#fff;height:min(900px,88vh)}
pre{background:#fff;border:1px solid #d9dde6;border-radius:8px;padding:8px;max-height:30vh;overflow:auto;font-size:12px}</style></head>
<body>
<p><label>Site <select id="pick">${options.join('')}</select></label>
   <label style="margin-left:12px">user_id <input id="user" size="12" placeholder="(guest)"></label>
   <button id="restore" title="Replay every progress message this page has seen into the game (what an LMS would do on another device)">Restore progress</button></p>
<iframe id="game" title="SQL: The Missing Influencer" src="intro/index.html"></iframe>
<p>Messages from the game (postMessage):</p><pre id="log"></pre>
<script>
  const game = document.getElementById('game'), log = document.getElementById('log'), user = document.getElementById('user');
  const load = () => { const q = user.value ? '?user_id=' + encodeURIComponent(user.value) : ''; game.src = document.getElementById('pick').value + '/index.html' + q; log.textContent = ''; };
  document.getElementById('pick').onchange = load;
  user.onchange = load;
  window.tmiSaved = [];
  document.getElementById('restore').onclick = () => game.contentWindow.postMessage({ source: 'tmi-host', type: 'restore', events: window.tmiSaved }, '*');
  addEventListener('message', (e) => {
    if (!e.data || e.data.source !== 'tmi') return;
    if (e.data.type === 'progress') window.tmiSaved.push(e.data.event);
    const line = e.data.type + ' ' + JSON.stringify(e.data.type === 'progress' ? { verb: e.data.event.verb, id: e.data.event.object.id, unit: e.data.event.object.unit } : e.data);
    log.textContent = line + '\\n' + log.textContent;
    (window.tmiMessages ||= []).push(e.data);
  });
</script>
</body></html>
`);

console.log(`${path.relative(ROOT, OUT)}/  assets ${kb(bytes(path.join(OUT, 'assets')))} · content ${kb(bytes(C))} · briefing + ${sessions.length} episodes${units.length ? ` + ${units.length} units` : ''} · total ${kb(bytes(OUT))}`);
