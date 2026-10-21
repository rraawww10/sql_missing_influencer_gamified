// Everything the player sees about progress is derived from the event log (pure functions).
// Only COMPLETED sittings earn points; for a replayed session (or unit) the best sitting counts.
//
// Two kinds of sitting share one log:
//   whole-session sittings (the dev case map, deploy/sNN)      → scope "s3"
//   unit sittings (deploy/uNN: one reading material = a slice)  → scope "s3.u11", event.object.unit = 11
// A session counts as completed when a whole-session sitting finished it, OR every one of its unit parts is completed.
import type { ProgressEvent } from '../../ports/progress';

export const SESSION_COUNT = 13;

export const POINTS = {
  taskPassed: 10,
  firstTryBonus: 3,                       // passed on attempt 1 with no hints
  hintPenalty: { 1: 2, 2: 4, 3: 7 } as Record<number, number>,   // by highest hint tier used on that task
  taskMinimum: 3,
  activityFirstTry: 3,
  activityLater: 1,
  checkCorrect: 2,
  cluePinned: 2,
};

export const RANKS = [
  { name: 'Intern', minSessions: 0 },
  { name: 'Constable', minSessions: 4 },
  { name: 'Sub-Inspector', minSessions: 8 },
  { name: 'Inspector', minSessions: 13 },
] as const;

export type SessionStatus = 'locked' | 'available' | 'completed';

export interface SessionProgress {
  session: number;
  status: SessionStatus;
  points: number;              // best completed sitting (or the sum of its completed unit parts)
  hintsUsed: number;           // in that sitting
  trapsFound: number;
  completedAt: string | null;
  partsDone?: number;          // unit parts completed (only when played as units)
  parts?: number;
}

export interface UnitProgress {
  session: number;
  unit: number;                // unit number (reading material #)
  part: number;
  parts: number;
  status: 'completed';
  points: number;
  hintsUsed: number;
  trapsFound: number;
  completedAt: string;
}

export interface EvidenceCard {
  clue_id: string;
  session: number;
  title: string;
  body: string;
  task_id?: string;
  sql?: string;                // the learner's own query that proved it
  pinned_at: string;
}

export interface Progress {
  sessions: SessionProgress[];
  units: UnitProgress[];       // every completed unit (best sitting each), in unit order
  evidence: EvidenceCard[];    // Evidence Board: clues from completed sittings, in story order
  totalPoints: number;
  rank: (typeof RANKS)[number]['name'];
  badges: string[];
}

export const scopeOf = (e: ProgressEvent) => e.object.unit ? `s${e.object.session}.u${e.object.unit}` : `s${e.object.session}`;

export function sittingPoints(events: ProgressEvent[]): number {
  let pts = 0;
  for (const e of events) {
    const r = e.result ?? {};
    if (e.verb === 'task_passed') {
      const tier = Number(r.max_hint_tier ?? 0);
      let p = POINTS.taskPassed - (POINTS.hintPenalty[tier] ?? 0);
      if (tier === 0 && r.attempts === 1) p += POINTS.firstTryBonus;
      pts += Math.max(p, POINTS.taskMinimum);
    } else if (e.verb === 'activity_done') pts += r.first_try ? POINTS.activityFirstTry : POINTS.activityLater;
    else if (e.verb === 'check_answered' && r.correct) pts += POINTS.checkCorrect;
    else if (e.verb === 'clue_pinned') pts += POINTS.cluePinned;
  }
  return pts;
}

export function deriveProgress(all: ProgressEvent[]): Progress {
  // A reset wipes that scope's history up to the reset (the log itself stays append-only).
  // A whole-session reset ("s3") also wipes the session's units; a unit reset ("s3.u11") wipes that unit only.
  const resetAt = new Map<string, string>();
  for (const e of all) if (e.verb === 'session_reset' && (resetAt.get(scopeOf(e)) ?? '') < e.client_ts) resetAt.set(scopeOf(e), e.client_ts);
  const wiped = (e: ProgressEvent) => {
    const until = [resetAt.get(scopeOf(e)), resetAt.get(`s${e.object.session}`)].filter((x): x is string => !!x);
    return until.some((t) => e.client_ts <= t);
  };
  const events = all.filter((e) => e.verb !== 'session_reset' && !wiped(e));
  const bySitting = new Map<string, ProgressEvent[]>();
  for (const e of events) {
    if (!bySitting.has(e.sitting_id)) bySitting.set(e.sitting_id, []);
    bySitting.get(e.sitting_id)!.push(e);
  }

  // best completed sitting per scope
  interface Best { session: number; unit?: number; part?: number; parts?: number; points: number; hintsUsed: number; trapsFound: number; completedAt: string; events: ProgressEvent[] }
  const best = new Map<string, Best>();
  const badges = new Set<string>();
  let traps = 0;
  for (const evs of bySitting.values()) {
    traps += evs.filter((e) => e.verb === 'trap_hit').length;
    const done = evs.find((e) => e.verb === 'session_completed');
    if (!done) continue;
    const r = done.result ?? {};
    const hints = evs.filter((e) => e.verb === 'hint_used').length;
    const b: Best = {
      session: done.object.session, unit: done.object.unit, part: r.part as number | undefined, parts: r.parts as number | undefined,
      points: sittingPoints(evs), hintsUsed: hints, trapsFound: evs.filter((e) => e.verb === 'trap_hit').length, completedAt: done.client_ts, events: evs,
    };
    const key = scopeOf(done);
    const prev = best.get(key);
    if (!prev || b.points > prev.points) best.set(key, b);
    if (hints === 0 && evs.some((e) => e.verb === 'task_passed')) badges.add('No-Hint Session');
  }
  if (traps >= 3) badges.add('Trap Spotter');

  const units: UnitProgress[] = [...best.values()].filter((b) => b.unit !== undefined)
    .map((b) => ({ session: b.session, unit: b.unit!, part: b.part ?? 1, parts: b.parts ?? 1, status: 'completed' as const,
      points: b.points, hintsUsed: b.hintsUsed, trapsFound: b.trapsFound, completedAt: b.completedAt }))
    .sort((a, b) => a.unit - b.unit);

  const sessions: SessionProgress[] = [];
  for (let n = 1; n <= SESSION_COUNT; n++) {
    const whole = best.get(`s${n}`);
    const parts = units.filter((u) => u.session === n);
    const partsTotal = parts[0]?.parts ?? 0;
    const allParts = partsTotal > 0 && new Set(parts.map((u) => u.part)).size >= partsTotal;
    const fromParts = parts.length ? {
      points: parts.reduce((a, u) => a + u.points, 0), hintsUsed: parts.reduce((a, u) => a + u.hintsUsed, 0),
      trapsFound: parts.reduce((a, u) => a + u.trapsFound, 0), completedAt: parts.map((u) => u.completedAt).sort().at(-1)!,
    } : null;
    const partInfo = parts.length ? { partsDone: new Set(parts.map((u) => u.part)).size, parts: partsTotal } : {};
    if (whole && (!allParts || whole.points >= fromParts!.points)) {
      sessions.push({ session: n, status: 'completed', points: whole.points, hintsUsed: whole.hintsUsed, trapsFound: whole.trapsFound, completedAt: whole.completedAt, ...partInfo });
    } else if (allParts) {
      sessions.push({ session: n, status: 'completed', ...fromParts!, ...partInfo });
    } else {
      const unlocked = n === 1 || sessions[n - 2]?.status === 'completed' || parts.length > 0;   // a unit played on its own unlocks its session
      sessions.push({ session: n, status: unlocked ? 'available' : 'locked', points: fromParts?.points ?? 0, hintsUsed: 0, trapsFound: 0, completedAt: null, ...partInfo });
    }
  }

  // Evidence: clues from every best completed sitting (whole sessions and units), in story order
  const evidence: EvidenceCard[] = [...best.values()]
    .sort((a, b) => a.session - b.session || (a.part ?? 0) - (b.part ?? 0))
    .flatMap((b) => b.events.filter((e) => e.verb === 'clue_pinned').map((e) => ({
      clue_id: e.object.id, session: b.session, title: String(e.result?.title ?? ''), body: String(e.result?.body ?? ''),
      ...(e.result?.task_id ? { task_id: String(e.result.task_id), sql: String(e.result.sql ?? '') } : {}),
      pinned_at: e.client_ts,
    })));
  // the same clue proved in a whole-session sitting AND a unit sitting: keep the first (story order)
  const seen = new Set<string>();
  const uniqueEvidence = evidence.filter((c) => !seen.has(c.clue_id) && seen.add(c.clue_id));

  const completed = sessions.filter((s) => s.status === 'completed').length;
  const rank = [...RANKS].reverse().find((r) => completed >= r.minSessions)!.name;
  return { sessions, units, evidence: uniqueEvidence, totalPoints: sessions.reduce((a, s) => a + s.points, 0), rank, badges: [...badges].sort() };
}

// The progress card for what a page is showing: one unit, or a whole session
export function progressOf(p: Progress | null, session: number, unit?: number | null): { status: SessionStatus; points: number; hintsUsed: number; trapsFound: number; completedAt: string | null } | null {
  if (!p) return null;
  if (unit) {
    const u = p.units.find((x) => x.unit === unit);
    return u ?? { status: 'available', points: 0, hintsUsed: 0, trapsFound: 0, completedAt: null };
  }
  return p.sessions[session - 1] ?? null;
}
