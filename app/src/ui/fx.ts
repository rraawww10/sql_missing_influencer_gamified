// Global button feel: every .btn / .choice / .pill press gets a click sound and a light ripple from where it was pressed.
// Installed once (main.tsx), so no component has to remember it.
import { sfx } from './sound';

export function installButtonFx(doc: Document = document) {
  doc.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('.btn, .choice, .pill, .envelope, .hud-stat, .nowchip, .storybar .seg, .tables-tabs button') as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    sfx('click');
    if (el.classList.contains('btn')) {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--rx', `${e.clientX - r.left}px`);
      el.style.setProperty('--ry', `${e.clientY - r.top}px`);
      el.classList.add('rippling');
      setTimeout(() => el.classList.remove('rippling'), 30);
    }
  }, { capture: true, passive: true });
}
