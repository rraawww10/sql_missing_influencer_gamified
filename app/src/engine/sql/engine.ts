// SQL engine around sql.js. Every grading run uses a FRESH copy of the session snapshot,
// so a learner's earlier mistakes can never break a later task.
// Runs inside the Web Worker in the browser, and directly in Node for tests.
import type { Database, SqlJsStatic } from 'sql.js';
import { gradeTask, type GradableTask, type Verdict } from '@shared/grader.mjs';
import { untaught, type UsedFeature } from '@shared/sql_features.mjs';

export interface QueryResult { columns: string[]; values: unknown[][] }

// What the Tables drawer shows for one table: the first rows, the row count, and the column definitions
export interface TablePreview extends QueryResult {
  total: number;
  schema: { name: string; type: string; pk: boolean; notnull: boolean }[];
}

export interface GradeOutcome {
  verdict: Verdict;
  // features the learner used that the course hasn't taught yet (a gentle nudge, never a block)
  notTaughtYet: UsedFeature[];
  ms: number;
}

export interface SqlEngine {
  loadSnapshot(name: string, bytes: Uint8Array): Promise<void>;
  grade(snapshot: string, task: GradableTask, sql: string, session: number): Promise<GradeOutcome>;
  // Tables + columns for the console's table tabs, as they exist for a task: snapshot + task setup
  // (+ optionally the learner's last query, so a table they just created shows up)
  schema(snapshot: string, setup?: string[], learnerSql?: string): Promise<{ table: string; columns: string[] }[]>;
  // The rows of one table as they exist for a task (snapshot + setup + the learner's last passing query), for the Tables drawer
  preview(snapshot: string, table: string, setup?: string[], learnerSql?: string, limit?: number): Promise<TablePreview>;
  // Runs a script on a fresh copy and returns the last result (used by demos, e.g. the S12 index demo)
  runScript(snapshot: string, script: string, then?: string): Promise<{ result?: QueryResult; error?: string; ms: number }>;
  // Demo timing: runs `script` once, then each step (repeated) on the same copy; average ms per step
  timeSteps(snapshot: string, script: string, steps: { sql: string; repeat?: number }[]): Promise<{ ms: number; result?: QueryResult }[]>;
}

export class SqlJsEngine implements SqlEngine {
  private snapshots = new Map<string, Uint8Array>();

  constructor(private readonly SQL: SqlJsStatic) {}

  private open(name: string): Database {
    const bytes = this.snapshots.get(name);
    if (!bytes) throw new Error(`Snapshot ${name} not loaded`);
    const db = new this.SQL.Database(new Uint8Array(bytes));   // own copy per run; the cached snapshot stays clean
    db.exec('PRAGMA foreign_keys = ON;');       // RM #30: enabled by default on the platform
    return db;
  }

  async loadSnapshot(name: string, bytes: Uint8Array) {
    this.snapshots.set(name, bytes);
  }

  async grade(snapshot: string, task: GradableTask, sql: string, session: number): Promise<GradeOutcome> {
    const t0 = performance.now();
    const verdict = await gradeTask(task, sql, () => this.open(snapshot));
    return { verdict, notTaughtYet: untaught(sql, session), ms: performance.now() - t0 };
  }

  async schema(snapshot: string, setup: string[] = [], learnerSql?: string) {
    const db = this.open(snapshot);
    try {
      for (const s of setup) db.exec(s);
      if (learnerSql) { try { db.exec(learnerSql); } catch { /* a broken query just doesn't add tables */ } }
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")[0]?.values ?? [];
      return tables.map(([t]) => ({
        table: String(t),
        columns: (db.exec(`SELECT name FROM pragma_table_info('${String(t)}')`)[0]?.values ?? []).map(([c]) => String(c)),
      }));
    } finally {
      db.close();
    }
  }

  async preview(snapshot: string, table: string, setup: string[] = [], learnerSql?: string, limit = 100): Promise<TablePreview> {
    const db = this.open(snapshot);
    try {
      for (const s of setup) db.exec(s);
      if (learnerSql) { try { db.exec(learnerSql); } catch { /* a broken query just doesn't change anything */ } }
      const q = `"${table.replace(/"/g, '""')}"`, lit = `'${table.replace(/'/g, "''")}'`;
      const schema = (db.exec(`SELECT name, type, pk, "notnull" FROM pragma_table_info(${lit})`)[0]?.values ?? [])
        .map(([name, type, pk, notnull]) => ({ name: String(name), type: String(type ?? ''), pk: Number(pk) > 0, notnull: Number(notnull) > 0 }));
      if (!schema.length) throw new Error(`no such table: ${table}`);
      const rows = db.exec(`SELECT * FROM ${q} LIMIT ${Math.max(1, Math.floor(limit))}`)[0];
      const total = Number(db.exec(`SELECT COUNT(*) FROM ${q}`)[0]?.values[0]?.[0] ?? 0);
      return { columns: rows?.columns ?? schema.map((c) => c.name), values: rows?.values ?? [], total, schema };
    } finally {
      db.close();
    }
  }

  async timeSteps(snapshot: string, script: string, steps: { sql: string; repeat?: number }[]) {
    const db = this.open(snapshot);
    try {
      db.exec(script);
      return steps.map((s) => {
        const n = s.repeat ?? 1;
        let res: QueryResult[] = [];
        const t0 = performance.now();
        for (let i = 0; i < n; i++) res = db.exec(s.sql);
        return { ms: (performance.now() - t0) / n, result: res.at(-1) };
      });
    } finally {
      db.close();
    }
  }

  async runScript(snapshot: string, script: string, then?: string) {
    const t0 = performance.now();
    const db = this.open(snapshot);
    try {
      const res = db.exec(script);
      const after = then ? db.exec(then) : res;
      return { result: after.at(-1), ms: performance.now() - t0 };
    } catch (e) {
      return { error: (e as Error).message, ms: performance.now() - t0 };
    } finally {
      db.close();
    }
  }
}
