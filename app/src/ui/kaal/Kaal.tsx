// Inspector Kaal — a shadow in a trench coat and fedora, two amber eyes glowing under the brim, a magnifying glass in hand.
// Pure SVG + CSS (styles in noir.css, .kaal-*): no images, scales to any size, every mood is a class on the root.
//
//   <Kaal mood="happy" size={96} />        the figure alone
//   <KaalDock />                           the companion that lives in the corner of the game, with a speech bubble
import { useEffect, useRef, useState } from 'react';
import type { KaalEvent, KaalMood } from './lines';
import { useKaal } from './bus';

export function Kaal({ mood = 'idle', size = 96, title = 'Inspector Kaal' }: { mood?: KaalMood; size?: number; title?: string }) {
  return (
    <svg className={`kaal kaal-${mood}`} viewBox="0 0 120 160" width={size} height={size * 160 / 120} role="img" aria-label={title}>
      <defs>
        <radialGradient id="kaal-eye" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff6c8" /><stop offset=".45" stopColor="#ffc53d" /><stop offset="1" stopColor="#ff8a00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="kaal-coat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2238" /><stop offset="1" stopColor="#0c0912" />
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
        <rect x="33" y="112" width="54" height="5" rx="2" fill="#07050a" />
        <rect x="56" y="111" width="8" height="7" rx="1.5" fill="none" stroke="#b08a4a" strokeWidth="1.4" />
        <path d="M52 70 L60 98 L68 70 L64 70 L60 84 L56 70 Z" fill="#3b2f4d" />
        <path d="M45 72 L56 94 L52 70 Z M75 72 L64 94 L68 70 Z" fill="#1a1424" />
        {/* left arm, resting */}
        <path d="M36 82 Q26 104 34 128 L40 127 Q36 106 44 88 Z" fill="#17121f" />
        {/* head in shadow */}
        <g className="kaal-head">
          <path d="M44 48 Q44 70 60 72 Q76 70 76 48 Z" fill="#100c16" />
          {/* collar up */}
          <path d="M42 60 L50 76 L56 66 Z M78 60 L70 76 L64 66 Z" fill="#2d2440" />
          {/* eyes */}
          <g className="kaal-eyes">
            <ellipse className="kaal-glow" cx="60" cy="54" rx="22" ry="9" fill="url(#kaal-eye)" opacity=".35" />
            <ellipse className="kaal-eye l" cx="53" cy="54" rx="3.2" ry="2.4" fill="#ffd166" />
            <ellipse className="kaal-eye r" cx="67" cy="54" rx="3.2" ry="2.4" fill="#ffd166" />
            <path className="kaal-happy-eyes" d="M49.5 55 Q53 50.5 56.5 55 M63.5 55 Q67 50.5 70.5 55" stroke="#ffd166" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
          <path className="kaal-mouth" d="M55 63 Q60 66 65 63" stroke="#ffb547" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".0" />
          {/* fedora */}
          <g className="kaal-hat">
            <ellipse cx="60" cy="46" rx="30" ry="6" fill="#0a0710" />
            <path d="M44 46 Q44 26 60 24 Q76 26 76 46 Z" fill="#1d1628" />
            <path d="M44 41 L76 41 L76 46 L44 46 Z" fill="#8b1e2d" />
            <path d="M56 26 Q60 30 64 26" stroke="#2c2238" strokeWidth="2" fill="none" />
            <path d="M68 28 Q74 34 76 44" stroke="var(--k-rim, #ffb547)" strokeOpacity=".5" strokeWidth="1.2" fill="none" />
          </g>
        </g>
        {/* right arm with magnifying glass (rotates per mood) */}
        <g className="kaal-arm">
          <path d="M80 82 Q94 96 92 112 L86 113 Q86 100 76 90 Z" fill="#17121f" />
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

const PASSIVE = new Set<KaalEvent>(['scene', 'note', 'task', 'activity', 'check', 'clue', 'demo', 'hook', 'review', 'resume', 'running']);

// The companion in the corner. Speaks when something happens (useKaal), the bubble fades after a while.
// Tapping him repeats / hides the line. Collapses to a small avatar on phones.
export function KaalDock({ hint }: { hint?: string }) {
  const k = useKaal();
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();
  useEffect(() => {
    if (!k.line) { setOpen(false); return; }
    // on a phone the bubble would cover the story: there Kaal only speaks when something happens, not on every step
    if (k.event && PASSIVE.has(k.event) && typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches) { setOpen(false); return; }
    setOpen(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), Math.min(9000, 3500 + k.line.length * 45));
    return () => window.clearTimeout(timer.current);
  }, [k.n, k.line]);
  return (
    <div className={`kaal-dock ${open ? 'talking' : ''}`}>
      {open && k.line && (
        <div className="kaal-bubble" role="status" key={k.n} onClick={() => setOpen(false)}>
          <b>Kaal</b>{k.line}
        </div>
      )}
      <button className="kaal-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Hide Inspector Kaal’s note' : `Inspector Kaal${hint ? ': ' + hint : ''}`} title="Inspector Kaal — your partner on the case">
        <Kaal mood={k.mood} size={96} />
      </button>
    </div>
  );
}
