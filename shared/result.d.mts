export interface QueryResult { columns: string[]; values: unknown[][] }
export type Normalised = { columns: number; rows: unknown[][] };
export function normaliseValue(v: unknown): unknown;
export function normaliseResult(result: QueryResult | undefined, opts?: { ordered?: boolean }): Normalised;
export function hashResult(result: QueryResult | undefined, opts?: { ordered?: boolean }): Promise<string>;
