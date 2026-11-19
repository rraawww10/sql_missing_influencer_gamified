// Opens the full-screen reading material from anywhere (the Learn scroll in the game bar, a Learn step, a hint, Kaal's chat).
// One reader at a time; ReaderHost (reader/Reader.tsx) renders it on top of everything.
import { useSyncExternalStore } from 'react';
import type { RmRef } from '../../content/types';

export interface ReaderRequest { session: number; focus?: RmRef }   // focus = the topic the student came from ("you are here")
let current: ReaderRequest | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export function openReader(r: ReaderRequest) { current = r; emit(); }
export function closeReader() { current = null; emit(); }
export function useReader(): ReaderRequest | null {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => current, () => current);
}
