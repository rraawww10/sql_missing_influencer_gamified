import { beforeEach, describe, expect, it } from 'vitest';
import { SessionRunner, type RunnerState } from './sessionRunner';
import { MemoryKV, SittingStore } from './sitting';
import { MemoryProgressStore } from '../../adapters/memoryProgressStore';
import { deriveProgress } from '../progress/derive';
import { answerKey, builtSessions, Clock, fileLoader, nodeEngine, seqUuid } from '../../test/fixtures';
import type { GameUser } from '../../ports/auth';
import type { ActivityBeat } from '../../content/types';

const user: GameUser = { id: 'u-1', displayName: 'Intern', provider: 'guest', lmsUserId: null };
const loader = fileLoader();
const engine = await nodeEngine();

let store: MemoryProgressStore, kv: MemoryKV, sittings: SittingStore<RunnerState>, clock: Clock, uuid: () => string;
beforeEach(() => {
  store = new MemoryProgressStore();
  kv = new MemoryKV();
  sittings = new SittingStore<RunnerState>(kv);
  clock = new Clock();
  uuid = seqUuid();   // one generator per test: event ids must be unique across sittings
});
const deps = () => ({ engine, loader, store, sittings, now: clock.now, uuid });

// Plays a whole session the way a careful learner would, using the reference answers
async function playThrough(r: SessionRunner, { useHints = false } = {}) {
  const sol = await loader.solutionsFor(r.pack.session);
  for (;;) {
    const b = r.beat;
    if (b.type === 'task') {
      if (useHints) { await r.hint(1); await r.hint(2); }
      const out = await r.submitSql(sol[b.task_id].ref);
      expect(out.verdict.status, b.task_id).toBe('pass');
    } else if (b.type === 'activity') {
      expect((await r.answerActivity(answerKey(b))).correct, b.id).toBe(true);
    } else if (b.type === 'check') {
      await r.answerCheck(b.options.findIndex((o) => o.correct));
    } else if (b.type === 'clue') {
      await r.pinClue();
    } else if (b.type === 'demo') {
      const t = await r.runDemo();
      expect(t.length).toBe(b.steps.length);
    }
    clock.advance(60_000);
    if ((await r.advance()).finished) return;
  }
}

describe('SessionRunner — full sessions', () => {
  it('plays every built session to completion, in order', async () => {
    for (const n of builtSessions()) {
      const r = await SessionRunner.open(await loader.pack(n), user, deps());
      await playThrough(r);
      expect(r.completed).toBe(true);
    }
    const events = await store.list(user.id);
    const p = deriveProgress(events);
    expect(p.sessions.every((s) => s.status === 'completed')).toBe(true);
    expect(p.totalPoints).toBeGreaterThan(0);
    expect(p.badges).toContain('No-Hint Session');
    expect(p.rank).toBe('Inspector');
    // Evidence Board: every pinned clue, with the learner's own proving query
    expect(p.evidence.map((c) => c.clue_id).slice(0, 3)).toEqual(['S1-C1', 'S2-C1', 'S3-C1']);
    expect(p.evidence.at(-1)!.clue_id).toBe('S13-C1');
    const c3 = p.evidence.find((c) => c.clue_id === 'S3-C1')!;
    expect(c3.task_id).toBe('T3.8');
    expect(c3.sql).toMatch(/vehicle_colour = 'Grey' AND \(gate/);
    expect(c3.title).toBe('Grey SUV at the service gate');
    // every task event carries the course reference for LMS migration
    // (the finale, S13, has no reading material: it carries only the course topic)
    const withRm = new Set<number>();
    for (const n of builtSessions()) if ((await loader.pack(n)).reading_materials.length) withRm.add(n);
    for (const e of events.filter((x) => x.verb === 'task_passed')) {
      expect(e.course_ref.topic_id).toBeTruthy();
      if (!withRm.has(e.object.session)) continue;
      expect(e.course_ref.unit_id).toBeTruthy();
      expect(e.course_ref.learning_resource_id).toBeTruthy();
    }
    // completed sittings are cleared from the refresh store
    expect(sittings.load(user.id, 3)).toBeNull();
  });

  it('hints cost points but never block', async () => {
    const r = await SessionRunner.open(await loader.pack(3), user, deps());
    await playThrough(r, { useHints: true });
    const p = deriveProgress(await store.list(user.id));
    const s3 = p.sessions[2];
    expect(s3.status).toBe('completed');
    expect(s3.hintsUsed).toBe(2 * 11);
    expect(p.badges).not.toContain('No-Hint Session');
  });
});

describe('SessionRunner — rules', () => {
  async function openAt(session: number, beatId: string) {
    const r = await SessionRunner.open(await loader.pack(session), user, deps());
    const sol = await loader.solutionsFor(session);
    while (r.beat.id !== beatId) {
      const b = r.beat;
      if (b.type === 'task') await r.submitSql(sol[b.task_id].ref);
      else if (b.type === 'activity') await r.answerActivity(answerKey(b));
      else if (b.type === 'check') await r.answerCheck(0);
      else if (b.type === 'clue') await r.pinClue();
      await r.advance();
    }
    return r;
  }

  it('cannot move past an unsolved task', async () => {
    const r = await openAt(3, 'S3.18');
    expect(r.canAdvance()).toBe(false);
    await expect(r.advance()).rejects.toThrow(/not finished/);
  });

  it('answers a known mistake with the story reply and logs trap_hit', async () => {
    const r = await openAt(3, 'S3.18');
    const out = await r.submitSql("SELECT * FROM gate_log WHERE vehicle_colour = 'Grey' AND gate = 'SERVICE' OR gate = 'STAFF';");
    expect(out.verdict.status).toBe('trap');
    if (out.verdict.status === 'trap') expect(out.verdict.trap.reply).toMatch(/AND runs before OR/);
    expect((await store.list(user.id)).some((e) => e.verb === 'trap_hit')).toBe(true);
    const pass = await r.submitSql("SELECT * FROM gate_log WHERE vehicle_colour = 'Grey' AND (gate = 'SERVICE' OR gate = 'STAFF');");
    expect(pass.clueUnlocked).toBe('S3-C1');
    expect(r.canAdvance()).toBe(true);
  });

  it('opens hints in order; tier 1 is the exact reading-material section', async () => {
    const r = await openAt(3, 'S3.18');
    await expect(r.hint(2)).rejects.toThrow(/hint 1 first/);
    const h1 = await r.hint(1);
    expect(h1.tier === 1 && h1.markdown).toMatch(/Precedence/);
    const h3 = await r.hint(2).then(() => r.hint(3));
    expect(h3.tier === 3 && h3.sql).toMatch(/\(gate = 'SERVICE' OR gate = 'STAFF'\)/);
  });

  it('clues need their task first', async () => {
    const r = await openAt(2, 'S2.15');
    expect(r.beat.type).toBe('clue');
    await r.pinClue();
    expect(r.pinned).toContain('S2-C1');
  });

  it('reveals an activity after 3 wrong tries, then lets the learner continue', async () => {
    const r = await openAt(1, 'S1.4');
    const b = r.beat as ActivityBeat;
    const wrong = { kind: 'sort_into' as const, placement: {} };
    expect((await r.answerActivity(wrong)).revealed).toBe(false);
    await r.answerActivity(wrong);
    const third = await r.answerActivity(wrong);
    expect(third.revealed).toBe(true);
    expect(r.canAdvance()).toBe(true);
    expect(b.kind).toBe('sort_into');
  });
});

describe('SessionRunner — continue any time', () => {
  it('resumes an unfinished session even days later, at the same step', async () => {
    const d = deps();
    const r1 = await SessionRunner.open(await loader.pack(3), user, d);
    await r1.advance(); await r1.advance();
    clock.advance(5 * 24 * 60 * 60 * 1000);   // five days later
    const r2 = await SessionRunner.open(await loader.pack(3), user, d);
    expect(r2.sittingId).toBe(r1.sittingId);
    expect(r2.index).toBe(2);
    expect((await store.list(user.id)).some((e) => e.verb === 'session_resumed')).toBe(true);
    expect((await store.list(user.id)).some((e) => e.verb === 'session_abandoned')).toBe(false);
  });

  it('Reset wipes the session (saved attempt, points, clues) and logs session_reset', async () => {
    const d = deps();
    const pack = await loader.pack(3);
    const r1 = await SessionRunner.open(pack, user, d);
    await playThrough(r1);
    expect(deriveProgress(await store.list(user.id)).sessions[2].status).toBe('completed');
    clock.advance(1000);
    await SessionRunner.reset(pack, user, d);
    const p = deriveProgress(await store.list(user.id));
    expect(p.sessions[2].status).not.toBe('completed');   // locked here: S2 was never played in this test
    expect(p.sessions[2].points).toBe(0);
    expect(p.evidence.filter((c) => c.session === 3)).toHaveLength(0);
    expect(sittings.load(user.id, 3)).toBeNull();
    const r2 = await SessionRunner.open(pack, user, d);
    expect(r2.index).toBe(0);
  });

});
