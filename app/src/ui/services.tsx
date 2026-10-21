// App-wide services (one instance per page) and the React context that hands them out.
import { createContext, useContext } from 'react';
import { ContentLoader } from '../content/loader';
import type { SqlEngine } from '../engine/sql/engine';
import { SittingStore } from '../engine/runner/sitting';
import type { RunnerState } from '../engine/runner/sessionRunner';
import type { AuthProvider } from '../ports/auth';
import type { ProgressStore } from '../ports/progress';

export interface Services {
  loader: ContentLoader;
  engine: SqlEngine;
  store: ProgressStore;
  auth: AuthProvider;
  sittings: SittingStore<RunnerState>;
}

const Ctx = createContext<Services | null>(null);
export const ServicesProvider = Ctx.Provider;
export function useServices(): Services {
  const s = useContext(Ctx);
  if (!s) throw new Error('ServicesProvider missing');
  return s;
}
