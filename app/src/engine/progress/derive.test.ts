import { describe, expect, it } from 'vitest';
import { deriveProgress, sittingPoints, POINTS } from './derive';
import type { ProgressEvent, Verb } from '../../ports/progress';

let n = 0;
const ev = (sitting: string, session: number, verb: Verb, result?: Record<string, unknown>): ProgressEvent => ({
  event_id: `e${++n}`, user_id: 'u', sitting_id: sitting, verb, object: { type: 'task', id: 'x', session },
  course_ref: { topic_id: 't' }, result, client_ts: `2026-12-01T10:00:${String(n % 60).padStart(2, '0')}Z`,
});

describe('deriveProgress', () => {
  it('scores tasks: first-try bonus, hint penalties, minimum', () => {
    expect(sittingPoints([ev('a', 1, 'task_passed', { attempts: 1, max_hint_tier: 0 })])).toBe(POINTS.taskPassed + POINTS.firstTryBonus);
    expect(sittingPoints([ev('a', 1, 'task_passed', { attempts: 4, max_hint_tier: 2 })])).toBe(POINTS.taskPassed - 4);
    expect(sittingPoints([ev('a', 1, 'task_passed', { attempts: 9, max_hint_tier: 3 })])).toBe(POINTS.taskMinimum);
  });

  it('counts only completed sittings, best one per session', () => {
    const events = [
      ev('a', 1, 'task_passed', { attempts: 1, max_hint_tier: 0 }),          // abandoned sitting
      ev('b', 1, 'task_passed', { attempts: 3, max_hint_tier: 1 }), ev('b', 1, 'session_completed'),
      ev('c', 1, 'task_passed', { attempts: 1, max_hint_tier: 0 }), ev('c', 1, 'session_completed'),
    ];
    const p = deriveProgress(events);
    expect(p.sessions[0].points).toBe(POINTS.taskPassed + POINTS.firstTryBonus);
    expect(p.totalPoints).toBe(13);
    expect(p.sessions[1].status).toBe('available');
  });

  it('a reset wipes that session only, and only what came before it', () => {
    const at = (sitting: string, session: number, verb: Verb, ts: string, result?: Record<string, unknown>): ProgressEvent =>
      ({ ...ev(sitting, session, verb, result), client_ts: ts });
    const p = deriveProgress([
      at('a', 1, 'task_passed', '2026-12-01T10:00:00Z', { attempts: 1, max_hint_tier: 0 }), at('a', 1, 'session_completed', '2026-12-01T10:01:00Z'),
      at('b', 2, 'task_passed', '2026-12-01T10:02:00Z', { attempts: 1, max_hint_tier: 0 }), at('b', 2, 'session_completed', '2026-12-01T10:03:00Z'),
      at('r', 1, 'session_reset', '2026-12-01T11:00:00Z'),
    ]);
    expect(p.sessions[0]).toMatchObject({ status: 'available', points: 0 });
    expect(p.sessions[1]).toMatchObject({ status: 'completed', points: 13 });
    const replay = deriveProgress([at('r', 1, 'session_reset', '2026-12-01T11:00:00Z'),
      at('c', 1, 'task_passed', '2026-12-01T11:05:00Z', { attempts: 2, max_hint_tier: 0 }), at('c', 1, 'session_completed', '2026-12-01T11:06:00Z')]);
    expect(replay.sessions[0]).toMatchObject({ status: 'completed', points: 10 });
  });

  it('units: a session completes when all its parts are done; points add up; a unit reset wipes one part', () => {
    const u = (sitting: string, unit: number, _part: number, verb: Verb, ts: string, result?: Record<string, unknown>): ProgressEvent =>
      ({ ...ev(sitting, 3, verb, result), object: { type: 'task', id: 'x', session: 3, unit }, client_ts: ts });
    const done = (unit: number, part: number, ts: string) => u(`u${unit}`, unit, part, 'session_completed', ts, { unit, part, parts: 3, unit_id: 'x' });
    const two = [
      u('u10', 10, 1, 'task_passed', '2026-12-01T10:00:00Z', { attempts: 1, max_hint_tier: 0 }), done(10, 1, '2026-12-01T10:01:00Z'),
      u('u11', 11, 2, 'task_passed', '2026-12-01T10:02:00Z', { attempts: 2, max_hint_tier: 0 }), done(11, 2, '2026-12-01T10:03:00Z'),
    ];
    let p = deriveProgress(two);
    expect(p.sessions[2]).toMatchObject({ status: 'available', points: 23, partsDone: 2, parts: 3 });
    expect(p.units.map((x) => x.unit)).toEqual([10, 11]);
    p = deriveProgress([...two, u('u12', 12, 3, 'clue_pinned', '2026-12-01T10:04:00Z', { title: 'c', body: 'b' }), done(12, 3, '2026-12-01T10:05:00Z')]);
    expect(p.sessions[2]).toMatchObject({ status: 'completed', points: 25, partsDone: 3 });
    expect(p.evidence.map((c) => c.clue_id)).toEqual(['x']);
    expect(p.sessions[3].status).toBe('available');
    // reset of one unit
    p = deriveProgress([...two, done(12, 3, '2026-12-01T10:05:00Z'), { ...u('r', 11, 2, 'session_reset', '2026-12-01T11:00:00Z'), object: { type: 'session', id: 'S3', session: 3, unit: 11 } }]);
    expect(p.units.map((x) => x.unit)).toEqual([10, 12]);
    expect(p.sessions[2]).toMatchObject({ status: 'available', partsDone: 2 });
    // a whole-session sitting also counts, and never double-counts the parts
    p = deriveProgress([...two, ev('whole', 3, 'task_passed', { attempts: 1, max_hint_tier: 0 }), ev('whole', 3, 'session_completed')]);
    expect(p.sessions[2]).toMatchObject({ status: 'completed', points: 13, partsDone: 2 });
  });

  it('ranks by completed sessions', () => {
    const events = [1, 2, 3, 4].map((s) => ev(`s${s}`, s, 'session_completed'));
    expect(deriveProgress(events).rank).toBe('Constable');
  });
});
