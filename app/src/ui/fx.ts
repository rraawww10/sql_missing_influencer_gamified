// Global button feel: every press gets a tap sound (its own voice per kind of control, in the episode's key),
// a ripple from where it was pressed, and a little squash. Installed once (main.tsx), so no component has to remember it.
import { sfx, type Sfx } from './sound';

const SEL = '.btn, .choice, .pill, .envelope, .hud-stat, .nowchip, .storybar .seg, .tables-tabs button, .kaal-btn, .step-item';

function soundFor(el: HTMLElement): Sfx {
  if (el.matches('.envelope')) return 'tapEnvelope';
  if (el.matches('.choice')) return 'tapChoice';
  if (el.matches('.storybar .seg, .step-item')) return 'tapSeg';
  if (el.matches('.pill, .hud-stat, .tables-tabs button, .nowchip')) return 'tapPill';
  if (el.matches('.btn.primary, .btn.go')) return 'tapPrimary';
  return 'click';
}

export function installButtonFx(doc: Document = document) {
  doc.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.(SEL) as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    sfx(soundFor(el));
    const r = el.getBoundingClientRect();
    el.style.setProperty('--rx', `${e.clientX - r.left}px`);
    el.style.setProperty('--ry', `${e.clientY - r.top}px`);
    el.classList.remove('squash'); void el.offsetWidth; el.classList.add('squash');
    setTimeout(() => el.classList.remove('squash'), 260);
    if (el.classList.contains('btn')) { el.classList.add('rippling'); setTimeout(() => el.classList.remove('rippling'), 30); }
    // a few sparks fly from primary buttons
    if (el.matches('.btn.primary, .choice, .envelope')) burst(doc, e.clientX, e.clientY, el.matches('.btn.primary') ? 8 : 5);
  }, { capture: true, passive: true });
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export function burst(doc: Document, x: number, y: number, n = 8, cls = '') {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    const s = doc.createElement('i');
    s.className = `tap-spark ${cls}`;
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6, dist = 28 + Math.random() * 30;
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    s.style.setProperty('--tx', `${Math.cos(ang) * dist}px`); s.style.setProperty('--ty', `${Math.sin(ang) * dist}px`);
    doc.body.appendChild(s);
    setTimeout(() => s.remove(), 650);
  }
}
