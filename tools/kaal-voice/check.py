#!/usr/bin/env python3
"""Listens to every recorded line with a speech-to-text model and compares what it hears with what should be said.

    python tools/kaal-voice/check.py                 # lists the clips that do not match their line
    python tools/kaal-voice/check.py --min 0.9       # stricter (1.0 = every word heard exactly)

A voice model sometimes drops a word, repeats one or trails off. Nobody can listen to 114 clips after every change,
so this does it: each clip is transcribed (Whisper, runs on the CPU, downloaded on first use) and scored by how many of
the line's words were heard in order. Re-record what it lists with  generate.py --only <key> --seed <another number>.
The speech-to-text model mishears now and then too, so a low score means "listen to this one", not "this one is wrong".
"""
import argparse
import difflib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
NUM = {'forty thousand': '40000', '40,000': '40000'}


def words(text):
    t = text.lower()
    for a, b in NUM.items():
        t = t.replace(a, b)
    t = re.sub(r"\bs\.? ?q\.? ?l\b", 'sql', t)
    t = re.sub(r"\bu\.? ?p\.? ?i\b", 'upi', t)
    t = re.sub(r"[’']", '', t)
    # names a speech-to-text model spells its own way. "Kaal" is recorded as "Kahl" and should sound like "call";
    # heard as "Kyle" it is wrong, so that one is NOT made equal.
    t = re.sub(r"\b(?:kaal|kahl|kal|call|carl|coll)\b", 'kaal', t)
    t = re.sub(r"\b(?:ira|iroh|iris|eera|era|aira)\b", 'ira', t)
    t = t.replace('pick up', 'pickup').replace('ok', 'okay').replace('okayay', 'okay').replace('rumor', 'rumour')
    return re.findall(r'[a-z0-9]+', t)


def score_of(text, heard):
    """0 to 1: how much of the line was heard, word for word and in order"""
    want, got = words(text), words(heard)
    return difflib.SequenceMatcher(None, want, got).ratio() if want else 1.0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--voice-dir', default=str(ROOT / 'content' / 'voice'))
    ap.add_argument('--lines', default=str(HERE / 'lines.json'))
    ap.add_argument('--min', type=float, default=0.85, help='list clips scoring below this (0 to 1)')
    ap.add_argument('--model', default='openai/whisper-base.en')
    ap.add_argument('--json', default=None, help='also write every score to this file')
    args = ap.parse_args()

    import librosa
    import soundfile as sf
    from transformers import pipeline

    out = Path(args.voice_dir)
    manifest = json.loads((out / 'manifest.json').read_text())
    lines = json.loads(Path(args.lines).read_text())
    asr = pipeline('automatic-speech-recognition', model=args.model, device='cpu')
    scores, low = {}, []
    for i, l in enumerate(lines, 1):
        f = out / manifest['clips'].get(l['key'], '-')
        if not f.exists():
            low.append((0.0, l['key'], l['text'], '(no clip)'))
            continue
        a, sr = sf.read(f, dtype='float32')
        if a.ndim > 1:
            a = a.mean(axis=1)
        heard = asr({'array': librosa.resample(a, orig_sr=sr, target_sr=16000), 'sampling_rate': 16000})['text'].strip()
        score = score_of(l['text'], heard)
        scores[l['key']] = {'score': round(score, 3), 'heard': heard, 'text': l['text']}
        if score < args.min:
            low.append((score, l['key'], l['text'], heard))
        if i % 20 == 0:
            print(f'  listened to {i} of {len(lines)} …', flush=True)
    if args.json:
        Path(args.json).write_text(json.dumps(scores, indent=1) + '\n')
    exact = sum(1 for s in scores.values() if s['score'] >= 0.999)
    print(f'{len(scores)} clips heard: {exact} word for word, {len(scores) - exact - len([x for x in low if x[3] != "(no clip)"])} close, {len(low)} to listen to (below {args.min})')
    for score, key, text, heard in sorted(low):
        print(f'  {key}  {score:.2f}\n     should say: {text}\n     heard:      {heard}')
    raise SystemExit(1 if low else 0)


if __name__ == '__main__':
    main()
