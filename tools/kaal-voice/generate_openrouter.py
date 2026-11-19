#!/usr/bin/env python3
"""Records every line Kaal says in ONE ElevenLabs voice, through OpenRouter's speech API (chosen 2026-11-19: the
"Raju" voice, Indian English, at a calm pace). Recorded once; the game plays the clips and never calls any service.

    1. cd app && npm run voice:lines                                   # tools/kaal-voice/lines.json (the 114 lines)
    2. python3 tools/kaal-voice/generate_openrouter.py --force         # every line → content/voice/<key>.mp3 + manifest.json
       python3 tools/kaal-voice/generate_openrouter.py --only 47bf034c --out /tmp/try   # one line, somewhere else
    3. ../kaal-voice/venv/bin/python tools/kaal-voice/check.py         # speech-to-text: every line heard word for word?
    4. cd app && npm run sync-content (or any build)

The OpenRouter key is read from ../kaal-voice/openrouter.key (one line, outside the repo) or $OPENROUTER_API_KEY;
it is never written anywhere else. Python standard library only. Lines already recorded IN THIS VOICE are skipped
(--force records all again); a folder holding another voice's clips is refused unless --force, so voices never mix.

Pace: `--speed` (0.7 to 1.2 on Eleven Multilingual v2). 0.75 measured 12.1 characters a second (~120 words a minute)
with every word heard. Cost: billed per character by OpenRouter (the 114 lines are about 6,100 characters).
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
KEY_FILE = ROOT.parent / 'kaal-voice' / 'openrouter.key'
API = 'https://openrouter.ai/api/v1/audio/speech'
MODEL = 'elevenlabs/eleven-multilingual-v2'
RAJU = 'pzxut4zZz4GImZNlqQ3H'


def api_key():
    k = os.environ.get('OPENROUTER_API_KEY') or (KEY_FILE.read_text().strip().splitlines()[0].strip() if KEY_FILE.exists() else '')
    if not k.startswith('sk-or-'):
        sys.exit(f'No OpenRouter key: put it in {KEY_FILE} (one line) or set OPENROUTER_API_KEY')
    return k


def speak(key, text, voice, speed, seed):
    body = json.dumps({'model': MODEL, 'input': text, 'voice': voice, 'response_format': 'mp3', 'speed': speed,
                       'provider': {'options': {'elevenlabs': {'seed': seed}}}}).encode()
    for attempt in range(5):
        req = urllib.request.Request(API, data=body, method='POST',
                                     headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                audio = r.read()
                if audio[:3] == b'ID3' or audio[:2] in (b'\xff\xfb', b'\xff\xf3', b'\xff\xf2'):
                    return audio
                raise RuntimeError(f'not an mp3: {audio[:200]!r}')
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode('utf-8', 'replace')
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(3 * (attempt + 1))
                continue
            raise RuntimeError(f'HTTP {e.code}: {msg}') from None
        except (urllib.error.URLError, TimeoutError):
            if attempt < 4:
                time.sleep(3 * (attempt + 1))
                continue
            raise
    raise RuntimeError('no answer')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--lines', default=str(HERE / 'lines.json'))
    ap.add_argument('--out', default=str(ROOT / 'content' / 'voice'))
    ap.add_argument('--voice', default=RAJU, help='ElevenLabs voice id (default: Raju)')
    ap.add_argument('--name', default='Raju (ElevenLabs, via OpenRouter)', help='written into the manifest')
    ap.add_argument('--speed', type=float, default=0.75)
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--force', action='store_true', help='record every line again')
    ap.add_argument('--only', action='append', default=[], help='record just this key (repeatable)')
    ap.add_argument('--respell', action='append', default=[], help='FROM=TO in the spoken text, e.g. Kahl=Kaal (repeatable)')
    args = ap.parse_args()

    key = api_key()
    lines = json.loads(Path(args.lines).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    mf = out / 'manifest.json'
    manifest = json.loads(mf.read_text()) if mf.exists() else {'clips': {}}
    if manifest.get('clips') and manifest.get('model') != MODEL and not (args.force or args.only):
        sys.exit(f'{out} holds clips of another voice ({manifest.get("model")}); use --force to replace them all')
    if args.force:
        for f in out.glob('*.mp3'):
            f.unlink()
        manifest = {'clips': {}}
    swaps = [s.split('=', 1) for s in args.respell]

    todo = [l for l in lines if (not args.only or l['key'] in args.only)
            and (args.force or l['key'] in args.only or not (out / manifest['clips'].get(l['key'], '-')).exists())]
    print(f'{len(lines)} lines, {len(todo)} to record in {args.name} at speed {args.speed}')
    started, chars = time.time(), 0
    for i, l in enumerate(todo, 1):
        text = l['text']
        for a, b in swaps:
            text = text.replace(a, b)
        audio = speak(key, text, args.voice, args.speed, args.seed)
        name = f"{l['key']}.mp3"
        (out / name).write_bytes(audio)
        chars += len(text)
        manifest['clips'][l['key']] = name
        manifest.update(voice=args.name, model=MODEL, voice_id=args.voice, speed=args.speed, lines=len(lines), rates={})
        mf.write_text(json.dumps(manifest, indent=1, sort_keys=True) + '\n')     # after every line: safe to stop and resume
        print(f'[{i}/{len(todo)}] {l["mood"]:8} {text[:70]}', flush=True)
    wanted = {l['key'] for l in lines}
    for k in [k for k in manifest['clips'] if k not in wanted]:
        (out / manifest['clips'].pop(k)).unlink(missing_ok=True)
    manifest.update(voice=args.name, model=MODEL, voice_id=args.voice, speed=args.speed, lines=len(lines), rates={})
    mf.write_text(json.dumps(manifest, indent=1, sort_keys=True) + '\n')
    have = sum(1 for l in lines if (out / manifest['clips'].get(l['key'], '-')).exists())
    print(f'{have} of {len(lines)} lines recorded in {out} · {chars} characters sent · {(time.time() - started) / 60:.1f} min')


if __name__ == '__main__':
    main()
