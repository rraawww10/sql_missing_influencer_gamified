// Web Worker: hosts the SQL engine off the UI thread.
/// <reference lib="webworker" />
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SqlJsEngine } from './engine';
import type { Request, Response } from './protocol';

const ready = initSqlJs({ locateFile: () => wasmUrl }).then((SQL) => new SqlJsEngine(SQL));

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, method, args } = e.data;
  try {
    const engine = await ready;
    const value = await (engine[method] as (...a: unknown[]) => Promise<unknown>)(...args);
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: true, value } satisfies Response);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: false, error: (err as Error).message } satisfies Response);
  }
};
