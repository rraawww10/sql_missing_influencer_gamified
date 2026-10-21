// Illustrated banner for each session, drawn as inline SVG (no image files to host, crisp on every screen).
// Shared layers: night sky for the story time, stars, the city skyline. On top: a motif for the stage.
import { useId } from 'react';
import { themeOf } from '../theme';

const W = 1200, H = 400;

// Deterministic pseudo-random numbers so the art is identical on every load
function rand(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function Stars({ session }: { session: number }) {
  const r = rand(97 + session);
  const n = 10 + session * 5;               // more stars as the night deepens
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={r() * W} cy={r() * H * 0.55} r={r() * 1.6 + 0.4} fill="#fff" opacity={0.25 + r() * 0.6} />
      ))}
    </g>
  );
}

function Skyline({ session, glow }: { session: number; glow: string }) {
  const r = rand(11);
  const buildings: { x: number; w: number; h: number }[] = [];
  for (let x = 0; x < W;) { const w = 40 + r() * 70; buildings.push({ x, w, h: 70 + r() * 150 }); x += w + 4; }
  const lit = rand(500 + session);
  return (
    <g>
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={H - b.h} width={b.w} height={b.h} fill="#0b0e24" opacity={0.85} />
          {Array.from({ length: Math.floor(b.h / 22) * Math.floor(b.w / 18) }, (_, k) => {
            const cols = Math.floor(b.w / 18);
            const cx = b.x + 6 + (k % cols) * 18, cy = H - b.h + 10 + Math.floor(k / cols) * 22;
            return lit() > 0.62 ? <rect key={k} x={cx} y={cy} width={7} height={9} fill={glow} opacity={0.55 + lit() * 0.4} /> : null;
          })}
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------- motifs
const motifs: Record<string, (g: string, a: string) => JSX.Element> = {
  alert: (g, a) => (
    <g transform="translate(760 70)">
      <rect x="0" y="0" width="150" height="270" rx="22" fill="#11142e" stroke={g} strokeWidth="3" />
      <rect x="12" y="24" width="126" height="222" rx="10" fill="#1d2250" />
      <rect x="20" y="48" width="110" height="46" rx="10" fill={a} />
      <rect x="30" y="60" width="70" height="7" rx="3" fill="#fff" opacity=".9" /><rect x="30" y="74" width="50" height="6" rx="3" fill="#fff" opacity=".7" />
      <circle cx="75" cy="160" r="26" fill="none" stroke={g} strokeWidth="3" opacity=".7" />
      <path d="M65 150 h20 v18 l6 6 h-32 l6 -6 z" fill={g} />
      {[1, 2, 3].map((i) => <circle key={i} cx="75" cy="160" r={26 + i * 18} fill="none" stroke={g} strokeWidth="2" opacity={0.35 - i * 0.09} />)}
    </g>
  ),
  casefile: (g, a) => (
    <g transform="translate(700 110) rotate(-6)">
      <path d="M0 30 h90 l20 -22 h170 v220 h-280 z" fill="#d9a65b" />
      <rect x="18" y="40" width="250" height="190" fill="#fffaf0" />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x="40" y={66 + i * 24} width={i % 2 ? 150 : 190} height="7" rx="3" fill="#5b6475" opacity=".5" />)}
      <rect x="196" y="140" width="56" height="70" fill={a} opacity=".18" /><circle cx="224" cy="168" r="14" fill={a} opacity=".55" />
      <rect x="270" y="20" width="14" height="200" rx="4" fill={g} transform="rotate(18 270 20)" />
    </g>
  ),
  gate: (g, a) => (
    <g transform="translate(640 120)">
      <rect x="40" y="0" width="300" height="220" fill="#151a3a" />
      {Array.from({ length: 24 }, (_, i) => <rect key={i} x={58 + (i % 6) * 46} y={18 + Math.floor(i / 6) * 46} width="26" height="28" fill={i % 5 === 2 ? '#2a2f55' : g} opacity=".75" />)}
      <rect x="0" y="214" width="420" height="10" fill="#3b3f63" />
      <rect x="350" y="150" width="22" height="70" fill="#d0d4e8" />
      <g transform="rotate(-24 361 158)"><rect x="361" y="152" width="230" height="14" fill="#fff" />
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={381 + i * 44} y="152" width="22" height="14" fill={a} />)}</g>
    </g>
  ),
  cab: (g, a) => (
    <g transform="translate(560 210)">
      {[0, 1, 2].map((i) => <g key={i} transform={`translate(${i * 240} 0)`}><rect x="0" y="-150" width="8" height="150" fill="#3b3f63" /><circle cx="4" cy="-152" r="12" fill={g} /><path d="M4 -150 L-50 0 H58 z" fill={g} opacity=".12" /></g>)}
      <g transform="translate(150 70)">
        <path d="M0 50 q10 -40 60 -44 h120 q40 4 70 44 v40 h-250 z" fill={a} />
        <rect x="80" y="-6" width="70" height="20" rx="4" fill="#11142e" /><text x="115" y="9" fontSize="13" fontWeight="700" textAnchor="middle" fill={g}>TAXI</text>
        <rect x="40" y="16" width="70" height="30" rx="6" fill="#bcd4ff" opacity=".8" /><rect x="120" y="16" width="70" height="30" rx="6" fill="#bcd4ff" opacity=".8" />
        <circle cx="50" cy="92" r="20" fill="#11142e" /><circle cx="200" cy="92" r="20" fill="#11142e" />
        <rect x="236" y="56" width="16" height="10" rx="3" fill="#fff8b0" />
      </g>
    </g>
  ),
  money: (g, a) => (
    <g transform="translate(720 70)">
      <rect x="0" y="20" width="140" height="250" rx="20" fill="#11142e" stroke={g} strokeWidth="3" />
      <rect x="12" y="44" width="116" height="202" rx="10" fill="#1d2250" />
      <circle cx="70" cy="120" r="36" fill={a} /><text x="70" y="134" fontSize="40" fontWeight="800" textAnchor="middle" fill="#fff">₹</text>
      <rect x="30" y="180" width="80" height="12" rx="6" fill={g} opacity=".7" /><rect x="40" y="202" width="60" height="10" rx="5" fill={g} opacity=".4" />
      {[[-80, 40, 26], [190, 10, 22], [210, 170, 30], [-110, 190, 20], [170, 260, 16]].map(([x, y, r], i) => (
        <g key={i}><circle cx={x} cy={y} r={r} fill={g} opacity=".9" /><text x={x} y={y + r * 0.38} fontSize={r} fontWeight="800" textAnchor="middle" fill={a}>₹</text></g>
      ))}
    </g>
  ),
  towers: (g) => (
    <g>
      {[[620, 1], [880, 0.8], [1080, 0.65]].map(([x, s], i) => (
        <g key={i} transform={`translate(${x} ${120 + i * 40}) scale(${s})`}>
          <path d="M0 0 L-40 260 M0 0 L40 260 M-30 190 L30 190 M-20 120 L20 120 M-12 60 L12 60 M-30 190 L20 120 M30 190 L-20 120" stroke="#d0d4e8" strokeWidth="5" fill="none" />
          <circle cx="0" cy="-6" r="9" fill={g} />
          {[1, 2, 3].map((k) => <path key={k} d={`M${-20 * k} ${-10 - 12 * k} a ${24 * k} ${24 * k} 0 0 1 ${40 * k} 0`} fill="none" stroke={g} strokeWidth="4" opacity={0.8 - k * 0.2} />)}
        </g>
      ))}
    </g>
  ),
  watch: (g, a) => (
    <g transform="translate(760 70)">
      <rect x="45" y="-20" width="90" height="70" rx="12" fill="#2a2f55" /><rect x="45" y="250" width="90" height="70" rx="12" fill="#2a2f55" />
      <rect x="0" y="40" width="180" height="220" rx="44" fill="#11142e" stroke={g} strokeWidth="4" />
      <path d="M24 160 h34 l14 -40 l20 80 l16 -56 l12 16 h40" fill="none" stroke={a} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
      <text x="90" y="226" fontSize="30" fontWeight="800" textAnchor="middle" fill={g}>♥</text>
    </g>
  ),
  lineup: (g, a) => (
    <g transform="translate(560 90)">
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${i * 120} 0)`}>
          <path d={`M60 -90 L0 300 H120 z`} fill={i === 2 ? a : g} opacity={i === 2 ? 0.28 : 0.1} />
          <circle cx="60" cy="130" r="30" fill="#0b0e24" /><path d="M10 300 q0 -110 50 -110 q50 0 50 110 z" fill="#0b0e24" />
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={i * 120 + 40} y="290" width="40" height="16" rx="4" fill={g} opacity=".8" />)}
    </g>
  ),
  board: (g, a) => (
    <g transform="translate(600 60)">
      <rect x="0" y="0" width="520" height="290" rx="12" fill="#b0855a" stroke="#6e4a2c" strokeWidth="10" />
      {[[40, 40, -5], [210, 30, 4], [370, 50, -3], [80, 170, 3], [300, 160, -4]].map(([x, y, rot], i) => (
        <g key={i} transform={`rotate(${rot} ${x + 60} ${y + 45})`}>
          <rect x={x} y={y} width="120" height="90" fill="#fffaf0" />
          <rect x={x + 12} y={y + 14} width="60" height="44" fill="#d0d4e8" /><rect x={x + 12} y={y + 66} width="90" height="6" fill="#5b6475" opacity=".5" />
          <circle cx={x + 60} cy={y + 2} r="7" fill={a} />
        </g>
      ))}
      <path d="M100 42 L270 32 L430 52 M100 42 L140 172 L360 162 L430 52 M270 32 L360 162" stroke={a} strokeWidth="3" fill="none" />
      <circle cx="140" cy="172" r="1" fill={g} />
    </g>
  ),
  network: (g, a) => {
    const pts = [[650, 120], [780, 70], [900, 150], [1040, 90], [720, 250], [860, 280], [1000, 240], [1120, 190], [600, 210]];
    const links = [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [6, 7], [2, 5], [3, 7], [8, 0], [8, 4], [2, 6]];
    return (
      <g>
        {links.map(([i, j], k) => <line key={k} x1={pts[i][0]} y1={pts[i][1]} x2={pts[j][0]} y2={pts[j][1]} stroke={k % 3 ? g : a} strokeWidth={k % 3 ? 2 : 4} opacity=".75" />)}
        {pts.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r={i % 3 ? 10 : 16} fill={i % 3 ? g : a} /><circle cx={x} cy={y} r={i % 3 ? 22 : 32} fill={g} opacity=".12" /></g>)}
      </g>
    );
  },
  toll: (g, a) => (
    <g transform="translate(560 120)">
      <rect x="0" y="0" width="600" height="40" fill="#2a2f55" /><text x="300" y="28" fontSize="20" fontWeight="800" textAnchor="middle" fill={g} letterSpacing="6">TOLL PLAZA</text>
      {[0, 1, 2, 3].map((i) => <g key={i}><rect x={20 + i * 150} y="40" width="40" height="200" fill="#3b3f63" /><rect x={28 + i * 150} y="70" width="24" height="24" fill={i === 1 ? a : '#1d2250'} /></g>)}
      <path d="M200 240 L-60 280 H120 z" fill={g} opacity=".18" /><path d="M260 240 L520 280 H340 z" fill={g} opacity=".18" />
      <rect x="180" y="200" width="100" height="44" rx="10" fill="#0b0e24" /><circle cx="196" cy="226" r="8" fill="#fff8b0" /><circle cx="264" cy="226" r="8" fill="#fff8b0" />
    </g>
  ),
  document: (g, a) => (
    <g transform="translate(640 50)">
      <rect x="0" y="0" width="300" height="320" rx="6" fill="#fffaf0" transform="rotate(-4 150 160)" />
      <g transform="rotate(-4 150 160)">
        <rect x="30" y="30" width="140" height="12" rx="3" fill="#1b1f2a" opacity=".7" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x="30" y={70 + i * 28} width={[220, 180, 200, 120, 230, 160, 210, 140][i]} height="12" rx="2" fill={i === 3 || i === 5 ? '#0b0e24' : '#5b6475'} opacity={i === 3 || i === 5 ? 1 : 0.4} />)}
        <text x="210" y="300" fontSize="26" fontWeight="800" fill={a} transform="rotate(-12 210 300)" opacity=".85">EDITED?</text>
      </g>
      <g transform="translate(250 190)"><circle r="62" fill={g} opacity=".18" stroke={g} strokeWidth="10" /><rect x="40" y="40" width="22" height="90" rx="8" fill="#d0d4e8" transform="rotate(-45 40 40)" /></g>
    </g>
  ),
  stage: (g, a) => (
    <g>
      {[620, 800, 980, 1140].map((x, i) => <path key={i} d={`M${x} 0 L${x - 160 + i * 40} 300 H${x + 120 - i * 30} z`} fill={i % 2 ? a : g} opacity=".2" />)}
      <rect x="560" y="250" width="640" height="34" fill="#2a1b45" />
      <circle cx="880" cy="200" r="22" fill="#0b0820" /><path d="M846 250 q0 -46 34 -46 q34 0 34 46 z" fill="#0b0820" />
      <rect x="878" y="160" width="4" height="40" fill="#d0d4e8" /><circle cx="880" cy="156" r="7" fill="#d0d4e8" />
      {Array.from({ length: 22 }, (_, i) => <circle key={i} cx={560 + i * 30} cy={330 + (i % 3) * 10} r="16" fill="#0b0820" />)}
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={580 + i * 52} y={300 + (i % 2) * 8} width="6" height="12" rx="2" fill={g} />)}
    </g>
  ),
};

// `height` set → fixed height (cropped from the top, so the street and motif stay visible); unset → the art's own 3:1 shape
// `fill` → covers its (positioned) parent, for the scene backdrop on the stage
export function SceneArt({ session, height, fill = false, className = '' }: { session: number; height?: number; fill?: boolean; className?: string }) {
  const t = themeOf(session);
  const id = useId().replace(/:/g, '');
  const draw = motifs[t.motif] ?? motifs.alert;
  return (
    <svg className={`scene-art ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice"
      style={fill ? { width: '100%', height: '100%', display: 'block' } : height ? { height, width: '100%', display: 'block' } : { width: '100%', aspectRatio: '3 / 1', maxHeight: 340, display: 'block' }}
      role="img" aria-label={t.alt}>
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.sky[0]} /><stop offset="1" stopColor={t.sky[1]} />
        </linearGradient>
        <linearGradient id={`fade${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={t.sky[1]} stopOpacity=".85" /><stop offset=".55" stopColor={t.sky[1]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#sky${id})`} />
      <Stars session={session} />
      {session >= 6 && <circle cx="1080" cy="70" r="34" fill={t.glow} opacity=".85" />}
      <Skyline session={session} glow={t.glow} />
      {draw(t.glow, t.accent)}
      <rect width={W} height={H} fill={`url(#fade${id})`} />
    </svg>
  );
}
