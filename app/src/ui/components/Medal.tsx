// A premium episode badge: ribbon, metal disc in the tier's colours, the episode's icon, a moving shine.
// `locked` draws an empty slot (not earned yet). Decorative: the label next to it carries the words.
import type { CSSProperties } from 'react';
import { Icon, type IconName } from '../design/Icon';
import type { Tier } from '../badges';

export function Medal({ tier, icon, episode, size = 96, locked = false, shine = true }: {
  tier?: Tier; icon: IconName; episode: number; size?: number; locked?: boolean; shine?: boolean;
}) {
  return (
    <span className={`medal ${locked ? 'locked' : tier ?? 'bronze'}${shine && !locked ? ' shine' : ''}`} style={{ '--m': `${size}px` } as CSSProperties} aria-hidden="true">
      <span className="medal-ribbon"><i /><i /></span>
      <span className="medal-disc">
        <span className="medal-ring" />
        <span className="medal-face"><Icon name={locked ? 'lock' : icon} /></span>
        <span className="medal-ep">{episode}</span>
      </span>
    </span>
  );
}
