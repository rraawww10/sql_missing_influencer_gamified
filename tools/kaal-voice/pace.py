#!/usr/bin/env python3
"""Gives Kaal's recorded lines a calmer pace by lengthening the pauses BETWEEN words and sentences; the words
themselves are not touched (no time-stretching, so no warble and no pitch change).

    python tools/kaal-voice/pace.py                 # content/voice, aiming at 14.5 characters a second
    python tools/kaal-voice/pace.py --target 14     # calmer still
    python tools/kaal-voice/pace.py --restore       # put the clips back as recorded

The clips as recorded are copied to ../kaal-voice/as-recorded/<model>/ next to the repo (outside it) the first time,
and every run starts from those copies, so running it twice never adds pauses twice.
A pause is a quiet stretch of at least 110 ms inside the line (shorter gaps are the closure before a consonant
like the t in "data": stretching those would sound like a stutter). Each gets longer by the same share (at most +0.35 s);
a sentence break (a pause of 150 ms or more) lasts at least 0.4 s. Lines already at or under the target are left
as recorded. The manifest's `rates` are emptied: the game plays every clip at its own speed.
Needs numpy + soundfile (both are in the Chatterbox venv).
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--voice', default=str(ROOT / 'content' / 'voice'))
    ap.add_argument('--lines', default=str(HERE / 'lines.json'))
    ap.add_argument('--target', type=float, default=14.5, help='characters a second to aim for (pauses included)')
    ap.add_argument('--restore', action='store_true', help='copy the clips as recorded back and stop')
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
    before, after, changed = [], [], 0
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
            runs = pauses(a, sr)
            for share in (0.4, 0.8, 1.2, 1.6, 2.0):
                b = lengthen(a, sr, runs, share)
                best = b
                if chars / (len(b) / sr) <= args.target:
                    break
            changed += best is not a
        after.append(chars / (len(best) / sr))
        sf.write(voice / name, best, sr, format='MP3' if name.endswith('.mp3') else 'WAV')
    manifest['rates'] = {}
    manifest['paced'] = args.target
    manifest_file.write_text(json.dumps(manifest, indent=1, sort_keys=True) + '\n')
    med = lambda xs: sorted(xs)[len(xs) // 2] if xs else 0
    print(f'{changed} of {len(after)} clips got longer pauses · median pace {med(before):.1f} → {med(after):.1f} characters a second '
          f'· fastest now {max(after):.1f}')


if __name__ == '__main__':
    sys.exit(main())
