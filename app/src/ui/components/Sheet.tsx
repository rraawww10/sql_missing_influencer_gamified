// A side panel over the game (steps, tables, evidence, hints, course note, full result). Esc or the backdrop closes it.
import { useEffect, type ReactNode } from 'react';

interface Props { title: string; onClose(): void; side?: 'left' | 'right'; wide?: boolean; children: ReactNode }

export function Sheet({ title, onClose, side = 'right', wide = false, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className={`sheet ${side} ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="btn small ghost" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="sheet-body">{children}</div>
      </aside>
    </>
  );
}
