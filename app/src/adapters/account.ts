// Student accounts on the analytics server (analytics/auth.mjs): sign up, log in, log out, forgot password.
// Every call answers with a small result the start screen can show a message for; nothing here throws.
import { normalizeEmail, normalizeId, normalizeName } from './identity';

export const PASSWORD_MIN = 6, PASSWORD_MAX = 100;   // same rule as the server
export const validPassword = (p: string) => p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX;

export interface Account { id: string; name: string; email: string; token: string; returning: boolean }
export type AccountError =
  | 'taken'                 // sign-up: this ID already has an account
  | 'email-mismatch'        // sign-up: the ID was used before with another email
  | 'no-account'            // log-in: nobody signed up with this ID
  | 'wrong'                 // log-in: wrong password
  | 'new-password-needed'   // log-in with the teacher's temporary password: choose your own now
  | 'bad-code'              // forgot password: wrong or expired code
  | 'too-many'              // slowed down after too many tries
  | 'invalid'               // the server refused what was typed
  | 'offline';              // no answer from the server
export type AccountResult = { ok: true; account: Account } | { ok: false; error: AccountError };
export type ForgotResult = { sent: true; to: string } | { sent: false; reason: 'no-account' | 'no-mail' | 'too-many' | 'offline' };

export interface AccountApi {
  signup(a: { id: string; name: string; email: string; password: string }): Promise<AccountResult>;
  login(a: { id: string; password: string; newPassword?: string }): Promise<AccountResult>;
  logout(token: string): Promise<void>;
  forgot(id: string): Promise<ForgotResult>;
  reset(a: { id: string; code: string; password: string }): Promise<AccountResult>;
}

const ERRORS: Record<string, AccountError> = {
  'taken': 'taken', 'email mismatch': 'email-mismatch', 'no account': 'no-account', 'wrong': 'wrong',
  'new password needed': 'new-password-needed', 'bad code': 'bad-code', 'too many': 'too-many',
};

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
    signup: (a) => account('/api/account/signup', { student_id: a.id, name: a.name, email: a.email, password: a.password }),
    login: (a) => account('/api/account/login', { student_id: a.id, password: a.password, ...(a.newPassword ? { new_password: a.newPassword } : {}) }),
    logout: async (token) => { await post('/api/account/logout', { token }); },
    reset: (a) => account('/api/account/reset', { student_id: a.id, code: a.code, password: a.password }),
    async forgot(id) {
      const r = await post('/api/account/forgot', { student_id: id });
      if (!r || r.status >= 500) return { sent: false, reason: 'offline' };
      if (r.status === 429) return { sent: false, reason: 'too-many' };
      if (r.json.sent === true) return { sent: true, to: String(r.json.to ?? 'your email') };
      return { sent: false, reason: r.json.reason === 'no-account' ? 'no-account' : 'no-mail' };
    },
  };
}
