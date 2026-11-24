// The logged-in student's session token: the proof, sent with everything that goes to the analytics server, that this
// browser is that student (analytics/auth.mjs). Set after sign-up / log-in and on every page load from the stored
// identity. When the server answers "login required" (the password was reset, or the ID got an account elsewhere),
// the app is told once and sends the student back to the log-in screen; what was queued stays queued for after.
let token: string | null = null;
let lost = false;
let onLost: (() => void) | null = null;

export const sessionToken = () => token;
export function setSessionToken(t: string | null) { token = t; lost = false; }
export function onSessionLost(cb: () => void) { onLost = cb; }
export function sessionLost() {
  if (lost) return;
  lost = true; token = null;
  onLost?.();
}
// Is this queued item another student's (a game user id "lms:<ID>" that is not the one logged in now)? Such leftovers
// from an earlier log-in on this browser can never be sent with this student's token: the server answers 401 and
// they must be dropped, NOT treated as "you are logged out" (2026-11-24 fix: a desktop with an old account's
// leftovers threw the new student back to the log-in screen every few seconds).
let me: (() => string | null) | null = null;
export function setCurrentStudent(fn: () => string | null) { me = fn; }
export function isOtherStudent(userId: unknown): boolean {
  const id = me?.();
  return typeof userId === 'string' && userId.startsWith('lms:') && !!id && userId.toUpperCase() !== `lms:${id}`.toUpperCase();
}

// adds the token to a JSON body that goes to the server (nothing added when nobody is logged in)
export const withToken = <T extends object>(body: T): T & { token?: string } => (token ? { ...body, token } : body);

// "Log out" in the top bar: ends the session on the server too, then forgets the student on this device
let signOutFn: (() => Promise<void>) | null = null;
export function setSignOut(fn: () => Promise<void>) { signOutFn = fn; }
export async function signOut() { if (signOutFn) await signOutFn(); }
