// One episode as a standalone site (the deploy build): intro → play → done → evidence.
// No case map and no links to other episodes — the page that embeds it decides what comes next.
//   #/          intro ("the case so far", start / continue / start over)
//   #/play      playing        #/done   solved        #/evidence   evidence board
// BriefingApp is the standalone briefing site (deploy/intro): the page before the first episode.
import { lazy, Suspense, useEffect, useState } from 'react';
import { SessionIntro } from './screens/SessionIntro';
import { SessionDone } from './screens/SessionDone';
import { EvidenceBoard } from './screens/EvidenceBoard';
import { Briefing } from './screens/Briefing';
import { postToParent, startResizeReports } from './embed';
import { ThemeScope } from './components/ThemeScope';

const Player = lazy(() => import('./screens/Player').then((m) => ({ default: m.Player })));

type Route = 'intro' | 'play' | 'done' | 'evidence';
const parse = (h: string): Route => (h === '#/play' ? 'play' : h === '#/done' ? 'done' : h === '#/evidence' ? 'evidence' : 'intro');

export function SessionApp({ session, unit }: { session: number; unit?: { n: number; unit_id: string; part: number; parts: number } }) {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const on = () => { setRoute(parse(location.hash)); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    postToParent('ready', { session, ...(unit ? { unit: unit.n, unit_id: unit.unit_id, part: unit.part, parts: unit.parts } : {}) });
    startResizeReports(session);
    return () => removeEventListener('hashchange', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  const go = (h: string) => { location.hash = h; };

  return (
    <ThemeScope session={session}>
    <div className="app">
      <Suspense fallback={<p className="muted">Loading…</p>}>
        {route === 'intro' && <SessionIntro session={session} standalone onBack={() => go('#/evidence')} onStart={() => go('#/play')} />}
        {route === 'play' && <Player session={session} exitLabel="← Episode intro" onExit={() => go('#/')} onFinished={() => go('#/done')} />}
        {route === 'done' && <SessionDone session={session} hasNext={false} onNext={() => {}} onMap={() => go('#/evidence')} onReset={() => go('#/')} standalone />}
        {route === 'evidence' && <EvidenceBoard session={session} onBack={() => go('#/')} />}
      </Suspense>
    </div>
    </ThemeScope>
  );
}

export function BriefingApp() {
  useEffect(() => { postToParent('ready', { session: 0, intro: true }); startResizeReports(0); }, []);
  return <div className="app"><Briefing standalone /></div>;
}
