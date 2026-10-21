// Copies generated content into app/public/content so Vite serves it.
// Source of truth stays in ../content (built by ../pipeline). Never edit app/public/content by hand.
//
// Safe while a dev server is running: files are written in place only when they changed, and stale
// files are removed last — the folder is never emptied, so the browser never gets Vite's HTML
// fallback page instead of a snapshot or JSON file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.resolve(APP, '../content');
const OUT = path.join(APP, 'public/content');

const wanted = new Map();   // relative path in OUT -> Buffer
const copies = [
  ['sessions', 'sessions', (f) => /^s\d\d\.json$/.test(f)],
  ['sessions/solutions', 'solutions', (f) => f.endsWith('.json')],
  ['units', 'units', (f) => f.endsWith('.json')],
  ['case_db/snapshots', 'snapshots', (f) => f.endsWith('.sqlite')],
  ['case_db/runtime', 'runtime', (f) => f.endsWith('.sql')],
];
for (const [from, to, keep] of copies) {
  for (const f of fs.readdirSync(path.join(CONTENT, from)).filter(keep)) wanted.set(`${to}/${f}`, fs.readFileSync(path.join(CONTENT, from, f)));
}

// sessions index: which sessions are built, for the case map
const index = [...wanted.keys()].filter((k) => /^sessions\/s\d\d\.json$/.test(k)).sort().map((k) => {
  const p = JSON.parse(wanted.get(k).toString('utf8'));
  return { session: p.session, title: p.title, minutes: Math.round(p.minutes_estimate), story_clock: p.story_clock, premise: p.premise, headline: p.headline };
});
wanted.set('sessions/index.json', Buffer.from(JSON.stringify(index)));

// reading materials: only what Case Notes need (title + markdown), keyed by unit_id
const rm = JSON.parse(fs.readFileSync(path.join(CONTENT, 'reading_materials.json'), 'utf8'));
const notes = {};
for (const t of rm.topics) for (const m of t.reading_materials) notes[m.unit_id] = { rm: m.global_sequence, title: m.title, markdown: m.content_markdown };
wanted.set('reading_materials.json', Buffer.from(JSON.stringify(notes)));

// the cast (people and places) for the briefing page
wanted.set('cast.json', fs.readFileSync(path.join(CONTENT, 'story/cast.json')));

let written = 0, removed = 0;
for (const [rel, buf] of wanted) {
  const file = path.join(OUT, rel);
  if (fs.existsSync(file) && fs.readFileSync(file).equals(buf)) continue;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);   // atomic replace: readers see the old file or the new one, never half
  written++;
}
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]) : [];
for (const file of walk(OUT)) {
  if (!wanted.has(path.relative(OUT, file).split(path.sep).join('/'))) { fs.rmSync(file); removed++; }
}
console.log(`content synced → public/content (${wanted.size} files, ${written} updated, ${removed} removed)`);
