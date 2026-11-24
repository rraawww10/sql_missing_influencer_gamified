// The start screen: nobody gets into the game before it knows who is playing.
//
// With an analytics server (VITE_ANALYTICS_URL) students log in WITHOUT a password, OTP or any check (the team's choice,
// 2026-11-19). Since 2026-11-24 (the team asked) there is NO NxtWave ID either:
//   * Sign up (first time)   name + personal email (any provider); the server's student ID is made from the email
//                            (idFromEmail), or is the ?user_id= one when the platform names the student
//   * Log in                 the email; an unknown one goes to Sign up with it filled in. A student who signed up with a
//                            NxtWave ID before this can still type that ID in the same box (not advertised).
// The server's session token is stored with the identity (adapters/identity.ts) and sent with everything. After logging
// in, the student's history is pulled into this device (adapters/serverSync.ts) so episodes, points, clues, an unfinished
// episode and feedback carry over; every later page load refreshes it first.
//
// Without a server there is nothing to log in to: the screen asks name, NxtWave ID and email once, as before.
//
// Class names the stylesheet themes: gate, gate-card, gate-head, gate-tabs, gate-field, gate-pass, gate-required,
// gate-err, gate-ok, gate-note, gate-wait, linkish (a text-style button).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { altIdFromEmail, clearIdentity, idFromEmail, loadSavedIdentity, normalizeEmail, normalizeId, normalizeName, saveIdentity, setCurrentIdentity,
  type Identity, type SavedIdentity } from '../../adapters/identity';
import type { RecoverResult, RestoreResult } from '../../adapters/serverSync';
import type { AccountApi, AccountError, AccountResult } from '../../adapters/account';
import { Kaal } from '../kaal/Kaal';
import { Backdrop } from '../design/Backdrop';
import { Icon } from '../design/Icon';

export interface GateDeps {
  // student accounts on the server (null = this build has no server: no passwords, name + ID + email only)
  account: AccountApi | null;
  // called as soon as a student is logged in or signed up, before their history is fetched (the app starts sending the token)
  signedIn?(who: Identity): void;
  // pulls the student's history into this device (null = no server)
  restore(id: string): Promise<RestoreResult | null>;
  // "Forgot your NxtWave ID?": finds the student who signed up with this email (null = no server: the option is hidden)
  recover: ((email: string) => Promise<RecoverResult>) | null;
  // the id the embedding platform passed as ?user_id= (prefilled and fixed)
  urlId: string | null;
}

type Mode = 'login' | 'signup';
type Phase =
  | { k: 'auth'; mode: Mode; notice?: string; prefill?: { id?: string; name?: string; email?: string } }
  | { k: 'form' } | { k: 'email'; who: SavedIdentity }                       // builds without a server
  | { k: 'loading'; who: Identity; first: boolean; returning?: boolean } | { k: 'ready' };

const EMAIL_ERR = 'Please type your email, like name@example.com.';
const RELOGIN_KEY = 'tmi.relogin';   // set by the app when the server stops accepting this device's login

export function IdentityGate({ deps, children }: { deps: GateDeps; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(() => {
    const saved = loadSavedIdentity();
    // a stored identity is used unless the platform names a different student in the URL
    const mine = saved && !(deps.urlId && normalizeId(deps.urlId) !== saved.id) ? saved : null;
    if (!deps.account) {
      if (!mine) return { k: 'form' };
      // saved before the email was asked: keep the name and ID, ask for the email only
      return mine.email ? { k: 'loading', who: { ...mine, email: mine.email }, first: false } : { k: 'email', who: mine };
    }
    if (mine?.token) return { k: 'loading', who: { ...mine, email: mine.email ?? '' }, first: false };
    let relogin = false;
    try { relogin = sessionStorage.getItem(RELOGIN_KEY) === '1'; sessionStorage.removeItem(RELOGIN_KEY); } catch { /* ignore */ }
    if (mine && relogin) return { k: 'auth', mode: 'login', notice: 'Please log in again to continue.', prefill: { id: mine.id, email: mine.email ?? undefined } };
    // played on this device before: one tap logs in with the same email (or the old ID)
    if (mine) return { k: 'auth', mode: 'login', notice: `Welcome back, ${mine.name.split(' ')[0]}. Log in to continue.`, prefill: { id: mine.id, email: mine.email ?? undefined } };
    return { k: 'auth', mode: 'login' };
  });
  const [welcome, setWelcome] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (phase.k !== 'loading' || started.current) return;
    started.current = true;
    const { who, first, returning } = phase;
    setCurrentIdentity(who);
    (async () => {
      const r = await deps.restore(who.id);
      // the server no longer accepts this device's login (logged out): log in again
      if (r?.unauthorized) {
        const { token: _gone, ...rest } = who;
        saveIdentity(rest);
        setCurrentIdentity(null);
        started.current = false;
        setPhase({ k: 'auth', mode: 'login', notice: 'Please log in again to continue.', prefill: { id: who.id, email: who.email || undefined } });
        return;
      }
      if (first && (returning || (r && r.events > 0)))
        setWelcome(`Welcome back, ${who.name.split(' ')[0]}! ${r && r.events > 0 ? 'Your case file is restored.' : 'Good to see you again.'}`);
      setPhase({ k: 'ready' });
    })();
  }, [phase, deps]);

  const enter = (who: Identity, returning = false) => {
    saveIdentity(who);
    deps.signedIn?.(who);
    setPhase({ k: 'loading', who, first: true, returning });
  };

  if (phase.k === 'ready') return <>{welcome && <WelcomeToast text={welcome} />}{children}</>;
  if (phase.k === 'loading') return (
    <div className="gate"><Backdrop /><div className="gate-card" role="status" aria-live="polite">
      <Kaal mood="think" size={70} /><p className="gate-wait">Opening your case file, {phase.who.name.split(' ')[0]}…</p>
    </div></div>
  );
  if (phase.k === 'auth' && deps.account) return (
    <AuthScreen key={`${phase.mode}-${phase.notice ?? ''}`} api={deps.account} urlId={deps.urlId}
      mode={phase.mode} notice={phase.notice} prefill={phase.prefill}
      onDone={(a) => enter({ id: a.id, name: a.name, email: a.email, token: a.token, at: new Date().toISOString() }, a.returning)} />
  );
  if (phase.k === 'email') return <EmailStep who={phase.who} onDone={(w) => enter(w)} onSwitch={() => { clearIdentity(); setPhase({ k: 'form' }); }} />;
  return <LocalForm urlId={deps.urlId} onDone={(w) => enter(w)} />;
}

// The start screen's frame: what the game is on the left, the form card on the right (stacked on a phone)
function GateShell({ children }: { children: ReactNode }) {
  return (
    <div className="gate">
      <Backdrop />
      <div className="gate-shell">
        <div className="gate-pitch">
          <span className="pill sun"><Icon name="shield" /> City Police Data Cell · night shift</span>
          <p className="gate-headline shadowed">A star is missing. The data saw everything.</p>
          <p className="lead">Tara Sen vanished at 6 PM. Her concert starts at midnight. Crack the case with SQL, one episode at a time.</p>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- log in (ID or email) / sign up
const MSG: Record<AccountError, string> = {
  'no-account': 'We could not find this email. If you are new, sign up below.',
  'too-many': 'Too many tries. Please wait a few minutes and try again.',
  'invalid': 'Something you typed was not accepted. Check each box and try again.',
  'offline': 'Could not reach the server. Check your internet and try again.',
};

function AuthScreen({ api, urlId, mode, notice, prefill, onDone }: {
  api: AccountApi; urlId: string | null; mode: Mode; notice?: string;
  prefill?: { id?: string; name?: string; email?: string }; onDone(a: Extract<AccountResult, { ok: true }>['account']): void;
}) {
  const [view, setView] = useState<Mode>(mode);
  const [who, setWho] = useState(urlId ?? (prefill?.email || prefill?.id) ?? '');
  const [name, setName] = useState(prefill?.name ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ReactNode>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const lockId = !!urlId;   // the platform names the student
  // the log-in box takes the email; an old NxtWave ID (no "@") still works for students who signed up with one
  const whoTrim = who.trim(), whoIsEmail = whoTrim.includes('@'), whoOk = whoIsEmail ? normalizeEmail(whoTrim) : normalizeId(whoTrim);
  const nameOk = normalizeName(name), emailOk = normalizeEmail(email);
  const idOk = urlId ? normalizeId(urlId) : emailOk ? idFromEmail(emailOk) : null;
  const go = (v: Mode) => { setView(v); setTried(false); setErr(null); setInfo(null); };
  const run = async (call: () => Promise<AccountResult>) => {
    setBusy(true); setErr(null);
    const r = await call();
    if (!alive.current) return null;
    setBusy(false);
    if (r.ok) onDone(r.account);
    return r;
  };

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (busy || !whoOk) return;
    const r = await run(() => api.login(whoTrim));
    if (!r || r.ok) return;
    if (r.error === 'no-account') {
      if (!whoIsEmail) { setErr(MSG['no-account']); return; }
      // new here: Sign up, with the email already filled in
      setEmail(whoTrim);
      setView('signup'); setTried(false); setErr(null);
      setInfo(`We don't know ${whoTrim} yet. Sign up once - it takes 20 seconds.`);
    } else setErr(MSG[r.error]);
  };
  const submitSignup = async (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (busy || !nameOk || !emailOk || !idOk) return;
    const r = await run(async () => {
      const first = await api.signup({ id: idOk, name: nameOk, email: emailOk });
      // the email's ID belongs to an old account made with the email typed as a NxtWave ID: use the second-choice ID
      if (!first.ok && first.error === 'no-account' && !urlId) return api.signup({ id: altIdFromEmail(emailOk), name: nameOk, email: emailOk });
      return first;
    });
    if (r && !r.ok) setErr(MSG[r.error]);
  };

  const messages = <>
    {info && <p className="gate-ok" role="status">{info}</p>}
    {err && <p className="gate-err gate-alert" role="alert">{err}</p>}
  </>;
  const head = (title: string, sub: string) => (
    <div className="gate-head"><Kaal mood="point" size={74} />
      <div><h1 id="gate-title">{title}</h1><p className="muted small">{sub}</p></div>
    </div>
  );
  const tabs = (
    <div className="gate-tabs" role="tablist" aria-label="Log in or sign up">
      <button type="button" role="tab" aria-selected={view === 'login'} className={view === 'login' ? 'on' : ''} onClick={() => go('login')}>Log in</button>
      <button type="button" role="tab" aria-selected={view === 'signup'} className={view === 'signup' ? 'on' : ''} onClick={() => go('signup')}>Sign up</button>
    </div>
  );

  return (
    <GateShell>
      {view === 'login' && (
        <form className="gate-card" onSubmit={submitLogin} noValidate aria-labelledby="gate-title">
          {tabs}
          {head("Who's on the case tonight?", 'Log in with your email.')}
          {messages}
          <div className="gate-field">
            <label htmlFor="gate-who"><span>{lockId ? 'NxtWave ID' : 'Email'}</span></label>
            <input id="gate-who" type={lockId ? 'text' : 'email'} inputMode={lockId ? 'text' : 'email'} required autoFocus={!lockId} readOnly={lockId} value={who}
              onChange={(e) => setWho(e.target.value)} maxLength={120} autoComplete={lockId ? 'username' : 'email'}
              autoCapitalize="none" spellCheck={false} placeholder="e.g. priya.sharma@gmail.com" aria-invalid={tried && !whoOk}
              aria-describedby={tried && !whoOk ? 'gate-who-err' : undefined} />
            {tried && !whoOk && <small id="gate-who-err" className="gate-err">{EMAIL_ERR}</small>}
          </div>
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
          <p className="muted small gate-note">New here? <button type="button" className="linkish" onClick={() => go('signup')}>Sign up</button></p>
        </form>
      )}

      {view === 'signup' && (
        <form className="gate-card" onSubmit={submitSignup} noValidate aria-labelledby="gate-title">
          {tabs}
          {head('Join the case', 'First time here? Tell us your name and email. Next time, just your email.')}
          {messages}
          <div className="gate-field">
            <label htmlFor="gate-name"><span>Your name</span></label>
            <input id="gate-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" placeholder="e.g. Priya Sharma"
              aria-invalid={tried && !nameOk} aria-describedby={tried && !nameOk ? 'gate-name-err' : undefined} />
            {tried && !nameOk && <small id="gate-name-err" className="gate-err">Please type your name (letters and spaces, at least 2).</small>}
          </div>
          <EmailField value={email} onChange={setEmail} bad={tried && !emailOk} account />
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Starting…' : 'Start playing'}</button>
          <p className="muted small gate-note">Played before? <button type="button" className="linkish" onClick={() => go('login')}>Log in</button></p>
        </form>
      )}
    </GateShell>
  );
}

// ---------------------------------------------------------------- shared: the email field with the note that says why it is asked
function EmailField({ value, onChange, bad, autoFocus, account = false }: { value: string; onChange(v: string): void; bad: boolean; autoFocus?: boolean; account?: boolean }) {
  return (
    <div className="gate-field">
      <label htmlFor="gate-email"><span>Personal email</span></label>
      <small id="gate-email-note" className="gate-required"><strong>Email is required.</strong> {account
        ? 'Any personal email works (Gmail, Outlook, college mail). You will log in with it next time.'
        : 'Use your personal email - we use it only to get your progress back if you forget your ID.'}</small>
      <input id="gate-email" type="email" inputMode="email" required autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} maxLength={120}
        autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="e.g. priya.sharma@gmail.com"
        aria-invalid={bad} aria-describedby={bad ? 'gate-email-note gate-email-err' : 'gate-email-note'} />
      {bad && <small id="gate-email-err" className="gate-err">{EMAIL_ERR}</small>}
    </div>
  );
}

// ---------------------------------------------------------------- builds without a server: no accounts, nothing to log in to
function LocalForm({ urlId, onDone }: { urlId: string | null; onDone(i: Identity): void }) {
  const [name, setName] = useState('');
  const [id, setId] = useState(urlId ?? '');
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);
  const nameOk = normalizeName(name), idOk = normalizeId(id), emailOk = normalizeEmail(email);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (nameOk && idOk && emailOk) onDone({ id: idOk, name: nameOk, email: emailOk, at: new Date().toISOString() });
  };
  return (
    <GateShell>
      <form className="gate-card" onSubmit={submit} noValidate aria-labelledby="gate-title">
        <div className="gate-head"><Kaal mood="point" size={74} />
          <div><span className="sticker">Police Data Cell · New recruit</span>
            <h1 id="gate-title">Who's on the case tonight?</h1>
            <p className="muted small">Tell us your name, NxtWave ID and email. Your progress is kept on this computer.</p></div>
        </div>
        <div className="gate-field">
          <label htmlFor="gate-name"><span>Your name</span></label>
          <input id="gate-name" required autoFocus={!urlId} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" placeholder="e.g. Priya Sharma"
            aria-invalid={tried && !nameOk} aria-describedby={tried && !nameOk ? 'gate-name-err' : undefined} />
          {tried && !nameOk && <small id="gate-name-err" className="gate-err">Please type your name (letters and spaces, at least 2).</small>}
        </div>
        <div className="gate-field">
          <label htmlFor="gate-id"><span>NxtWave ID</span></label>
          <input id="gate-id" required autoFocus={!!urlId} value={id} onChange={(e) => setId(e.target.value)} maxLength={64} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            placeholder="Your NxtWave ID" aria-invalid={tried && !idOk} aria-describedby={tried && !idOk ? 'gate-id-err' : undefined} />
          {tried && !idOk && <small id="gate-id-err" className="gate-err">Please type your NxtWave ID (letters and numbers, at least 3).</small>}
        </div>
        <EmailField value={email} onChange={setEmail} bad={tried && !emailOk} />
        <button className="btn primary big" type="submit">Open the case file</button>
      </form>
    </GateShell>
  );
}

// A student who used a no-server build before the email was asked: their name and ID stay, only the email is new
function EmailStep({ who, onDone, onSwitch }: { who: SavedIdentity; onDone(i: Identity): void; onSwitch(): void }) {
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);
  const emailOk = normalizeEmail(email);
  const first = who.name.split(' ')[0];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (emailOk) onDone({ id: who.id, name: who.name, email: emailOk, at: who.at || new Date().toISOString() });
  };
  return (
    <GateShell>
      <form className="gate-card" onSubmit={submit} noValidate aria-labelledby="gate-title">
        <div className="gate-head"><Kaal mood="point" size={74} />
          <div><span className="sticker">Police Data Cell · One more thing</span>
            <h1 id="gate-title">Add your email</h1>
            <p className="muted small">Welcome back, {first}. You are signed in as {who.name} ({who.id}). We need your email just once.</p></div>
        </div>
        <EmailField value={email} onChange={setEmail} bad={tried && !emailOk} autoFocus />
        <button className="btn primary big" type="submit">Save and continue</button>
        <p className="muted small gate-note">Not {first}? <button type="button" className="linkish" onClick={onSwitch}>Switch student</button></p>
      </form>
    </GateShell>
  );
}

function WelcomeToast({ text }: { text: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 4500); return () => clearTimeout(t); }, []);
  return on ? <div className="welcome-toast" role="status">{text}</div> : null;
}
