// Sound effects, synthesised with the Web Audio API — no audio files, nothing to license, ~0 KB.
// The student controls it: a 🔊/🔇 toggle in the HUD (remembered on this device). Browsers keep audio locked
// until the first click/tap inside the frame, so the AudioContext is created lazily on the first sound.
//
//   sfx('click')   every button press          sfx('type')   a key in the SQL console (throttled)
//   sfx('pass')    correct query / answer       sfx('fail')   wrong answer
//   sfx('trap')    trap hit                     sfx('stamp')  a verdict stamp lands
//   sfx('clue')    clue pinned (camera flash)   sfx('paper')  a sheet / envelope opens
//   sfx('solved')  episode solved               sfx('reveal') something new appears
//   sfx('whoosh')  page / step change

export type Sfx = 'click' | 'type' | 'pass' | 'fail' | 'trap' | 'stamp' | 'clue' | 'paper' | 'solved' | 'reveal' | 'whoosh';

const KEY = 'tmi.sound.v1';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

function readPref(): boolean {
  try { const v = localStorage.getItem(KEY); return v === null ? true : v === '1'; } catch { return true; }
}
let enabled = readPref();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastType = 0;

export const soundOn = () => enabled;
export function setSound(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* blocked storage: still works this page */ }
  listeners.forEach((l) => l(on));
  if (on) sfx('click');
}
export function onSoundChange(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

function audio(): AudioContext | null {
  if (!enabled) return null;
  const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination); }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, slideTo?: number) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!); o.start(at); o.stop(at + dur + 0.02);
}

function noise(a: AudioContext, at: number, dur: number, vol = 0.3, filter = 2000, q = 1, type: BiquadFilterType = 'bandpass') {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = type; f.frequency.value = filter; f.Q.value = q; g.gain.value = vol;
  src.connect(f).connect(g).connect(master!); src.start(at);
}

export function sfx(name: Sfx) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + 0.005;
  switch (name) {
    case 'click': tone(a, 520, t, 0.06, 'triangle', 0.35, 340); noise(a, t, 0.03, 0.15, 3500); break;
    case 'type': {
      const now = performance.now(); if (now - lastType < 45) return; lastType = now;
      noise(a, t, 0.025, 0.12, 2400 + Math.random() * 1600, 4); break;
    }
    case 'pass': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(a, f, t + i * 0.08, 0.35, 'triangle', 0.32)); break;
    case 'fail': tone(a, 196, t, 0.18, 'sawtooth', 0.18, 150); tone(a, 185, t + 0.16, 0.26, 'sawtooth', 0.16, 120); break;
    case 'trap': tone(a, 311, t, 0.22, 'square', 0.12, 293); tone(a, 233, t + 0.2, 0.4, 'square', 0.12, 220); break;
    case 'stamp': tone(a, 90, t, 0.18, 'sine', 0.8, 45); noise(a, t, 0.08, 0.5, 800, 0.7, 'lowpass'); break;
    case 'clue': noise(a, t, 0.05, 0.5, 5000, 0.8, 'highpass'); noise(a, t + 0.07, 0.12, 0.25, 1500); tone(a, 1318.5, t + 0.12, 0.5, 'sine', 0.15); break;
    case 'paper': noise(a, t, 0.22, 0.22, 3000, 0.6); break;
    case 'reveal': tone(a, 392, t, 0.5, 'sine', 0.18, 784); tone(a, 587.33, t + 0.05, 0.5, 'sine', 0.1, 1174.7); break;
    case 'whoosh': noise(a, t, 0.28, 0.16, 900, 0.5, 'lowpass'); break;
    case 'solved': {
      // a short noir-jazz sting: minor 9th arpeggio then a bright major resolve
      [220, 261.63, 329.63, 392, 493.88].forEach((f, i) => tone(a, f, t + i * 0.09, 0.6, 'triangle', 0.22));
      [523.25, 659.25, 783.99].forEach((f) => tone(a, f, t + 0.6, 1.1, 'sine', 0.2));
      noise(a, t + 0.6, 0.6, 0.06, 6000, 0.5, 'highpass');
      break;
    }
  }
}
