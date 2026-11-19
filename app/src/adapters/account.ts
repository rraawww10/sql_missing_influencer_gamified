// Student log-in on the analytics server (analytics/auth.mjs): sign up once (name + NxtWave ID), then log in with the ID (no password).
// Every call answers with a small result the start screen can show a message for; nothing here throws.
import { normalizeEmail, normalizeId, normalizeName } from './identity';

export interface Account { id: string; name: string; email: string; token: string; returning: boolean }
export type AccountError =
  | 'no-account'            // log-in: nobody signed up with this ID or email yet
  | 'too-many'              // slowed down after too many tries
  | 'invalid'               // the server refused what was typed
  | 'offline';              // no answer from the server
export type AccountResult = { ok: true; account: Account } | { ok: false; error: AccountError };

export interface AccountApi {
  // first time: name + NxtWave ID; an email is optional (an ID that already has an account is simply logged in)
  signup(a: { id: string; name: string; email?: string }): Promise<AccountResult>;
  // later: the NxtWave ID (no password; an email given at sign-up works too)
  login(who: string): Promise<AccountResult>;
  logout(token: string): Promise<void>;
}

const ERRORS: Record<string, AccountError> = { 'no account': 'no-account', 'too many': 'too-many' };

export function accountApi(url: string, send: typeof fetch = (...a) => fetch(...a), timeoutMs = 10_000): AccountApi {
  async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> } | null> {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await send(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'text/plain' },   // no CORS preflight
        body: JSON.stringify(body), signal: ctrl?.signal });
      let json: Record<string, unknown> = {};
      try { json = await res.json() as Record<string, unknown>; } catch { /* a plain-text error */ }
      return { status: res.status, json };
    } catch { return null; } finally { if (t) clearTimeout(t); }
  }
  async function account(path: string, body: unknown): Promise<AccountResult> {
    const r = await post(path, body);
    if (!r) return { ok: false, error: 'offline' };
    if (r.status === 429) return { ok: false, error: 'too-many' };
    if (r.status >= 500) return { ok: false, error: 'offline' };
    if (!r.json.ok) return { ok: false, error: ERRORS[String(r.json.error)] ?? 'invalid' };
    const id = typeof r.json.student_id === 'string' ? normalizeId(r.json.student_id) : null;
    const name = typeof r.json.name === 'string' ? normalizeName(r.json.name) ?? r.json.name : null;
    const email = typeof r.json.email === 'string' ? normalizeEmail(r.json.email) ?? '' : '';
    const token = typeof r.json.token === 'string' ? r.json.token : null;
    return id && name && token ? { ok: true, account: { id, name, email, token, returning: !!r.json.returning } } : { ok: false, error: 'offline' };
  }
  return {
    signup: (a) => account('/api/account/signup', { student_id: a.id, name: a.name, ...(a.email ? { email: a.email } : {}) }),
    login: (who) => account('/api/account/login', { who: who.trim() }),
    logout: async (token) => { await post('/api/account/logout', { token }); },
  };
}
