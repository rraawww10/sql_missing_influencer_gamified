// Student identity without a login: the student types their NAME and NXTWAVE ID once on the start screen.
//   * The NxtWave ID is the unique key: events go out as user_id "lms:<ID>", so the analytics server files everything
//     (progress, time, feedback) under that ID, and a returning student who types the same ID gets their history back.
//   * The name replaces "intern" in the story and Kaal's lines (personalize / firstName below).
// Kept in localStorage, which every episode site shares (one host, one path prefix - see README §Shipping),
// so the student is asked once per device, not once per episode.
import type { AuthProvider, GameUser } from '../ports/auth';

export interface Identity { id: string; name: string; at: string }

const KEY = 'tmi.identity.v1';
type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Case-insensitive (stored upper-case); letters, digits and . _ @ - only, 3-64 characters. Same rule as the server.
export function normalizeId(v: string): string | null {
  const id = v.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._@-]{2,63}$/.test(id) ? id : null;
}
export function normalizeName(v: string): string | null {
  const n = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  return n.length >= 2 && n.length <= 60 && /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(n) ? n : null;
}

export function loadIdentity(kv: Pick<KV, 'getItem'> = localStorage): Identity | null {
  try {
    const v = JSON.parse(kv.getItem(KEY) ?? 'null') as Identity | null;
    return v && normalizeId(v.id) === v.id && normalizeName(v.name) ? v : null;
  } catch { return null; }
}
export function saveIdentity(i: Identity, kv: Pick<KV, 'setItem'> = localStorage) {
  try { kv.setItem(KEY, JSON.stringify(i)); } catch { /* storage blocked: this page still works, the next one asks again */ }
}
export function clearIdentity(kv: Pick<KV, 'removeItem'> = localStorage) {
  try { kv.removeItem(KEY); } catch { /* ignore */ }
}

// The name the story uses: first word of what they typed ("Priya Sharma" → "Priya")
export const firstName = (i: Identity | null) => i?.name.split(' ')[0] ?? '';

// Who is playing, for the rest of the app. Before the start screen has run (tests, dev harness) the fallback is used.
export class IdentityAuth implements AuthProvider {
  constructor(private readonly fallback: AuthProvider, private readonly kv: Pick<KV, 'getItem'> = localStorage) {}
  async currentUser(): Promise<GameUser> {
    const i = loadIdentity(this.kv);
    if (!i) return this.fallback.currentUser();
    return { id: `lms:${i.id}`, displayName: i.name, provider: 'lms', lmsUserId: i.id };
  }
}

// ---------------------------------------------------------------- the name inside story text
// Story text says "[[name]]" where a character addresses the student (content/sessions/src/*.yaml); Kaal's lines say "{you}".
let current: Identity | null = null;
export function setCurrentIdentity(i: Identity | null) { current = i; }
export function currentIdentity() { return current; }
export function personalize(text: string, fallback = 'partner'): string {
  const n = firstName(current) || fallback;
  return text.replace(/\[\[name\]\]/g, n).replace(/\{you\}/g, n);
}
