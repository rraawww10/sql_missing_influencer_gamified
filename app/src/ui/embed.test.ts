// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MemoryProgressStore } from '../adapters/memoryProgressStore';
import type { ProgressEvent } from '../ports/progress';

const ev = (id: string): ProgressEvent => ({ event_id: id, user_id: 'other-device', sitting_id: 's', verb: 'task_passed',
  object: { type: 'task', id: 'T3.1', session: 3, unit: 10 }, course_ref: { topic_id: 't' }, client_ts: '2026-12-01T10:00:00Z' });

describe('restore from the embedding page', () => {
  it('replays events idempotently under this page\'s user and answers "restored"', async () => {
    // pretend we're inside an iframe
    const parent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { value: parent, configurable: true });
    const { listenForRestore } = await import('./embed');
    const store = new MemoryProgressStore();
    listenForRestore(store, 'lms:stu-42');
    const restored = new Promise<void>((r) => addEventListener('tmi:restored', () => r(), { once: true }));
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'tmi-host', type: 'restore', events: [ev('e1'), ev('e2'), ev('e1'), { bad: true }] }, origin: 'https://lms' }));
    await restored;
    const list = await store.list('lms:stu-42');
    expect(list.map((e) => e.event_id).sort()).toEqual(['e1', 'e2']);
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ source: 'tmi', type: 'restored', added: 3, skipped: 1 }), '*');
    // messages that are not ours are ignored
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'someone', type: 'restore', events: [ev('e9')] } }));
    await new Promise((r) => setTimeout(r, 10));
    expect((await store.list('lms:stu-42')).length).toBe(2);
  });
});
