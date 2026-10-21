// Answer checking for non-SQL activities. Pure functions — the UI sends the learner's answer,
// the runner gets back which parts are right so it can highlight them.
import type { ActivityBeat } from '../../content/types';

export type ActivityAnswer =
  | { kind: 'sort_into'; placement: Record<string, string> }        // item text -> bucket
  | { kind: 'match'; pairs: Record<string, string> }                // left -> right
  | { kind: 'order'; steps: string[] }                              // learner's order
  | { kind: 'pick_cell'; table: string; row: number; column: string }
  | { kind: 'multi_select'; selected: string[] };                   // option texts

export interface ActivityResult {
  correct: boolean;
  // per-part correctness, keyed by item / left / step / option text
  parts: Record<string, boolean>;
}

export function checkActivity(beat: ActivityBeat, answer: ActivityAnswer): ActivityResult {
  if (beat.kind !== answer.kind) throw new Error(`answer kind ${answer.kind} for ${beat.kind} activity`);
  const parts: Record<string, boolean> = {};
  switch (beat.kind) {
    case 'sort_into': {
      const a = answer as Extract<ActivityAnswer, { kind: 'sort_into' }>;
      for (const it of beat.items) parts[it.text] = a.placement[it.text] === it.bucket;
      break;
    }
    case 'match': {
      const a = answer as Extract<ActivityAnswer, { kind: 'match' }>;
      for (const p of beat.pairs) parts[p.left] = a.pairs[p.left] === p.right;
      break;
    }
    case 'order': {
      const a = answer as Extract<ActivityAnswer, { kind: 'order' }>;
      beat.steps.forEach((s, i) => { parts[s] = a.steps[i] === s; });
      break;
    }
    case 'pick_cell': {
      const a = answer as Extract<ActivityAnswer, { kind: 'pick_cell' }>;
      const ok = a.table === beat.answer.table && a.row === beat.answer.row && a.column === beat.answer.column;
      parts[`${a.table}[${a.row}].${a.column}`] = ok;
      return { correct: ok, parts };
    }
    case 'multi_select': {
      const a = answer as Extract<ActivityAnswer, { kind: 'multi_select' }>;
      for (const o of beat.options) parts[o.text] = a.selected.includes(o.text) === !!o.correct;
      break;
    }
  }
  return { correct: Object.values(parts).every(Boolean), parts };
}

// Deterministic shuffle so the UI shows a scrambled order that is the same on refresh
export function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift()!);   // never show the answer as-is
  return out;
}
