// Promise-based client for the SQL worker. Implements the same SqlEngine interface,
// so the session runner doesn't know (or care) whether SQL runs in a worker.
import type { SqlEngine } from './engine';
import type { Method, Request, Response } from './protocol';

export class WorkerEngine implements SqlEngine {
  private next = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(private readonly worker: Worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })) {
    worker.onmessage = (e: MessageEvent<Response>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.value);
      else p.reject(new Error(e.data.error));
    };
  }

  private call<T>(method: Method, ...args: unknown[]): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, method, args } satisfies Request);
    });
  }

  loadSnapshot(name: string, bytes: Uint8Array) { return this.call<void>('loadSnapshot', name, bytes); }
  grade(...a: Parameters<SqlEngine['grade']>) { return this.call<Awaited<ReturnType<SqlEngine['grade']>>>('grade', ...a); }
  schema(...a: Parameters<SqlEngine['schema']>) { return this.call<Awaited<ReturnType<SqlEngine['schema']>>>('schema', ...a); }
  preview(...a: Parameters<SqlEngine['preview']>) { return this.call<Awaited<ReturnType<SqlEngine['preview']>>>('preview', ...a); }
  timeSteps(...a: Parameters<SqlEngine['timeSteps']>) { return this.call<Awaited<ReturnType<SqlEngine['timeSteps']>>>('timeSteps', ...a); }
  runScript(...a: Parameters<SqlEngine['runScript']>) { return this.call<Awaited<ReturnType<SqlEngine['runScript']>>>('runScript', ...a); }
}
