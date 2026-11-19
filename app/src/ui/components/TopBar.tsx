// The bar at the top of every page outside the player: the game's name, the story clock, a slot for page-specific
// chips and buttons, the sound and voice switches, and who is playing.
import type { ReactNode } from 'react';
import { WhoChip } from '../identity/WhoChip';
import { SoundToggle } from './SoundToggle';
import { VoiceToggle } from './VoiceToggle';

export function TopBar({ time, rank, full = false, children }: { time?: string; rank?: string; full?: boolean; children?: ReactNode }) {
  return (
    <nav className="topnav" aria-label="Game">
      <span className="brand">The Missing Influencer</span>
      {time && <span className="hudchip" title="Story time"><span className="live-dot" aria-hidden="true" />{time}</span>}
      <span className="grow" />
      {children}
      <SoundToggle className="hudchip tool" /><VoiceToggle className="hudchip tool" />
      <WhoChip full={full} rank={rank} />
    </nav>
  );
}
