// 🎙 - Inspector Kaal's voice on/off (voice.ts). Hidden when the browser can't speak.
import { useEffect, useState } from 'react';
import { onVoiceChange, setVoice, voiceOn, voiceSupported } from '../voice';

export function VoiceToggle({ className = 'hud-stat' }: { className?: string }) {
  const [on, setOn] = useState(voiceOn());
  useEffect(() => onVoiceChange(setOn), []);
  if (!voiceSupported()) return null;
  return (
    <button className={`${className} voice-toggle ${on ? 'on' : 'off'}`} onClick={() => setVoice(!on)}
      aria-pressed={on} aria-label={on ? 'Kaal’s voice is on. Turn it off' : 'Kaal’s voice is off. Turn it on'} title={on ? 'Kaal’s voice on' : 'Kaal’s voice off'}>
      {on ? '🎙️' : '🤐'}
    </button>
  );
}
