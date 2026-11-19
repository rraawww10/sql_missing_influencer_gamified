#!/usr/bin/env python3
"""Records every line Kaal says in ONE Indian English voice, with AI4Bharat's Indic Parler-TTS
(ai4bharat/indic-parler-tts: open source, Apache-2.0, made for Indian voices, runs on this computer).

    1. cd app && npm run voice:lines                                   # writes tools/kaal-voice/lines.json
    2. ../kaal-voice/venv-parler/bin/python tools/kaal-voice/generate_parler.py --verify
       → content/voice/<key>.mp3 for every line + content/voice/manifest.json  ("rates": {} : played as recorded)
    3. cd app && npm run sync-content (or any build): the game plays these clips (app/src/ui/voice.ts)

The voice is one of the model's named speakers (SPEAKER), the same for every line. The text description below sets
the voice, a moderate pace and clean audio; only the feeling changes with the line's mood. The pace is recorded right
(about 13 characters a second), so the game never has to slow a clip down.

A voice model sometimes drops or slurs a word, pauses too long or runs too fast. With --verify every take is
transcribed by a speech-to-text model (check.py) and compared with the line: up to 4 takes, the one heard most
accurately is kept (then: no glitch, then the pace closest to 13 characters a second). A take that runs too fast or too
slow is tried again with a slower or quicker pace in the description. A clip that already exists is only replaced by a
better one. Anything still doubtful is listed at the end.

Lines already recorded are skipped (--force redoes all; --only <key> redoes one line; --limit N stops after N new
lines). The manifest is written after every line, so the run can be stopped and continued.
Needs the venv described in tools/kaal-voice/README.md (parler-tts) and access to the model on Hugging Face.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

MODEL = 'ai4bharat/indic-parler-tts'
MODEL_TAG = 'indic-parler-tts'      # written into the manifest
SPEAKER = 'Thoma'                   # one of the model's English speakers; Kaal keeps this one voice
RATE = 24000                        # the clips are written at this sample rate (mono MP3)

# One fixed description. Only {feeling} changes with the mood, and {pace} only when a take runs too fast or too slow.
BASE = ("{speaker} speaks in a clear and warm male voice with an Indian English accent, {feeling}, {pace} and a moderate pitch. "
        "The recording is of very high quality, with very clear audio, the speaker's voice sounding close up, and no background noise.")
FRIENDLY = 'in a friendly, conversational tone'
FEELING = {
    'cheer':   'in a cheerful and excited tone',          # promotion, first try, episode solved
    'happy':   'in a cheerful and excited tone',          # correct answer
    'oops':    'in a gentle and slightly sad tone',       # wrong answer, SQL error
    'think':   'in a calm and thoughtful tone',
    'whisper': 'in a calm and thoughtful tone',           # hints, the briefing
    'point':   FRIENDLY,                                  # "your turn"
    'idle':    FRIENDLY,
    'smirk':   FRIENDLY,                                  # trap spotted
}
PACES = ['at a moderate speed', 'at a slightly slow speed', 'at a slow speed']    # quicker → slower
PACE_START = 1                      # where every line starts on that ladder

# How a word is spelled for THIS voice only; the line on screen and lines.json do not change.
# lines.json spells the name "Kaal" as "Kahl" (that suited the Chatterbox voice).
RESPELL = {}

TARGET = 13.0                       # characters a second
FAST, SLOW = 15.0, 11.0             # accepted at once inside this range ...
TOO_FAST, TOO_SLOW = 15.5, 9.0      # ... and never kept outside this one if any other take is in it
GOOD = 0.95                         # --verify: a take heard this accurately (and at a good pace) is accepted at once
TAKES = 4
CHUNK = 140                         # longer lines are said sentence by sentence and joined with a short pause
GAP = 0.30                          # seconds of quiet between those sentences
LONG_PAUSE = 1.1                    # a pause longer than this inside a take counts as a glitch


def describe(mood, speaker=SPEAKER, pace=PACE_START):
    return BASE.format(speaker=speaker, feeling=FEELING.get(mood, FRIENDLY), pace=PACES[pace])


def spoken(text):
    for a, b in RESPELL.items():
        text = re.sub(rf'\b{re.escape(a)}\b', b, text)
    return text


def chunks(text, size=CHUNK):
    """a long line in pieces of whole sentences, each at most about `size` characters"""
    if len(text) <= size:
        return [text]
    out = []
    for s in re.split(r'(?<=[.!?])\s+', text.strip()):
        if out and len(out[-1]) + 1 + len(s) <= size * 0.8:
            out[-1] += ' ' + s
        else:
            out.append(s)
    return out


class Voice:
    """the Parler-TTS model, loaded once"""

    def __init__(self, model_id=MODEL):
        import os
        import warnings
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer
        from transformers.utils import logging
        warnings.filterwarnings('ignore')
        logging.set_verbosity_error()
        torch.set_num_threads(min(12, os.cpu_count() or 4))      # more threads are no faster here, all 28 much slower
        self.torch = torch
        self.model = ParlerTTSForConditionalGeneration.from_pretrained(model_id).eval()
        self.tok = AutoTokenizer.from_pretrained(model_id)
        self.desc_tok = AutoTokenizer.from_pretrained(self.model.config.text_encoder._name_or_path)
        self.sr = self.model.config.sampling_rate

    def say(self, text, description, seed, n=1):
        """n takes in one batch (2 cost about 1.4 times one): [(float32 array at self.sr, samples at full scale)]"""
        import numpy as np
        torch = self.torch
        torch.manual_seed(seed)
        d = self.desc_tok([description] * n, return_tensors='pt')
        p = self.tok([text] * n, return_tensors='pt')
        with torch.inference_mode():
            g = self.model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask,
                                    prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask,
                                    return_dict_in_generate=True)
        takes = []
        for row, length in zip(g.sequences, g.audios_length):
            a = row[:length].cpu().numpy().astype('float32')
            takes.append((a, int(np.sum(np.abs(a) >= 0.99))))
        return takes


# ---- tidying and measuring a take ------------------------------------------------------------------------------

def trim(a, sr):
    """cut the quiet at both ends (keeps a little air before and after the voice)"""
    import numpy as np
    hop = max(1, int(sr * 0.01))
    n = len(a) // hop
    if n == 0:
        return a
    rms = np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(axis=1))
    loud = np.flatnonzero(rms > max(0.004, rms.max() * 0.06))
    if not len(loud):
        return a
    return a[max(0, (loud[0] - 6) * hop): min(len(a), (loud[-1] + 18) * hop)]


def finish(a, sr):
    """at RATE: even loudness, no DC, a short fade in and out"""
    import librosa
    import numpy as np
    if sr != RATE:
        a = librosa.resample(a, orig_sr=sr, target_sr=RATE).astype('float32')
    a = a - float(np.mean(a))
    hop = int(RATE * 0.02)
    n = len(a) // hop
    rms = np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(axis=1)) if n else np.array([0.1])
    voiced = rms[rms > rms.max() * 0.1]
    level = float(np.sqrt(np.mean(voiced ** 2))) if len(voiced) else 0.1
    peak = float(np.max(np.abs(a))) or 1.0
    a = a * min(0.12 / max(level, 1e-4), 0.89 / peak)          # about -18 dBFS where he speaks, never above -1 dBFS
    fade = min(len(a) // 2, int(RATE * 0.012))
    if fade:
        a[:fade] *= np.linspace(0, 1, fade, dtype='float32')
        a[-fade:] *= np.linspace(1, 0, fade, dtype='float32')
    return a.astype('float32')


def join(parts, sr):
    import numpy as np
    quiet = np.zeros(int(sr * GAP), dtype='float32')
    out = []
    for i, p in enumerate(parts):
        out += [quiet, p] if i else [p]
    return np.concatenate(out)


def longest_pause(a, sr):
    """seconds of the longest quiet stretch inside the take"""
    import numpy as np
    hop = int(sr * 0.02)
    n = len(a) // hop
    if n < 3:
        return 0.0
    rms = np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(axis=1))
    quiet = rms < rms.max() * 0.03
    best = run = 0
    for q in quiet:
        run = run + 1 if q else 0
        best = max(best, run)
    return best * 0.02


def pace(a, sr, text):
    return len(text) / max(len(a) / sr, 0.05)


def short(text):
    return len(text) < 12        # "Perfect!": characters a second mean little; only "too fast" counts


def in_range(p, text, lo, hi):
    return p <= hi and (p >= lo or short(text))


def clean(a, sr, text, clipped=0):
    return in_range(pace(a, sr, text), text, TOO_SLOW, TOO_FAST) and longest_pause(a, sr) <= LONG_PAUSE and clipped < 50


def rank(score, a, sr, text, clipped=0):
    """how good a take is: heard correctly first (every take heard at GOOD or better counts the same), then no glitch,
    then the pace closest to the target"""
    return (min(round(score, 2), GOOD), 1 if clean(a, sr, text, clipped) else 0, -abs(pace(a, sr, text) - TARGET))


def accepted(score, a, sr, text, clipped=0):
    return score >= GOOD and clean(a, sr, text, clipped) and in_range(pace(a, sr, text), text, SLOW, FAST)


def make_hear():
    """Whisper, as in check.py: hear(audio, rate, text) → 0 to 1"""
    import librosa
    from transformers import pipeline
    from check import score_of
    asr = pipeline('automatic-speech-recognition', model='openai/whisper-base.en', device='cpu')

    def hear(a, rate, text):
        return score_of(text, asr({'array': librosa.resample(a, orig_sr=rate, target_sr=16000), 'sampling_rate': 16000})['text'])
    return hear


def record(voice, text, mood, seed, hear=None, speaker=SPEAKER, takes=TAKES, per_round=2, log=None):
    """the best take of one line (long lines sentence by sentence) → (audio at RATE, score)
    Takes come in rounds of `per_round` (one batch, one seed). Without `hear` only the pace and pauses decide."""
    import numpy as np
    parts = []
    for piece in chunks(text):
        best, step, n, done = None, PACE_START, 0, False
        while n < takes and not done:
            paces = []
            for raw, clipped in voice.say(spoken(piece), describe(mood, speaker, step), seed + n, min(per_round, takes - n)):
                n += 1
                a = finish(trim(raw, voice.sr), voice.sr)
                s = hear(a, RATE, piece) if hear else 1.0
                r = rank(s, a, RATE, piece, clipped)
                paces.append(pace(a, RATE, piece))
                if log:
                    log(f'      take {n}: heard {s:.2f}  {paces[-1]:4.1f} ch/s  pause {longest_pause(a, RATE):.1f}s  {PACES[step]}')
                if best is None or r > best[0]:
                    best = (r, a, s)
                done = done or accepted(s, a, RATE, piece, clipped)
            p = float(np.median(paces))
            if p > FAST and not short(piece):              # too quick: ask for a slower delivery next round
                step = min(step + 1, len(PACES) - 1)
            elif p < SLOW and not short(piece):
                step = max(step - 1, 0)
        parts.append(best[1])
    a = join(parts, RATE) if len(parts) > 1 else parts[0]
    return a, (hear(a, RATE, text) if hear and len(parts) > 1 else best[2])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--lines', default=str(HERE / 'lines.json'))
    ap.add_argument('--out', default=str(ROOT / 'content' / 'voice'))
    ap.add_argument('--model', default=MODEL, help='Hugging Face model id or a local folder')
    ap.add_argument('--speaker', default=SPEAKER, help='the named speaker in the description (one voice for every line)')
    ap.add_argument('--force', action='store_true', help='record every line again')
    ap.add_argument('--only', action='append', default=[], help='record just this key (repeatable)')
    ap.add_argument('--limit', type=int, default=0, help='stop after this many new lines')
    ap.add_argument('--seed', type=int, default=7, help='same seed = the same takes')
    ap.add_argument('--verify', action='store_true', help='transcribe every take and keep the one heard most accurately')
    ap.add_argument('--verbose', action='store_true', help='print every take')
    args = ap.parse_args()

    import numpy as np
    import soundfile as sf
    lines = json.loads(Path(args.lines).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    manifest_file = out / 'manifest.json'
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {'clips': {}}
    if manifest.get('clips') and manifest.get('model') not in (None, MODEL_TAG):
        sys.exit(f"{out} holds a {manifest.get('model')} voice pack. Move it away first (README: 'Kaal's Indian voice'), "
                 f"so the two voices never mix.")
    if args.force:
        manifest['clips'] = {}

    def has_clip(l):
        return (out / manifest['clips'].get(l['key'], '-')).exists()

    todo = [l for l in lines if (not args.only or l['key'] in args.only) and (args.force or l['key'] in args.only or not has_clip(l))]
    if args.limit:
        todo = todo[:args.limit]
    print(f'{len(lines)} lines in all, {len(todo)} to record in the voice of {args.speaker} ({args.model})')

    def save():
        manifest.update(voice=args.speaker, model=MODEL_TAG, lines=len(lines), rates={})
        manifest_file.write_text(json.dumps(manifest, indent=1, sort_keys=True) + '\n')

    odd = []
    if todo:
        print('loading the voice model on the CPU …', flush=True)
        voice = Voice(args.model)
        hear = make_hear() if args.verify else None
        log = print if args.verbose else None
        started = time.time()
        for i, l in enumerate(todo, 1):
            t0 = time.time()
            text = l['text']
            seed = args.seed + (100 if l['key'] in args.only else 0)
            a, s = record(voice, text, l['mood'], seed, hear, args.speaker, log=log)
            kept = False
            if hear and has_clip(l) and not args.force and not l.get('changed'):     # the clip already there competes
                old, old_sr = sf.read(out / manifest['clips'][l['key']], dtype='float32')
                old = old.mean(axis=1) if old.ndim > 1 else old
                s_old = hear(old, old_sr, text)
                if old_sr == RATE and rank(s_old, old, RATE, text) >= rank(s, a, RATE, text):
                    a, s, kept = old, s_old, True
            name = manifest['clips'].get(l['key']) if kept else f"{l['key']}.mp3"
            if not kept:
                sf.write(out / name, np.clip(a, -1, 1), RATE, format='MP3')
            p = pace(a, RATE, text)
            if (hear and s < 0.9) or not clean(a, RATE, text):
                odd.append((l['key'], round(s, 2), round(p, 1), text))
            manifest['clips'][l['key']] = name
            save()                                                       # after every line: safe to stop and resume
            heard = f'heard {s:.2f}  ' if hear else ''
            print(f"[{i}/{len(todo)}] {len(a) / RATE:4.1f}s in {time.time() - t0:5.1f}s  {p:4.1f} ch/s  {heard}{l['mood']:8} "
                  f"{'(kept the earlier take) ' if kept else ''}{text[:60]}", flush=True)
        print(f'recorded in {(time.time() - started) / 60:.1f} min')

    # clips of lines that no longer exist are removed, so the folder holds exactly what the game can play
    wanted = {l['key'] for l in lines}
    for key in [k for k in manifest['clips'] if k not in wanted]:
        (out / manifest['clips'].pop(key)).unlink(missing_ok=True)
    save()
    paces = []
    for l in lines:
        f = out / manifest['clips'].get(l['key'], '-')
        if f.exists() and not short(l['text']):
            info = sf.info(f)
            paces.append(len(l['text']) / max(info.frames / info.samplerate, 0.05))
    have = sum(1 for l in lines if (out / manifest['clips'].get(l['key'], '-')).exists())
    size = sum(f.stat().st_size for f in out.glob('*.mp3')) / 1e6
    print(f'{have} of {len(lines)} lines recorded, {size:.1f} MB in {out}')
    if paces:
        print(f'pace (characters a second, lines of 12+ characters): min {min(paces):.1f}, '
              f'median {float(np.median(paces)):.1f}, max {max(paces):.1f}')
    if odd:
        print(f'{len(odd)} take(s) to listen to (re-record with --only <key> --seed <another number> if needed):')
        for key, s, p, text in odd:
            print(f'  {key}  heard {s}  {p} ch/s  {text[:80]}')


if __name__ == '__main__':
    main()
