import { afterEach, describe, expect, it } from 'vitest';
import { Mailbox, SyncedSittingKV, recoverByEmail, restoreFromServer, feedbackKey } from './serverSync';
import { IdentityAuth, loadIdentity, loadSavedIdentity, normalizeEmail, normalizeId, normalizeName, personalize, saveIdentity, setCurrentIdentity } from './identity';
import { MemoryProgressStore } from './memoryProgressStore';
import { Outbox } from './remoteSync';
import { accountApi } from './account';
import { onSessionLost, sessionToken, setSessionToken } from './session';
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
const TOKEN = 'b'.repeat(64);
afterEach(() => { setSessionToken(null); onSessionLost(() => {}); });   // the session is module state: every test starts logged out

describe('identity', () => {
  it('normalises the NxtWave ID and the name like the server does', () => {
    expect(normalizeId(' nw1001 ')).toBe('NW1001');
    expect(normalizeId('ab')).toBeNull();
    expect(normalizeId('a b c')).toBeNull();
    expect(normalizeName('  Priya   Sharma ')).toBe('Priya Sharma');
    expect(normalizeName('<script>')).toBeNull();
    expect(normalizeName('A')).toBeNull();
  });
  it('normalises the email (trimmed, lower-case) and rejects what is not something@domain.tld', () => {
    expect(normalizeEmail('  Priya.Sharma+sql@Gmail.COM ')).toBe('priya.sharma+sql@gmail.com');
    expect(normalizeEmail('asha@mail.college.ac.in')).toBe('asha@mail.college.ac.in');
    for (const bad of ['', 'priya', 'priya@', '@gmail.com', 'priya@gmail', 'priya@gmail.', 'priya@.com', 'priya@gmail..com', 'priya@gmail.c',
      'pri ya@gmail.com', 'priya@gm ail.com', 'priya@@gmail.com', 'a@b@c.com', `${'x'.repeat(112)}@gmail.com`]) expect(normalizeEmail(bad), bad).toBeNull();
    expect(normalizeEmail(`${'x'.repeat(110)}@gmail.com`)).toHaveLength(120);   // 120 characters is the most
  });
  it('an identity saved before the email was asked is incomplete: name and ID are kept, nobody is signed in yet', async () => {
    const kv = new MapKV();
    kv.setItem('tmi.identity.v1', JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', at: 'x' }));
    expect(loadSavedIdentity(kv)).toEqual({ id: 'NW1001', name: 'Priya Sharma', email: null, at: 'x' });
    expect(loadIdentity(kv)).toBeNull();
    expect((await new IdentityAuth(new GuestAuth(kv, () => 'guest'), kv).currentUser()).provider).toBe('guest');
    // a stored email that is not an email counts as none
    kv.setItem('tmi.identity.v1', JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', email: 'nope', at: 'x' }));
    expect(loadSavedIdentity(kv)?.email).toBeNull();
    // once the email is added the identity is complete
    saveIdentity({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', at: 'x' }, kv);
    expect(loadIdentity(kv)).toEqual({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', at: 'x' });
    // nothing stored, or not an identity at all
    expect(loadSavedIdentity(new MapKV())).toBeNull();
    kv.setItem('tmi.identity.v1', JSON.stringify({ id: 'x', name: 'Priya', email: 'priya@gmail.com' }));
    expect(loadSavedIdentity(kv)).toBeNull();
    kv.setItem('tmi.identity.v1', 'not json');
    expect(loadSavedIdentity(kv)).toBeNull();
  });
  it('the start screen identity becomes the user id lms:<ID>; the name replaces [[name]] and {you}', async () => {
    const kv = new MapKV();
    kv.setItem('tmi.identity.v1', JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', at: 'x' }));
    const u = await new IdentityAuth(new GuestAuth(kv, () => 'guest'), kv).currentUser();
    expect(u).toEqual({ id: 'lms:NW1001', displayName: 'Priya Sharma', provider: 'lms', lmsUserId: 'NW1001' });
    setCurrentIdentity({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', at: 'x' });
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
    setSessionToken(TOKEN);
    const send = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://a.test/api/history');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ student_id: 'NW1', token: TOKEN });   // only the logged-in student can read their history
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
  it('"login required" from the server is reported, so the start screen asks the student to log in again', async () => {
    const local = new MemoryProgressStore();
    const refused = (async () => json({ error: 'login required' }, 401)) as unknown as typeof fetch;
    expect(await restoreFromServer('https://a.test', 'NW1', local, new MapKV(), { send: refused })).toEqual({ ok: false, events: 0, sittings: 0, name: null, unauthorized: true });
    expect(await local.list('lms:NW1')).toEqual([]);
  });
});

describe('the session token goes out with everything, and a refused login keeps what was queued', () => {
  const ev = (id: string): ProgressEvent => ({ event_id: id, user_id: 'lms:NW1', sitting_id: 's', verb: 'beat_viewed', object: { type: 'beat', id: 'S1.1', session: 1 }, course_ref: { topic_id: 't' }, client_ts: '2026-11-18T10:00:00Z' });

  it('mailbox posts (feedback, check-ins, sittings) carry the token; without a login nothing is added', async () => {
    const bodies: Record<string, unknown>[] = [];
    const send = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return json({ ok: true }); }) as unknown as typeof fetch;
    const box = new Mailbox('https://a.test', new MapKV(), send);
    box.push('/api/feedback', { user_id: 'lms:NW1', session: 1, rating: 5 });
    await box.flush();
    setSessionToken(TOKEN);
    box.push('/api/feedback', { user_id: 'lms:NW1', session: 2, rating: 4 });
    await box.flush();
    expect(bodies[0]).toEqual({ user_id: 'lms:NW1', session: 1, rating: 5 });
    expect(bodies[1]).toEqual({ user_id: 'lms:NW1', session: 2, rating: 4, token: TOKEN });
    expect(box.size()).toBe(0);
  });

  it('a 401 keeps the mailbox item, tells the app once, and the item goes out after the next log-in', async () => {
    let status = 401, lost = 0;
    const send = (async () => json(status === 200 ? { ok: true } : { error: 'login required' }, status)) as unknown as typeof fetch;
    setSessionToken(TOKEN);
    onSessionLost(() => { lost++; });
    const box = new Mailbox('https://a.test', new MapKV(), send);
    box.push('/api/feedback', { user_id: 'lms:NW1', session: 1, rating: 5 });
    await box.flush();
    await box.flush();
    expect(box.size()).toBe(1);
    expect(lost).toBe(1);
    expect(sessionToken()).toBeNull();
    status = 200; setSessionToken(TOKEN);
    await box.flush();
    expect(box.size()).toBe(0);
  });

  it('events carry the token too, and a 401 keeps them in the outbox', async () => {
    const seen: { events: unknown[]; token?: string }[] = [];
    let status = 200, lost = 0;
    const send = (async (_u: string, init: RequestInit) => { seen.push(JSON.parse(String(init.body))); return json(status === 200 ? { added: 1 } : { error: 'login required' }, status); }) as unknown as typeof fetch;
    setSessionToken(TOKEN);
    onSessionLost(() => { lost++; });
    const out = new Outbox('https://a.test', new MapKV(), send);
    out.push(ev('e1'));
    await out.flush();
    expect(seen[0].token).toBe(TOKEN);
    expect(out.size()).toBe(0);
    status = 401;
    out.push(ev('e2'));
    await out.flush();
    expect(out.size()).toBe(1);
    expect(lost).toBe(1);
  });
});

describe('accounts (adapters/account.ts)', () => {
  const server = (answers: Record<string, [number, unknown]>) => {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const send = (async (url: string, init: RequestInit) => {
      const path = url.replace('https://a.test', '');
      calls.push({ path, body: JSON.parse(String(init.body)) });
      const [status, body] = answers[path] ?? [404, {}];
      return json(body, status);
    }) as unknown as typeof fetch;
    return { api: accountApi('https://a.test', send), calls };
  };
  const OK = { ok: true, student_id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: TOKEN, returning: false };

  it('sign up without an email sends only name and ID', async () => {
    const { api, calls } = server({ '/api/account/signup': [200, { ...OK, email: '' }] });
    expect((await api.signup({ id: 'NW1001', name: 'Priya Sharma' })).ok).toBe(true);
    expect(calls[0].body).toEqual({ student_id: 'NW1001', name: 'Priya Sharma' });
  });

  it('sign up sends name, ID and email (no password) and returns the logged-in account', async () => {
    const { api, calls } = server({ '/api/account/signup': [200, OK] });
    expect(await api.signup({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com' }))
      .toEqual({ ok: true, account: { id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', token: TOKEN, returning: false } });
    expect(calls[0]).toEqual({ path: '/api/account/signup', body: { student_id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com' } });
  });

  it('log in sends the NxtWave ID or email; every refusal becomes a reason the start screen can explain', async () => {
    const { api, calls } = server({ '/api/account/login': [200, { ...OK, returning: true }] });
    expect((await api.login(' priya@gmail.com ')).ok).toBe(true);
    expect(calls[0]).toEqual({ path: '/api/account/login', body: { who: 'priya@gmail.com' } });
    for (const [status, error, want] of [[404, 'no account', 'no-account'], [429, 'too many', 'too-many'], [400, 'bad id', 'invalid'], [500, 'boom', 'offline']] as const) {
      const { api: a } = server({ '/api/account/login': [status, { error }] });
      expect(await a.login('NW1001'), error).toEqual({ ok: false, error: want });
    }
    const down = accountApi('https://a.test', (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    expect(await down.login('NW1001')).toEqual({ ok: false, error: 'offline' });
  });

  it('the stored identity keeps the token only when it looks like one', () => {
    const kv = new MapKV();
    saveIdentity({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', at: 'x', token: TOKEN }, kv);
    expect(loadIdentity(kv)?.token).toBe(TOKEN);
    kv.setItem('tmi.identity.v1', JSON.stringify({ id: 'NW1001', name: 'Priya Sharma', email: 'priya@gmail.com', at: 'x', token: '<script>' }));
    expect(loadIdentity(kv)?.token).toBeUndefined();
  });
});

describe('recoverByEmail ("Forgot your NxtWave ID?")', () => {
  it('posts the email and returns the student to sign in as', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const send = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return json({ found: true, student_id: 'nw1001', name: 'Priya  Sharma' });
    }) as unknown as typeof fetch;
    expect(await recoverByEmail('https://a.test', 'priya@gmail.com', { send })).toEqual({ k: 'found', id: 'NW1001', name: 'Priya Sharma' });
    expect(calls).toEqual([{ url: 'https://a.test/api/recover', body: { email: 'priya@gmail.com' } }]);
  });
  it('no match, too many tries, server trouble, offline and a broken answer are told apart', async () => {
    const answer = (r: Response | Error) => ({ send: (async () => { if (r instanceof Error) throw r; return r; }) as unknown as typeof fetch });
    expect(await recoverByEmail('https://a.test', 'x@y.co', answer(json({ found: false })))).toEqual({ k: 'none' });
    expect(await recoverByEmail('https://a.test', 'x@y.co', answer(json({ error: 'slow down' }, 429)))).toEqual({ k: 'wait' });
    expect(await recoverByEmail('https://a.test', 'x@y.co', answer(json({ error: 'server error' }, 500)))).toEqual({ k: 'error' });
    expect(await recoverByEmail('https://a.test', 'x@y.co', answer(new Error('offline')))).toEqual({ k: 'error' });
    // a name or ID this game could not sign in with is not used
    expect(await recoverByEmail('https://a.test', 'x@y.co', answer(json({ found: true, student_id: 'NW1001', name: '<b>' })))).toEqual({ k: 'error' });
    expect(await recoverByEmail('https://a.test', 'x@y.co', answer(json({ found: true, name: 'Priya' })))).toEqual({ k: 'error' });
  });
});
