// Iframe bridge: lets the page that embeds a session (e.g. the LMS) follow progress without any code
// changes on our side. Every message is { source: 'tmi', type, session, ... } and is posted to
// window.parent only when the game runs inside an iframe.
//
//   type 'ready'      the session loaded
//   type 'progress'   one progress event (same shape as the event log; see src/ports/progress.ts)
//   type 'completed'  the session was solved: { points, hints, traps }
//   type 'resize'     content height in px, so the parent can size the iframe
//   type 'restored'   reply to a 'restore' (below): how many events were added
//
// Inbound (parent → game): { source: 'tmi-host', type: 'restore', events: ProgressEvent[] }
//   replays events the parent saved from earlier 'progress' messages (another device, cleared storage).
//   Appends are idempotent by event_id, so replaying everything is always safe.
//
// Add ?parent_origin=https://lms.example.com to the iframe URL to restrict who receives messages
// (and whose 'restore' messages are accepted).
import type { ProgressEvent, ProgressStore } from '../ports/progress';

const embedded = typeof window !== 'undefined' && window.parent !== window;
const targetOrigin = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('parent_origin')) || '*';

export function postToParent(type: string, data: Record<string, unknown> = {}) {
  if (!embedded) return;
  try { window.parent.postMessage({ source: 'tmi', type, ...data }, targetOrigin); } catch { /* parent gone */ }
}

// Wraps the real store: every event is saved locally AND announced to the parent page
export class EmbedProgressStore implements ProgressStore {
  constructor(private readonly inner: ProgressStore) {}
  async append(event: ProgressEvent) {
    await this.inner.append(event);
    postToParent('progress', { session: event.object.session, event });
  }
  list(userId: string) { return this.inner.list(userId); }
}

export function listenForRestore(store: ProgressStore, userId: string) {
  if (!embedded) return;
  addEventListener('message', async (e: MessageEvent) => {
    const m = e.data;
    if (!m || m.source !== 'tmi-host' || m.type !== 'restore' || !Array.isArray(m.events)) return;
    if (targetOrigin !== '*' && e.origin !== targetOrigin) return;
    let added = 0, skipped = 0;
    for (const ev of m.events as ProgressEvent[]) {
      if (!ev || typeof ev.event_id !== 'string' || typeof ev.verb !== 'string' || !ev.object || typeof ev.client_ts !== 'string') { skipped++; continue; }
      try { await store.append({ ...ev, user_id: userId }); added++; } catch { skipped++; }   // stored under THIS page's user
    }
    try { dispatchEvent(new Event('tmi:restored')); } catch { /* ignore */ }
    postToParent('restored', { added, skipped });
  });
}

export function startResizeReports(session: number) {
  if (!embedded || typeof ResizeObserver === 'undefined') return;
  let last = 0;
  new ResizeObserver(() => {
    const h = Math.ceil(document.documentElement.scrollHeight);
    if (h !== last) { last = h; postToParent('resize', { session, height: h }); }
  }).observe(document.body);
}
