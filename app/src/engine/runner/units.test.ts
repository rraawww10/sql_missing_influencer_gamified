// Units: one deployable pack per reading material (a slice of its session). Played one after another on the
// same device they must add up to the whole case: every session completed, every clue on the Evidence Board.
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionRunner, type RunnerState } from './sessionRunner';
import { MemoryKV, SittingStore } from './sitting';
import { MemoryProgressStore } from '../../adapters/memoryProgressStore';
import { deriveProgress, progressOf } from '../progress/derive';
import { answerKey, builtSessions, builtUnits, Clock, fileLoader, nodeEngine, seqUuid } from '../../test/fixtures';
import { packScope } from '../../content/types';
import type { GameUser } from '../../ports/auth';

const user: GameUser = { id: 'u-1', displayName: 'Intern', provider: 'guest', lmsUserId: null };
const loader = fileLoader();
const engine = await nodeEngine();

let store: MemoryProgressStore, sittings: SittingStore<RunnerState>, clock: Clock, uuid: () => string;
beforeEach(() => { store = new MemoryProgressStore(); sittings = new SittingStore<RunnerState>(new MemoryKV()); clock = new Clock(); uuid = seqUuid(); });
const deps = () => ({ engine, loader, store, sittings, now: clock.now, uuid });

async function playThrough(r: SessionRunner) {
  const sol = await loader.solutionsFor(r.pack.session);
  for (;;) {
    const b = r.beat;
    if (b.type === 'task') expect((await r.submitSql(sol[b.task_id].ref)).verdict.status, b.task_id).toBe('pass');
    else if (b.type === 'activity') expect((await r.answerActivity(answerKey(b))).correct, b.id).toBe(true);
    else if (b.type === 'check') await r.answerCheck(b.options.findIndex((o) => o.correct));
    else if (b.type === 'clue') await r.pinClue();
    else if (b.type === 'demo') await r.runDemo();
    clock.advance(60_000);
    if ((await r.advance()).finished) return;
  }
}

describe('unit packs', () => {
  it('there is one unit per reading material (37) plus the finale, numbered by reading-material order', async () => {
    const index = await loader.unitIndex();
    expect(builtUnits()).toEqual(Array.from({ length: 38 }, (_, i) => i + 1));
    expect(index.map((u) => u.n)).toEqual(builtUnits());
    const notes = await loader.caseNotes();
    for (const u of index) {
      const pack = await loader.unitPack(u.n);
      expect(pack.unit?.n).toBe(u.n);
      expect(pack.session).toBe(u.session);
      if (u.finale) continue;
      expect(notes[u.unit_id].rm, `u${u.n} is RM #${u.n}`).toBe(u.n);
      expect(notes[u.unit_id].title).toBe(u.title);
    }
    // duplicate reading materials are aliases of one another: same beats, own unit_id
    const aliases = index.filter((u) => u.same_as);
    expect(aliases.map((u) => u.n)).toEqual([1, 8, 24, 27, 34]);
    for (const a of aliases) {
      const twin = index.find((u) => u.unit_id === a.same_as)!;
      expect((await loader.unitPack(a.n)).beats).toEqual((await loader.unitPack(twin.n)).beats);
    }
  });

  it('the parts of a session cover all its beats, in order, each part able to stand alone', async () => {
    const index = await loader.unitIndex();
    for (const n of builtSessions()) {
      const session = await loader.pack(n);
      const parts = index.filter((u) => u.session === n && !u.same_as).sort((a, b) => a.part - b.part);
      expect(parts.map((p) => p.part)).toEqual(parts.map((_, i) => i + 1));
      const joined = [];
      for (const p of parts) {
        const pack = await loader.unitPack(p.n);
        const own = pack.beats.filter((b) => !/^U\d+\.(open|close)$/.test(b.id));
        joined.push(...own.map((b) => b.id));
        // earlier clues of the same session are briefed, so this part makes sense on its own
        const earlier = session.beats.slice(0, session.beats.findIndex((b) => b.id === own[0].id)).filter((b) => b.type === 'clue');
        for (const c of earlier) expect(pack.previously.map((x) => x.clue_id)).toContain(c.type === 'clue' && c.clue_id);
        expect(pack.exit.required_beats.every((id) => own.some((b) => b.id === id))).toBe(true);
      }
      expect(joined).toEqual(session.beats.map((b) => b.id));
    }
  });
});

describe('playing the case as units', () => {
  it('all 38 units on one device = every session completed, every clue earned, rank Inspector', async () => {
    const index = await loader.unitIndex();
    for (const u of index) {
      if (u.same_as) continue;   // a learner on the platform opens either twin, not both
      const pack = await loader.unitPack(u.n);
      const r = await SessionRunner.open(pack, user, deps());
      await playThrough(r);
      expect(r.completed).toBe(true);
      expect(sittings.load(user.id, packScope(pack))).toBeNull();
      const p = deriveProgress(await store.list(user.id));
      expect(progressOf(p, u.session, u.n)?.status).toBe('completed');
      // the session itself turns "completed" only with its last part
      expect(p.sessions[u.session - 1].status).toBe(u.part === u.parts ? 'completed' : 'available');
      expect(p.sessions[u.session - 1].partsDone).toBe(u.part);
    }
    const events = await store.list(user.id);
    const p = deriveProgress(events);
    expect(p.sessions.every((s) => s.status === 'completed')).toBe(true);
    expect(p.units).toHaveLength(33);
    expect(p.rank).toBe('Inspector');
    expect(p.evidence.map((c) => c.clue_id).slice(0, 4)).toEqual(['S1-C1', 'S2-C1', 'S3-C1', 'S4-C1']);
    expect(p.evidence.at(-1)!.clue_id).toBe('S13-C1');
    expect(p.evidence.find((c) => c.clue_id === 'S3-C1')?.task_id).toBe('T3.8');
    expect(p.totalPoints).toBeGreaterThan(0);
    // every event says which unit it came from, and which course unit it teaches
    for (const e of events) expect(e.object.unit).toBeTypeOf('number');
    const started = events.filter((e) => e.verb === 'session_completed');
    expect(started.every((e) => typeof e.result?.unit_id === 'string' && typeof e.result?.parts === 'number')).toBe(true);
  });

  it('a unit resumes where it stopped, independently of the other parts', async () => {
    const d = deps();
    const u11 = await loader.unitPack(11), u12 = await loader.unitPack(12);
    const a = await SessionRunner.open(u11, user, d);
    await a.advance(); await a.advance();
    const b = await SessionRunner.open(u12, user, d);
    expect(b.index).toBe(0);
    expect(b.sittingId).not.toBe(a.sittingId);
    clock.advance(3 * 24 * 60 * 60 * 1000);
    const a2 = await SessionRunner.open(u11, user, d);
    expect(a2.sittingId).toBe(a.sittingId);
    expect(a2.index).toBe(2);
  });

  it('resetting one unit wipes that part only; a whole-session reset wipes all its parts', async () => {
    const d = deps();
    for (const n of [10, 11, 12]) await playThrough(await SessionRunner.open(await loader.unitPack(n), user, d));
    let p = deriveProgress(await store.list(user.id));
    expect(p.sessions[2].status).toBe('completed');
    clock.advance(1000);
    await SessionRunner.reset(await loader.unitPack(11), user, d);
    p = deriveProgress(await store.list(user.id));
    expect(p.units.map((u) => u.unit)).toEqual([10, 12]);
    expect(p.sessions[2]).toMatchObject({ status: 'available', partsDone: 2, parts: 3 });
    expect(p.evidence.some((c) => c.clue_id === 'S3-C1')).toBe(true);   // S3-C1 is earned in part 3 (u12)
    clock.advance(1000);
    await SessionRunner.reset(await loader.pack(3), user, d);          // the whole session
    p = deriveProgress(await store.list(user.id));
    expect(p.units).toHaveLength(0);
    expect(p.sessions[2].points).toBe(0);
    expect(p.evidence).toHaveLength(0);
  });

  it('a session played whole and its units played apart share one Evidence Board without duplicates', async () => {
    const d = deps();
    await playThrough(await SessionRunner.open(await loader.pack(6), user, d));
    await playThrough(await SessionRunner.open(await loader.unitPack(18), user, d));
    const p = deriveProgress(await store.list(user.id));
    expect(p.evidence.filter((c) => c.session === 6).map((c) => c.clue_id)).toEqual(['S6-C1', 'S6-C2']);
    expect(p.sessions[5].status).toBe('completed');
  });
});
