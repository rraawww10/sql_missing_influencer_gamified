import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalProgressStore } from './localProgressStore';
import { GuestAuth } from './guestAuth';
import { MemoryKV } from '../engine/runner/sitting';
import type { ProgressEvent } from '../ports/progress';

const e = (id: string, ts: string): ProgressEvent => ({ event_id: id, user_id: 'u', sitting_id: 's', verb: 'beat_viewed',
  object: { type: 'beat', id: 'b', session: 1 }, course_ref: { topic_id: 't' }, client_ts: ts });

describe('LocalProgressStore (IndexedDB)', () => {
  it('appends idempotently and lists in time order', async () => {
    const store = new LocalProgressStore('test-db-1');
    await store.append(e('2', '2026-12-01T10:00:02Z'));
    await store.append(e('1', '2026-12-01T10:00:01Z'));
    await store.append(e('1', '2026-12-01T10:00:01Z'));   // replay
    const list = await store.list('u');
    expect(list.map((x) => x.event_id)).toEqual(['1', '2']);
  });
});

describe('GuestAuth', () => {
  it('creates one guest per device and keeps it', async () => {
    const kv = new MemoryKV();
    const a = await new GuestAuth(kv, () => 'g-1').currentUser();
    const b = await new GuestAuth(kv, () => 'g-2').currentUser();
    expect(a.id).toBe('g-1');
    expect(b.id).toBe('g-1');
    expect(a).toMatchObject({ provider: 'guest', lmsUserId: null });
  });
});
