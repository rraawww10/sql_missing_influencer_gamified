// 🔊 / 🔇 - the student decides. Remembered on this device (sound.ts).
import { useEffect, useState } from 'react';
import { onSoundChange, setSound, soundOn } from '../sound';

export function SoundToggle({ className = 'hud-stat' }: { className?: string }) {
  const [on, setOn] = useState(soundOn());
  useEffect(() => onSoundChange(setOn), []);
  return (
    <button className={`${className} sound sound-toggle ${on ? 'on' : 'off'}`} onClick={() => setSound(!on)}
      aria-pressed={on} aria-label={on ? 'Sound is on. Turn sound off' : 'Sound is off. Turn sound on'} title={on ? 'Sound on' : 'Sound off'}>
      {on ? '🔊' : '🔇'}
    </button>
  );
}
