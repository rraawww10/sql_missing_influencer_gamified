// Who is playing, in the top bar: initials, name, rank, ID, and "Log out". Logging out ends the session on the server,
// forgets the student on this device and shows the start screen again (their progress stays on the server, in their account).
import { clearIdentity, currentIdentity } from '../../adapters/identity';
import { signOut } from '../../adapters/session';
import { rankIcon } from '../ranks';
import { Icon } from '../design/Icon';

const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export function WhoChip({ full = false, rank }: { full?: boolean; rank?: string }) {
  const who = currentIdentity();
  if (!who) return null;
  const sw = async () => {
    if (!confirm(`Log out? ${who.name} (${who.id}) will be logged out on this computer. Your progress stays saved in your account.`)) return;
    await signOut();
    clearIdentity();
    location.reload();
  };
  return (
    <span className="who-chip" title={`Playing as ${who.name} · NxtWave ID ${who.id}`}>
      <span className="avatar" aria-hidden="true">{initials(who.name)}</span>
      <b>{full ? who.name : who.name.split(' ')[0]}</b>
      {rank && <span className="who-rank hide-phone"><Icon name={rankIcon(rank)} /> {rank}</span>}
      <span className="who-id hide-phone">{who.id}</span>
      <button className="linkish" onClick={sw} title="Log out on this computer">Log out</button>
    </span>
  );
}
