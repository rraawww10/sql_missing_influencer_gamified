#!/usr/bin/env python3
"""Records every line Kaal says in ONE voice, with Chatterbox (open source, MIT, runs on this computer).

    1. cd app && npm run voice:lines                            # writes tools/kaal-voice/lines.json (the lines to record)
    2. python tools/kaal-voice/generate.py --verify             # Chatterbox's own built-in voice
       python tools/kaal-voice/generate.py --verify --voice my-voice.wav   # or: clone the voice in this recording
       → content/voice/<key>.mp3 for every line + content/voice/manifest.json
    3. cd app && npm run sync-content (or any build): the game plays these clips instead of the browser's voice (app/src/ui/voice.ts)

Without --voice Kaal speaks in the voice that ships with Chatterbox. --voice is a clean recording (10 to 30 seconds,
one speaker, no music or noise) of the person whose voice Kaal gets instead; only use a voice whose owner agreed to it.
Every clip carries Chatterbox's inaudible "AI generated" watermark.

A voice model sometimes drops or slurs a word. Two guards:
  * a take far too short or too long for its text (a cut-off or a ramble) is recorded again;
  * with --verify every take is also transcribed by a speech-to-text model (check.py) and compared with the line:
    up to 4 takes, the one heard most accurately is kept, and a clip that already exists is only replaced by a better one.
Anything still doubtful is listed at the end.

Lines already recorded are skipped, so after changing a few lines only those are generated again (--force redoes all;
--only <key> redoes one line; --limit N stops after N new lines, to listen before recording everything).

The manifest also says how fast to play each clip (`rates`): the voice speaks briskly, so the game plays the faster
clips a little slower (same pitch) to keep one steady pace. --pace sets the target; --pace 0 switches that off.
Needs:  pip install chatterbox-tts   (see tools/kaal-voice/README.md; a GPU is used when there is one, else the CPU).
"""
import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

# How each mood is spoken. exaggeration: how much feeling (0.5 = neutral); cfg_weight: how closely the pace follows the voice.
MOODS = {
    'cheer':   dict(exaggeration=0.80, cfg_weight=0.40),   # promotion, first try, episode solved
    'happy':   dict(exaggeration=0.70, cfg_weight=0.45),   # correct answer
    'point':   dict(exaggeration=0.55, cfg_weight=0.50),   # "your turn"
    'idle':    dict(exaggeration=0.50, cfg_weight=0.50),
    'smirk':   dict(exaggeration=0.60, cfg_weight=0.45),   # trap spotted
    'think':   dict(exaggeration=0.45, cfg_weight=0.50),
    'whisper': dict(exaggeration=0.40, cfg_weight=0.45),   # hints, the briefing
    'oops':    dict(exaggeration=0.45, cfg_weight=0.40),   # wrong answer, SQL error: gentle
}
GOOD = 0.95          # --verify: a take heard this accurately is accepted at once
TAKES = 4


def tidy(wav, sr):
    """mono float array: trim the silence at both ends, even out the loudness, soften the very start and end"""
    import numpy as np
    a = wav.squeeze().detach().cpu().numpy().astype('float32')
    loud = np.flatnonzero(np.abs(a) > 0.012)
    if len(loud):
        pad = int(sr * 0.06)
        a = a[max(0, loud[0] - pad): min(len(a), loud[-1] + pad * 3)]
    peak = float(np.max(np.abs(a))) or 1.0
    a = a * (0.89 / peak)
    fade = min(len(a) // 2, int(sr * 0.012))
    if fade:
        a[:fade] *= np.linspace(0, 1, fade, dtype='float32')
        a[-fade:] *= np.linspace(1, 0, fade, dtype='float32')
    return a


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--voice', default=None, help="a voice sample to clone (wav / mp3 / flac, 10-30 s); default: Chatterbox's built-in voice")
    ap.add_argument('--lines', default=str(HERE / 'lines.json'))
    ap.add_argument('--out', default=str(ROOT / 'content' / 'voice'))
    ap.add_argument('--name', default=None, help='who the voice belongs to (written into the manifest)')
    ap.add_argument('--force', action='store_true', help='record every line again')
    ap.add_argument('--only', action='append', default=[], help='record just this key (repeatable)')
    ap.add_argument('--limit', type=int, default=0, help='stop after this many new lines')
    ap.add_argument('--seed', type=int, default=7, help='same seed + same sample = the same takes')
    ap.add_argument('--verify', action='store_true', help='transcribe every take and keep the one heard most accurately')
    ap.add_argument('--pace', type=float, default=17.0, help='characters a second the game should play clips at, at most (0 = as recorded)')
    ap.add_argument('--format', default='mp3', choices=['mp3', 'wav'])
    ap.add_argument('--cfg', type=float, default=None, help='cfg_weight for every mood (lower = slower, more deliberate; 0.3 gives a calm classroom pace)')
    ap.add_argument('--target', type=float, default=15.0, help='--verify: among equally clear takes keep the one closest to this many characters a second')
    args = ap.parse_args()

    voice = Path(args.voice).expanduser().resolve() if args.voice else None
    if voice and not voice.exists():
        sys.exit(f'No voice sample at {voice}')
    lines = json.loads(Path(args.lines).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    manifest_file = out / 'manifest.json'
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {'clips': {}}
    voice_name = args.name or (voice.stem if voice else manifest.get('voice') or 'Chatterbox built-in voice')
    if args.force:
        manifest['clips'] = {}

    def has_clip(l):
        return (out / manifest['clips'].get(l['key'], '-')).exists()

    todo = [l for l in lines if (not args.only or l['key'] in args.only) and (args.force or l['key'] in args.only or not has_clip(l))]
    if args.limit:
        todo = todo[:args.limit]
    print(f'{len(lines)} lines in all, {len(todo)} to record in: {voice_name}')

    import soundfile as sf
    odd = []
    if todo:
        import torch
        from chatterbox.tts import ChatterboxTTS
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f'loading Chatterbox on {device} …')
        model = ChatterboxTTS.from_pretrained(device=device)
        sr = model.sr

        hear = None
        if args.verify:
            import librosa
            from transformers import pipeline
            from check import score_of
            asr = pipeline('automatic-speech-recognition', model='openai/whisper-base.en', device='cpu')

            def hear(a, rate, text):
                return score_of(text, asr({'array': librosa.resample(a, orig_sr=rate, target_sr=16000), 'sampling_rate': 16000})['text'])

        # Speech runs at roughly 11 to 20 characters a second. A take far outside that is a cut-off or a ramble
        # (a one-word line is slow per character, so only "too fast" counts there).
        def pace(a, text):
            return len(text) / max(len(a) / sr, 0.05)

        def natural(a, text):
            p = pace(a, text)
            return p <= 23.0 and (p >= 9.0 or len(text) < 12)

        # how good a take is: heard correctly first, then a natural pace
        def rank(score, a, text):
            return (round(score, 2), 1 if natural(a, text) else 0, -abs(pace(a, text) - args.target))

        started = time.time()
        for i, l in enumerate(todo, 1):
            t0 = time.time()
            text = l['text']
            best = None     # (rank, audio or None, score)
            if hear and has_clip(l) and not args.force:
                old, old_sr = sf.read(out / manifest['clips'][l['key']], dtype='float32')
                if old_sr == sr and not l.get('changed'):
                    s = hear(old, old_sr, text)
                    best = (rank(s, old, text), None, s)            # None = keep the file that is there
            for attempt in range(TAKES if hear else 3):
                torch.manual_seed(args.seed + attempt + (100 if l['key'] in args.only else 0))
                mood = dict(MOODS.get(l['mood'], MOODS['idle']), **({'cfg_weight': args.cfg} if args.cfg is not None else {}))
                a = tidy(model.generate(text, audio_prompt_path=str(voice) if voice else None, **mood), sr)
                s = hear(a, sr, text) if hear else 1.0
                r = rank(s, a, text)
                if best is None or r > best[0]:
                    best = (r, a, s)
                if s >= GOOD and natural(a, text):
                    break
            _, a, s = best
            kept = a is None
            name = manifest['clips'].get(l['key']) if kept else f"{l['key']}.{args.format}"
            if kept:
                a, _ = sf.read(out / name, dtype='float32')
            else:
                sf.write(out / name, a, sr, format='MP3' if args.format == 'mp3' else 'WAV')
            if (hear and s < 0.85) or not natural(a, text):
                odd.append((l['key'], round(s, 2), round(pace(a, text), 1), text))
            manifest['clips'][l['key']] = name
            manifest.update(voice=voice_name, model='chatterbox', lines=len(lines))
            manifest_file.write_text(json.dumps(manifest, indent=1, sort_keys=True) + '\n')     # after every line: safe to stop and resume
            heard = f'heard {s:.2f}  ' if hear else ''
            print(f"[{i}/{len(todo)}] {len(a) / sr:4.1f}s in {time.time() - t0:5.1f}s  {pace(a, text):4.1f} ch/s  {heard}{l['mood']:8} {'(kept the earlier take) ' if kept else ''}{text[:60]}", flush=True)
        print(f'recorded in {(time.time() - started) / 60:.1f} min')

    # clips of lines that no longer exist are removed, so the folder holds exactly what the game can play
    wanted = {l['key'] for l in lines}
    for key in [k for k in manifest['clips'] if k not in wanted]:
        (out / manifest['clips'].pop(key)).unlink(missing_ok=True)
    # one steady pace: the game plays a clip that runs faster than --pace a little slower (never below 0.85: it must stay natural)
    rates = {}
    if args.pace > 0:
        for l in lines:
            f = out / manifest['clips'].get(l['key'], '-')
            if not f.exists() or len(l['text']) < 12:
                continue
            info = sf.info(f)
            p = len(l['text']) / max(info.frames / info.samplerate, 0.05)
            if p > args.pace:
                rates[l['key']] = round(max(0.85, args.pace / p), 3)
    manifest['rates'] = rates
    manifest.update(voice=voice_name, model='chatterbox', lines=len(lines))
    manifest_file.write_text(json.dumps(manifest, indent=1, sort_keys=True) + '\n')
    have = sum(1 for l in lines if (out / manifest['clips'].get(l['key'], '-')).exists())
    size = sum(f.stat().st_size for f in out.glob(f'*.{args.format}')) / 1e6
    print(f'{have} of {len(lines)} lines recorded, {size:.1f} MB in {out}; {len(rates)} clips are played a little slower to keep one pace')
    if odd:
        print(f'{len(odd)} take(s) to listen to (re-record with --only <key> --seed <another number> if needed):')
        for key, s, p, text in odd:
            print(f'  {key}  heard {s}  {p} ch/s  {text[:80]}')


if __name__ == '__main__':
    main()
