import type { QueryResult } from './result.mjs';

export interface TrapMatch { error_regex?: string; result_hash?: string; inspect?: string; sql_regex?: string }
export interface Trap { id: string; match: TrapMatch; reply: string; rm_ref?: { unit_id: string; heading: string } }
export interface GradableTask {
  setup?: string[];
  grading?: { ordered?: boolean; inspect?: string; expected_hash: string | null };
  traps?: Trap[];
}
export interface SqlJsDatabase { exec(sql: string): QueryResult[]; close(): void }
export type Verdict =
  | { status: 'pass'; result?: QueryResult }
  | { status: 'trap'; trap: Trap; error?: string; result?: QueryResult }
  | { status: 'error'; error: string }
  | { status: 'wrong'; result?: QueryResult };
export function gradeTask(task: GradableTask, learnerSql: string, openDb: () => SqlJsDatabase): Promise<Verdict>;
