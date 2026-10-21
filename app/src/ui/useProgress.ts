import { useCallback, useEffect, useState } from 'react';
import { deriveProgress, type Progress } from '../engine/progress/derive';
import { useServices } from './services';

export function useProgress(): { progress: Progress | null; reload(): void } {
  const { auth, store } = useServices();
  const [progress, setProgress] = useState<Progress | null>(null);
  const reload = useCallback(() => {
    auth.currentUser().then((u) => store.list(u.id)).then((ev) => setProgress(deriveProgress(ev)));
  }, [auth, store]);
  useEffect(reload, [reload]);
  useEffect(() => {   // the embedding page replayed events into the store (see embed.ts)
    addEventListener('tmi:restored', reload);
    return () => removeEventListener('tmi:restored', reload);
  }, [reload]);
  return { progress, reload };
}
