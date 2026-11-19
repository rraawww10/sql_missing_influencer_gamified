# Kaal's recorded voice

Kaal can speak in one custom voice, the same on every device: every line he says is recorded once with
[Chatterbox](https://github.com/resemble-ai/chatterbox) (open source, MIT, runs on a normal computer) from a short
sample of a real voice, and shipped as small audio clips. Without the clips the game uses the browser's own voice.

## What gets recorded
`cd app && npm run voice:lines` writes `lines.json`: every line Kaal can say (his reactions in `app/src/ui/kaal/lines.ts`,
the episode teasers, and the lines the screens build, `SAY`). 114 lines, about 6,000 characters.
- A line with the student's name is recorded without it ("Well done, {you}!" → "Well done!"); the name still shows on screen.
- A line whose text carries a number ("Chapter 2 of 3 closed …") is spoken through one fixed recording.
- Kaal's chat answers are written on the spot, so they are **not spoken** when a voice pack is installed
  (he never changes voice). Put `"fallback": "browser"` in `manifest.json` to have the browser read them instead.

## Make the voice pack
1. **Choose the voice.** Without a sample, Kaal gets the voice that ships with Chatterbox (a man's voice; this is what
   is installed now). To clone a real voice instead you need a sample: 10 to 30 seconds, one speaker, a quiet room,
   no music, WAV or MP3, and only a voice whose owner agreed to it (`kaal-voice/record.sh`, next to this repo,
   records one from the computer's microphone).
2. **Install once** (about 2 GB, plus about 3.5 GB of model files on the first run):
   ```
   python3 -m venv venv && venv/bin/pip install chatterbox-tts --extra-index-url https://download.pytorch.org/whl/cpu
   venv/bin/pip install "setuptools<81"      # Chatterbox's watermarker needs pkg_resources
   ```
3. **Record:**
   ```
   venv/bin/python tools/kaal-voice/generate.py --verify                        # the built-in voice
   venv/bin/python tools/kaal-voice/generate.py --verify --voice my-voice.wav   # or a cloned one
   ```
   On a CPU each short line takes about 12 seconds (the whole set: 20 to 40 minutes). Clips land in `content/voice/`
   (`<key>.mp3` + `manifest.json`). Lines already recorded are skipped; `--force` records everything again,
   `--only <key>` one line, `--limit 3` just the first three (to listen before recording the rest).
   The moods (`MOODS` in `generate.py`) set how lively each kind of line is.
4. `cd app && npm run sync-content` (every build does this): the game finds `content/voice/manifest.json` and plays the clips.

## Checking the takes without listening to all of them
A voice model sometimes slurs or drops a word (the first run garbled "Perfect!" and said "Kaal" as "Kyle").
- `--verify` transcribes every take with a speech-to-text model (Whisper, on the CPU) and compares it with the line:
  up to 4 takes, the best-heard one is kept, and an existing clip is only replaced by a better one.
- `venv/bin/python tools/kaal-voice/check.py` does the same for a finished pack and lists what to listen to.
- Words the voice gets wrong are respelled for the recording only, in `spokenText()` (`app/src/ui/voiceKey.ts`):
  "Kaal" → "Kahl", "SQL" → "S Q L", "40,000" → "forty thousand".

## One steady pace
The built-in voice speaks briskly (about 17.5 characters a second, some lines 22), and Chatterbox's `cfg_weight` does not
slow it down reliably (0.05 to 0.3 still gave 14 to 18 on the same lines). The game no longer slows clips while playing
(changing the speed in the browser made speech warble; since 2026-11-19 `rates` are ignored). Instead:

    ../kaal-voice/venv/bin/python tools/kaal-voice/pace.py              # aim at 14.5 characters a second
    ../kaal-voice/venv/bin/python tools/kaal-voice/pace.py --restore    # the clips exactly as recorded

`pace.py` lengthens only the pauses between phrases and sentences (110 ms or longer); the words are not touched. The
clips as recorded are kept in `../kaal-voice/as-recorded/<model>/` and every run starts from them. Result on the
Chatterbox pack: median 17.6 → 14.7 characters a second; `check.py` 111 of 114 word for word, 3 close, none below 0.85.
Lines with no pause in them (short ones) stay as recorded. Run it again after recording new lines.
`generate.py --cfg <weight> --target <ch/s>` are there for experiments.

## After changing a line
Edit the line, run `npm run voice:lines`, then `generate.py` again: only the new or reworded lines are recorded, and
clips of lines that no longer exist are removed. `app/src/ui/kaal/voiceLines.test.ts` fails when an installed voice pack
is missing a line, so a silent line cannot slip through. Changing only punctuation or capitals keeps the old clip.

## Kaal's Indian voice (Indic Parler-TTS)
Students found the Chatterbox voice too fast and too American. `generate_parler.py` records the same lines with
[Indic Parler-TTS](https://huggingface.co/ai4bharat/indic-parler-tts) by AI4Bharat (IIT Madras): open source,
**Apache-2.0**, runs on this computer, and trained on Indian speakers, with named Indian English voices. Its voice, pace and
recording quality are set by a short text description, so every clip is recorded at an easy pace (about 13 characters
a second) and played as recorded: the manifest says `"model": "indic-parler-tts"` and `"rates": {}`.
- **Voice:** one named speaker for every line (`SPEAKER` in `generate_parler.py`). One fixed description (clear and warm
  male voice, Indian English accent, slightly slow, very clear close-up audio, no background noise); only the feeling
  changes with the mood (`FEELING`: cheerful for cheer/happy, gentle and a little sad for oops, calm for think/whisper,
  friendly for the rest).
- **Checks:** with `--verify` up to 4 takes per line (2 at a time), each transcribed by Whisper; the best-heard take
  is kept (every take heard at 0.95 or better counts the same), then the one without glitches (a pause over 1.1 s,
  clipping), then the pace closest to 13 characters a second.
  A round that runs too fast or too slow asks for a slower or quicker delivery in the next one. Lines over 140
  characters are said sentence by sentence and joined with a short pause.
- **Spelling:** `RESPELL` in `generate_parler.py` respells a word for this voice only (the screen text and `lines.json`
  stay as they are).

Install once, next to the Chatterbox venv (about 1.5 GB, plus 3.8 GB of model files on the first run):
```
python3 -m venv venv-parler
venv-parler/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
venv-parler/bin/pip install git+https://github.com/huggingface/parler-tts.git librosa soundfile "sentencepiece==0.2.0"
```
(`sentencepiece` 0.2.0: newer versions need protobuf 5, which the model's audio codec package does not allow.)
The model is free, but Hugging Face asks for a one-time OK: log in at huggingface.co, open the model page, accept its
conditions, create a read token (Settings, Access Tokens) and run `venv-parler/bin/hf auth login` with it.

Record (from the repo folder; the Chatterbox pack must be moved away first, the script refuses to mix two voices):
```
mv content/voice ../kaal-voice/backup-chatterbox
../kaal-voice/venv-parler/bin/python tools/kaal-voice/generate_parler.py --verify
../kaal-voice/venv/bin/python tools/kaal-voice/check.py           # listen-to list
```
On this CPU one second of speech takes about 5 seconds to make (12 threads; more are no faster), so the whole set
takes about an hour. `--only`, `--limit`, `--force`, `--seed` work as in `generate.py`; `--verbose` prints every take.
`../kaal-voice/try_speakers.py` (outside the repo) compares speakers and spellings of the name on a few lines.

**Back to Chatterbox:** `rm -r content/voice && cp -r ../kaal-voice/backup-chatterbox content/voice`. That pack was
recorded fast and relies on `rates` to be played slower; if the game no longer applies `rates`, record it again with
`generate.py` instead.

## Good to know
- Every Chatterbox clip carries Chatterbox's inaudible "AI generated" watermark (Indic Parler-TTS adds none).
- To go back to the browser voice, delete `content/voice/`.
- The per-site `build:deploy` build does not copy the voice pack; `npm run build`, `build:s3` and `local-test` do.
