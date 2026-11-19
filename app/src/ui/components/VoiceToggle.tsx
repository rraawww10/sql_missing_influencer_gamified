// Kaal's voice on / off (voice.ts). Hidden when the browser can't speak.
import { useEffect, useState } from 'react';
import { onVoiceChange, setVoice, voiceOn, voiceSupported } from '../voice';
import { Icon } from '../design/Icon';

export function VoiceToggle({ className = 'hudchip tool' }: { className?: string }) {
  const [on, setOn] = useState(voiceOn());
  const [, refresh] = useState(0);   // the recorded voice pack arrives after the first render: show the switch then
  useEffect(() => onVoiceChange((v) => { setOn(v); refresh((n) => n + 1); }), []);
  if (!voiceSupported()) return null;
  return (
    <button className={`${className} voice-toggle ${on ? 'on' : 'off'}`} onClick={() => setVoice(!on)}
      aria-pressed={on} aria-label={on ? 'Kaal’s voice is on. Turn it off' : 'Kaal’s voice is off. Turn it on'} title={on ? 'Kaal’s voice on' : 'Kaal’s voice off'}>
      <Icon name={on ? 'mic' : 'mic-off'} />
    </button>
  );
}
