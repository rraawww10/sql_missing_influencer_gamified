// Reading material is for reading: selecting, copying, cutting, dragging and the right-click menu are switched off
// on anything that spreads these props (the CSS class also turns text selection off).
import type { SyntheticEvent } from 'react';

const stop = (e: SyntheticEvent) => e.preventDefault();
export const noCopy = { className: 'nocopy', onCopy: stop, onCut: stop, onContextMenu: stop, onDragStart: stop } as const;
