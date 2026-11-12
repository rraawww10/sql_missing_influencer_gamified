// "👤 Priya · NW123 · Switch" in the top bar of the intro / briefing / solved screens. Switch = forget this device's
// student and show the start screen again (their progress stays on the server under their ID).
import { clearIdentity, currentIdentity } from '../../adapters/identity';

export function WhoChip() {
  const who = currentIdentity();
  if (!who) return null;
  const sw = () => {
    if (!confirm(`Switch student? ${who.name} (${who.id}) will be signed out on this computer. Their progress is saved under their NxtWave ID.`)) return;
    clearIdentity();
    location.reload();
  };
  return (
    <span className="who-chip" title={`Playing as ${who.name} · NxtWave ID ${who.id}`}>
      <span aria-hidden="true">👤</span> <b>{who.name.split(' ')[0]}</b><span className="hide-phone"> · {who.id}</span>
      <button className="linkish" onClick={sw}>Not you?</button>
    </span>
  );
}
