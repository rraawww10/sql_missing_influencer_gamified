// The briefing: the page before the first episode. Who you are, what happened, how the game works,
// tonight's timeline (every episode by name and story time), the people in the case, points and ranks, house rules.
// Standalone (deploy/intro) it is its own site; in the team build it is #/intro.
import { useEffect, useState } from 'react';
import type { CastFile } from '../../content/types';
import { resolveCastText } from '../../content/types';
import { POINTS, RANKS } from '../../engine/progress/derive';
import { useServices } from '../services';
import { storyTime } from '../speakers';
import { SceneArt } from '../art/SceneArt';
import { EPISODES, EPISODE_COUNT } from '../episodes';
import { isEmbedded, postToParent } from '../embed';
import { themeVars } from '../theme';

interface Props { onStart?(): void; onBack?(): void; standalone?: boolean }

const LOOP = [
  { ico: '💬', title: 'Read the story', text: 'Chats, notifications and calls from the case — one step at a time.' },
  { ico: '📖', title: 'Learn a Case Note', text: 'One idea from the course, explained in the words of the case.' },
  { ico: '💻', title: 'Run SQL', text: 'Write a query on the real case database. Wrong query? You get a wrong lead, not a red X.' },
  { ico: '📌', title: 'Pin the evidence', text: 'Every answer becomes a clue on your Evidence Board — with the query that proved it.' },
];

const TOOLS = [
  { ico: '🧩', title: 'Activities', text: 'Sort, match, order and spot-the-cell puzzles between the SQL tasks.' },
  { ico: '❓', title: 'Quick checks', text: 'Ira asks one question. The explanation is the lesson, right or wrong.' },
  { ico: '💡', title: 'Hints, 3 levels', text: 'A Case Note, a fill-in-the-blanks skeleton, then the full answer. Hints cost a few points, never the task.' },
  { ico: '⚠️', title: 'Traps', text: 'Common mistakes from the course are built in. A wrong query gives a wrong lead — fixing it is the lesson.' },
  { ico: '🔎', title: 'Evidence Board', text: 'A cork board of every clue you proved, across all episodes.' },
  { ico: '💾', title: 'Stop any time', text: 'Progress saves on this device. Come back later and continue from the same step.' },
];

const RULES = [
  { ico: '🫶', text: 'Tara is missing, not hurt. No violence, ever.' },
  { ico: '🧾', text: 'Evidence, not noise. Every claim needs a query behind it.' },
  { ico: '🙅', text: 'Fans deserve respect. Nobody gets shamed online in this case.' },
  { ico: '🛡️', text: 'Everyone and every place in the story is fictional.' },
];

export function Briefing({ onStart, onBack, standalone = false }: Props) {
  const { loader } = useServices();
  const [cast, setCast] = useState<CastFile | null>(null);
  const [minutes, setMinutes] = useState<Record<number, number>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    loader.cast().then(setCast).catch(() => setCast(null));
    loader.index().then((i) => setMinutes(Object.fromEntries(i.map((e) => [e.session, e.minutes])))).catch(() => {});
  }, [loader]);
  const premise = cast?.premise ? resolveCastText(cast.premise, cast) : EPISODES[0].teaser;
  const people = cast ? ['star', 'mentor', 'analyst', 'sister', 'manager', 'rival', 'fan', 'driver', 'organiser'].filter((k) => cast.people[k]).map((k) => ({ key: k, ...cast.people[k], role: resolveCastText(cast.people[k].role, cast) })) : [];
  const total = Object.values(minutes).reduce((a, b) => a + b, 0);
  const star = cast?.people.star?.name ?? 'Tara Sen';
  const mentor = cast?.people.mentor?.name ?? 'Ira Menon';

  // Standalone the briefing is its own site. Inside the LMS iframe the host decides what comes next, so the
  // button only reports "done"; opened directly there is no host, so it links to the first episode's site.
  const embedded = isEmbedded();
  const firstEpisode = `../s01/index.html${location.search}`;
  const imReady = () => {
    setReady(true);
    postToParent('completed', { session: 0, intro: true, points: 0, hints: 0, traps: 0 });
    onStart?.();
  };
  // both "I'm ready" buttons are the same button, so they always say the same thing
  const readyButton = (extra: string) => (embedded
    ? <button className={`btn primary big ${extra}`} onClick={imReady} disabled={ready}>{ready ? '✓ Briefing complete' : "I'm ready →"}</button>
    : <a className={`btn primary big ${extra}`} href={firstEpisode} onClick={imReady}>Start the first episode: {EPISODES[0].title} →</a>);

  return (
    <div className="page themed" style={themeVars(1) as React.CSSProperties}>
      <div className="page-inner">
        <nav className="topnav">
          <span className="brand">Police Data Cell · Case briefing</span>
          {onBack && <button className="btn small ghost" onClick={onBack}>← Case map</button>}
        </nav>

        <section className="brief-hero" aria-label="The case">
          <SceneArt session={1} fill />
          <div className="shade" aria-hidden="true" />
          <div className="phone-stack" aria-hidden="true">
            <div className="notification" style={{ '--i': 0 } as React.CSSProperties}><div className="app"><i>🔔</i> Breaking · 6:00 PM</div>Singer <b>{star}</b> is missing. Her stadium show starts at midnight.</div>
            <div className="notification" style={{ '--i': 1 } as React.CSSProperties}><div className="app"><i>👮</i> {mentor} · Data Cell</div>Welcome, intern. No CCTV, phone switched off. But this city writes everything down.</div>
            <div className="notification" style={{ '--i': 2 } as React.CSSProperties}><div className="app"><i>🗄️</i> Case database</div>Hotel register · cab rides · UPI · phone towers · toll plaza. Your only witness.</div>
          </div>
          <div className="hero-body">
            <div className="row"><span className="sticker">A SQL mystery</span><span className="sticker paper">{EPISODE_COUNT} episodes · one night</span></div>
            <h1 className="gradient-text">SQL: The Missing Influencer</h1>
            <p className="lede">{premise}</p>
            <div className="cta">
              {standalone ? readyButton('go') : <button className="btn primary big go" onClick={onStart}>{`▶ Start the first episode: ${EPISODES[0].title}`}</button>}
              <span className="muted small">No SQL needed to start. You learn everything inside the case.</span>
            </div>
          </div>
        </section>

        <div className="ticker" aria-hidden="true">
          <div>{[...EPISODES, ...EPISODES].map((e, i) => <span key={i}>{storyTime(e.n)} · {e.title}</span>)}</div>
        </div>

        <section className="section" aria-label="Your role">
          <h2>You are the new intern at the City Police Data Cell.</h2>
          <p className="sub">Your mentor is <b>SI {mentor}</b>. There is no CCTV and no phone signal. There is data — and every clue tonight comes from a query you write.
            {total > 0 && <> The whole case takes about <b>{Math.round(total / 60)} hours</b> of play, in episodes of 20–55 minutes. Stop any time.</>}</p>
          <div className="loop">
            {LOOP.map((s, i) => <div key={s.title} className="how rise" style={{ '--i': i } as React.CSSProperties}><div className="ico">{s.ico}</div><b>{s.title}</b><p>{s.text}</p></div>)}
          </div>
        </section>

        <section className="section" aria-label="Tonight's timeline">
          <h2>Tonight, 6 PM → midnight</h2>
          <p className="sub">Every episode is named after what happens in it. The clock is story time only — there is no real timer.</p>
          <ol className="ep-list">
            {EPISODES.map((e, i) => (
              <li key={e.n} className={`ep-row rise ${i === 0 ? 'first' : ''}`} style={{ '--i': i } as React.CSSProperties}>
                <span className="t">{storyTime(e.n)}{minutes[e.n] && <><br /><span className="muted" style={{ fontWeight: 500, letterSpacing: 0 }}>~{minutes[e.n]} min</span></>}</span>
                <span className="e" aria-hidden="true">{e.emoji}</span>
                <div><h3><span>{e.title}</span>{i === 0 && <span className="sticker flat" style={{ marginLeft: 8 }}>start here</span>}</h3><p>{e.teaser}</p></div>
                <span className="chip learn">{e.learn}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" aria-label="What you will be doing">
          <h2>What's in the toolkit</h2>
          <div className="howto">
            {TOOLS.map((s, i) => <div key={s.title} className="how rise" style={{ '--i': i } as React.CSSProperties}><div className="ico">{s.ico}</div><b>{s.title}</b><p>{s.text}</p></div>)}
          </div>
        </section>

        {people.length > 0 && (
          <section className="section" aria-label="The people">
            <h2>The people in the case</h2>
            <p className="sub">Some are helpers. Some are suspects. The data decides who is which.</p>
            <div className="cast">
              <div className="person you rise"><div className="portrait" aria-hidden="true">YOU</div><b>You</b><span>Intern, Data Cell. You write every query.</span></div>
              {people.map((p, i) => (
                <div key={p.key} className="person rise" style={{ '--i': i + 1 } as React.CSSProperties}>
                  <div className="portrait" style={{ background: p.color }} aria-hidden="true">{p.initials}</div>
                  <b>{p.name}</b><span>{p.role}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="section" aria-label="Points and ranks">
          <h2>Points, ranks, badges</h2>
          <p className="sub">A correct query is worth {POINTS.taskPassed} points (+{POINTS.firstTryBonus} first try, no hints). Activities, quick checks and pinned clues add more. Solve episodes to rank up.</p>
          <div className="ranks">
            {RANKS.map((r, i) => (
              <div key={r.name} style={{ display: 'contents' }}>
                {i > 0 && <span className="arrow" aria-hidden="true">→</span>}
                <div className="rank"><b>🎖 {r.name}</b><span>{r.minSessions === 0 ? 'where you start' : `${r.minSessions} episodes solved`}</span></div>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-label="House rules">
          <h2>House rules</h2>
          <div className="rules">
            {RULES.map((r) => <div key={r.text} className="rule"><span className="ico" aria-hidden="true">{r.ico}</span><span>{r.text}</span></div>)}
          </div>
        </section>

        <section className="ready" aria-label="Ready">
          <h2>Ready, intern?</h2>
          <p>{standalone
            ? (embedded
                ? (ready ? `Briefing done. Open the first episode, "${EPISODES[0].title}", from your course to begin.` : `Next in your course: the first episode, "${EPISODES[0].title}" — ${storyTime(1)}.`)
                : `The first episode, "${EPISODES[0].title}", starts at ${storyTime(1)}.`)
            : `The first episode, "${EPISODES[0].title}", starts at ${storyTime(1)}.`}</p>
          {standalone
            ? readyButton('')
            : <button className="btn primary big go" onClick={onStart}>▶ Start: {EPISODES[0].title}</button>}
        </section>
      </div>
    </div>
  );
}
