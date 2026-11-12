import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import './ui/noir.css';
import { App } from './ui/App';
import { BriefingApp, SessionApp } from './ui/SessionApp';
import { ServicesProvider, type Services } from './ui/services';
import { ContentLoader } from './content/loader';
import type { SessionPack } from './content/types';
import { WorkerEngine } from './engine/sql/client';
import { LocalProgressStore } from './adapters/localProgressStore';
import { GuestAuth } from './adapters/guestAuth';
import { UrlAuth } from './adapters/urlAuth';
import { SittingStore } from './engine/runner/sitting';
import type { RunnerState } from './engine/runner/sessionRunner';
import { EmbedProgressStore, listenForRestore } from './ui/embed';
import { Outbox, RemoteProgressStore, startHeartbeat } from './adapters/remoteSync';
import { IdentityAuth, loadIdentity } from './adapters/identity';
import { Mailbox, SyncedSittingKV, restoreFromServer, setMailbox } from './adapters/serverSync';
import { IdentityGate, type GateDeps } from './ui/identity/IdentityGate';
import { installButtonFx } from './ui/fx';

installButtonFx();

// What this page is: the full case map (npm run dev), the briefing (before the first episode), one session, or one unit
// (one reading material). scripts/build-deploy.mjs writes <meta name="tmi-intro"> / <meta name="tmi-session"> / <meta name="tmi-unit">
// into each standalone site; in dev, ?intro=1, ?session=3 or ?unit=11 do the same.
const meta = (name: string) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content');
const query = new URLSearchParams(location.search);
const SESSION = Number(import.meta.env.VITE_SESSION ?? meta('tmi-session') ?? query.get('session') ?? 0);
const UNIT = Number(import.meta.env.VITE_UNIT ?? meta('tmi-unit') ?? query.get('unit') ?? 0);
const INTRO = Number(import.meta.env.VITE_INTRO ?? meta('tmi-intro') ?? query.get('intro') ?? 0);
// Where the content lives. Default: ./content next to the page. The compact S3 layout (scripts/build-s3.mjs) keeps ONE
// content folder for every site and says so with <meta name="tmi-content" content="../content">.
const CONTENT_BASE = meta('tmi-content') ?? undefined;

// Analytics (admin dashboard, ../analytics): on only when the build names the server, e.g. VITE_ANALYTICS_URL=https://… npm run build:s3
const ANALYTICS_URL = (import.meta.env.VITE_ANALYTICS_URL as string | undefined)?.replace(/\/+$/, '');
// The student types their name + NxtWave ID on the start screen (ui/identity/IdentityGate.tsx); that ID is the user id
// for everything below. With an analytics server, every event, heartbeat, feedback, chapter check-in and unfinished
// sitting goes to it (one database, the admin dashboard reads the same one), and a returning student's history comes back.
const local = new LocalProgressStore();
const mailboxOut = ANALYTICS_URL ? new Mailbox(ANALYTICS_URL, localStorage) : null;
setMailbox(mailboxOut);
const remote = ANALYTICS_URL ? new RemoteProgressStore(local, new Outbox(ANALYTICS_URL, localStorage)) : null;
const store = new EmbedProgressStore(remote ?? local);
const auth = new IdentityAuth(new UrlAuth(new GuestAuth()));   // the start screen's identity; before it (dev harness only) the old fallbacks
const services: Services = {
  loader: new ContentLoader(undefined, CONTENT_BASE, UNIT || null),
  engine: new WorkerEngine(),
  store,
  auth,
  sittings: new SittingStore<RunnerState>(mailboxOut ? new SyncedSittingKV(localStorage, mailboxOut) : localStorage),
};

const gate: GateDeps = {
  urlId: query.get('user_id')?.trim() || null,
  async identify(i) {
    if (!ANALYTICS_URL) return null;
    try {
      const res = await fetch(`${ANALYTICS_URL}/api/identify`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ student_id: i.id, name: i.name }) });
      if (res.ok) return await res.json() as { returning: boolean };
    } catch { /* offline */ }
    mailboxOut!.push('/api/identify', { student_id: i.id, name: i.name }, `identify:${i.id}`);   // retried later
    return null;
  },
  async restore(id) {
    if (!ANALYTICS_URL) return null;
    return restoreFromServer(ANALYTICS_URL, id, local, localStorage, { timeoutMs: 6000 });
  },
};
// once the student is known: accept a host 'restore', start heartbeats, send anything still queued
let wired = false;
function onIdentified() {
  if (wired || !loadIdentity()) return;
  wired = true;
  auth.currentUser().then((u) => {
    listenForRestore(store, u.id);
    if (remote) { startHeartbeat(remote, u.id, INTRO ? 0 : SESSION); void remote.outbox.flush(); }
    if (mailboxOut) {
      void mailboxOut.flush();
      setInterval(() => { if (mailboxOut.size()) void mailboxOut.flush(); }, 60_000);
      addEventListener('pagehide', () => { void mailboxOut.flush({ keepalive: true }); });
    }
  });
}
function Identified({ children }: { children: ReactNode }) {
  useEffect(onIdentified, []);
  return <>{children}</>;
}

// A unit site: load the unit pack first (it says which session it belongs to), then play it like a session
function UnitApp({ unit }: { unit: number }) {
  const [pack, setPack] = useState<SessionPack | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { services.loader.unitPack(unit).then(setPack).catch((e) => setError((e as Error).message)); }, [unit]);
  if (error) return <div className="page"><div className="page-inner" style={{ paddingTop: 40 }}><div className="panel" role="alert">{error}</div></div></div>;
  if (!pack?.unit) return <div className="page"><div className="page-inner" style={{ paddingTop: 40 }}><p className="muted">Loading…</p></div></div>;
  return <SessionApp session={pack.session} unit={pack.unit} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><ServicesProvider value={services}>
    <IdentityGate deps={gate}><Identified>
      {INTRO ? <BriefingApp /> : UNIT ? <UnitApp unit={UNIT} /> : SESSION ? <SessionApp session={SESSION} /> : <App />}
    </Identified></IdentityGate>
  </ServicesProvider></StrictMode>,
);
