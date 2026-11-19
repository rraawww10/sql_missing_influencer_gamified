// Kaal, the student's assistant - a cheerful desi detective: bright blue trench coat, saffron scarf, brown fedora, big expressive eyes,
// a proud moustache, and a magnifying glass. His mouth moves while his voice (voice.ts) is speaking.
// Pure SVG + CSS (styles in design/kaal.css, .kaal-*): no images, scales to any size, every mood is a class on the root.
//
//   <Kaal mood="happy" size={96} />        the figure alone
//   <KaalDock />                           Kaal in the corner of every screen: speech bubble + the Ask Kaal chat
import { useEffect, useMemo, useRef, useState } from 'react';
import { PASSIVE_EVENTS, SAY, type KaalMood } from './lines';
import { kaal, useKaal } from './bus';
import { onSpeaking } from '../voice';
import { runDockAction, useDockContext } from './dock';
import { KaalChat } from './chat/KaalChat';
import type { ChatAction, ChatContext } from './chat/brain';
import { useProgress } from '../useProgress';
import { currentIdentity } from '../../adapters/identity';
import { openReader } from '../reader/store';
import { Icon } from '../design/Icon';

// true while Kaal's voice is actually speaking (drives his mouth)
export function useTalking(): boolean {
  const [t, setT] = useState(false);
  useEffect(() => onSpeaking(setT), []);
  return t;
}

export function Kaal({ mood = 'idle', size = 96, title = 'Kaal, your assistant', talking = false }: { mood?: KaalMood; size?: number; title?: string; talking?: boolean }) {
  return (
    <svg className={`kaal kaal-${mood}${talking ? ' kaal-talking' : ''}`} viewBox="0 0 120 160" width={size} height={size * 160 / 120} role="img" aria-label={title}>
      <defs>
        <radialGradient id="kaal-eye" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff6c8" /><stop offset=".45" stopColor="#ffc53d" /><stop offset="1" stopColor="#ff8a00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="kaal-coat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4c7dff" /><stop offset="1" stopColor="#2a3fb8" />
        </linearGradient>
        <linearGradient id="kaal-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--k-rim, #ffb547)" stopOpacity=".0" /><stop offset=".85" stopColor="var(--k-rim, #ffb547)" stopOpacity=".55" /><stop offset="1" stopColor="var(--k-rim, #ffb547)" stopOpacity=".9" />
        </linearGradient>
        <radialGradient id="kaal-lens" cx="40%" cy="35%" r="60%">
          <stop offset="0" stopColor="#e9fbff" stopOpacity=".9" /><stop offset="1" stopColor="#7dd3fc" stopOpacity=".15" />
        </radialGradient>
      </defs>
      <ellipse className="kaal-shadow" cx="60" cy="154" rx="36" ry="5" />
      <g className="kaal-body">
        {/* coat */}
        <path d="M28 150 L34 92 Q36 74 52 70 L68 70 Q84 74 86 92 L92 150 Z" fill="url(#kaal-coat)" />
        <path d="M28 150 L34 92 Q36 74 52 70 L68 70 Q84 74 86 92 L92 150 Z" fill="url(#kaal-rim)" opacity=".35" />
        {/* belt + lapels */}
        <rect x="33" y="112" width="54" height="5" rx="2" fill="#5a2d14" />
        <rect x="56" y="111" width="8" height="7" rx="1.5" fill="none" stroke="#b08a4a" strokeWidth="1.4" />
        <path d="M52 70 L60 98 L68 70 L64 70 L60 84 L56 70 Z" fill="#fff4dc" /><path d="M58 74 L60 92 L62 74 Z" fill="#e8364f" />
        <path d="M45 72 L56 94 L52 70 Z M75 72 L64 94 L68 70 Z" fill="#2333a0" />
        {/* left arm, resting */}
        <path d="M36 82 Q26 104 34 128 L40 127 Q36 106 44 88 Z" fill="#3456e0" /><circle cx="37" cy="129" r="4.5" fill="#c98b5e" />
        {/* face */}
        <g className="kaal-head">
          <path d="M44 46 Q43 72 60 73 Q77 72 76 46 Z" fill="#c98b5e" />
          <ellipse cx="43.5" cy="56" rx="3" ry="4.5" fill="#b57a50" /><ellipse cx="76.5" cy="56" rx="3" ry="4.5" fill="#b57a50" />
          {/* saffron scarf */}
          <path className="kaal-scarf" d="M44 68 Q60 78 76 68 L77 74 Q60 84 43 74 Z" fill="#ff9f1c" />
          <path className="kaal-scarf-tail" d="M66 76 L72 96 L64 94 L61 78 Z" fill="#ff7b00" />
          <g className="kaal-eyes">
            <ellipse cx="53" cy="54" rx="4.6" ry="5" fill="#fff" /><ellipse cx="67" cy="54" rx="4.6" ry="5" fill="#fff" />
            <ellipse className="kaal-eye l" cx="53.6" cy="54.6" rx="2.4" ry="2.8" fill="#2a160a" />
            <ellipse className="kaal-eye r" cx="67.6" cy="54.6" rx="2.4" ry="2.8" fill="#2a160a" />
            <circle cx="54.4" cy="53.6" r=".8" fill="#fff" /><circle cx="68.4" cy="53.6" r=".8" fill="#fff" />
            <path className="kaal-happy-eyes" d="M48.5 55.5 Q53 50 57.5 55.5 M62.5 55.5 Q67 50 71.5 55.5" stroke="#2a160a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path className="kaal-brows" d="M48.5 48 Q53 45.5 57 47.5 M63 47.5 Q67 45.5 71.5 48" stroke="#3a2210" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </g>
          <path className="kaal-stache" d="M50 63 Q55 59 60 62 Q65 59 70 63 Q66 65.5 60 64 Q54 65.5 50 63 Z" fill="#3a2210" />
          <ellipse className="kaal-mouth" cx="60" cy="67" rx="3.2" ry="1.6" fill="#7a1f1f" />
          {/* fedora */}
          <g className="kaal-hat">
            <ellipse cx="60" cy="46" rx="30" ry="6" fill="#6b3f22" />
            <path d="M44 46 Q44 26 60 24 Q76 26 76 46 Z" fill="#8a5530" />
            <path d="M44 41 L76 41 L76 46 L44 46 Z" fill="#e8364f" />
            <path d="M56 26 Q60 30 64 26" stroke="#5e3a1f" strokeWidth="2" fill="none" />
            <path d="M68 28 Q74 34 76 44" stroke="var(--k-rim, #ffb547)" strokeOpacity=".5" strokeWidth="1.2" fill="none" />
          </g>
        </g>
        {/* right arm with magnifying glass (rotates per mood) */}
        <g className="kaal-arm">
          <path d="M80 82 Q94 96 92 112 L86 113 Q86 100 76 90 Z" fill="#3456e0" />
          <g className="kaal-glass">
            <rect x="86" y="108" width="4" height="16" rx="2" fill="#5a3a1c" transform="rotate(-30 88 116)" />
            <circle cx="98" cy="102" r="10" fill="url(#kaal-lens)" stroke="#c9a15a" strokeWidth="2.6" />
            <path d="M93 97 Q96 94 100 95" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".8" />
          </g>
        </g>
      </g>
      <g className="kaal-fx" aria-hidden="true">
        <text className="kaal-q" x="92" y="30">?</text>
        <text className="kaal-spark s1" x="14" y="40">✦</text>
        <text className="kaal-spark s2" x="98" y="56">✦</text>
        <text className="kaal-spark s3" x="20" y="88">✦</text>
      </g>
    </svg>
  );
}

const PASSIVE = PASSIVE_EVENTS;

// Kaal in the corner of every screen: the student's assistant. He speaks when something happens (useKaal; the bubble
// fades after a while), and tapping him opens "Ask Kaal", the chat that answers questions about the game (chat/KaalChat.tsx).
export function KaalDock() {
  const k = useKaal();
  const talking = useTalking();
  const ctx = useDockContext();
  const { progress } = useProgress();
  const [bubble, setBubble] = useState(false);
  const [chat, setChat] = useState(false);
  const timer = useRef<number>();
  useEffect(() => {
    if (!k.line) { setBubble(false); return; }
    // on a phone the bubble would cover the story: there Kaal only speaks when something happens, not on every step
    if (k.event && PASSIVE.has(k.event) && typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches) { setBubble(false); return; }
    setBubble(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBubble(false), Math.min(9000, 3500 + k.line.length * 45));
    return () => window.clearTimeout(timer.current);
  }, [k.n, k.line]);

  useEffect(() => { setBubble(false); }, [ctx.screen, ctx.session]);

  const chatCtx = useMemo<ChatContext>(() => ({
    screen: ctx.screen, session: ctx.session, beatType: ctx.beatType, onTask: ctx.onTask,
    rank: progress?.rank, points: progress?.totalPoints, name: currentIdentity()?.name.split(' ')[0],
  }), [ctx, progress?.rank, progress?.totalPoints]);
  // what a chat reply's button does: the screen behind handles it if it can, otherwise the dock does the sensible thing
  const act = (a: ChatAction) => {
    if (runDockAction(a.kind)) { if (a.kind !== 'open-hints') setChat(false); return; }
    if (a.kind === 'open-learn') { openReader({ session: ctx.session ?? progress?.sessions.find((x) => x.status === 'available')?.session ?? 1 }); setChat(false); }
    else if (a.kind === 'open-tables' || a.kind === 'open-hints') kaal('idle', { line: SAY.openEpisodeFirst, silent: true });
    else kaal('idle', { line: SAY.notInThisEpisode, silent: true });
  };
  return (
    <div className={`kaal-dock ${bubble ? 'talking' : ''} ${chat ? 'chatting' : ''}`}>
      {chat && <KaalChat ctx={chatCtx} onAction={act} open={chat} onOpenChange={setChat} />}
      {!chat && bubble && k.line && (
        <div className="kaal-bubble" role="status" key={k.n} onClick={() => setBubble(false)}>
          <b>Kaal</b>{k.line}
        </div>
      )}
      <button className="kaal-btn" onClick={() => setChat((c) => !c)} aria-expanded={chat}
        aria-label={chat ? 'Close the chat with Kaal' : 'Ask Kaal: open the chat'} title="Kaal - your assistant. Tap to ask a question about the game">
        <span className="kaal-ask"><Icon name={chat ? 'close' : 'chat'} /><span>{chat ? 'Close' : 'Ask me'}</span></span>
        <Kaal mood={k.mood} size={96} talking={talking} />
      </button>
    </div>
  );
}
