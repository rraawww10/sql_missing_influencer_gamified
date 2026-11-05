// Sound, synthesised with the Web Audio API - no audio files, nothing to license, ~0 KB.
// The student controls it: a 🔊/🔇 toggle in the HUD (remembered on this device). Browsers keep audio locked
// until the first click/tap inside the frame, so the AudioContext is created lazily on the first sound.
//
// Every EPISODE has its own sound palette (key, scale, timbre) and its own flavour of the background music - dusk-orange episode 1 sounds nothing
// like the midnight stadium of episode 13 - and every CHAPTER (stage) inside an episode raises the tension:
// taps climb the scale, the ambient bed opens up and a heartbeat pulse speeds up.
//
//   setSoundTheme(session)      called by ThemeScope         setSoundStage(chapter, of)   called by the Player
//   sfx(name)                   a one-shot effect (see Sfx)  startAmbient()/stopAmbient() the background bed
//
//   sfx('click')   generic button        sfx('tapPrimary') Continue / main action   sfx('tapChoice') an answer option
//   sfx('tapPill') chips & toggles       sfx('tapSeg')     story-bar segment        sfx('tapEnvelope') a hint envelope
//   sfx('type')    a key in the SQL console (throttled)    sfx('run')  a query starts running
//   sfx('pass') sfx('fail') sfx('trap') sfx('stamp') sfx('clue') sfx('paper') sfx('solved') sfx('reveal') sfx('whoosh')
//   sfx('chapter') a new chapter begins   sfx('typing') a character "typing…" blip   sfx('notify') phone notification

export type Sfx =
  | 'click' | 'tapPrimary' | 'tapChoice' | 'tapPill' | 'tapSeg' | 'tapEnvelope'
  | 'type' | 'run' | 'pass' | 'fail' | 'trap' | 'stamp' | 'clue' | 'paper' | 'solved' | 'reveal' | 'whoosh'
  | 'chapter' | 'typing' | 'notify';

type Texture = 'traffic' | 'paper' | 'rain' | 'engine' | 'coins' | 'static' | 'heart' | 'crowdlow' | 'clock' | 'hum' | 'wind' | 'server' | 'crowd';

interface Palette {
  root: number;            // Hz of the tonic
  scale: number[];         // semitone steps of the mode
  wave: OscillatorType;    // lead timbre (stings, pass, solved)
  tap: OscillatorType;     // button timbre
  drone: number[];         // scale degrees of the ambient chord
  texture: Texture;        // the ambient noise character
  sting: number[];         // a 3–5 note motif (scale degrees) for chapter / reveal
}

const MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10], PHRYG = [0, 1, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11], LYDIAN = [0, 2, 4, 6, 7, 9, 11], HARM = [0, 2, 3, 5, 7, 8, 11];
const PENTA = [0, 3, 5, 7, 10], BLUES = [0, 3, 5, 6, 7, 10], WHOLE = [0, 2, 4, 6, 8, 10];

// One palette per episode (same order as theme.ts): the sky darkens, the music gets lower and tighter.
export const PALETTES: Record<number, Palette> = {
  1: { root: 293.66, scale: DORIAN, wave: 'triangle', tap: 'triangle', drone: [0, 4], texture: 'traffic', sting: [0, 2, 4, 6] },        // alert - city at dusk
  2: { root: 277.18, scale: MAJOR, wave: 'sine', tap: 'triangle', drone: [0, 2, 4], texture: 'paper', sting: [4, 2, 0, 4] },            // case file - typewriter office
  3: { root: 261.63, scale: MINOR, wave: 'triangle', tap: 'sine', drone: [0, 4], texture: 'rain', sting: [0, 3, 4, 2] },              // hotel gate - rain
  4: { root: 246.94, scale: BLUES, wave: 'triangle', tap: 'triangle', drone: [0, 3], texture: 'engine', sting: [0, 1, 2, 4] },        // cab - idling engine
  5: { root: 329.63, scale: PENTA, wave: 'sine', tap: 'sine', drone: [0, 2, 3], texture: 'coins', sting: [0, 2, 3, 4] },              // money - coins chime
  6: { root: 220.0, scale: WHOLE, wave: 'sine', tap: 'triangle', drone: [0, 2], texture: 'static', sting: [0, 1, 2, 3, 4] },            // towers - radio static
  7: { root: 207.65, scale: HARM, wave: 'triangle', tap: 'sine', drone: [0, 2, 4], texture: 'heart', sting: [0, 4, 6, 4] },           // watch - heartbeat
  8: { root: 196.0, scale: PHRYG, wave: 'triangle', tap: 'triangle', drone: [0, 1, 4], texture: 'crowdlow', sting: [0, 1, 0, 4] },      // lineup - interrogation room
  9: { root: 185.0, scale: MINOR, wave: 'triangle', tap: 'triangle', drone: [0, 2, 4], texture: 'clock', sting: [4, 3, 2, 0] },         // cork board - ticking clock
  10: { root: 233.08, scale: LYDIAN, wave: 'sine', tap: 'sine', drone: [0, 3, 4], texture: 'hum', sting: [0, 2, 3, 4, 5] },           // network - neon hum
  11: { root: 174.61, scale: DORIAN, wave: 'triangle', tap: 'triangle', drone: [0, 4], texture: 'wind', sting: [0, 2, 3, 6] },        // toll highway - wind
  12: { root: 164.81, scale: HARM, wave: 'triangle', tap: 'triangle', drone: [0, 2, 5], texture: 'server', sting: [0, 6, 5, 2] },         // logs - server room
  13: { root: 146.83, scale: HARM, wave: 'triangle', tap: 'triangle', drone: [0, 2, 4], texture: 'crowd', sting: [0, 2, 4, 6, 7] },   // stadium - crowd, finale
};

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
let session = 1;
let stage = 0;          // 0-based chapter index
let stages = 1;
const pal = () => PALETTES[session] ?? PALETTES[1];
const tension = () => (stages <= 1 ? 0 : stage / (stages - 1));   // 0 … 1 across the episode

export const soundOn = () => enabled;
export function setSound(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* blocked storage: still works this page */ }
  listeners.forEach((l) => l(on));
  if (on) { sfx('click'); if (wantAmbient) startAmbient(); } else stopAmbient(true);
}
export function onSoundChange(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

export function setSoundTheme(n: number) {
  if (n === session || !PALETTES[n]) { session = PALETTES[n] ? n : session; return; }
  session = n; stage = 0; stages = 1;
  if (el) { el.dataset.session = ''; applyFlavour(true); }
}
export function setSoundStage(chapter: number, of: number) {
  const s = Math.max(0, chapter - 1), changed = s !== stage || of !== stages;
  stage = s; stages = Math.max(1, of);
  if (changed) retuneAmbient();
}

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

// a note: scale degree d (can exceed the scale length → next octave), shifted up by the current chapter
function note(d: number, octave = 0, withStage = true): number {
  const p = pal(), sc = p.scale, deg = d + (withStage ? stage : 0);
  const oct = Math.floor(deg / sc.length) + octave, semi = sc[((deg % sc.length) + sc.length) % sc.length] + 12 * oct;
  return p.root * Math.pow(2, semi / 12);
}

function tone(a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, slideTo?: number, out: AudioNode = master!) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out); o.start(at); o.stop(at + dur + 0.02);
}

function noiseBuf(a: AudioContext, dur: number, decay = true) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (decay ? 1 - i / len : 1);
  return buf;
}
function noise(a: AudioContext, at: number, dur: number, vol = 0.3, filter = 2000, q = 1, type: BiquadFilterType = 'bandpass') {
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuf(a, dur); f.type = type; f.frequency.value = filter; f.Q.value = q; g.gain.value = vol;
  src.connect(f).connect(g).connect(master!); src.start(at);
}

export function sfx(name: Sfx) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + 0.005, p = pal(), T = tension();
  switch (name) {
    // ---- taps: each kind of control has its own voice, in the episode's key, climbing with the chapter
    case 'click': tone(a, note(4, 1), t, 0.06, p.tap, 0.22, note(2, 1)); noise(a, t, 0.03, 0.12, 3500); break;
    case 'tapPrimary': tone(a, note(0, 1), t, 0.08, p.tap, 0.22); tone(a, note(4, 1), t + 0.05, 0.12, p.tap, 0.2); noise(a, t, 0.03, 0.1, 5000, 1, 'highpass'); break;
    case 'tapChoice': tone(a, note(2, 1), t, 0.1, 'sine', 0.3, note(3, 1)); break;
    case 'tapPill': tone(a, note(5, 2), t, 0.04, 'triangle', 0.18); break;
    case 'tapSeg': tone(a, note(0, 2), t, 0.05, 'sine', 0.16, note(1, 2)); break;
    case 'tapEnvelope': noise(a, t, 0.12, 0.25, 2600, 0.8); tone(a, note(6, 1), t + 0.06, 0.18, 'sine', 0.12); break;
    case 'typing': tone(a, note(4, 2, false), t, 0.03, 'sine', 0.06); break;
    case 'notify': tone(a, note(4, 2, false), t, 0.12, 'sine', 0.25); tone(a, note(7, 2, false), t + 0.12, 0.25, 'sine', 0.22); break;
    case 'type': {
      const now = performance.now(); if (now - lastType < 45) return; lastType = now;
      noise(a, t, 0.025, 0.12, (p.texture === 'paper' ? 1800 : 2400) + Math.random() * 1600, 4); break;
    }
    case 'run': [0, 1, 2].forEach((i) => tone(a, note(i * 2, 1), t + i * 0.05, 0.08, 'sine', 0.1)); noise(a, t, 0.25, 0.06, 1200 + T * 1500, 3); break;
    // ---- verdicts
    case 'pass': [0, 2, 4, 7].forEach((d, i) => tone(a, note(d, 1), t + i * 0.08, 0.35, p.wave, 0.28)); break;
    case 'fail': tone(a, note(4, 0), t, 0.14, 'triangle', 0.3, note(3, 0)); tone(a, note(1, 0), t + 0.15, 0.32, 'triangle', 0.28, note(0, 0) * 0.85); break;   // cartoon "uh-oh"
    case 'trap': [5, 4, 3, 1].forEach((d, i) => tone(a, note(d, 0), t + i * 0.11, 0.16, 'triangle', 0.25)); tone(a, note(0, -1), t + 0.46, 0.5, 'sine', 0.3, note(0, -1) * 0.7); break;   // "wah-wah-wah"
    case 'stamp': tone(a, 90, t, 0.18, 'sine', 0.8, 45); noise(a, t, 0.08, 0.5, 800, 0.7, 'lowpass'); break;
    case 'clue': noise(a, t, 0.05, 0.5, 5000, 0.8, 'highpass'); noise(a, t + 0.07, 0.12, 0.25, 1500); p.sting.forEach((d, i) => tone(a, note(d, 1), t + 0.12 + i * 0.07, 0.4, 'sine', 0.13)); break;
    case 'paper': noise(a, t, 0.22, 0.22, 3000, 0.6); break;
    case 'reveal': tone(a, note(0, 0), t, 0.5, 'sine', 0.18, note(0, 1)); tone(a, note(4, 0), t + 0.05, 0.5, 'sine', 0.1, note(4, 1)); break;
    case 'whoosh': {
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = noiseBuf(a, 0.35); f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(300 + T * 300, t); f.frequency.exponentialRampToValueAtTime(2500 + T * 2000, t + 0.3); g.gain.value = 0.2;
      src.connect(f).connect(g).connect(master); src.start(t); break;
    }
    case 'chapter': {
      // the episode's motif, a little higher and louder each chapter, over a low boom
      tone(a, note(0, -2, false), t, 0.9, 'sine', 0.5, note(0, -2, false) * 0.7);
      p.sting.forEach((d, i) => tone(a, note(d, 1), t + 0.1 + i * 0.12, 0.5, p.wave, 0.14 + T * 0.06));
      noise(a, t, 0.5, 0.1, 6000, 0.6, 'highpass');
      break;
    }
    case 'solved': {
      p.sting.forEach((d, i) => tone(a, note(d, 0, false), t + i * 0.09, 0.6, 'triangle', 0.22));
      [0, 2, 4, 7].forEach((d) => tone(a, note(d, 1, false), t + 0.6, 1.2, 'sine', 0.18));
      tone(a, note(0, 2, false), t + 0.6, 1.2, 'sine', 0.1);
      noise(a, t + 0.6, 0.8, 0.07, 6000, 0.5, 'highpass');
      break;
    }
  }
}

// ---------------------------------------------------------------- background music
// One looped track (src/assets/music/suspense-theme.mp3 - "funny suspenseful cartoon-style music" by DesiFreeMusic,
// Pixabay licence) given a different flavour per episode and per chapter:
//   • every episode starts the loop at its own point of the track and runs it through its own tone filter
//     (warm & muffled at dusk → bright & open at the stadium finale)
//   • every chapter plays it a little faster (tempo only, pitch kept), so the night speeds up as the case closes in
// Ducks while Kaal speaks; pauses when the tab is hidden; off with the 🔊 toggle.
import musicUrl from '../assets/music/suspense-theme.mp3';

let wantAmbient = false;
let el: HTMLAudioElement | null = null;
let musicGain: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;
let ducked = false;
const MUSIC_VOL = 0.5;          // relative to master (0.32) → quiet under the effects and the voice
// [start offset in s, filter type, cutoff Hz] per episode
const FLAVOUR: Record<number, [number, BiquadFilterType, number]> = {
  1: [0, 'lowpass', 9000], 2: [18, 'lowpass', 5000], 3: [36, 'lowpass', 2600], 4: [54, 'peaking', 900], 5: [72, 'highshelf', 4000],
  6: [90, 'bandpass', 1500], 7: [108, 'lowpass', 3200], 8: [126, 'lowpass', 2200], 9: [144, 'peaking', 2000], 10: [162, 'highshelf', 6000],
  11: [180, 'lowpass', 3800], 12: [198, 'bandpass', 2400], 13: [0, 'highshelf', 3000],
};

function ensureMusic(): boolean {
  const a = audio();
  if (!a || !master || typeof Audio === 'undefined') return false;
  if (el) return true;
  try {
    el = new Audio(musicUrl); el.loop = true; el.preload = 'auto';
    (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    const src = a.createMediaElementSource(el);
    musicFilter = a.createBiquadFilter(); musicGain = a.createGain(); musicGain.gain.value = 0.0001;
    src.connect(musicFilter).connect(musicGain).connect(master);
    return true;
  } catch { el = null; return false; }
}

function applyFlavour(seek: boolean) {
  if (!el || !musicFilter || !ctx) return;
  const [start, type, f] = FLAVOUR[session] ?? FLAVOUR[1];
  musicFilter.type = type; musicFilter.Q.value = type === 'bandpass' ? 0.4 : 0.7;
  musicFilter.gain.value = type === 'peaking' || type === 'highshelf' ? 5 : 0;
  musicFilter.frequency.setTargetAtTime(f * (1 + tension() * 0.6), ctx.currentTime, 0.8);
  el.playbackRate = 1 + tension() * 0.08;
  if (seek) { try { el.currentTime = start; } catch { /* not loaded yet */ } }
}

export function startAmbient() {
  wantAmbient = true;
  if (!ensureMusic() || !el || !musicGain || !ctx) return;
  const fresh = el.paused;
  applyFlavour(fresh && el.dataset.session !== String(session));
  el.dataset.session = String(session);
  if (fresh) {
    el.play().then(() => {
      if (!ctx || !musicGain) return;
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(ducked ? MUSIC_VOL * 0.35 : MUSIC_VOL, ctx.currentTime, 0.8);
    }).catch(() => { /* autoplay blocked until the first tap - retried by unlock() */ });
  }
}

function retuneAmbient() { applyFlavour(false); }

export function stopAmbient(keepWanted = false) {
  if (!keepWanted) wantAmbient = false;
  if (!el || !ctx || !musicGain) return;
  musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
  const e = el; setTimeout(() => { if (!wantAmbient || !enabled) e.pause(); }, 1200);
}

// Kaal talking → the music drops so his voice is clear
export function duckAmbient(on: boolean) {
  ducked = on;
  if (!musicGain || !ctx || !el || el.paused) return;
  musicGain.gain.setTargetAtTime(on ? MUSIC_VOL * 0.35 : MUSIC_VOL, ctx.currentTime, 0.2);
}

// browsers only allow audio after a tap: start the music on the first one
function unlock() { if (wantAmbient && enabled && (!el || el.paused)) startAmbient(); }

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  document.addEventListener('keydown', unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { void ctx?.suspend(); el?.pause(); }
    else if (enabled) { void ctx?.resume(); if (wantAmbient) startAmbient(); }
  });
}
