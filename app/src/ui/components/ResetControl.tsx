// "Reset progress" for one episode (or one part of it), with an inline confirmation (window.confirm can be blocked inside iframes).
// Clears the saved place AND this episode's points, clues and completion (logged as session_reset).
import { useEffect, useState } from 'react';
import type { SessionPack } from '../../content/types';
import { SessionRunner } from '../../engine/runner/sessionRunner';
import { useServices } from '../services';
import { postToParent } from '../embed';
import { forgetRunner } from '../screens/Player';
import { episodeTitle } from '../episodes';

interface Props { session: number; onDone(): void; label?: string; small?: boolean; popover?: boolean }

export function ResetControl({ session, onDone, label = '↺ Reset progress', small = false, popover = false }: Props) {
  const services = useServices();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<SessionPack | null>(null);
  useEffect(() => { services.loader.pack(session).then(setPack).catch(() => {}); }, [services, session]);
  const unit = pack?.unit;
  const title = episodeTitle(session, pack?.title);

  const reset = async () => {
    setBusy(true);
    try {
      const [pack, user] = await Promise.all([services.loader.pack(session), services.auth.currentUser()]);
      await SessionRunner.reset(pack, user, services);
      forgetRunner(session);
      postToParent('reset', { session, ...(pack.unit ? { unit: pack.unit.n, unit_id: pack.unit.unit_id } : {}) });
      setAsking(false);
      onDone();
    } finally { setBusy(false); }
  };

  const button = <button className={`btn danger ${small ? 'small' : ''}`} onClick={() => setAsking(!asking)} aria-expanded={asking}>{label}</button>;
  if (!asking) return popover ? <span className="reset-wrap">{button}</span> : button;
  const panel = (
    <div className={`confirm ${popover ? 'popover' : ''}`} role="alertdialog" aria-label="Reset this episode?">
      {unit && unit.parts > 1
        ? <p><b>Reset part {unit.part} of “{title}”?</b> Your saved place, points and clues for this part will be cleared. Other parts and episodes are not affected.</p>
        : <p><b>Reset “{title}”?</b> Your saved place, points and clues for this episode will be cleared. Other episodes are not affected.</p>}
      <div className="row">
        <button className="btn danger solid small" onClick={reset} disabled={busy}>{busy ? 'Resetting…' : 'Yes, reset'}</button>
        <button className="btn small" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
  return popover ? <span className="reset-wrap">{button}{panel}</span> : panel;
}
