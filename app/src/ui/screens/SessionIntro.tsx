// Before an episode: the story clock, the title, what's inside (tasks, clues, the SQL it uses), how it works,
// "the case so far" (clues from earlier episodes), and start / continue / reset.
import { useEffect, useState } from 'react';
import type { SessionPack } from '../../content/types';
import { useServices } from '../services';
import { storyTime } from '../speakers';
import { Markdown } from '../components/Markdown';
import { SceneArt } from '../art/SceneArt';
import { ResetControl } from '../components/ResetControl';
import { useProgress } from '../useProgress';
import { progressOf } from '../../engine/progress/derive';
import { packScope } from '../../content/types';
import { episodeOf, episodeTitle, unitLabel } from '../episodes';
import { KaalCard } from '../kaal/KaalCard';
import { SAY, TEASE } from '../kaal/lines';
import { Backdrop } from '../design/Backdrop';
import { Icon, type IconName } from '../design/Icon';
import { TopBar } from '../components/TopBar';

interface Props { session: number; onStart(): void; onBack(): void; onBriefing?(): void; standalone?: boolean }

const HOW: { ico: IconName; title: string; text: string }[] = [
  { ico: 'story', title: 'Story', text: 'Read the chats and notifications, one step at a time.' },
  { ico: 'scroll', title: 'Learn', text: 'Learn one idea from the course. Tap the scroll for the full reading material.' },
  { ico: 'code', title: 'SQL console', text: 'Run queries on the real case database. Hints if you get stuck.' },
  { ico: 'pin', title: 'Evidence', text: 'Pin what you prove. Finish the episode to solve it.' },
];

export function SessionIntro({ session, onStart, onBack, onBriefing, standalone = false }: Props) {
  const { loader, auth, sittings } = useServices();
  const { progress, reload } = useProgress();
  const [pack, setPack] = useState<SessionPack | null>(null);
  const [error, setError] = useState('');
  const [resumable, setResumable] = useState(false);
  const [notice, setNotice] = useState('');
  const check = () => Promise.all([auth.currentUser(), loader.pack(session)]).then(([u, p]) => setResumable(sittings.canResume(u.id, packScope(p)))).catch(() => {});
  useEffect(() => {
    loader.pack(session).then(setPack).catch((e) => setError((e as Error).message));
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, session]);

  if (error) return <div className="page"><Backdrop /><div className="page-inner narrow"><div className="surface card panel" role="alert">{error}</div></div></div>;
  if (!pack) return <div className="page"><Backdrop /><div className="page-inner narrow"><p className="loading">Loading…</p></div></div>;
  const unit = pack.unit;
  const ep = episodeOf(session);
  const title = episodeTitle(session, pack.title);
  const mine = progressOf(progress, session, unit?.n);
  const done = mine?.status === 'completed';
  const tasks = pack.beats.filter((b) => b.type === 'task').length;
  const clues = pack.beats.filter((b) => b.type === 'clue').length;
  const first = session === 1 && (!unit || unit.part === 1);
  return (
    <div className="page">
      <Backdrop />
      <div className="page-inner">
        <TopBar time={storyTime(session)} rank={progress?.rank}>
          <button className="btn small ghost" onClick={onBack}><Icon name={standalone ? 'pin' : 'map'} /> {standalone ? 'Evidence Board' : 'Case map'}</button>
        </TopBar>

        <section className="hero pop-in">
          <div className="hero-info">
            <div className="row">
              <span className="pill sun"><Icon name="clock" /> {storyTime(session)}</span>
              {unit && unit.parts > 1 && <span className="pill white">Part {unit.part} of {unit.parts}</span>}
              {done && <span className="pill mint"><Icon name="tick" /> solved · {mine!.points} pts</span>}
            </div>
            <h1 className="shadowed">{title}</h1>
            {unit && !unit.finale && <p className="unit-line"><Icon name="scroll" /> <b>{unitLabel(unit)}</b></p>}
            <p className="teaser">{standalone ? <><b>{pack.headline}</b> {pack.premise}</> : ep.teaser}</p>
            {notice && <p className="notice" role="status">{notice}</p>}
            <div className="row mission-actions">
              <button className="btn primary big go" onClick={onStart}><Icon name="play" /> {resumable ? 'Continue where I left off' : done ? 'Play again' : 'Start the episode'}</button>
              {(resumable || done) && <ResetControl session={session} onDone={() => { setNotice('Progress reset. You can start fresh.'); check(); reload(); }} />}
              {first && onBriefing && <button className="btn ghost" onClick={onBriefing}><Icon name="flag" /> New here? Read the briefing</button>}
            </div>
            <p className="muted small"><Icon name="save" /> Stop any time - your place is saved.</p>
          </div>
          <div className="surface card epcard">
            <SceneArt session={session} height={132} />
            <div className="epcard-body">
              <div className="stats">
                {tasks > 0 && <div className="stat"><b>{tasks}</b><span>SQL task{tasks === 1 ? '' : 's'}</span></div>}
                {clues > 0 && <div className="stat"><b>{clues}</b><span>clue{clues === 1 ? '' : 's'} to find</span></div>}
              </div>
              <div><span className="cap">SQL you will use</span>
                <ul className="tags">{ep.learn.split(', ').map((x) => <li key={x} className="pill">{x}</li>)}</ul></div>
            </div>
          </div>
        </section>

        <KaalCard mood={first ? 'whisper' : 'think'} title="Kaal · your assistant" line={first
          ? SAY.introFirst()   /* he introduces himself once, on the Briefing */
          : resumable ? SAY.introBack(session) : (TEASE[session] ?? ep.teaser)} />

        {pack.previously.length > 0 && (
          <section className="section" aria-label="Previously on the case">
            <h2 className="shadowed">Previously on the case</h2>
            <div className="recap">
              {pack.previously.slice(-6).map((c, i) => (
                <article key={c.clue_id} className="surface polaroid rise" style={{ '--i': i } as React.CSSProperties}>
                  <span className="cap">{c.session === session ? 'Earlier tonight' : storyTime(c.session)}</span>
                  <b><Icon name="pin" /> {c.title}</b>
                </article>
              ))}
            </div>
          </section>
        )}

        {(first || standalone) && (
          <section className="section" aria-label="How it works">
            <h2 className="shadowed">How this works</h2>
            <div className="tiles">
              {HOW.map((h, i) => <div key={h.title} className="surface card tile rise" style={{ '--i': i } as React.CSSProperties}><span className="tile-n" aria-hidden="true">{i + 1}</span><Icon name={h.ico} className="xl" /><b>{h.title}</b><p>{h.text}</p></div>)}
            </div>
          </section>
        )}

        {pack.previously.length > 0 && (
          <section className="section" aria-label="The case so far">
            <h2 className="shadowed">The case so far</h2>
            <div className="evidence">
              {pack.previously.map((c) => (
                <article key={c.clue_id} className="surface card evi">
                  <div className="cap">{c.session === session ? 'Earlier in this episode' : `${episodeTitle(c.session)} · ${storyTime(c.session)}`}</div>
                  <h4>{c.title}</h4>
                  <Markdown source={c.body} />
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
