// Episode score out of 100 % and the badge it earns (2026-11-19).
//
// Score = the episode's best points ÷ the most it can give (every task right first time with no hints, every activity
// right first time, every quick check right, every clue pinned) - see POINTS in engine/progress/derive.ts.
// Badge tier by score: Platinum 100 % (flawless) · Gold 90 %+ · Silver 70 %+ · Bronze for solving the episode.
// Each episode has its own badge name; a student can pin earned badges to the badge wall on the case map (kept on this
// device). The dashboard computes the same score on the server (analytics/lib.mjs `episodeScores`).
import { POINTS, EPISODE_MAX, scorePct } from '../engine/progress/derive';
import { currentIdentity } from '../adapters/identity';
import type { IconName } from './design/Icon';

export { EPISODE_MAX, scorePct, PASS_PCT, passedEpisode } from '../engine/progress/derive';
export const GAME_MAX = EPISODE_MAX.reduce((a, b) => a + b, 0);

// the same weights as sittingPoints(): a task's best is 10 + the first-try bonus; a demo counts as an activity done first time
export function maxPoints(beats: { type: string }[]): number {
  const W: Record<string, number> = { task: POINTS.taskPassed + POINTS.firstTryBonus, activity: POINTS.activityFirstTry, demo: POINTS.activityFirstTry,
    check: POINTS.checkCorrect, clue: POINTS.cluePinned };
  return beats.reduce((a, b) => a + (W[b.type] ?? 0), 0);
}

export type Tier = 'platinum' | 'gold' | 'silver' | 'bronze';
export const TIERS: { id: Tier; name: string; min: number; line: string }[] = [
  { id: 'platinum', name: 'Platinum', min: 100, line: 'Flawless. Not a single point dropped.' },
  { id: 'gold', name: 'Gold', min: 90, line: 'Sharp work. Almost flawless.' },
  { id: 'silver', name: 'Silver', min: 70, line: 'Solid detective work.' },
  { id: 'bronze', name: 'Bronze', min: 0, line: 'Case cracked. Replay it to aim higher.' },
];
export const tierOf = (pct: number): (typeof TIERS)[number] => TIERS.find((t) => pct >= t.min) ?? TIERS[TIERS.length - 1];
export const nextTier = (pct: number) => [...TIERS].reverse().find((t) => t.min > pct) ?? null;

// one badge per episode: named after what you did in it
export const BADGES: { name: string; icon: IconName }[] = [
  { name: 'First Night', icon: 'shield' },
  { name: 'Case File Architect', icon: 'db' },
  { name: 'Gatekeeper', icon: 'key' },
  { name: 'Ride Tracker', icon: 'map' },
  { name: 'Money Trail', icon: 'target' },
  { name: 'Signal Hunter', icon: 'bolt' },
  { name: 'Pulse Reader', icon: 'clock' },
  { name: 'Truth Filter', icon: 'eye' },
  { name: 'Board Master', icon: 'pin' },
  { name: 'Dot Connector', icon: 'spark' },
  { name: 'Road Watcher', icon: 'flag' },
  { name: 'Log Detective', icon: 'scroll' },
  { name: 'Showstopper', icon: 'trophy' },
];
export interface EpisodeBadge { session: number; name: string; icon: IconName; pct: number; points: number; max: number; tier: (typeof TIERS)[number] }
export function badgeOf(session: number, points: number): EpisodeBadge {
  const max = EPISODE_MAX[session - 1] ?? 0, pct = scorePct(points, max);
  return { session, ...BADGES[session - 1], pct, points, max, tier: tierOf(pct) };
}

// ---- the badge wall: which earned badges the student pinned (this device, per student)
const pinKey = () => `tmi.badges.pinned.${currentIdentity()?.id ?? 'guest'}`;
export function pinnedBadges(): number[] {
  try { const v = JSON.parse(localStorage.getItem(pinKey()) ?? '[]'); return Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : []; } catch { return []; }
}
export function setPinned(session: number, on: boolean): number[] {
  const now = new Set(pinnedBadges());
  if (on) now.add(session); else now.delete(session);
  const list = [...now].sort((a, b) => a - b);
  try { localStorage.setItem(pinKey(), JSON.stringify(list)); } catch { /* storage blocked: the pin lasts until reload */ }
  dispatchEvent(new CustomEvent('tmi:badges'));
  return list;
}
