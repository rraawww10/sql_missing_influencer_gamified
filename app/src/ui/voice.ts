// Kaal's voice. Two ways to speak, in this order:
//   1. RECORDED CLIPS: when the build carries a voice pack (content/voice/manifest.json + one mp3 per line, made once by
//      tools/kaal-voice; served from the content folder like the episode packs), every line is played in that one voice,
//      the same on every device. A line with no clip (Kaal's chat answers, which are written on the spot) is then not
//      spoken at all, so he never changes voice.
//      So that a line never stutters or breaks off: every clip is loaded COMPLETELY and decoded before it plays (Web Audio,
//      no streaming that can stall half-way), it plays at its recorded speed (no time-stretching, which warbles), a line that
//      only comments on a new step never cuts off one that is still playing, and a line that does take over fades the old
//      one out instead of chopping it.
//   2. THE BROWSER'S OWN VOICE (Web Speech API): used when there is no voice pack. An Indian-English voice at one steady,
//      clear pace (see PREFER, RATE); his mood is heard in the tone (TONE).
// A separate toggle in the top bar switches the voice, remembered on this device. Muted automatically when sound is off.
import { audioContext, duckAmbient, soundOn } from './sound';
import { currentIdentity, firstName, personalize } from '../adapters/identity';
import { candidateKeys } from './voiceKey';
import { SAY } from './kaal/lines';

const KEY = 'tmi.voice.v1';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();
const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

function readPref(): boolean {
  try { const v = localStorage.getItem(KEY); return v === null ? true : v === '1'; } catch { return true; }
}
let enabled = readPref();

// ---------------------------------------------------------------- recorded clips
// manifest.json: { voice: "whose voice", fallback?: "browser", clips: { "<key>": "<file>.mp3" } }   (keys: voiceKey.ts)
// The clips are recorded at the pace Kaal should speak; a `rates` field from older voice packs is ignored on purpose.
interface VoicePack { voice?: string; fallback?: 'none' | 'browser'; clips: Record<string, string>; rates?: Record<string, number> }
// next to the episode packs: '/content/voice/' in the team build, '../content/voice/' in the per-episode sites (<meta name="tmi-content">)
const VOICE_DIR = `${(typeof document !== 'undefined' && document.querySelector('meta[name="tmi-content"]')?.getAttribute('content')) || `${import.meta.env?.BASE_URL ?? '/'}content`}/voice/`;
let pack: VoicePack | null = null;
export const hasRecordedVoice = () => !!pack && Object.keys(pack.clips).length > 0;
// for tests, and for a page that wants to load the pack itself
export function setVoicePack(p: VoicePack | null) { pack = p; bytes.clear(); decoded.clear(); listeners.forEach((l) => l(enabled)); }
const browserPage = typeof fetch === 'function' && typeof window !== 'undefined' && !/jsdom/i.test(navigator.userAgent);
if (browserPage) {
  fetch(`${VOICE_DIR}manifest.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m: VoicePack | null) => { if (m && m.clips && typeof m.clips === 'object') { setVoicePack(m); prefetchAll(); } })
    .catch(() => { /* no voice pack in this build: the browser's voice is used */ });
}

// Every clip is downloaded in the background once the game has loaded (about 3 MB for all of them, 3 at a time), so a
// line is ready the moment Kaal says it. The bytes are decoded on first use.
const bytes = new Map<string, Promise<ArrayBuffer | null>>();
const decoded = new Map<string, AudioBuffer>();
function load(file: string): Promise<ArrayBuffer | null> {
  let p = bytes.get(file);
  if (!p) {
    p = fetch(`${VOICE_DIR}${file}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    bytes.set(file, p);
    p.then((b) => { if (!b) bytes.delete(file); });     // a failed download is tried again next time
  }
  return p;
}
function prefetchAll() {
  const files = [...new Set(Object.values(pack?.clips ?? {}))];
  let i = 0;
  const next = (): unknown => i < files.length && load(files[i++]).then(next);
  const start = () => { for (let k = 0; k < 3; k++) void next(); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 4000 }); else setTimeout(start, 1500);
}
async function bufferOf(ac: AudioContext, file: string): Promise<AudioBuffer | null> {
  const hit = decoded.get(file);
  if (hit) return hit;
  const b = await load(file);
  if (!b) return null;
  try {
    const buf = await ac.decodeAudioData(b.slice(0));   // decodeAudioData takes the bytes over: keep the cached copy intact
    decoded.set(file, buf);
    return buf;
  } catch { return null; }
}

export const voiceSupported = () => hasRecordedVoice() || !!synth();
export const voiceOn = () => enabled && voiceSupported();
export function setVoice(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((l) => l(on));
  if (!on) hush(); else speak(personalize(SAY.voiceOn, 'partner'));
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

// What is playing now: a Web Audio voice (with its own gain, for the fade-out) or, where Web Audio is missing, an <audio>.
let current: { source?: AudioBufferSourceNode; gain?: GainNode; el?: HTMLAudioElement; ends: number } | null = null;
let ticket = 0;                       // a newer line wins over one that is still loading
const playing = () => !!current && (current.el ? !current.el.paused && !current.el.ended : Date.now() < current.ends);

function stopCurrent(fadeMs = 120) {
  const c = current;
  current = null;
  if (!c) return;
  if (c.source && c.gain) {
    const ac = c.gain.context, t = ac.currentTime;
    try {
      c.gain.gain.cancelScheduledValues(t);
      c.gain.gain.setValueAtTime(c.gain.gain.value, t);
      c.gain.gain.linearRampToValueAtTime(0.0001, t + fadeMs / 1000);   // a short fade: no click, no chopped syllable
      c.source.stop(t + fadeMs / 1000 + 0.02);
    } catch { /* already stopped */ }
  }
  if (c.el) c.el.pause();
}

async function playClip(file: string, passive: boolean) {
  if (passive && playing()) return;              // a comment on a new step never cuts off a line Kaal is still saying
  const mine = ++ticket;
  const ac = audioContext();
  if (!ac) {                                     // no Web Audio: a plain <audio>, still at its recorded speed
    stopCurrent(0); synth()?.cancel();
    const el = new Audio(`${VOICE_DIR}${file}`);
    el.preload = 'auto';
    current = { el, ends: 0 };
    el.onplaying = () => { duckAmbient(true); talking(true); };
    el.onended = el.onerror = () => { if (current?.el === el) current = null; duckAmbient(false); talking(false); };
    void el.play().catch(() => { if (current?.el === el) current = null; });
    return;
  }
  const buf = await bufferOf(ac, file);
  if (mine !== ticket || !buf || !enabled || !soundOn()) return;
  if (passive && playing()) return;
  stopCurrent(); synth()?.cancel();
  const source = ac.createBufferSource(), gain = ac.createGain();
  source.buffer = buf;
  gain.gain.value = 1;
  source.connect(gain).connect(ac.destination);
  const self = { source, gain, ends: Date.now() + buf.duration * 1000 + 100 };
  current = self;
  source.onended = () => { if (current === self) { current = null; duckAmbient(false); talking(false); } };
  duckAmbient(true); talking(true);
  source.start();
}

let last = '';
let lastAt = 0;
// `say`: what to speak when the text on screen carries something that has no recording (a number, lines.ts SAY)
// `passive`: a comment on a new step (lines.ts PASSIVE_EVENTS): skipped while another line is still playing
export function speak(text: string, opts: { mood?: string; say?: string; passive?: boolean } = {}) {
  if (!enabled || !soundOn() || !text) return;
  const spoken = opts.say ?? text;
  const t = clean(spoken);
  if (!t) return;
  const now = Date.now();
  if (t === last && now - lastAt < 1500) return;      // StrictMode double-mount / repeated renders
  last = t; lastAt = now;
  if (pack && hasRecordedVoice()) {
    const key = candidateKeys(spoken, firstName(currentIdentity()) || 'partner').find((k) => pack!.clips[k]);
    if (key) { void playClip(pack.clips[key], !!opts.passive); return; }
    if (pack.fallback !== 'browser') { if (!opts.passive) hush(); return; }   // no clip for this line: stay silent, so Kaal keeps one voice
  }
  const s = synth();
  if (!s) return;
  hush();
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
export function hush() {
  ticket++;
  synth()?.cancel();
  stopCurrent();
  duckAmbient(false); talking(false);
}
