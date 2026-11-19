#!/usr/bin/env python3
"""Gives Kaal's recorded lines a calm classroom pace (about 125 words a minute), in two gentle steps:
  1. the speech itself is slowed with WSOLA (a time-stretch made for speech: same pitch, no "chipmunk" or echo),
     never below 0.78 of the recorded speed, so it still sounds natural;
  2. the pauses BETWEEN phrases and sentences (110 ms or longer) are lengthened; the closure before a consonant
     (like the t in "data") is shorter than that and is never touched, so nothing sounds like a stutter.

    ../kaal-voice/venv/bin/python tools/kaal-voice/pace.py                 # aim at 12.5 characters a second
    ../kaal-voice/venv/bin/python tools/kaal-voice/pace.py --target 13.5   # a little brisker
    ../kaal-voice/venv/bin/python tools/kaal-voice/pace.py --restore       # put the clips back as recorded
    ... pace.py --mild 01ce0b13 --mild 0f502285                             # slow these words less (check.py flagged them)

The clips as recorded are copied to ../kaal-voice/as-recorded/<model>/ next to the repo (outside it) the first time,
and every run starts from those copies, so running it twice never slows anything twice. The game plays every clip at
its own speed (the manifest's `rates` are emptied). Then run check.py: every line should still be heard word for word.
Needs numpy, soundfile and audiotsm (pip install audiotsm==0.1.2, MIT) - all in the Chatterbox venv.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SLOWEST = 0.78          # never slow the words more than this: below it speech starts to sound drawn out
MILD = 0.92             # --mild: for the few takes that blur when slowed more (check.py finds them); pauses do the rest
WORDS_SHARE = 1.12      # step 1 aims a little above the target; the longer pauses bring it the rest of the way


def pauses(a, sr):
    """(start, end) sample ranges of quiet stretches of 110 ms or more inside the line"""
    hop, win = int(sr * 0.01), int(sr * 0.02)
    n = max(1, (len(a) - win) // hop)
    rms = np.array([np.sqrt(np.mean(a[i * hop:i * hop + win] ** 2)) for i in range(n)])
    loud = np.percentile(rms, 90) if len(rms) else 0
    quiet = rms < max(0.004, loud * 0.07)
    runs, i = [], 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if i > 0 and j < n and (j - i) * hop >= sr * 0.11:      # inside the line, not the lead-in or tail
                runs.append((i * hop + win // 2, j * hop + win // 2))
            i = j
        else:
            i += 1
    return runs


def lengthen(a, sr, runs, share):
    out, last = [], 0
    for s, e in runs:
        length = (e - s) / sr
        extra = min(0.35, length * share)
        if length >= 0.15:
            extra = max(extra, 0.40 - length)
        mid = (s + e) // 2
        out += [a[last:mid], np.zeros(int(extra * sr), dtype=a.dtype)]
        last = mid
    out.append(a[last:])
    return np.concatenate(out)


def stretch(a, sr, speed):
    """the same speech, slower (speed < 1), same pitch: WSOLA with 40 ms frames, as used for speech"""
    if speed >= 0.995:
        return a
    from audiotsm import wsola
    from audiotsm.io.array import ArrayReader, ArrayWriter
    frame = int(sr * 0.04) // 2 * 2
    reader, writer = ArrayReader(a.reshape(1, -1).astype(np.float32)), ArrayWriter(channels=1)
    wsola(channels=1, speed=speed, frame_length=frame, synthesis_hop=frame // 2).run(reader, writer)
    b = writer.data[0].astype(np.float32)
    peak = float(np.max(np.abs(b))) or 1.0
    return b * (min(1.0, 0.89 / peak))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--voice', default=str(ROOT / 'content' / 'voice'))
    ap.add_argument('--lines', default=str(HERE / 'lines.json'))
    ap.add_argument('--target', type=float, default=12.5, help='characters a second to aim for (pauses included)')
    ap.add_argument('--restore', action='store_true', help='copy the clips as recorded back and stop')
    ap.add_argument('--mild', action='append', default=[], help='slow the words of this clip less (a key check.py flagged); repeatable')
    ap.add_argument('--plain', action='append', default=[], help='do not slow the words of this clip at all, only its pauses; repeatable')
    args = ap.parse_args()

    voice = Path(args.voice)
    manifest_file = voice / 'manifest.json'
    manifest = json.loads(manifest_file.read_text())
    keep = ROOT.parent / 'kaal-voice' / 'as-recorded' / manifest.get('model', 'voice')
    if not keep.exists():
        keep.mkdir(parents=True)
        for f in voice.glob('*.mp3'):
            shutil.copy2(f, keep / f.name)
        shutil.copy2(manifest_file, keep / 'manifest.json')
        print(f'kept the clips as recorded in {keep}')
    if args.restore:
        for f in keep.glob('*.mp3'):
            shutil.copy2(f, voice / f.name)
        shutil.copy2(keep / 'manifest.json', manifest_file)
        print('clips restored as recorded')
        return

    text = {l['key']: l['text'] for l in json.loads(Path(args.lines).read_text())}
    before, after, slowed = [], [], 0
    for key, name in manifest['clips'].items():
        src = keep / name
        if not src.exists() or key not in text:
            continue
        a, sr = sf.read(src, dtype='float32')
        chars = len(text[key])
        p0 = chars / (len(a) / sr)
        before.append(p0)
        best = a
        if p0 > args.target and chars >= 12:
            floor = 1.0 if key in args.plain else MILD if key in args.mild else SLOWEST
            best = stretch(a, sr, max(floor, min(1.0, args.target * WORDS_SHARE / p0)))
            runs = pauses(best, sr)
            for share in (0.0, 0.4, 0.8, 1.2, 1.6, 2.0):
                b = lengthen(best, sr, runs, share) if share else best
                if chars / (len(b) / sr) <= args.target or share == 2.0:
                    best = b
                    break
            slowed += 1
        after.append(chars / (len(best) / sr))
        sf.write(voice / name, best, sr, format='MP3' if name.endswith('.mp3') else 'WAV')
    manifest['rates'] = {}
    manifest['paced'] = args.target
    manifest_file.write_text(json.dumps(manifest, indent=1, sort_keys=True) + '\n')
    med = lambda xs: sorted(xs)[len(xs) // 2] if xs else 0
    print(f'{slowed} of {len(after)} clips slowed · median pace {med(before):.1f} → {med(after):.1f} characters a second '
          f'· fastest now {max(after):.1f} · slowest {min(after):.1f}')


if __name__ == '__main__':
    sys.exit(main())
