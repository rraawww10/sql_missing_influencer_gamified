export interface Feature { id: string; session: number; re: RegExp }
export interface UsedFeature { id: string; session: number }
export const FEATURES: Feature[];
export function strip(sql: string): string;
export function featuresUsed(sql: string): UsedFeature[];
export function untaught(sql: string, session: number): UsedFeature[];
