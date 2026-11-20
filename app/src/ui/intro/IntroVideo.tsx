// "How to play": a 90-second animated intro that plays like a video, built from the game's own look (no video file).
// Nine scenes, each with one line Kaal says (lines.ts INTRO_VIDEO, recorded in his voice) and captions in sync: a scene
// lasts as long as its recording (or a reading time when the sound is off). Play / pause, back / next, a progress bar
// per scene, mute, replay, close (Esc). Opens by itself on a student's first visit to the case map, and from the
// "How to play" buttons. Nothing is graded and nothing is saved except "seen" (per student, on this device).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { INTRO_VIDEO } from '../kaal/lines';
import { clipSeconds, hush, speak } from '../voice';
import { Kaal } from '../kaal/Kaal';
import { Icon } from '../design/Icon';
import { Medal } from '../components/Medal';
import { currentIdentity } from '../../adapters/identity';

const seenKey = () => `tmi.introvideo.seen.${currentIdentity()?.id ?? 'guest'}`;
export function introSeen(): boolean { try { return localStorage.getItem(seenKey()) === '1'; } catch { return true; } }
function markSeen() { try { localStorage.setItem(seenKey(), '1'); } catch { /* ignore */ } }

// reading time when there is no recording: ~13 characters a second, at least 4.5 s
const readSeconds = (t: string) => Math.max(4.5, t.length / 13 + 1);

export function IntroVideo({ onClose }: { onClose(): void }) {
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [len, setLen] = useState(5);          // this scene's length in seconds (drives the progress bar)
  const [run, setRun] = useState(0);          // bumps to restart the current scene's animations
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const done = idx >= INTRO_VIDEO.length;
  const close = useCallback(() => { clearTimeout(timer.current); hush(); markSeen(); onClose(); }, [onClose]);

  // play the current scene: say the line, wait for it, go to the next
  useEffect(() => {
    if (!started || !playing || done) return;
    let alive = true;
    const { line, mood } = INTRO_VIDEO[idx];
    (async () => {
      const secs = muted ? null : await clipSeconds(line);
      if (!alive) return;
      const total = (secs ?? readSeconds(line)) + 0.8;
      setLen(total);
      if (!muted) speak(line, { mood });
      timer.current = setTimeout(() => { if (alive) setIdx((i) => i + 1); }, total * 1000);
    })();
    return () => { alive = false; clearTimeout(timer.current); };
  }, [started, playing, idx, muted, run, done]);

  useEffect(() => { if (done) { setPlaying(false); markSeen(); } }, [done]);
  useEffect(() => () => { clearTimeout(timer.current); hush(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === ' ' && started && !done) { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight' && started) go(idx + 1);
      if (e.key === 'ArrowLeft' && started) go(idx - 1);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const go = (n: number) => { hush(); clearTimeout(timer.current); setIdx(Math.max(0, Math.min(INTRO_VIDEO.length, n))); setPlaying(true); setRun((r) => r + 1); };
  const toggle = () => { if (playing) { hush(); clearTimeout(timer.current); setPlaying(false); } else { setPlaying(true); setRun((r) => r + 1); } };
  const start = () => { setStarted(true); setPlaying(true); setIdx(0); setRun((r) => r + 1); };

  return (
    <div className="iv" role="dialog" aria-modal="true" aria-label="How to play: a 90-second intro">
      <div className="iv-frame">
        <button type="button" className="iv-x" onClick={close} aria-label="Close the intro"><Icon name="close" /></button>
        {!started ? (
          <div className="iv-poster">
            <span className="pill sun">SQL: The Missing Influencer</span>
            <h2>How to play</h2>
            <p>Your assistant shows you the case, the tools and the badges in 90 seconds.</p>
            <button type="button" className="iv-play" onClick={start} aria-label="Play the intro"><Icon name="play" /></button>
            <button type="button" className="btn ghost" onClick={close}>Skip, I'll explore myself</button>
          </div>
        ) : done ? (
          <div className="iv-poster end">
            <Medal tier="platinum" icon="trophy" episode={13} size={96} />
            <h2>You're ready, detective.</h2>
            <p>Start with the briefing, then episode 1. You can watch this again from "How to play".</p>
            <div className="row">
              <button type="button" className="btn primary big" onClick={close}><Icon name="play" /> Start playing</button>
              <button type="button" className="btn ghost" onClick={() => go(0)}><Icon name="reset" /> Watch again</button>
            </div>
          </div>
        ) : (
          <>
            <div className="iv-stage" key={`${idx}-${run}`}>{SCENES[idx]()}</div>
            <div className="iv-kaal"><Kaal mood={INTRO_VIDEO[idx].mood} size={84} /></div>
            <p className="iv-caption" aria-live="polite">{INTRO_VIDEO[idx].line}</p>
          </>
        )}
        {started && (
          <div className="iv-bar">
            <button type="button" className="iv-btn" onClick={done ? () => go(0) : toggle} aria-label={done ? 'Replay' : playing ? 'Pause' : 'Play'}>
              {done ? <Icon name="reset" /> : playing ? <span className="iv-pause" aria-hidden="true"><i /><i /></span> : <Icon name="play" />}</button>
            <button type="button" className="iv-btn" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous scene"><Icon name="left" /></button>
            <div className="iv-progress" aria-label={`Scene ${Math.min(idx + 1, INTRO_VIDEO.length)} of ${INTRO_VIDEO.length}`}>
              {INTRO_VIDEO.map((_, i) => (
                <button key={i} type="button" className={`seg ${i < idx ? 'past' : i === idx && !done ? (playing ? 'now' : 'now paused') : ''}`}
                  style={i === idx ? ({ '--len': `${len}s` } as CSSProperties) : undefined} onClick={() => go(i)} aria-label={`Go to scene ${i + 1}`}>
                  <i key={i === idx ? run : 0} /></button>
              ))}
            </div>
            <button type="button" className="iv-btn" onClick={() => go(idx + 1)} disabled={done} aria-label="Next scene"><Icon name="right" /></button>
            <button type="button" className="iv-btn" onClick={() => { hush(); setMuted((m) => !m); setRun((r) => r + 1); }} aria-pressed={muted} aria-label={muted ? 'Sound on' : 'Sound off'}>
              <Icon name={muted ? 'mute' : 'sound'} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the nine scenes (pure CSS animation, see intro.css)
const Typed = ({ text, delay = 0.4, speed = 0.045 }: { text: string; delay?: number; speed?: number }) => (
  <>{[...text].map((ch, i) => <span key={i} className="iv-type" style={{ animationDelay: `${delay + i * speed}s` }}>{ch}</span>)}</>
);
const Scene = ({ className = '', children }: { className?: string; children: ReactNode }) => <div className={`iv-scene ${className}`}>{children}</div>;

const SCENES: (() => ReactNode)[] = [
  // 1. hello
  () => (
    <Scene className="s-title">
      <span className="pill sun iv-in" style={{ animationDelay: '.1s' }}>A SQL mystery · 13 episodes · one night</span>
      <h1 className="iv-in" style={{ animationDelay: '.35s' }}>SQL: The Missing Influencer</h1>
      <div className="iv-clock iv-in" style={{ animationDelay: '.8s' }}><Icon name="clock" /> 6:00 PM <span>· six hours to midnight</span></div>
    </Scene>
  ),
  // 2. the story
  () => (
    <Scene className="s-phone">
      <div className="iv-phone">
        {[['bell', 'BREAKING · 6:00 PM', 'Singer Tara Sen is missing.'], ['flag', 'City Stadium', 'Her concert starts at midnight. 40,000 fans.'],
          ['mute', 'Tara Sen', 'Phone switched off.'], ['shield', 'Data Cell', 'Welcome, intern. The data is your only witness.']].map(([ic, from, text], i) => (
          <div key={i} className="iv-note" style={{ animationDelay: `${0.4 + i * 1.6}s` }}><Icon name={ic as never} /><div><b>{from}</b><span>{text}</span></div></div>
        ))}
      </div>
    </Scene>
  ),
  // 3. the case map
  () => (
    <Scene className="s-map">
      <svg viewBox="0 0 600 220" className="iv-trail" aria-hidden="true">
        <path d="M20 170 C 120 40, 200 200, 300 110 S 480 30, 580 120" className="iv-path" />
      </svg>
      <div className="iv-stops">
        {Array.from({ length: 13 }, (_, i) => <span key={i} className="iv-stop" style={{ animationDelay: `${0.5 + i * 0.35}s`, left: `${3 + i * 7.8}%`, top: `${[72, 52, 36, 34, 50, 66, 60, 44, 28, 18, 22, 38, 52][i]}%` }}>{i + 1}</span>)}
      </div>
      <div className="iv-hours"><span>6 PM</span><span>9 PM</span><span>12 AM</span></div>
    </Scene>
  ),
  // 4. learn
  () => (
    <Scene className="s-learn">
      <div className="iv-card iv-in" style={{ animationDelay: '.2s' }}>
        <span className="cap">From your course · learn this</span>
        <h3>SELECT … WHERE</h3>
        {['Pick the columns you need.', 'Filter the rows with WHERE.', 'Combine conditions with AND / OR.'].map((t, i) => <p key={i} className="iv-in" style={{ animationDelay: `${0.9 + i * 0.7}s` }}><Icon name="tick" /> {t}</p>)}
      </div>
      <div className="iv-scroll iv-in" style={{ animationDelay: '3s' }}><Icon name="scroll" /><span>Open the full reading material</span></div>
    </Scene>
  ),
  // 5. SQL task
  () => (
    <Scene className="s-sql">
      <div className="iv-console">
        <div className="iv-console-top"><i /><i /><i /><span>case database</span></div>
        <pre><Typed text={"SELECT name, role\nFROM suspects\nWHERE seen_at = 'hotel';"} /></pre>
        <div className="iv-run iv-in" style={{ animationDelay: '3.4s' }}><Icon name="play" /> Run</div>
        <div className="iv-pass iv-in" style={{ animationDelay: '4.2s' }}><Icon name="tick" /> Correct! +13 points</div>
        <table className="iv-table iv-in" style={{ animationDelay: '4.6s' }}><tbody><tr><th>name</th><th>role</th></tr><tr><td>Mahi Sen</td><td>sister</td></tr><tr><td>Sunny Gill</td><td>driver</td></tr></tbody></table>
      </div>
    </Scene>
  ),
  // 6. hints
  () => (
    <Scene className="s-hints">
      {[['A course note', '-2'], ['A fill-in skeleton', '-4'], ['The full answer', '-7']].map(([t, c], i) => (
        <div key={i} className={`iv-env ${i === 0 ? 'open' : ''}`} style={{ animationDelay: `${0.3 + i * 0.4}s` }}>
          <Icon name="envelope" /><b>Hint {i + 1}</b><span>{t}</span><small>{c} points</small>
        </div>
      ))}
    </Scene>
  ),
  // 7. evidence
  () => (
    <Scene className="s-evidence">
      <div className="iv-board">
        <span className="iv-pinned" style={{ left: '8%', top: '14%' }}>Left Room 704</span>
        <span className="iv-pinned" style={{ left: '56%', top: '20%' }}>The service lift</span>
        <span className="iv-flyin">Grey car at the service gate</span>
      </div>
      <div className="iv-pinbtn iv-in" style={{ animationDelay: '.6s' }}><Icon name="pin" /> Pin to Evidence Board</div>
    </Scene>
  ),
  // 8. score and badge
  () => (
    <Scene className="s-badge">
      <div className="iv-medal"><Medal tier="platinum" icon="key" episode={3} size={130} /></div>
      <div>
        <div className="iv-count" aria-hidden="true"><span /></div>
        <span className="tier-pill platinum iv-in" style={{ animationDelay: '2.2s' }}><Icon name="medal" /> Platinum · Gatekeeper</span>
        <div className="iv-tiers iv-in" style={{ animationDelay: '2.8s' }}><span className="tier-pill gold">Gold 90%+</span><span className="tier-pill silver">Silver 70%+</span><span className="tier-pill bronze">Bronze</span></div>
      </div>
    </Scene>
  ),
  // 9. ask
  () => (
    <Scene className="s-ask">
      <div className="iv-chat">
        <p className="me iv-in" style={{ animationDelay: '.4s' }}>How do hints work?</p>
        <p className="bot iv-in" style={{ animationDelay: '1.4s' }}>Open my envelopes one at a time. Each costs a few points, never the task.</p>
      </div>
      <div className="iv-askme iv-in" style={{ animationDelay: '2.4s' }}><Icon name="chat" /> Ask me</div>
    </Scene>
  ),
];
