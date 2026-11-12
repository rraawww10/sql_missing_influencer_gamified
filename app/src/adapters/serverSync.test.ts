import { describe, expect, it } from 'vitest';
import { Mailbox, SyncedSittingKV, restoreFromServer, feedbackKey } from './serverSync';
import { IdentityAuth, normalizeId, normalizeName, personalize, setCurrentIdentity } from './identity';
import { MemoryProgressStore } from './memoryProgressStore';
import { GuestAuth } from './guestAuth';
import { deriveProgress } from '../engine/progress/derive';
import type { ProgressEvent } from '../ports/progress';

class MapKV {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('identity', () => {
  it('normalises the NxtWave ID and the name like the server does', () => {
    expect(normalizeId(' nw1001 ')).toBe('NW1001');
    expect(normalizeId('ab')).toBeNull();
    expect(normalizeId('a b c')).toBeNull();
    expect(normalizeName('  Priya   Sharma ')).toBe('Priya Sharma');
    expect(normalizeName('<script>')).toBeNull();
    expect(normalizeName('A')).toBeNull();
  });
  it('the start screen identity becomes the user id lms:<ID>; the name replaces [[name]] and {you}', async () => {
    const kv = new MapKV();
    kv.setItem('tmi.identity.v1', JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', at: 'x' }));
    const u = await new IdentityAuth(new GuestAuth(kv, () => 'guest'), kv).currentUser();
    expect(u).toEqual({ id: 'lms:NW1001', displayName: 'Priya Sharma', provider: 'lms', lmsUserId: 'NW1001' });
    setCurrentIdentity({ id: 'NW1001', name: 'Priya Sharma', at: 'x' });
    expect(personalize('Welcome, [[name]]. Shabash, {you}!')).toBe('Welcome, Priya. Shabash, Priya!');
    setCurrentIdentity(null);
    expect(personalize('Hi {you}')).toBe('Hi partner');
  });
});

describe('Mailbox', () => {
  it('keeps items when offline or on 5xx, sends them later, and drops a rejected (4xx) item', async () => {
    let mode: 'down' | 'ok' | 'bad' = 'down';
    const got: string[] = [];
    const send = (async (url: string) => {
      if (mode === 'down') throw new Error('offline');
      if (mode === 'bad') return json({ error: 'x' }, 400);
      got.push(url); return json({ ok: true });
    }) as unknown as typeof fetch;
    const box = new Mailbox('https://a.test', new MapKV(), send);
    box.push('/api/feedback', { a: 1 });
    await box.flush();
    expect(box.size()).toBe(1);
    mode = 'ok'; await box.flush();
    expect(got).toEqual(['https://a.test/api/feedback']);
    expect(box.size()).toBe(0);
    mode = 'bad'; box.push('/api/checkpoint', { b: 1 });
    await box.flush(); await box.flush();
    expect(box.size()).toBe(0);
  });
  it('items with the same key replace each other (only the newest sitting is sent)', () => {
    const box = new Mailbox('https://a.test', new MapKV(), (async () => json({})) as unknown as typeof fetch);
    box.push('/api/sitting', { v: 1 }, 'k'); box.push('/api/sitting', { v: 2 }, 'k');
    expect(box.size()).toBe(1);
  });
});

describe('SyncedSittingKV', () => {
  it('mirrors sitting saves and clears of an identified student, nothing else', () => {
    const base = new MapKV(), mkv = new MapKV();
    const box = new Mailbox('https://a.test', mkv, (async () => json({})) as unknown as typeof fetch);
    const kv = new SyncedSittingKV(base, box);
    kv.setItem('tmi.sitting.v1.lms:NW.1.s3.u11', JSON.stringify({ savedAt: 5, state: {} }));
    kv.setItem('tmi.sitting.v1.guest-uuid.s3', '{}');
    kv.setItem('other', 'x');
    const items = JSON.parse(mkv.getItem('tmi-analytics-mailbox')!);
    expect(items).toHaveLength(1);
    expect(items[0].body).toMatchObject({ op: 'save', user_id: 'lms:NW.1', scope: 's3.u11', saved_at: 5 });
    expect(base.getItem('other')).toBe('x');
    kv.removeItem('tmi.sitting.v1.lms:NW.1.s3.u11');
    const after = JSON.parse(mkv.getItem('tmi-analytics-mailbox')!);
    expect(after).toHaveLength(1);
    expect(after[0].body.op).toBe('clear');
  });
});

describe('restoreFromServer', () => {
  const evs = (sitting: string): ProgressEvent[] => [
    { event_id: `${sitting}-a`, user_id: 'lms:NW1', sitting_id: sitting, verb: 'session_started', object: { type: 'session', id: 'S1', session: 1 }, course_ref: { topic_id: 't' }, client_ts: '2026-11-01T10:00:00Z' },
    { event_id: `${sitting}-b`, user_id: 'lms:NW1', sitting_id: sitting, verb: 'clue_pinned', object: { type: 'clue', id: 'S1-C1', session: 1, beat: 'S1.9' }, course_ref: { topic_id: 't' }, result: { title: 'x', body: 'y' }, client_ts: '2026-11-01T10:05:00Z' },
    { event_id: `${sitting}-c`, user_id: 'lms:NW1', sitting_id: sitting, verb: 'session_completed', object: { type: 'session', id: 'S1', session: 1 }, course_ref: { topic_id: 't' }, result: { points: 2 }, client_ts: '2026-11-01T10:06:00Z' },
  ];
  it('a returning student on a new device gets their episodes, clues, newer sittings and feedback marks back', async () => {
    const local = new MemoryProgressStore(), kv = new MapKV();
    kv.setItem('tmi.sitting.v1.lms:NW1.s1', JSON.stringify({ savedAt: 1, state: { sittingId: 'A', startedAt: '2026-11-01T09:00:00Z' } }));   // stale: A finished elsewhere
    kv.setItem('tmi.sitting.v1.lms:NW1.s2', JSON.stringify({ savedAt: 10, state: { sittingId: 'B2' } }));
    const send = (async (url: string) => {
      expect(url).toBe('https://a.test/api/history/NW1');
      return json({ student_id: 'NW1', name: 'Asha', events: evs('A'), feedback: [1], checkpoints: [],
        sittings: [{ scope: 's2', saved_at: 99, value: JSON.stringify({ savedAt: 99, state: { sittingId: 'B2', index: 4 } }) }] });
    }) as unknown as typeof fetch;
    const r = await restoreFromServer('https://a.test', 'NW1', local, kv, { send });
    expect(r).toEqual({ ok: true, events: 3, sittings: 1, name: 'Asha' });
    const p = deriveProgress(await local.list('lms:NW1'));
    expect(p.sessions[0].status).toBe('completed');
    expect(p.evidence.map((c) => c.clue_id)).toEqual(['S1-C1']);
    expect(JSON.parse(kv.getItem('tmi.sitting.v1.lms:NW1.s2')!).state.index).toBe(4);
    expect(kv.getItem('tmi.sitting.v1.lms:NW1.s1')).toBeNull();
    expect(kv.getItem(feedbackKey('lms:NW1', 1))).toBe('server');
    // running it again adds nothing (idempotent)
    expect((await restoreFromServer('https://a.test', 'NW1', local, kv, { send })).events).toBe(0);
  });
  it('offline or a server error: nothing changes and the game still opens', async () => {
    const local = new MemoryProgressStore();
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await restoreFromServer('https://a.test', 'NW1', local, new MapKV(), { send: down })).toEqual({ ok: false, events: 0, sittings: 0, name: null });
    const err = (async () => json({}, 500)) as unknown as typeof fetch;
    expect((await restoreFromServer('https://a.test', 'NW1', local, new MapKV(), { send: err })).ok).toBe(false);
  });
});
