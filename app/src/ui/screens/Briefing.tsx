// The briefing: the page before the first episode. What happened, who you are, how the game works,
// tonight's timeline (every episode by name and story time), the people in the case, points and ranks, house rules.
// Standalone (deploy/intro) it is its own site; in the team build it is #/intro.
import { useEffect, useState } from 'react';
import type { CastFile } from '../../content/types';
import { resolveCastText } from '../../content/types';
import { POINTS, RANKS } from '../../engine/progress/derive';
import { useProgress } from '../useProgress';
import { rankIcon, solvedCount } from '../ranks';
import { useServices } from '../services';
import { storyTime } from '../speakers';
import { KaalCard } from '../kaal/KaalCard';
import { EPISODES, EPISODE_COUNT } from '../episodes';
import { isEmbedded, postToParent } from '../embed';
import { themeVars } from '../theme';
import { currentIdentity, personalize } from '../../adapters/identity';
import { Backdrop } from '../design/Backdrop';
import { Icon, type IconName } from '../design/Icon';
import { TopBar } from '../components/TopBar';
import { SAY } from '../kaal/lines';

const initials = (n?: string) => (n ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

interface Props { onStart?(): void; onBack?(): void; standalone?: boolean }
type Tile = { ico: IconName; title: string; text: string };

const LOOP: Tile[] = [
  { ico: 'story', title: 'Read the story', text: 'Chats, notifications and calls from the case - one step at a time.' },
  { ico: 'scroll', title: 'Learn a tool', text: 'One idea from the course at a time. Tap the scroll to read the full reading material.' },
  { ico: 'code', title: 'Run SQL', text: 'Write a query on the real case database. Wrong query? You get a wrong lead, not a red X.' },
  { ico: 'pin', title: 'Pin the evidence', text: 'Every answer becomes a clue on your Evidence Board - with the query that proved it.' },
];

const TOOLS: Tile[] = [
  { ico: 'puzzle', title: 'Activities', text: 'Sort, match, order and spot-the-cell puzzles between the SQL tasks.' },
  { ico: 'check', title: 'Quick checks', text: 'One question. The explanation is the lesson, right or wrong.' },
  { ico: 'envelope', title: 'Hints, 3 levels', text: 'A course note, a fill-in-the-blanks skeleton, then the full answer. Hints cost a few points, never the task.' },
  { ico: 'warn', title: 'Traps', text: 'Common mistakes from the course are built in. A wrong query gives a wrong lead - fixing it is the lesson.' },
  { ico: 'chat', title: 'Ask Kaal', text: 'Tap Kaal in the corner and ask anything about the game. He is your assistant all night.' },
  { ico: 'save', title: 'Stop any time', text: 'Your progress is saved. Come back later and continue from the same step.' },
];

const RULES: { ico: IconName; text: string }[] = [
  { ico: 'shield', text: 'Tara is missing, not hurt. No violence, ever.' },
  { ico: 'clue', text: 'Evidence, not noise. Every claim needs a query behind it.' },
  { ico: 'people', text: 'Fans deserve respect. Nobody gets shamed online in this case.' },
  { ico: 'spark', text: 'Everyone and every place in the story is fictional.' },
];

export function Briefing({ onStart, onBack, standalone = false }: Props) {
  const { progress } = useProgress();
  const rank = progress?.rank ?? 'Intern';
  const solved = solvedCount(progress);
  const { loader } = useServices();
  const [cast, setCast] = useState<CastFile | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { loader.cast().then(setCast).catch(() => setCast(null)); }, [loader]);
  const premise = cast?.premise ? resolveCastText(cast.premise, cast) : EPISODES[0].teaser;
  const people = cast ? ['star', 'mentor', 'analyst', 'sister', 'manager', 'rival', 'fan', 'driver', 'organiser'].filter((k) => cast.people[k]).map((k) => ({ key: k, ...cast.people[k], role: resolveCastText(cast.people[k].role, cast) })) : [];
  const star = cast?.people.star?.name ?? 'Tara Sen';
  const hometown = cast?.places?.hometown ?? 'Chandpur';
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
    ? <button className={`btn primary big ${extra}`} onClick={imReady} disabled={ready}>{ready ? 'Briefing complete' : "I'm ready"}</button>
    : <a className={`btn primary big ${extra}`} href={firstEpisode} onClick={imReady}>Start the first episode: {EPISODES[0].title}</a>);

  const FACTS: { cap: string; big: string; text: string }[] = [
    { cap: 'Who', big: star, text: `A young singer from ${hometown}, famous for her reels. Tonight is her first stadium concert in the city.` },
    { cap: 'When', big: '6:00 PM', text: 'Gone. She is not in her hotel room, and nobody saw her leave.' },
    { cap: 'No easy clues', big: 'Phone off', text: 'Her phone is switched off. There is no CCTV footage to look at.' },
    { cap: 'Deadline', big: 'Midnight', text: 'The concert starts at midnight and 40,000 fans are coming. Six hours to find her.' },
    { cap: 'Your job', big: 'Ask the data', text: 'The city records everything: hotel entries, cab rides, UPI payments, phone towers, toll booths. You ask that data questions with SQL, clue by clue.' },
  ];

  return (
    <div className="page" style={themeVars(1) as React.CSSProperties}>
      <Backdrop />
      <div className="page-inner">
        <TopBar time={storyTime(1)} rank={progress?.rank}>
          {onBack && <button className="btn small ghost" onClick={onBack}><Icon name="map" /> Case map</button>}
        </TopBar>

        <section className="brief-hero" aria-label="The case">
          <div className="stack">
            <div className="row"><span className="pill sun">A SQL mystery</span><span className="pill">{EPISODE_COUNT} episodes · one night</span></div>
            <h1 className="shadowed">SQL: The Missing Influencer</h1>
            <p className="lede">{premise}</p>
            <div className="row">
              {standalone ? readyButton('go') : <button className="btn primary big go" onClick={onStart}><Icon name="play" /> {`Start the first episode: ${EPISODES[0].title}`}</button>}
            </div>
            <p className="muted small">No SQL needed to start. You learn everything inside the case.</p>
          </div>
          <div className="phone-stack" aria-hidden="true">
            <div className="surface notification rise" style={{ '--i': 0 } as React.CSSProperties}><div className="from"><Icon name="bell" /> Breaking · 6:00 PM</div>Singer <b>{star}</b> is missing. Her stadium show starts at midnight.</div>
            <div className="surface notification rise" style={{ '--i': 1 } as React.CSSProperties}><div className="from"><Icon name="shield" /> {mentor} · Data Cell</div>Welcome, {personalize('{you}', 'intern')}. No CCTV, phone switched off. But this city writes everything down.</div>
            <div className="surface notification rise" style={{ '--i': 2 } as React.CSSProperties}><div className="from"><Icon name="db" /> Case database</div>Hotel register · cab rides · UPI · phone towers · toll plaza. Your only witness.</div>
          </div>
        </section>

        <section className="section" aria-label="The story">
          <div className="surface card brief-story rise">
            <h2>The story</h2>
            <p>{star} is a young singer from {hometown} whose reels made her famous. Tonight at midnight she is meant to sing her first
              stadium concert in the city, in front of 40,000 fans. At 6 PM she is gone. She is not in her hotel room, nobody saw her
              leave, and her phone is switched off. There is no CCTV footage to look at. Her sister, her manager, the organisers and
              thousands of fans are all asking the same question: where is {star.split(' ')[0]}? The show starts at midnight. That leaves six hours.</p>
            <h2>What this game is about</h2>
            <p>You are the new intern at the City Police Data Cell, working with SI {mentor}. There are no
              witnesses, but the city writes everything down: hotel entries, cab rides, UPI payments, phone towers, toll booths.
              Over {EPISODE_COUNT} episodes, from 6 PM to midnight, you ask that data questions in SQL. Every answer becomes a clue on
              your Evidence Board. You don't need any SQL to start: you learn it while you solve the case.</p>
          </div>
        </section>

        <section className="section" aria-label="What happened">
          <h2 className="shadowed">At a glance: what happened to {star}?</h2>
          <p className="sub">Here is everything the police know at 6 PM. The rest, you will find in the data.</p>
          <div className="facts">
            {FACTS.map((f, i) => <div key={f.cap} className="card fact rise" style={{ '--i': i } as React.CSSProperties}><span className="cap">{f.cap}</span><b>{f.big}</b><p>{f.text}</p></div>)}
          </div>
        </section>

        <section className="section" aria-label="Your role">
          <h2 className="shadowed">{personalize('{you}', 'You')}, you are the new intern at the City Police Data Cell.</h2>
          <p className="sub">Your mentor is <b>SI {mentor}</b>. There is no CCTV and no phone signal. There is data - and every clue tonight comes from a query you write. Stop any time; you continue from the same step.</p>
          <div className="tiles">
            {LOOP.map((s, i) => <div key={s.title} className="surface card tile rise" style={{ '--i': i } as React.CSSProperties}><span className="tile-n" aria-hidden="true">{i + 1}</span><Icon name={s.ico} className="xl" /><b>{s.title}</b><p>{s.text}</p></div>)}
          </div>
        </section>

        <section className="section" aria-label="Your assistant">
          <h2 className="shadowed">Your assistant tonight</h2>
          <KaalCard size={110} mood="whisper" title="Kaal · your assistant" line={SAY.briefing(star)} />
        </section>

        <section className="section" aria-label="Tonight's timeline">
          <h2 className="shadowed">Tonight, 6 PM to midnight</h2>
          <p className="sub">Every episode is named after what happens in it. The clock is story time only - there is no real timer.</p>
          <ol className="ep-list">
            {EPISODES.map((e, i) => (
              <li key={e.n} className={`surface ep-row rise ${i === 0 ? 'first' : ''}`} style={{ ...themeVars(e.n), '--i': i } as React.CSSProperties}>
                <span className="ep-n" aria-hidden="true">{e.n}</span>
                <span className="t">{storyTime(e.n)}</span>
                <div><h3><span>{e.title}</span>{i === 0 && <span className="pill sun" style={{ marginLeft: 8 }}>start here</span>}</h3><p>{e.teaser}</p></div>
                <span className="pill wrap learn">{e.learn}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" aria-label="What you will be doing">
          <h2 className="shadowed">What's in the toolkit</h2>
          <div className="tiles">
            {TOOLS.map((s, i) => <div key={s.title} className="surface card tile rise" style={{ '--i': i } as React.CSSProperties}><Icon name={s.ico} className="xl" /><b>{s.title}</b><p>{s.text}</p></div>)}
          </div>
        </section>

        {people.length > 0 && (
          <section className="section" aria-label="The people">
            <h2 className="shadowed">The people in the case</h2>
            <p className="sub">Some are helpers. Some are suspects. The data decides who is which.</p>
            <div className="cast">
              <div className="surface card person you rise"><div className="portrait" aria-hidden="true">{initials(currentIdentity()?.name) || 'YOU'}</div><b>{currentIdentity()?.name ?? 'You'}</b><span>That's you! {rank}, Data Cell. You write every query.</span></div>
              {people.map((p, i) => (
                <div key={p.key} className="surface card person rise" style={{ '--i': i + 1 } as React.CSSProperties}>
                  <div className="portrait" style={{ background: p.color }} aria-hidden="true">{p.initials}</div>
                  <b>{p.name}</b><span>{p.role}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="section" aria-label="Points and ranks">
          <h2 className="shadowed">Points and ranks</h2>
          <p className="sub">A correct query is worth {POINTS.taskPassed} points (+{POINTS.firstTryBonus} first try, no hints). Activities, quick checks and pinned clues add more. Solve episodes to rank up.</p>
          <div className="ranks">
            {RANKS.map((r) => (
              <div key={r.name} className={`rank ${r.name === rank ? 'current' : ''} ${solved >= r.minSessions ? 'earned' : ''}`}>
                <Icon name={rankIcon(r.name)} className="lg" /><b>{r.name}</b>
                <span>{r.minSessions === 0 ? 'where you start' : `${r.minSessions} episodes solved`}</span>{r.name === rank && <em>You are here</em>}
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-label="House rules">
          <h2 className="shadowed">House rules</h2>
          <div className="rules">
            {RULES.map((r) => <div key={r.text} className="rule"><Icon name={r.ico} className="lg" /><span>{r.text}</span></div>)}
          </div>
        </section>

        <section className="surface card ready" aria-label="Ready">
          <h2>Ready, {personalize('{you}', 'intern')}?</h2>
          <p>{standalone
            ? (embedded
                ? (ready ? `Briefing done. Open the first episode, "${EPISODES[0].title}", from your course to begin.` : `Next in your course: the first episode, "${EPISODES[0].title}" - ${storyTime(1)}.`)
                : `The first episode, "${EPISODES[0].title}", starts at ${storyTime(1)}.`)
            : `The first episode, "${EPISODES[0].title}", starts at ${storyTime(1)}.`}</p>
          {standalone
            ? readyButton('')
            : <button className="btn primary big go" onClick={onStart}><Icon name="play" /> Start: {EPISODES[0].title}</button>}
        </section>
      </div>
    </div>
  );
}
