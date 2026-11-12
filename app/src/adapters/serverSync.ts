// Everything except progress events that the game sends to the analytics server (../../analytics), and the way back:
//
//   Mailbox            a small persistent queue (localStorage) of JSON posts: identify, feedback, chapter check-ins,
//                      sitting saves. A failed send stays queued and is retried; items with the same `key` replace each
//                      other (only the newest sitting copy is worth sending). Never blocks the game.
//   SyncedSittingKV    the storage the SittingStore writes to: localStorage as before, plus a copy of every save / clear
//                      for an identified student, so an unfinished episode continues on another device.
//   restoreFromServer  a returning student: pulls their history (GET /api/history/:id) into this device - events into the
//                      local log (idempotent by event_id), unfinished sittings when the server's copy is newer, and the
//                      "feedback already given" marks - so progress, points, clues and feedback state carry over.
import type { ProgressEvent, ProgressStore } from '../ports/progress';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
interface Item { path: string; body: unknown; key?: string; tries?: number }

const MAILBOX_KEY = 'tmi-analytics-mailbox';
const MAX_ITEMS = 300;
const MAX_TRIES_ON_REJECT = 1;   // a 4xx means the server will never accept it: drop instead of retrying forever

export class Mailbox {
  private sending = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(readonly url: string, private readonly kv: Pick<KV, 'getItem' | 'setItem'>,
              private readonly send: typeof fetch = (...a) => fetch(...a)) {}

  private read(): Item[] { try { return JSON.parse(this.kv.getItem(MAILBOX_KEY) ?? '[]'); } catch { return []; } }
  private write(list: Item[]) { try { this.kv.setItem(MAILBOX_KEY, JSON.stringify(list.slice(-MAX_ITEMS))); } catch { /* full or blocked */ } }
  size() { return this.read().length; }

  push(path: string, body: unknown, key?: string) {
    const list = key ? this.read().filter((x) => x.key !== key) : this.read();
    this.write([...list, { path, body, ...(key ? { key } : {}) }]);
  }
  // send soon (several pushes in a row become one flush)
  later(ms = 3000) {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, ms);
  }

  async flush(opts: { keepalive?: boolean } = {}): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      for (const item of this.read()) {
        let res: Response;
        try {
          res = await this.send(`${this.url}${item.path}`, { method: 'POST', headers: { 'content-type': 'text/plain' },   // no CORS preflight
            body: JSON.stringify(item.body), keepalive: opts.keepalive && JSON.stringify(item.body).length < 60_000 });
        } catch { return; }                                   // offline: keep everything, retry later
        if (res.status >= 500 || res.status === 429) return;  // server trouble: retry later
        const same = (x: Item) => x.path === item.path && JSON.stringify(x.body) === JSON.stringify(item.body);
        if (res.ok || (item.tries ?? 0) + 1 > MAX_TRIES_ON_REJECT) this.write(this.read().filter((x) => !same(x)));
        else this.write(this.read().map((x) => (same(x) ? { ...x, tries: (x.tries ?? 0) + 1 } : x)));
      }
    } finally { this.sending = false; }
  }
}

// tmi.sitting.v1.<userId>.<scope>, scope = s3 or s3.u11 (engine/runner/sitting.ts)
const SITTING_RE = /^tmi\.sitting\.v1\.lms:(.+)\.(s\d{1,2}(?:\.u\d{1,2})?)$/;

export class SyncedSittingKV implements KV {
  constructor(private readonly base: KV, private readonly mailbox: Mailbox) {}
  getItem(k: string) { return this.base.getItem(k); }
  setItem(k: string, v: string) {
    this.base.setItem(k, v);
    const m = SITTING_RE.exec(k);
    if (!m) return;
    let savedAt = Date.now();
    try { savedAt = Number(JSON.parse(v).savedAt) || savedAt; } catch { /* keep now */ }
    this.mailbox.push('/api/sitting', { op: 'save', user_id: `lms:${m[1]}`, scope: m[2], saved_at: savedAt, value: v }, `sitting:${m[1]}:${m[2]}`);
    this.mailbox.later();
  }
  removeItem(k: string) {
    this.base.removeItem(k);
    const m = SITTING_RE.exec(k);
    if (!m) return;
    this.mailbox.push('/api/sitting', { op: 'clear', user_id: `lms:${m[1]}`, scope: m[2], saved_at: Date.now() }, `sitting:${m[1]}:${m[2]}`);
    this.mailbox.later();
  }
}

export interface History {
  student_id: string; name: string | null; events: ProgressEvent[];
  feedback: number[]; checkpoints: { session: number; chapter: number }[];
  sittings: { scope: string; saved_at: number; value: string }[];
}
export interface RestoreResult { ok: boolean; events: number; sittings: number; name: string | null }

export const feedbackKey = (user: string, s: number) => `tmi.feedback.v1.${user}.s${s}`;
export const checkpointKey = (user: string, s: number, c: number) => `tmi.checkpoint.v1.${user}.s${s}.c${c}`;

export async function restoreFromServer(url: string, nxtwaveId: string, local: ProgressStore, kv: KV,
                                        opts: { timeoutMs?: number; send?: typeof fetch } = {}): Promise<RestoreResult> {
  const user = `lms:${nxtwaveId}`;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000) : null;
  let h: History;
  try {
    const res = await (opts.send ?? fetch)(`${url}/api/history/${encodeURIComponent(nxtwaveId)}`, { signal: ctrl?.signal, cache: 'no-store' });
    if (!res.ok) return { ok: false, events: 0, sittings: 0, name: null };
    h = await res.json() as History;
  } catch { return { ok: false, events: 0, sittings: 0, name: null }; } finally { if (t) clearTimeout(t); }

  const have = new Set((await local.list(user)).map((e) => e.event_id));
  let events = 0;
  for (const e of h.events ?? []) {
    if (!e || typeof e.event_id !== 'string' || have.has(e.event_id)) continue;
    await local.append({ ...e, user_id: user });   // the LOCAL store: nothing goes back out to the server
    events++;
  }
  let sittings = 0;
  for (const s of h.sittings ?? []) {
    const key = `tmi.sitting.v1.${user}.${s.scope}`;
    let mine = 0;
    try { mine = Number(JSON.parse(kv.getItem(key) ?? 'null')?.savedAt) || 0; } catch { /* corrupt: take the server's */ }
    if (s.saved_at > mine) { try { kv.setItem(key, s.value); sittings++; } catch { /* storage full */ } }
  }
  // An unfinished sitting left on THIS device is stale when another device finished that attempt or reset the episode since
  const all = await local.list(user);
  const finished = new Set(all.filter((e) => e.verb === 'session_completed').map((e) => e.sitting_id));
  for (let n = 1; n <= 13; n++) {
    const key = `tmi.sitting.v1.${user}.s${n}`;
    try {
      const saved = JSON.parse(kv.getItem(key) ?? 'null') as { state?: { sittingId?: string; startedAt?: string } } | null;
      if (!saved?.state) continue;
      const resetAfter = all.some((e) => e.verb === 'session_reset' && e.object.session === n && !e.object.unit
        && e.sitting_id !== saved.state!.sittingId && e.client_ts > (saved.state!.startedAt ?? ''));
      if (finished.has(saved.state.sittingId ?? '') || resetAfter) kv.removeItem(key);
    } catch { /* leave it */ }
  }
  for (const n of h.feedback ?? []) try { if (!kv.getItem(feedbackKey(user, n))) kv.setItem(feedbackKey(user, n), 'server'); } catch { /* ignore */ }
  for (const c of h.checkpoints ?? []) try { kv.setItem(checkpointKey(user, c.session, c.chapter), 'server'); } catch { /* ignore */ }
  return { ok: true, events, sittings, name: h.name };
}

// One mailbox per page, set by main.tsx when the build names an analytics server (null = nothing is sent)
let shared: Mailbox | null = null;
export const setMailbox = (m: Mailbox | null) => { shared = m; };
export const mailbox = () => shared;
