// Test helpers: real content from ../content, real sql.js (same SQLite build as the browser).
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { ContentLoader } from '../content/loader';
import { SqlJsEngine } from '../engine/sql/engine';
import type { ActivityBeat } from '../content/types';
import type { ActivityAnswer } from '../engine/activities/check';

const ROOT = path.resolve(__dirname, '../../..');
const CONTENT = path.join(ROOT, 'content');

// Maps the app's /content URLs onto the repo's content folder (same layout sync-content.mjs produces)
export function fileLoader(): ContentLoader {
  const map = (p: string) => {
    const rel = p.replace(/^\/content\//, '');
    if (rel.startsWith('sessions/')) return path.join(CONTENT, rel);
    if (rel.startsWith('units/')) return path.join(CONTENT, rel);
    if (rel.startsWith('solutions/')) return path.join(CONTENT, 'sessions', rel);
    if (rel.startsWith('snapshots/')) return path.join(CONTENT, 'case_db', rel);
    if (rel === 'reading_materials.json') return path.join(CONTENT, rel);
    throw new Error(`unmapped ${p}`);
  };
  return new ContentLoader(async (p) => {
    const file = p.endsWith('sessions/index.json') ? CONTENT : map(p);
    if (!fs.existsSync(file)) return new Response('missing', { status: 404 });
    let body: BodyInit = p.endsWith('sessions/index.json') ? '' : fs.readFileSync(file);
    if (p.endsWith('sessions/index.json')) body = JSON.stringify(builtSessions().map((n) => {
      const pack = JSON.parse(fs.readFileSync(path.join(CONTENT, 'sessions', `s${String(n).padStart(2, '0')}.json`), 'utf8'));
      return { session: n, title: pack.title, minutes: Math.round(pack.minutes_estimate), story_clock: pack.story_clock, premise: pack.premise, headline: pack.headline };
    }));
    if (p.endsWith('reading_materials.json')) {
      // same shape as scripts/sync-content.mjs writes
      const rm = JSON.parse(fs.readFileSync(file, 'utf8'));
      const notes: Record<string, unknown> = {};
      for (const t of rm.topics) for (const m of t.reading_materials) notes[m.unit_id] = { rm: m.global_sequence, title: m.title, markdown: m.content_markdown };
      body = JSON.stringify(notes);
    }
    return new Response(body, { status: 200 });
  });
}

export async function nodeEngine() {
  return new SqlJsEngine(await initSqlJs());
}

export function builtUnits(): number[] {
  return fs.readdirSync(path.join(CONTENT, 'units')).filter((f) => /^u\d\d\.json$/.test(f)).map((f) => Number(f.slice(1, 3))).sort((a, b) => a - b);
}

export function builtSessions(): number[] {
  return fs.readdirSync(path.join(CONTENT, 'sessions')).filter((f) => /^s\d\d\.json$/.test(f)).map((f) => Number(f.slice(1, 3))).sort((a, b) => a - b);
}

// The correct answer for any activity, built from the pack's own key
export function answerKey(b: ActivityBeat): ActivityAnswer {
  switch (b.kind) {
    case 'sort_into': return { kind: 'sort_into', placement: Object.fromEntries(b.items.map((i) => [i.text, i.bucket])) };
    case 'match': return { kind: 'match', pairs: Object.fromEntries(b.pairs.map((p) => [p.left, p.right])) };
    case 'order': return { kind: 'order', steps: [...b.steps] };
    case 'pick_cell': return { kind: 'pick_cell', ...b.answer };
    case 'multi_select': return { kind: 'multi_select', selected: b.options.filter((o) => o.correct).map((o) => o.text) };
  }
}

export function seqUuid(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(5, '0')}`;
}

export class Clock {
  constructor(public t = Date.parse('2026-12-01T10:00:00Z')) {}
  now = () => new Date(this.t);
  advance(ms: number) { this.t += ms; }
}
