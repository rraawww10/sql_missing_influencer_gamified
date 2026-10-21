// App shell with hash routes, so a refresh keeps the learner where they were:
//   #/            case map          #/intro    the briefing (before the first episode)
//   #/s/3         episode intro     #/play/3   playing        #/done/3   episode solved
//   #/evidence    evidence board    #/dev      engine dev harness (team only)
import { lazy, Suspense, useEffect, useState } from 'react';
import { Home } from './screens/Home';
import { Briefing } from './screens/Briefing';
import { SessionIntro } from './screens/SessionIntro';
import { SessionDone } from './screens/SessionDone';
import { EvidenceBoard } from './screens/EvidenceBoard';
import { useServices } from './services';
import { ThemeScope } from './components/ThemeScope';

// heavy screens load on demand: the Player brings CodeMirror; the dev harness is team-only
const Player = lazy(() => import('./screens/Player').then((m) => ({ default: m.Player })));
const DevHarness = lazy(() => import('../dev/DevHarness').then((m) => ({ default: m.DevHarness })));

type Route = { name: 'home' } | { name: 'intro' | 'play' | 'done'; n: number } | { name: 'briefing' } | { name: 'evidence' } | { name: 'dev' };

function parse(hash: string): Route {
  const m = hash.match(/^#\/(s|play|done)\/(\d+)$/);
  if (m) return { name: m[1] === 's' ? 'intro' : (m[1] as 'play' | 'done'), n: Number(m[2]) };
  if (hash === '#/intro') return { name: 'briefing' };
  if (hash === '#/evidence') return { name: 'evidence' };
  if (hash === '#/dev') return { name: 'dev' };
  return { name: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [built, setBuilt] = useState<number[]>([]);
  const { loader } = useServices();
  useEffect(() => {
    const on = () => { setRoute(parse(location.hash)); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => { loader.index().then((i) => setBuilt(i.map((e) => e.session))).catch(() => {}); }, [loader]);
  const go = (hash: string) => { location.hash = hash; };

  return (
    <div className="app">
      <Suspense fallback={<p className="muted">Loading…</p>}>
      {route.name === 'home' && <Home onOpen={(n) => go(`#/s/${n}`)} onEvidence={() => go('#/evidence')} onBriefing={() => go('#/intro')} />}
      {route.name === 'briefing' && <Briefing onBack={() => go('#/')} onStart={() => go('#/s/1')} />}
      {route.name === 'intro' && <ThemeScope session={route.n}><SessionIntro session={route.n} onBack={() => go('#/')} onStart={() => go(`#/play/${route.n}`)} onBriefing={() => go('#/intro')} /></ThemeScope>}
      {route.name === 'play' && <ThemeScope session={route.n}><Player key={route.n} session={route.n} onExit={() => go('#/')} onFinished={() => go(`#/done/${route.n}`)} /></ThemeScope>}
      {route.name === 'done' && <ThemeScope session={route.n}><SessionDone session={route.n} hasNext={built.includes(route.n + 1)} onNext={() => go(`#/s/${route.n + 1}`)} onMap={() => go('#/')} onReset={() => go(`#/s/${route.n}`)} /></ThemeScope>}
      {route.name === 'evidence' && <EvidenceBoard onBack={() => go('#/')} />}
      {route.name === 'dev' && <DevHarness />}
      </Suspense>
    </div>
  );
}
