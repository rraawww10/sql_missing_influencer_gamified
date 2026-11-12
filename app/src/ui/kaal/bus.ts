// A tiny store for Inspector Kaal: any component can make him react (kaal('pass')), the dock renders it.
// Also plays the matching sound effect, so one call = one reaction.
import { useSyncExternalStore } from 'react';
import { MOOD, lineFor, type KaalEvent, type KaalMood } from './lines';
import { sfx, type Sfx } from '../sound';
import { speak } from '../voice';
import { gameFx } from '../gamefx';
import { personalize } from '../../adapters/identity';

export interface KaalState { mood: KaalMood; line: string; event: KaalEvent | null; n: number }
let state: KaalState = { mood: 'idle', line: '', event: null, n: 0 };
const subs = new Set<() => void>();

const SOUND: Partial<Record<KaalEvent, Sfx>> = {
  pass: 'pass', passFirst: 'pass', wrong: 'fail', error: 'fail', trap: 'trap', activityRight: 'pass', activityWrong: 'fail',
  checkRight: 'pass', checkWrong: 'fail', pinned: 'clue', solved: 'solved', clue: 'reveal', hint1: 'paper', hint2: 'paper', hint3: 'paper',
};

export function kaal(event: KaalEvent, opts: { line?: string; silent?: boolean; mute?: boolean } = {}) {
  state = { mood: MOOD[event], line: personalize(opts.line ?? lineFor(event)), event, n: state.n + 1 };
  subs.forEach((s) => s());
  const s = SOUND[event];
  if (s && !opts.silent) sfx(s);
  if (!opts.mute) speak(state.line, { mood: state.mood });
  gameFx(event);
}
export function kaalQuiet() { state = { ...state, line: '', n: state.n + 1 }; subs.forEach((s) => s()); }

export function useKaal(): KaalState {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state, () => state);
}
