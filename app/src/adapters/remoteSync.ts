// Analytics sync: copies every progress event to the analytics server (../../analytics) so the admin dashboard can follow
// every learner, and measures ACTIVE play time with heartbeats. Switched on only when the build sets VITE_ANALYTICS_URL.
//
//   RemoteProgressStore  wraps the real store: saves locally first (the game never waits on the network), then queues the
//                        event in an outbox (localStorage) that is sent in batches. A failed send stays queued and is
//                        retried; the server ignores an event_id it already has, so a resend never double-counts.
//   startHeartbeat       every 30 s of ACTIVE time (tab visible + the learner touched, typed or scrolled in the last 60 s)
//                        queues a 'heartbeat' with the seconds played and the beat the learner was on. Heartbeats only go
//                        to the server — they are not part of the local event log, so points and progress are unchanged.
import type { ProgressEvent, ProgressStore } from '../ports/progress';

export interface RemoteEvent extends Omit<ProgressEvent, 'verb'> { verb: ProgressEvent['verb'] | 'heartbeat' }

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

const OUTBOX_KEY = 'tmi-analytics-outbox';
const OUTBOX_MAX = 5000;          // a learner offline for a whole episode stays well under this
const BATCH = 200;

export class Outbox {
  private sending = false;
  constructor(private readonly url: string, private readonly kv: KV,
              private readonly send: typeof fetch = (...a) => fetch(...a)) {}

  private read(): RemoteEvent[] {
    try { return JSON.parse(this.kv.getItem(OUTBOX_KEY) ?? '[]'); } catch { return []; }
  }
  private write(list: RemoteEvent[]) {
    try { this.kv.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_MAX))); } catch { /* storage full or blocked */ }
  }

  push(e: RemoteEvent) { this.write([...this.read(), e]); }
  size() { return this.read().length; }

  // Sends queued events in batches; on any failure the rest stay queued for the next flush
  async flush(opts: { keepalive?: boolean } = {}): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      for (;;) {
        const batch = this.read().slice(0, BATCH);
        if (!batch.length) return;
        const res = await this.send(`${this.url}/api/events`, {
          method: 'POST', headers: { 'content-type': 'text/plain' },   // text/plain: no CORS preflight
          body: JSON.stringify({ events: batch }), keepalive: opts.keepalive,
        });
        if (!res.ok) return;
        const sent = new Set(batch.map((e) => e.event_id));
        this.write(this.read().filter((e) => !sent.has(e.event_id)));
      }
    } catch { /* offline: retry later */ } finally { this.sending = false; }
  }
}

export class RemoteProgressStore implements ProgressStore {
  lastBeat: { session: number; beat: string | null; sitting_id: string; topic_id: string } | null = null;
  constructor(private readonly inner: ProgressStore, readonly outbox: Outbox) {}

  async append(event: ProgressEvent) {
    await this.inner.append(event);
    if (event.verb === 'session_started' || event.verb === 'session_resumed' || event.verb === 'session_reset')
      this.lastBeat = { session: event.object.session, beat: null, sitting_id: event.sitting_id, topic_id: event.course_ref.topic_id };
    const beat = event.object.beat ?? (event.verb === 'beat_viewed' ? event.object.id : undefined);
    if (beat) this.lastBeat = { session: event.object.session, beat, sitting_id: event.sitting_id, topic_id: event.course_ref.topic_id };
    this.outbox.push(event);
    void this.outbox.flush();
  }
  list(userId: string) { return this.inner.list(userId); }
}

export const HEARTBEAT_SECONDS = 30;
const IDLE_AFTER_MS = 60_000;
const TICK_MS = 5_000;

// Returns a stop function. `session` is 0 on the briefing page.
export function startHeartbeat(store: RemoteProgressStore, userId: string, session: number,
                               deps = { uuid: (): string => crypto.randomUUID(), now: () => Date.now(), win: window as Window, doc: document as Document }) {
  const { win, doc } = deps;
  let lastInput = deps.now(), active = 0;
  const touch = () => { lastInput = deps.now(); };
  const inputs = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;
  inputs.forEach((t) => win.addEventListener(t, touch, { passive: true, capture: true }));

  const emit = () => {
    if (active < 1) return;
    const at = store.lastBeat?.session === session || !session ? store.lastBeat : null;
    store.outbox.push({
      event_id: deps.uuid(), user_id: userId, sitting_id: at?.sitting_id ?? 'none', verb: 'heartbeat',
      object: { type: 'session', id: `S${session}`, session, ...(at?.beat ? { beat: at.beat } : {}) },
      course_ref: { topic_id: at?.topic_id ?? '' }, result: { seconds: Math.round(active) },
      client_ts: new Date(deps.now()).toISOString(),
    });
    active = 0;
  };
  const timer = win.setInterval(() => {
    if (doc.visibilityState === 'visible' && deps.now() - lastInput < IDLE_AFTER_MS) active += TICK_MS / 1000;
    if (active >= HEARTBEAT_SECONDS) { emit(); void store.outbox.flush(); }
  }, TICK_MS);
  const retry = win.setInterval(() => { if (store.outbox.size()) void store.outbox.flush(); }, 60_000);
  // Leaving or hiding the page: report the partial time and send it with keepalive so it survives the unload
  const leave = () => { if (doc.visibilityState === 'hidden') { emit(); void store.outbox.flush({ keepalive: true }); } };
  const hide = () => { emit(); void store.outbox.flush({ keepalive: true }); };
  doc.addEventListener('visibilitychange', leave);
  win.addEventListener('pagehide', hide);
  return () => {
    win.clearInterval(timer); win.clearInterval(retry);
    inputs.forEach((t) => win.removeEventListener(t, touch, { capture: true }));
    doc.removeEventListener('visibilitychange', leave);
    win.removeEventListener('pagehide', hide);
  };
}
