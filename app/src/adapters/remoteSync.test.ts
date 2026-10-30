import { describe, expect, it } from 'vitest';
import { Outbox, RemoteProgressStore, startHeartbeat, type RemoteEvent } from './remoteSync';
import { MemoryProgressStore } from './memoryProgressStore';
import type { ProgressEvent } from '../ports/progress';

class MapKV { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }

const ev = (id: string, verb: ProgressEvent['verb'] = 'beat_viewed', beat = 'S3.4'): ProgressEvent => ({
  event_id: id, user_id: 'lms:42', sitting_id: 'sit', verb,
  object: { type: 'beat', id: beat, session: 3, beat }, course_ref: { topic_id: 't3' }, client_ts: '2026-11-01T10:00:00Z' });

function fakeServer(ok = () => true) {
  const got: RemoteEvent[] = [];
  const send = (async (_url: string, init: RequestInit) => {
    if (!ok()) return new Response('', { status: 503 });
    got.push(...JSON.parse(init.body as string).events);
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  return { got, send };
}

describe('Outbox', () => {
  it('sends queued events and empties the queue', async () => {
    const srv = fakeServer();
    const box = new Outbox('https://a.test', new MapKV(), srv.send);
    box.push(ev('1')); box.push(ev('2'));
    await box.flush();
    expect(srv.got.map((e) => e.event_id)).toEqual(['1', '2']);
    expect(box.size()).toBe(0);
  });

  it('keeps events when the server fails and resends them later', async () => {
    let up = false;
    const srv = fakeServer(() => up);
    const box = new Outbox('https://a.test', new MapKV(), srv.send);
    box.push(ev('1'));
    await box.flush();
    expect(box.size()).toBe(1);
    up = true;
    await box.flush();
    expect(srv.got.map((e) => e.event_id)).toEqual(['1']);
    expect(box.size()).toBe(0);
  });
});

describe('RemoteProgressStore', () => {
  it('saves locally, queues for the server and remembers the current beat', async () => {
    const local = new MemoryProgressStore();
    const srv = fakeServer();
    const store = new RemoteProgressStore(local, new Outbox('https://a.test', new MapKV(), srv.send));
    await store.append(ev('1', 'task_passed', 'S3.7'));
    expect((await local.list('lms:42')).length).toBe(1);
    expect(store.lastBeat).toMatchObject({ session: 3, beat: 'S3.7' });
    await store.outbox.flush();
    expect(srv.got.length).toBe(1);
  });
});

describe('startHeartbeat', () => {
  function env() {
    const l = new Map<string, Set<() => void>>();
    const timers: (() => void)[] = [];
    const target = {
      addEventListener: (t: string, f: () => void) => { if (!l.has(t)) l.set(t, new Set()); l.get(t)!.add(f); },
      removeEventListener: (t: string, f: () => void) => l.get(t)?.delete(f),
    };
    const win = { ...target, setInterval: (f: () => void) => timers.push(f), clearInterval: () => {} } as unknown as Window;
    const doc = { ...target, visibilityState: 'visible' } as unknown as Document & { visibilityState: string };
    return { win, doc, fire: (t: string) => l.get(t)?.forEach((f) => f()), tick: () => timers[0]() };
  }

  it('counts only active time and reports it with the current beat', async () => {
    const e = env();
    let now = 0, n = 0;
    const box = new Outbox('https://a.test', new MapKV(), fakeServer(() => false).send);
    const store = new RemoteProgressStore(new MemoryProgressStore(), box);
    await store.append(ev('1', 'beat_viewed', 'S3.2'));
    startHeartbeat(store, 'lms:42', 3, { uuid: () => `hb${++n}`, now: () => now, win: e.win, doc: e.doc });
    for (let i = 0; i < 6; i++) { now += 5000; e.tick(); }          // 30 s, learner touched at t=0 → active
    now += 120_000; for (let i = 0; i < 6; i++) { now += 5000; e.tick(); }   // idle: nothing counted
    const queued = (box as unknown as { read(): RemoteEvent[] }).read().filter((x) => x.verb === 'heartbeat');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ result: { seconds: 30 }, object: { session: 3, beat: 'S3.2' } });
  });

  it('flushes partial time when the tab is hidden', async () => {
    const e = env();
    let now = 0;
    const box = new Outbox('https://a.test', new MapKV(), fakeServer(() => false).send);
    const store = new RemoteProgressStore(new MemoryProgressStore(), box);
    startHeartbeat(store, 'lms:42', 3, { uuid: () => 'hb', now: () => now, win: e.win, doc: e.doc });
    now += 5000; e.tick(); now += 5000; e.tick();
    e.doc.visibilityState = 'hidden'; e.fire('visibilitychange');
    const queued = (box as unknown as { read(): RemoteEvent[] }).read();
    expect(queued[0]).toMatchObject({ verb: 'heartbeat', result: { seconds: 10 } });
  });
});
