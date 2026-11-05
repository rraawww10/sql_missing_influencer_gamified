// Screen-level game juice, driven by Kaal's events: the whole game flashes / shakes / pulses for a moment.
// Classes go on <body> (styles in noir.css, .fx-*) and fall off on their own. Reduced motion → only the colour flash.
import type { KaalEvent } from './kaal/lines';

const FX: Partial<Record<KaalEvent, string>> = {
  pass: 'fx-pass', passFirst: 'fx-pass fx-combo', activityRight: 'fx-pass', checkRight: 'fx-pass',
  wrong: 'fx-fail', error: 'fx-fail', activityWrong: 'fx-fail', checkWrong: 'fx-fail', trap: 'fx-trap',
  pinned: 'fx-pin', solved: 'fx-solved', clue: 'fx-clue',
};
let timer: number | undefined;
let current: string[] = [];

export function gameFx(e: KaalEvent) {
  const cls = FX[e];
  if (!cls || typeof document === 'undefined') return;
  const b = document.body;
  b.classList.remove(...current);
  void b.offsetWidth;            // restart the animation
  current = cls.split(' ');
  b.classList.add(...current);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { b.classList.remove(...current); current = []; }, 900);
  if (cls.includes('fx-pass') || e === 'pinned') floater(e === 'passFirst' ? '+2 ⭐ FIRST TRY!' : e === 'pinned' ? '+1 📌 EVIDENCE' : '+1 ⭐');
}

// "+1 ⭐" rising from the middle of the screen, game style
function floater(text: string) {
  const f = document.createElement('div');
  f.className = 'xp-float'; f.textContent = text; f.setAttribute('aria-hidden', 'true');
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1500);
}
