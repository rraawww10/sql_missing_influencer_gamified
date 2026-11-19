// The start screen: nobody gets into the game before it knows who is playing.
//
// With an analytics server (VITE_ANALYTICS_URL) every student has an ACCOUNT, protected by a password:
//   * Sign up        name, NxtWave ID, personal email (required), password twice → the account is created on the server
//   * Log in         NxtWave ID + password
//   * Forgot password        the server emails a 6-digit code to the sign-up email; code + new password logs them in.
//                            When the server has no mail service, the student is told to ask their teacher, who gives a
//                            temporary password from the dashboard; logging in with it asks for a new one right away.
//   * Forgot your NxtWave ID?  the email finds the ID (POST /api/recover); the student then logs in with it
// The server's session token is stored with the identity (adapters/identity.ts) and sent with everything, so only the
// logged-in student can read or add to their progress. A stored identity from before accounts (no token) is asked to
// create its password. After logging in, the student's history is pulled into this device (adapters/serverSync.ts) so
// episodes, points, clues, an unfinished episode and feedback carry over; every later page load refreshes it first.
//
// Without a server there is nothing to log in to: the screen asks name, NxtWave ID and email once, as before.
//
// Class names the stylesheet themes: gate, gate-card, gate-head, gate-tabs, gate-field, gate-pass, gate-required,
// gate-err, gate-ok, gate-note, gate-wait, linkish (a text-style button).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { clearIdentity, loadSavedIdentity, normalizeEmail, normalizeId, normalizeName, saveIdentity, setCurrentIdentity,
  type Identity, type SavedIdentity } from '../../adapters/identity';
import type { RecoverResult, RestoreResult } from '../../adapters/serverSync';
import { PASSWORD_MIN, validPassword, type AccountApi, type AccountError, type AccountResult } from '../../adapters/account';
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
    if (mine?.token && mine.email) return { k: 'loading', who: { ...mine, email: mine.email }, first: false };
    let relogin = false;
    try { relogin = sessionStorage.getItem(RELOGIN_KEY) === '1'; sessionStorage.removeItem(RELOGIN_KEY); } catch { /* ignore */ }
    if (mine && relogin) return { k: 'auth', mode: 'login', notice: 'Please log in again to continue.', prefill: { id: mine.id } };
    // played here before accounts existed: the same ID now needs a password
    if (mine) return { k: 'auth', mode: 'signup', notice: `Welcome back, ${mine.name.split(' ')[0]}. Accounts now have a password. Create yours to keep your progress safe.`,
      prefill: { id: mine.id, name: mine.name, email: mine.email ?? undefined } };
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
      // the server no longer accepts this device's login (password reset, or logged out everywhere): log in again
      if (r?.unauthorized) {
        const { token: _gone, ...rest } = who;
        saveIdentity(rest);
        setCurrentIdentity(null);
        started.current = false;
        setPhase({ k: 'auth', mode: 'login', notice: 'Please log in again to continue.', prefill: { id: who.id } });
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
    <AuthScreen key={`${phase.mode}-${phase.notice ?? ''}`} api={deps.account} recover={deps.urlId ? null : deps.recover} urlId={deps.urlId}
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

// ---------------------------------------------------------------- accounts: log in, sign up, forgot password, forgot ID
type View = Mode | 'forgot' | 'code' | 'newpass' | 'findid';

const MSG: Record<AccountError, string> = {
  'taken': 'This NxtWave ID already has an account. Log in with your password instead.',
  'email-mismatch': 'This ID was used before with a different email. Use that email, or ask your teacher for help.',
  'no-account': 'No account with this ID yet. Sign up first.',
  'wrong': 'Wrong NxtWave ID or password. Check both and try again.',
  'new-password-needed': '',
  'bad-code': 'That code is wrong or too old. Check the email, or ask for a new code.',
  'too-many': 'Too many tries. Please wait 15 minutes and try again.',
  'invalid': 'Something you typed was not accepted. Check each box and try again.',
  'offline': 'Could not reach the server. Check your internet and try again.',
};
const PASS_ERR = `Use at least ${PASSWORD_MIN} letters or numbers.`;

function PasswordField({ id, label, value, onChange, error, autoComplete, autoFocus, hint }: {
  id: string; label: string; value: string; onChange(v: string): void; error?: string | null; autoComplete: string; autoFocus?: boolean; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="gate-field">
      <label htmlFor={id}><span>{label}</span></label>
      <div className="gate-pass">
        <input id={id} type={show ? 'text' : 'password'} required autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} maxLength={100}
          autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} />
        <button type="button" className="gate-eye" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? 'Hide the password' : 'Show the password'} title={show ? 'Hide' : 'Show'}>
          <Icon name="eye" />
        </button>
      </div>
      {error ? <small id={`${id}-err`} className="gate-err">{error}</small> : hint ? <small id={`${id}-hint`} className="gate-hint">{hint}</small> : null}
    </div>
  );
}

function AuthScreen({ api, recover, urlId, mode, notice, prefill, onDone }: {
  api: AccountApi; recover: GateDeps['recover']; urlId: string | null; mode: Mode; notice?: string;
  prefill?: { id?: string; name?: string; email?: string }; onDone(a: Extract<AccountResult, { ok: true }>['account']): void;
}) {
  const [view, setView] = useState<View>(mode);
  const [name, setName] = useState(prefill?.name ?? '');
  const [id, setId] = useState(urlId ?? prefill?.id ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [fresh, setFresh] = useState('');        // the new password (forgot password, temporary password)
  const [code, setCode] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ReactNode>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const [found, setFound] = useState<{ id: string; name: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const lockId = !!urlId || (mode === 'signup' && !!prefill?.id);   // the platform, or this device's own earlier progress, fixes the ID
  const nameOk = normalizeName(name), idOk = normalizeId(id), emailOk = normalizeEmail(email);
  const go = (v: View, keepInfo = false) => { setView(v); setTried(false); setErr(null); if (!keepInfo) setInfo(null); setPassword(''); setAgain(''); setFresh(''); setCode(''); };
  const run = async (call: () => Promise<AccountResult>) => {
    setBusy(true); setErr(null);
    const r = await call();
    if (!alive.current) return null;
    setBusy(false);
    if (r.ok) { onDone(r.account); return r; }
    return r;
  };
  const fail = (e: AccountError) => setErr(
    e === 'taken' ? <>{MSG.taken} <button type="button" className="linkish" onClick={() => go('login')}>Log in</button></>
    : e === 'no-account' ? <>{MSG['no-account']} <button type="button" className="linkish" onClick={() => go('signup')}>Sign up</button></>
    : MSG[e]);

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (busy || !idOk || !password) return;
    const r = await run(() => api.login({ id: idOk, password }));
    if (r && !r.ok) { if (r.error === 'new-password-needed') { setView('newpass'); setTried(false); setErr(null); setInfo('That was a temporary password from your teacher. Choose your own password now.'); } else fail(r.error); }
  };
  const submitSignup = async (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (busy || !nameOk || !idOk || !emailOk || !validPassword(password) || password !== again) return;
    const r = await run(() => api.signup({ id: idOk, name: nameOk, email: emailOk, password }));
    if (r && !r.ok) fail(r.error);
  };
  const submitNewPass = async (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (busy || !idOk || !validPassword(fresh) || fresh !== again || fresh === password) return;
    const r = await run(() => api.login({ id: idOk, password, newPassword: fresh }));
    if (r && !r.ok) fail(r.error);
  };
  const submitForgot = async (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (busy || !idOk) return;
    setBusy(true); setErr(null);
    const r = await api.forgot(idOk);
    if (!alive.current) return;
    setBusy(false);
    if (r.sent) { setView('code'); setTried(false); setInfo(`We emailed a 6-digit code to ${r.to}. It works for 15 minutes.`); return; }
    setErr(r.reason === 'no-account' ? <>{MSG['no-account']} <button type="button" className="linkish" onClick={() => go('signup')}>Sign up</button></>
      : r.reason === 'too-many' ? MSG['too-many'] : r.reason === 'offline' ? MSG.offline
      : 'Ask your teacher to reset your password. They will give you a temporary password to log in with.');
  };
  const submitCode = async (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (busy || !idOk || !/^\d{6}$/.test(code.trim()) || !validPassword(fresh) || fresh !== again) return;
    const r = await run(() => api.reset({ id: idOk, code: code.trim(), password: fresh }));
    if (r && !r.ok) fail(r.error);
  };
  const submitFindId = async (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (busy || !emailOk || !recover) return;
    setBusy(true); setErr(null); setFound(null);
    const r = await recover(emailOk);
    if (!alive.current) return;
    setBusy(false);
    if (r.k === 'found') setFound({ id: r.id, name: r.name });
    else setErr(r.k === 'none' ? 'We could not find this email. Check the spelling, or sign up if you are new.' : r.k === 'wait' ? MSG['too-many'] : MSG.offline);
  };

  const idField = (autoFocus: boolean) => (
    <div className="gate-field">
      <label htmlFor="gate-id"><span>NxtWave ID</span></label>
      <input id="gate-id" required autoFocus={autoFocus && !lockId} readOnly={lockId} value={id} onChange={(e) => setId(e.target.value)} maxLength={64} autoComplete="username"
        autoCapitalize="characters" spellCheck={false} placeholder="Your NxtWave ID" aria-invalid={tried && !idOk} aria-describedby={tried && !idOk ? 'gate-id-err' : undefined} />
      {tried && !idOk && <small id="gate-id-err" className="gate-err">Please type your NxtWave ID (letters and numbers, at least 3).</small>}
    </div>
  );
  const messages = <>
    {info && <p className="gate-ok" role="status">{info}</p>}
    {err && <p className="gate-err gate-alert" role="alert">{err}</p>}
  </>;
  const head = (title: string, sub: string, mood: 'point' | 'think' = 'point') => (
    <div className="gate-head"><Kaal mood={mood} size={74} />
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
          {head("Who's on the case tonight?", 'Log in with your NxtWave ID and your password.')}
          {messages}
          {idField(true)}
          <PasswordField id="gate-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" autoFocus={lockId}
            error={tried && !password ? 'Please type your password.' : null} />
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
          <p className="muted small gate-note">
            <button type="button" className="linkish" onClick={() => go('forgot')}>Forgot password?</button>
            {recover && <> · <button type="button" className="linkish" onClick={() => go('findid')}>Forgot your NxtWave ID?</button></>}
            {' '}· New here? <button type="button" className="linkish" onClick={() => go('signup')}>Sign up</button>
          </p>
        </form>
      )}

      {view === 'signup' && (
        <form className="gate-card" onSubmit={submitSignup} noValidate aria-labelledby="gate-title">
          {tabs}
          {head('Create your account', 'Your password keeps your progress yours. Nobody else can open your case file.')}
          {messages}
          <div className="gate-field">
            <label htmlFor="gate-name"><span>Your name</span></label>
            <input id="gate-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" placeholder="e.g. Priya Sharma"
              aria-invalid={tried && !nameOk} aria-describedby={tried && !nameOk ? 'gate-name-err' : undefined} />
            {tried && !nameOk && <small id="gate-name-err" className="gate-err">Please type your name (letters and spaces, at least 2).</small>}
          </div>
          {idField(false)}
          <EmailField value={email} onChange={setEmail} bad={tried && !emailOk} account />
          <PasswordField id="gate-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN} letters or numbers. Do not share it.`} error={tried && !validPassword(password) ? PASS_ERR : null} />
          <PasswordField id="gate-password2" label="Type the password again" value={again} onChange={setAgain} autoComplete="new-password"
            error={tried && validPassword(password) && password !== again ? 'The two passwords are not the same.' : null} />
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create my account'}</button>
          <p className="muted small gate-note">Already have an account? <button type="button" className="linkish" onClick={() => go('login')}>Log in</button></p>
        </form>
      )}

      {view === 'newpass' && (
        <form className="gate-card" onSubmit={submitNewPass} noValidate aria-labelledby="gate-title">
          {head('Choose your password', `Logging in as ${idOk ?? id}.`, 'think')}
          {messages}
          <PasswordField id="gate-new-password" label="New password" value={fresh} onChange={setFresh} autoComplete="new-password" autoFocus
            hint={`At least ${PASSWORD_MIN} letters or numbers. Do not share it.`}
            error={tried && !validPassword(fresh) ? PASS_ERR : tried && fresh === password ? 'Choose a password that is different from the temporary one.' : null} />
          <PasswordField id="gate-password2" label="Type the password again" value={again} onChange={setAgain} autoComplete="new-password"
            error={tried && validPassword(fresh) && fresh !== again ? 'The two passwords are not the same.' : null} />
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and log in'}</button>
          <p className="muted small gate-note"><button type="button" className="linkish" onClick={() => go('login')}>Back to log in</button></p>
        </form>
      )}

      {view === 'forgot' && (
        <form className="gate-card" onSubmit={submitForgot} noValidate aria-labelledby="gate-title">
          {head('Forgot your password?', 'Type your NxtWave ID. We will email a code to the address you signed up with.', 'think')}
          {messages}
          {idField(true)}
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send me a code'}</button>
          <p className="muted small gate-note"><button type="button" className="linkish" onClick={() => go('login')}>Back to log in</button></p>
        </form>
      )}

      {view === 'code' && (
        <form className="gate-card" onSubmit={submitCode} noValidate aria-labelledby="gate-title">
          {head('Set a new password', `For ${idOk ?? id}. Type the code from the email, then your new password.`, 'think')}
          {messages}
          <div className="gate-field">
            <label htmlFor="gate-code"><span>6-digit code</span></label>
            <input id="gate-code" required autoFocus inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code"
              placeholder="123456" aria-invalid={tried && !/^\d{6}$/.test(code)} aria-describedby={tried && !/^\d{6}$/.test(code) ? 'gate-code-err' : undefined} />
            {tried && !/^\d{6}$/.test(code) && <small id="gate-code-err" className="gate-err">Type the 6 digits from the email.</small>}
          </div>
          <PasswordField id="gate-new-password" label="New password" value={fresh} onChange={setFresh} autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN} letters or numbers.`} error={tried && !validPassword(fresh) ? PASS_ERR : null} />
          <PasswordField id="gate-password2" label="Type the password again" value={again} onChange={setAgain} autoComplete="new-password"
            error={tried && validPassword(fresh) && fresh !== again ? 'The two passwords are not the same.' : null} />
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and log in'}</button>
          <p className="muted small gate-note"><button type="button" className="linkish" onClick={() => go('forgot')}>Send a new code</button> · <button type="button" className="linkish" onClick={() => go('login')}>Back to log in</button></p>
        </form>
      )}

      {view === 'findid' && (
        <form className="gate-card gate-recover" onSubmit={submitFindId} noValidate aria-labelledby="gate-title">
          {head('Forgot your NxtWave ID?', 'Type the email you signed up with. We will show you your ID.', 'think')}
          {messages}
          <div className="gate-field">
            <label htmlFor="gate-recover-email"><span>Personal email</span></label>
            <input id="gate-recover-email" type="email" inputMode="email" required autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setFound(null); }} maxLength={120}
              autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="e.g. priya.sharma@gmail.com"
              aria-invalid={tried && !emailOk} aria-describedby={tried && !emailOk ? 'gate-recover-err' : undefined} />
            {tried && !emailOk && <small id="gate-recover-err" className="gate-err">{EMAIL_ERR}</small>}
          </div>
          {found
            ? <>
                <p className="gate-ok" role="status">Your NxtWave ID is <b>{found.id}</b> ({found.name}).</p>
                <button className="btn primary big" type="button" onClick={() => { setId(found.id); go('login'); }}>Log in with this ID</button>
              </>
            : <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Looking…' : 'Find my ID'}</button>}
          <p className="muted small gate-note"><button type="button" className="linkish" onClick={() => go('login')}>Back to log in</button></p>
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
        ? 'Use your personal email - it is how you get back in if you forget your password or your ID.'
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
