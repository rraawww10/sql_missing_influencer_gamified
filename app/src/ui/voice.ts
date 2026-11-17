// Inspector Kaal's voice - the browser's built-in speech synthesis (Web Speech API), so no audio files and no server.
// An Indian-English voice at one steady, clear pace (see PREFER, RATE); his mood is heard in the tone (TONE). Separate 🎙 toggle in the HUD, remembered on this device.
// Muted automatically when sound is off. If the browser has no speech synthesis, everything here is a silent no-op.
import { duckAmbient, soundOn } from './sound';
import { personalize } from '../adapters/identity';

const KEY = 'tmi.voice.v1';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();
const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

function readPref(): boolean {
  try { const v = localStorage.getItem(KEY); return v === null ? true : v === '1'; } catch { return true; }
}
let enabled = readPref();
export const voiceSupported = () => !!synth();
export const voiceOn = () => enabled && !!synth();
export function setVoice(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((l) => l(on));
  if (!on) hush(); else speak(personalize('Kaal here. I’ll talk you through it, {you}.', 'partner'));
}
export function onVoiceChange(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

// Indian-English voices first. Names differ per OS/browser, so this is a ranked list of known ones:
//   Edge (any OS): "Microsoft Prabhat Online (Natural) - English (India)" - the best; Neerja is the female twin
//   Windows: "Microsoft Ravi" / "Heera" (en-IN, offline)       Android / ChromeOS: "English India" voices (en-IN)
//   (Chrome's "Google हिन्दी" is female, so it is excluded: Kaal is a man)
//   macOS/iOS: "Rishi" (en-IN)
// Only if none exists do we fall back to any English voice.
const PREFER: RegExp[] = [/prabhat.*natural/i, /madhur/i, /prabhat/i, /rishi/i, /ravi/i, /hemant/i, /aarav|kunal/i, /en[-_]IN.*male/i,
  /daniel|arthur|george|ryan|guy|thomas|oliver|david|mark|james/i, /google uk english male/i, /male/i];
// Kaal is a man: known female voices are never used (Edge/Windows/macOS/Android names + Google's female defaults)
const FEMALE = /female|neerja|heera|swara|kalpana|veena|lekha|aditi|raveena|ananya|kajal|zira|hazel|susan|samantha|karen|moira|tessa|fiona|victoria|serena|kate|libby|sonia|emma|aria|jenny|michelle|google (uk english female|us english|हिन्दी|hindi)/i;
let chosen: SpeechSynthesisVoice | null = null;
function score(v: SpeechSynthesisVoice): number {
  const id = `${v.name} ${v.lang}`;
  const i = PREFER.findIndex((re) => re.test(id));
  let sc = i < 0 ? 0 : 100 - i * 5;
  if (/natural|neural|online|enhanced|premium/i.test(v.name)) sc += 8;      // clearer, human-sounding
  if (i < 0 && /^en/i.test(v.lang)) sc += /en[-_]GB/i.test(v.lang) ? 6 : 3;
  if (/espeak|robot|whisper|novelty|zarvox|bells|bad news|bubbles/i.test(v.name)) sc -= 50;
  return sc;
}
function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth(); if (!s) return null;
  if (chosen) return chosen;
  const vs = s.getVoices().filter((v) => /^(en|hi)/i.test(v.lang) && !FEMALE.test(v.name));
  if (!vs.length) return null;
  return (chosen = [...vs].sort((x, y) => score(y) - score(x))[0]);
}
export const voiceName = () => pickVoice()?.name ?? '';
synth()?.addEventListener?.('voiceschanged', () => { chosen = null; pickVoice(); });

// mouth animation etc.: who's listening for "Kaal is speaking"
const talkSubs = new Set<(on: boolean) => void>();
export function onSpeaking(l: (on: boolean) => void) { talkSubs.add(l); return () => { talkSubs.delete(l); }; }
const talking = (on: boolean) => talkSubs.forEach((l) => l(on));

// what we say: the line without emoji / markdown, and "SQL" read as letters
function clean(text: string) {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}✦]/gu, '')
    .replace(/[*_`#>|]/g, '')
    .replace(/\bSQL\b/g, 'S Q L').replace(/\bUPI\b/g, 'U P I')
    .replace(/…/g, '... ').replace(/ - /g, ', ')
    .replace(/\s+/g, ' ').trim();
}

// the pace of every line (1 = the voice's normal speed)
const RATE = 1.05;

let last = '';
let lastAt = 0;
export function speak(text: string, opts: { mood?: string } = {}) {
  const s = synth();
  if (!s || !enabled || !soundOn() || !text) return;
  const t = clean(text);
  if (!t) return;
  const now = Date.now();
  if (t === last && now - lastAt < 1500) return;      // StrictMode double-mount / repeated renders
  last = t; lastAt = now;
  s.cancel();
  const u = new SpeechSynthesisUtterance(t);
  const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-IN';
  // A steady, clear pace for every line (students must catch every word), with the MOOD heard in the tone:
  //   happy / cheering  → brighter, higher voice, a touch quicker (still easy to follow)
  //   sad (wrong query, error) → lower, softer, a little slower, like a sympathetic "oh no"
  //   thinking / hint   → calm, slightly lower
  // The pace never moves more than ±6% from RATE, so it stays consistent; the pitch carries the feeling.
  const m = opts.mood ?? 'idle', natural = !!v && /natural|neural|online/i.test(v.name);
  //                                         [pitch, pace,  volume]
  const TONE: Record<string, [number, number, number]> = {
    cheer:   [0.82, 1.06, 1],    // promotion, first try, episode solved
    happy:   [0.76, 1.04, 1],    // correct answer
    point:   [0.68, 1.0, 1],     // "your turn"
    idle:    [0.66, 1.0, 1],
    smirk:   [0.64, 1.0, 1],     // trap spotted
    think:   [0.62, 0.97, 1],
    whisper: [0.6, 0.97, 0.95],  // hints, the Briefing
    oops:    [0.54, 0.94, 0.85], // wrong answer, SQL error: sad, gentle
  };
  const [pitch, pace, volume] = TONE[m] ?? TONE.idle;
  u.pitch = natural ? 1 + (pitch - 1) * 0.8 : pitch;   // natural voices warp when pushed far from 1.0
  u.rate = RATE * pace; u.volume = volume;
  u.onstart = () => { duckAmbient(true); talking(true); };
  u.onend = u.onerror = () => { duckAmbient(false); talking(false); };
  // Chrome sometimes needs a tick after cancel()
  setTimeout(() => s.speak(u), 60);
}
export function hush() { synth()?.cancel(); duckAmbient(false); talking(false); }
