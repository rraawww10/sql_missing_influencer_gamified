// Ranks (designations) in the UI: icon per rank, how far to the next one, and the one-time "Promoted!" moment.
// The rank itself is derived from solved episodes in engine/progress/derive.ts (RANKS).
import { RANKS, type Progress } from '../engine/progress/derive';
import { currentIdentity } from '../adapters/identity';

export const RANK_ICON: Record<string, string> = { Intern: '🎓', Constable: '🛡️', 'Sub-Inspector': '⭐', Inspector: '🏅' };
export const rankIcon = (rank: string) => RANK_ICON[rank] ?? '🎖️';

export const solvedCount = (p: Progress | null) => p?.sessions.filter((s) => s.status === 'completed').length ?? 0;

// the next rank and how many more episodes it needs (null at the top rank)
export function nextRank(solved: number): { name: string; left: number } | null {
  const n = RANKS.find((r) => r.minSessions > solved);
  return n ? { name: n.name, left: n.minSessions - solved } : null;
}

// True once per student per rank, right after the episode that earned it (solved count sits exactly on the threshold).
export function takePromotion(p: Progress | null): string | null {
  if (!p) return null;
  const solved = solvedCount(p);
  const r = RANKS.find((x) => x.name === p.rank);
  if (!r || r.minSessions === 0 || solved !== r.minSessions) return null;
  const key = `tmi.promoted.${currentIdentity()?.id ?? 'guest'}.${r.name}`;
  try { if (localStorage.getItem(key)) return null; localStorage.setItem(key, '1'); } catch { /* storage blocked: still celebrate */ }
  return r.name;
}
