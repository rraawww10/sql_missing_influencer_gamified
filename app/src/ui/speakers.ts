import type { CastEntry } from '../content/types';

// Non-people voices; everyone else comes from the session pack's `cast` (content/story/cast.json)
const VOICES: Record<string, CastEntry> = {
  narrator: { name: 'Narrator', role: '', initials: '•', color: '#5b6475' },
  system: { name: 'Notification', role: '', initials: '🔔', color: '#2f4fd8' },
};

export function speakerOf(key: string | undefined, cast: Record<string, CastEntry>): CastEntry & { key: string } {
  const k = key ?? 'narrator';
  return { key: k, ...(cast[k] ?? VOICES[k] ?? VOICES.narrator) };
}

// Story clock: 6:00 PM + 30 min per session
export function storyTime(session: number): string {
  const minutes = 18 * 60 + (session - 1) * 30;
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
}
