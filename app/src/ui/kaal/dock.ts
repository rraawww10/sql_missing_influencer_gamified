// What Kaal's corner dock knows about the screen behind it, and what it can do there.
// The app shell says which screen is showing; the player adds the step the student is on. Screens register handlers for
// the actions Kaal's chat can offer ("Open the reading material", "Show the tables" …); the newest handler wins.
import { useSyncExternalStore } from 'react';

export type DockScreen = 'map' | 'briefing' | 'intro' | 'play' | 'done' | 'evidence';
export interface DockContext { screen: DockScreen; session?: number; beatType?: string; onTask?: boolean }
export type DockActionKind = 'open-learn' | 'open-tables' | 'open-hints' | 'open-evidence' | 'go-map' | 'go-briefing';
type Handlers = Partial<Record<DockActionKind, () => void>>;

let ctx: DockContext = { screen: 'map' };
const subs = new Set<() => void>();
const stack: Handlers[] = [];

export function setDockContext(next: DockContext) {
  if (next.screen === ctx.screen && next.session === ctx.session && next.beatType === ctx.beatType && next.onTask === ctx.onTask) return;
  ctx = next;
  subs.forEach((s) => s());
}
export function useDockContext(): DockContext {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => ctx, () => ctx);
}
// returns the function that removes these handlers again (use it as an effect's cleanup)
export function onDockAction(h: Handlers): () => void {
  stack.push(h);
  return () => { const i = stack.indexOf(h); if (i >= 0) stack.splice(i, 1); };
}
export function runDockAction(kind: DockActionKind): boolean {
  for (let i = stack.length - 1; i >= 0; i--) { const f = stack[i][kind]; if (f) { f(); return true; } }
  return false;
}
// the SQL task on screen listens for this to show its hint envelopes
export const HINTS_EVENT = 'tmi:open-hints';
