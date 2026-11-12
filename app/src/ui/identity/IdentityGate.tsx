// The start screen: the student's name and NxtWave ID, asked once per device before anything else (no password).
// With an analytics server (VITE_ANALYTICS_URL) it also registers the student (POST /api/identify) and, for a returning
// student, pulls their history from the server into this device before the game opens (adapters/serverSync.ts), so their
// episodes, points, clues, unfinished episode and feedback carry over. Every later page load refreshes that history first
// (briefly: "Opening your case file…"), so playing on two devices stays in step.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadIdentity, normalizeId, normalizeName, saveIdentity, setCurrentIdentity, type Identity } from '../../adapters/identity';
import type { RestoreResult } from '../../adapters/serverSync';
import { Kaal } from '../kaal/Kaal';

export interface GateDeps {
  // registers the student; resolves to whether the server knows them (null = no server / offline)
  identify(i: Identity): Promise<{ returning: boolean } | null>;
  // pulls the student's history into this device (null = no server)
  restore(id: string): Promise<RestoreResult | null>;
  // the id the embedding platform passed as ?user_id= (prefilled)
  urlId: string | null;
}

type Phase = { k: 'form' } | { k: 'loading'; who: Identity; first: boolean } | { k: 'ready' };

export function IdentityGate({ deps, children }: { deps: GateDeps; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(() => {
    const saved = loadIdentity();
    // a stored identity is used unless the platform names a different student in the URL
    if (saved && (!deps.urlId || normalizeId(deps.urlId) === saved.id)) return { k: 'loading', who: saved, first: false };
    return { k: 'form' };
  });
  const [welcome, setWelcome] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (phase.k !== 'loading' || started.current) return;
    started.current = true;
    const { who, first } = phase;
    setCurrentIdentity(who);
    (async () => {
      const known = first ? await deps.identify(who) : null;
      const r = await deps.restore(who.id);
      if (first && (known?.returning || (r && r.events > 0)))
        setWelcome(`Welcome back, ${who.name.split(' ')[0]}! ${r && r.events > 0 ? 'Your case file is restored.' : 'Good to see you again.'}`);
      setPhase({ k: 'ready' });
    })();
  }, [phase, deps]);

  if (phase.k === 'ready') return <>{welcome && <WelcomeToast text={welcome} />}{children}</>;
  if (phase.k === 'loading') return (
    <div className="gate"><div className="gate-card" role="status" aria-live="polite">
      <Kaal mood="think" size={70} /><p className="gate-wait">Opening your case file, {phase.who.name.split(' ')[0]}…</p>
    </div></div>
  );
  return <GateForm urlId={deps.urlId} onDone={(who) => { saveIdentity(who); setPhase({ k: 'loading', who, first: true }); }} />;
}

function GateForm({ urlId, onDone }: { urlId: string | null; onDone(i: Identity): void }) {
  const [name, setName] = useState('');
  const [id, setId] = useState(urlId ?? '');
  const [tried, setTried] = useState(false);
  const nameOk = normalizeName(name), idOk = normalizeId(id);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (nameOk && idOk) onDone({ id: idOk, name: nameOk, at: new Date().toISOString() });
  };
  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit} noValidate aria-labelledby="gate-title">
        <div className="gate-head"><Kaal mood="point" size={74} />
          <div><span className="sticker">Police Data Cell · New recruit</span>
            <h1 id="gate-title">Who's on the case tonight?</h1>
            <p className="muted small">Tell us your name and NxtWave ID. Use the same ID every time - it keeps your progress safe, even on another computer.</p></div>
        </div>
        <label className="gate-field">
          <span>Your name</span>
          <input autoFocus={!urlId} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" placeholder="e.g. Priya Sharma"
            aria-invalid={tried && !nameOk} aria-describedby="gate-name-err" />
          {tried && !nameOk && <small id="gate-name-err" className="gate-err">Please type your name (letters and spaces, at least 2).</small>}
        </label>
        <label className="gate-field">
          <span>NxtWave ID</span>
          <input autoFocus={!!urlId} value={id} onChange={(e) => setId(e.target.value)} maxLength={64} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            placeholder="Your NxtWave ID" aria-invalid={tried && !idOk} aria-describedby="gate-id-err" />
          {tried && !idOk && <small id="gate-id-err" className="gate-err">Please type your NxtWave ID (letters and numbers, at least 3).</small>}
        </label>
        <button className="btn primary big" type="submit">Open the case file →</button>
        <p className="muted small gate-note">No password needed. Coming back? Type the same ID and you'll continue where you left off.</p>
      </form>
    </div>
  );
}

function WelcomeToast({ text }: { text: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 4500); return () => clearTimeout(t); }, []);
  return on ? <div className="welcome-toast" role="status">{text}</div> : null;
}
