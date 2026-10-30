import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
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
const remote = ANALYTICS_URL ? new RemoteProgressStore(new LocalProgressStore(), new Outbox(ANALYTICS_URL, localStorage)) : null;
const store = new EmbedProgressStore(remote ?? new LocalProgressStore());
const auth = new UrlAuth(new GuestAuth());   // ?user_id=… from the embedding platform, else a guest id on this device
const services: Services = {
  loader: new ContentLoader(undefined, CONTENT_BASE, UNIT || null),
  engine: new WorkerEngine(),
  store,
  auth,
  sittings: new SittingStore<RunnerState>(localStorage),
};
auth.currentUser().then((u) => {
  listenForRestore(store, u.id);
  if (remote) { startHeartbeat(remote, u.id, INTRO ? 0 : SESSION); void remote.outbox.flush(); }
});

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
    {INTRO ? <BriefingApp /> : UNIT ? <UnitApp unit={UNIT} /> : SESSION ? <SessionApp session={SESSION} /> : <App />}
  </ServicesProvider></StrictMode>,
);
