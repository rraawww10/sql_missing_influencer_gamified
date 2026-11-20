// Everything except progress events that the game sends to the analytics server (../../analytics), and the way back:
//
//   Mailbox            a small persistent queue (localStorage) of JSON posts: identify, feedback, chapter check-ins,
//                      sitting saves. A failed send stays queued and is retried; items with the same `key` replace each
//                      other (only the newest sitting copy is worth sending). Never blocks the game.
//   SyncedSittingKV    the storage the SittingStore writes to: localStorage as before, plus a copy of every save / clear
//                      for an identified student, so an unfinished episode continues on another device.
//   restoreFromServer  a returning student: pulls their history (POST /api/history, with their token) into this device - events into the
//                      local log (idempotent by event_id), unfinished sittings when the server's copy is newer, and the
//                      "feedback already given" marks - so progress, points, clues and feedback state carry over.
//   recoverByEmail     "Forgot your NxtWave ID?": asks the server which student signed up with this email
//                      (POST /api/recover); the start screen shows the ID, and the student logs in with their password.
// Everything sent carries the logged-in student's token (session.ts); a "login required" answer keeps the item queued.
import type { ProgressEvent, ProgressStore } from '../ports/progress';
import { normalizeId, normalizeName } from './identity';
import { sessionLost, sessionToken, withToken } from './session';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
interface Item { path: string; body: unknown; key?: string; tries?: number; token?: string }   // token: the student logged in when it was queued

const MAILBOX_KEY = 'tmi-analytics-mailbox';
const MAX_ITEMS = 300;
const MAX_TRIES_ON_REJECT = 1;   // a 4xx means the server will never accept it: drop instead of retrying forever

export class Mailbox {
  private sending = false;
  private again = false;   // a flush asked for while one is running: run once more right after it (2026-11-20 fix: feedback waited a minute, or was lost when the tab closed)
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(readonly url: string, private readonly kv: Pick<KV, 'getItem' | 'setItem'>,
              private readonly send: typeof fetch = (...a) => fetch(...a)) {}

  private read(): Item[] { try { return JSON.parse(this.kv.getItem(MAILBOX_KEY) ?? '[]'); } catch { return []; } }
  private write(list: Item[]) { try { this.kv.setItem(MAILBOX_KEY, JSON.stringify(list.slice(-MAX_ITEMS))); } catch { /* full or blocked */ } }
  size() { return this.read().length; }

  push(path: string, body: unknown, key?: string) {
    const list = key ? this.read().filter((x) => x.key !== key) : this.read();
    const token = sessionToken();   // sent with the token of the student who queued it, even if someone else logs in on this browser later
    this.write([...list, { path, body, ...(key ? { key } : {}), ...(token ? { token } : {}) }]);
  }
  // send soon (several pushes in a row become one flush)
  later(ms = 3000) {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, ms);
  }

  async flush(opts: { keepalive?: boolean } = {}): Promise<void> {
    if (this.sending) { this.again = true; return; }
    this.sending = true;
    this.again = false;
    try {
      for (const item of this.read()) {
        let res: Response;
        try {
          res = await this.send(`${this.url}${item.path}`, { method: 'POST', headers: { 'content-type': 'text/plain' },   // no CORS preflight
            body: JSON.stringify(item.token ? { ...(item.body as object), token: item.token } : withToken(item.body as object)), keepalive: opts.keepalive && JSON.stringify(item.body).length < 60_000 });
        } catch { return; }                                   // offline: keep everything, retry later
        if (res.status >= 500 || res.status === 429) return;  // server trouble: retry later
        if (res.status === 401) {
          // queued by another student on this browser whose session has ended: it can never be sent, drop it and go on
          if (item.token && sessionToken() && item.token !== sessionToken()) { this.write(this.read().filter((x) => !(x.path === item.path && JSON.stringify(x.body) === JSON.stringify(item.body)))); continue; }
          sessionLost(); return;                              // not logged in any more: keep it for after the next log-in
        }
        const same = (x: Item) => x.path === item.path && JSON.stringify(x.body) === JSON.stringify(item.body);
        if (res.ok || (item.tries ?? 0) + 1 > MAX_TRIES_ON_REJECT) this.write(this.read().filter((x) => !same(x)));
        else this.write(this.read().map((x) => (same(x) ? { ...x, tries: (x.tries ?? 0) + 1 } : x)));
      }
    } finally {
      this.sending = false;
      if (this.again && this.read().length) void this.flush(opts);
    }
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
export interface RestoreResult { ok: boolean; events: number; sittings: number; name: string | null; unauthorized?: boolean }   // unauthorized: log in again

export const feedbackKey = (user: string, s: number) => `tmi.feedback.v1.${user}.s${s}`;
export const checkpointKey = (user: string, s: number, c: number) => `tmi.checkpoint.v1.${user}.s${s}.c${c}`;

export async function restoreFromServer(url: string, nxtwaveId: string, local: ProgressStore, kv: KV,
                                        opts: { timeoutMs?: number; send?: typeof fetch } = {}): Promise<RestoreResult> {
  const user = `lms:${nxtwaveId}`;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000) : null;
  let h: History;
  try {
    const res = await (opts.send ?? fetch)(`${url}/api/history`, { method: 'POST', headers: { 'content-type': 'text/plain' },   // no CORS preflight
      body: JSON.stringify({ student_id: nxtwaveId, ...(sessionToken() ? { token: sessionToken() } : {}) }), signal: ctrl?.signal, cache: 'no-store' });
    if (res.status === 401) return { ok: false, events: 0, sittings: 0, name: null, unauthorized: true };
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

// found = the student to sign in as · none = no student has this email · wait = too many tries (429) · error = offline / server trouble
export type RecoverResult = { k: 'found'; id: string; name: string } | { k: 'none' } | { k: 'wait' } | { k: 'error' };

export async function recoverByEmail(url: string, email: string, opts: { timeoutMs?: number; send?: typeof fetch } = {}): Promise<RecoverResult> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000) : null;
  try {
    const res = await (opts.send ?? fetch)(`${url}/api/recover`, { method: 'POST', headers: { 'content-type': 'text/plain' },   // no CORS preflight
      body: JSON.stringify({ email }), signal: ctrl?.signal });
    if (res.status === 429) return { k: 'wait' };
    if (!res.ok) return { k: 'error' };
    const r = await res.json() as { found?: boolean; student_id?: unknown; name?: unknown };
    if (!r.found) return { k: 'none' };
    const id = typeof r.student_id === 'string' ? normalizeId(r.student_id) : null;
    const name = typeof r.name === 'string' ? normalizeName(r.name) : null;
    return id && name ? { k: 'found', id, name } : { k: 'error' };
  } catch { return { k: 'error' }; } finally { if (t) clearTimeout(t); }
}

// One mailbox per page, set by main.tsx when the build names an analytics server (null = nothing is sent)
let shared: Mailbox | null = null;
export const setMailbox = (m: Mailbox | null) => { shared = m; };
export const mailbox = () => shared;
