// Builds the briefing and every episode as its own self-contained static site (the test build; the upload folder is
// scripts/build-s3.mjs):
//   ../deploy/intro       the briefing — the page before the first episode (who you are, how to play, tonight's timeline)
//   ../deploy/s01 … s13   one whole session (episode) each (13 sites)
//   ../deploy/u01 … u38   one UNIT each (one reading material = a slice of its session) — NOT built by default since
//                         2026-10-19 (the platform ships episodes only); `-- units` / `-- u 11 12` builds them.
// Folder ids stay sNN (stable keys for the platform); every title the learner sees is the episode's name.
// Each folder is self-contained (its own pack, solutions, case DB snapshot and course notes) and uses relative
// paths, so it can be uploaded anywhere — any domain, any sub-folder — and embedded in an iframe.
// The app bundle is built ONCE; each folder gets a copy plus an index.html that says what it is
// (<meta name="tmi-intro">, <meta name="tmi-session"> or <meta name="tmi-unit">; see src/main.tsx).
//
// Usage: npm run build:deploy                 (intro + all sessions)
//        npm run build:deploy -- s 3          (only session 3)
//        npm run build:deploy -- u 11 12      (only units 11 and 12)
//        npm run build:deploy -- sessions | units | intro | all   (all = intro + sessions + units)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(APP, '..');
const CONTENT = path.join(ROOT, 'content');
const DEPLOY = path.join(ROOT, 'deploy');
const pad = (n) => String(n).padStart(2, '0');

const args = process.argv.slice(2);
// default (no argument): intro + sessions. Units only when asked for.
const mode = args[0] === 's' || args[0] === 'sessions' ? 's' : args[0] === 'u' || args[0] === 'units' ? 'u' : args[0] === 'intro' ? 'i' : args[0] === 'all' ? 'all' : 'default';
const only = args.slice(1).map(Number).filter(Boolean);
const allSessions = fs.readdirSync(path.join(CONTENT, 'sessions')).filter((f) => /^s\d\d\.json$/.test(f)).map((f) => Number(f.slice(1, 3))).sort((a, b) => a - b);
const allUnits = fs.readdirSync(path.join(CONTENT, 'units')).filter((f) => /^u\d\d\.json$/.test(f)).map((f) => Number(f.slice(1, 3))).sort((a, b) => a - b);
const sessions = mode === 'u' || mode === 'i' ? [] : allSessions.filter((n) => !only.length || only.includes(n));
const units = mode === 'u' || mode === 'all' ? allUnits.filter((n) => !only.length || only.includes(n)) : [];
const intro = mode === 'all' || mode === 'i' || mode === 'default';
if (!sessions.length && !units.length && !intro) throw new Error('nothing to build — run node pipeline/build_sessions.mjs first');
const SITE_SUFFIX = ' — SQL: The Missing Influencer';

const rm = JSON.parse(fs.readFileSync(path.join(CONTENT, 'reading_materials.json'), 'utf8'));
const notesByUnit = {};
for (const t of rm.topics) for (const m of t.reading_materials) notesByUnit[m.unit_id] = { rm: m.global_sequence, title: m.title, markdown: m.content_markdown };

const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const bytes = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((a, d) =>
  a + (d.isDirectory() ? bytes(path.join(dir, d.name)) : fs.statSync(path.join(dir, d.name)).size), 0);

// one bundle for every site
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tmi-deploy-'));
await build({
  root: APP,
  configFile: path.join(APP, 'vite.config.ts'),
  base: './',                       // relative URLs: works in any folder / domain
  publicDir: false,                 // content is copied per site below (only what that site needs)
  logLevel: 'warn',
  build: { outDir: dist, emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

// a site = bundle + its content + an index.html that names the session/unit
function site(out, pack, { title, meta }) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(dist, out, { recursive: true });
  const id = `s${pad(pack.session)}`;
  copy(path.join(CONTENT, 'sessions/solutions', `${id}.json`), path.join(out, 'content/solutions', `${id}.json`));
  copy(path.join(CONTENT, 'case_db/snapshots', `${pack.snapshot}.sqlite`), path.join(out, 'content/snapshots', `${pack.snapshot}.sqlite`));
  const unitIds = new Set(pack.reading_materials.map((r) => r.unit_id));
  fs.writeFileSync(path.join(out, 'content/reading_materials.json'),
    JSON.stringify(Object.fromEntries([...unitIds].map((u) => [u, notesByUnit[u]]))));
  fs.writeFileSync(path.join(out, 'index.html'), template
    .replace(/<title>.*<\/title>/, `<title>${title}${SITE_SUFFIX}</title>`)
    .replace('</head>', `    ${meta}\n  </head>`));
}

// the briefing site: bundle + cast + the sessions index (for episode lengths); no case DB
if (intro) {
  const out = path.join(DEPLOY, 'intro');
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(dist, out, { recursive: true });
  copy(path.join(CONTENT, 'story/cast.json'), path.join(out, 'content/cast.json'));
  const index = allSessions.map((n) => {
    const p = JSON.parse(fs.readFileSync(path.join(CONTENT, 'sessions', `s${pad(n)}.json`), 'utf8'));
    return { session: p.session, title: p.title, minutes: Math.round(p.minutes_estimate), story_clock: p.story_clock, premise: p.premise, headline: p.headline };
  });
  fs.mkdirSync(path.join(out, 'content/sessions'), { recursive: true });
  fs.writeFileSync(path.join(out, 'content/sessions/index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(out, 'index.html'), template
    .replace(/<title>.*<\/title>/, `<title>Case briefing${SITE_SUFFIX}</title>`)
    .replace('</head>', `    <meta name="tmi-intro" content="1">\n  </head>`));
  console.log(`built deploy/intro  Case briefing  (${Math.round(bytes(out) / 1024)} KB)`);
}

const sessionSummary = [], unitSummary = [];
for (const n of sessions) {
  const id = `s${pad(n)}`, out = path.join(DEPLOY, id);
  const pack = JSON.parse(fs.readFileSync(path.join(CONTENT, 'sessions', `${id}.json`), 'utf8'));
  site(out, pack, { title: pack.title, meta: `<meta name="tmi-session" content="${n}">` });
  copy(path.join(CONTENT, 'sessions', `${id}.json`), path.join(out, 'content/sessions', `${id}.json`));
  sessionSummary.push({ n, id, title: pack.title, minutes: Math.round(pack.minutes_estimate), topic: pack.course_topic_id, kb: Math.round(bytes(out) / 1024) });
  console.log(`built deploy/${id}  ${pack.title}  (${Math.round(bytes(out) / 1024)} KB)`);
}
for (const n of units) {
  const id = `u${pad(n)}`, out = path.join(DEPLOY, id);
  const pack = JSON.parse(fs.readFileSync(path.join(CONTENT, 'units', `${id}.json`), 'utf8'));
  const u = pack.unit;
  const label = u.finale ? pack.title : `${u.title} · ${pack.title}${u.parts > 1 ? ` (part ${u.part} of ${u.parts})` : ''}`;
  site(out, pack, { title: label, meta: `<meta name="tmi-unit" content="${n}">` });
  copy(path.join(CONTENT, 'units', `${id}.json`), path.join(out, 'content/units', `${id}.json`));
  unitSummary.push({ n, id, unit_id: u.unit_id, learning_resource_id: u.learning_resource_id, topic_id: pack.course_topic_id,
    title: u.title, session: pack.session, session_title: pack.title, part: u.part, parts: u.parts,
    minutes: Math.round(pack.minutes_estimate), tasks: pack.beats.filter((b) => b.type === 'task').length,
    clues: pack.beats.filter((b) => b.type === 'clue').length, ...(u.same_as ? { same_as: u.same_as } : {}), ...(u.finale ? { finale: true } : {}),
    kb: Math.round(bytes(out) / 1024) });
  console.log(`built deploy/${id}  ${label}  (${Math.round(bytes(out) / 1024)} KB)`);
}
fs.rmSync(dist, { recursive: true, force: true });

// merge into the indexes (a partial build keeps the other entries)
const merge = (file, rows) => {
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const byN = new Map(prev.map((r) => [r.n, r]));
  for (const r of rows) byN.set(r.n, r);
  const all = [...byN.values()].filter((r) => fs.existsSync(path.join(DEPLOY, r.id))).sort((a, b) => a.n - b.n);
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
  return all;
};
const allS = merge(path.join(DEPLOY, 'sessions.json'), sessionSummary);
// units.json exists only while unit folders exist (none by default)
const allU = merge(path.join(DEPLOY, 'units.json'), unitSummary);
if (!allU.length) fs.rmSync(path.join(DEPLOY, 'units.json'), { force: true });

// a tiny host page that embeds every built site and logs what it reports — for the LMS team and our tests
const options = [...(fs.existsSync(path.join(DEPLOY, 'intro')) ? ['<option value="intro">intro · Case briefing (before the first episode)</option>'] : []),
  ...allS.map((s) => `<option value="${s.id}">${s.id} · ${s.title}</option>`),
  ...allU.map((u) => `<option value="${u.id}">${u.id} · ${u.title} · ${u.session_title}${u.parts > 1 ? ` (part ${u.part} of ${u.parts})` : ''}</option>`)];
const first = fs.existsSync(path.join(DEPLOY, 'intro')) ? 'intro' : (allS[0] ?? allU[0]).id;
fs.writeFileSync(path.join(DEPLOY, 'embed-demo.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Embed demo — SQL: The Missing Influencer</title>
<style>body{font:15px system-ui,sans-serif;margin:0;padding:16px;background:#f4f5f8;color:#1b1f2a}
select,button,input{font:inherit;padding:6px 10px}iframe{width:100%;border:1px solid #d9dde6;border-radius:12px;background:#fff;height:min(900px,88vh)}
pre{background:#fff;border:1px solid #d9dde6;border-radius:8px;padding:8px;max-height:30vh;overflow:auto;font-size:12px}</style></head>
<body>
<p><label>Site <select id="pick">${options.join('')}</select></label>
   <label style="margin-left:12px">user_id <input id="user" size="12" placeholder="(guest)"></label>
   <button id="restore" title="Replay every progress message this page has seen into the game (what an LMS would do on another device)">Restore progress</button></p>
<iframe id="game" title="SQL: The Missing Influencer" src="${first}/index.html"></iframe>
<p>Messages from the game (postMessage):</p><pre id="log"></pre>
<script>
  const game = document.getElementById('game'), log = document.getElementById('log'), user = document.getElementById('user');
  const load = () => { const q = user.value ? '?user_id=' + encodeURIComponent(user.value) : ''; game.src = document.getElementById('pick').value + '/index.html' + q; log.textContent = ''; };
  document.getElementById('pick').onchange = load;
  user.onchange = load;
  // an LMS would keep these on its server; this demo keeps them in memory
  window.tmiSaved = [];
  document.getElementById('restore').onclick = () => game.contentWindow.postMessage({ source: 'tmi-host', type: 'restore', events: window.tmiSaved }, '*');
  addEventListener('message', (e) => {
    if (!e.data || e.data.source !== 'tmi') return;
    // Recommended: keep the iframe a fixed height (the game scrolls inside it and keeps the SQL console in view).
    // 'resize' messages are there if a host prefers to grow the iframe instead.
    if (e.data.type === 'progress') window.tmiSaved.push(e.data.event);
    const line = e.data.type + ' ' + JSON.stringify(e.data.type === 'progress' ? { verb: e.data.event.verb, id: e.data.event.object.id, unit: e.data.event.object.unit } : e.data);
    log.textContent = line + '\\n' + log.textContent;
    (window.tmiMessages ||= []).push(e.data);
  });
</script>
</body></html>
`);
console.log(`\n${fs.existsSync(path.join(DEPLOY, 'intro')) ? 'briefing + ' : ''}${allS.length} session site(s) + ${allU.length} unit site(s) in deploy/ · demo host: deploy/embed-demo.html`);
