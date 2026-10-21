import type { SqlEngine } from './engine';

export type Method = keyof SqlEngine;
export interface Request { id: number; method: Method; args: unknown[] }
export type Response = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
