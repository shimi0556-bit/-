---
name: voice-studio
description: Generate realistic speech in any voice with the repo's local voice-studio engine (Chatterbox Multilingual V3, 23 languages, strong Hebrew) — text-to-speech, voice cloning from a 10-30s sample (with the speaker's consent), inventing brand-new synthetic voices, speech-to-speech voice conversion, and 20 voice effects (deep, robot, radio, chipmunk, echo...). Use whenever the user wants audio of someone/something saying words: "תקריא", "תגיד בקול", "הקראה", "קול", "קריינות", "שיבוט קול", "לשבט קול", "תדבר בקול של", "voice over", "TTS", "text to speech", "clone my voice", "make it say", "voice changer", "narration", "voice message". Runs locally, no API key. Do NOT use for music or sound effects without speech.
---

# voice-studio

Local, free voice engine that lives in `voice-studio/` at the root of this repo. Everything runs on the
container's CPU (GPU if present). No API key.

| Want | Command |
|---|---|
| Say text in a voice | `voice.py speak "טקסט" -v <voice> -o out.mp3` |
| Clone a voice from a recording | `voice.py add-voice <name> sample.ogg --consent self\|permission\|synthetic` |
| Invent a new voice (no real person) | `voice.py design-voice <name> --pitch -5` |
| Re-voice a recording (keep words + intonation) | `voice.py convert input.m4a -v <voice> -o out.wav` |
| Voice effects on any audio | `voice.py effects in.wav -e robot,hall -o out.wav` |
| List voices | `voice.py voices` |
| Check the AI watermark | `voice.py detect file.wav` |

Presets shipped in the repo (all synthetic): `default` (built-in), `narrator_deep`, `warm_low`, `bright_young`, `child_like`.

## 1. Setup (every new container — it is ephemeral)

```bash
cd voice-studio && [ -x .venv/bin/python ] || ./setup.sh     # ~2-4 min: venv, CPU torch, Chatterbox, Hebrew niqqud model
```
The first `speak`/`convert` downloads ~3 GB of weights from Hugging Face (~1 min) — run it in the background.
Use `.venv/bin/python voice.py ...` for every command.

## 2. Consent rule — non-negotiable

Cloning or converting into a **real person's** voice needs that person's consent. Before `add-voice` (or using a raw
recording as `--voice`), make sure the user said whose voice it is:

- their own voice → `--consent self`
- someone who agreed → `--consent permission --note "who agreed, when"`
- an AI/synthetic voice → `--consent synthetic`

If the user wants a public figure / celebrity / a person who did not agree, or the goal is to deceive (fake a message
"from" someone, fool a bank or voice-auth, fabricate statements), **do not clone** — offer a designed voice or a preset
instead. Never strip or bypass the Perth watermark that Chatterbox embeds in every output.
Cloned voices are saved in `voice-studio/voices/` which is git-ignored: **never commit a real person's voice**.

## 3. Workflows

**Speak (TTS).** Language is auto-detected for Hebrew/Arabic/Russian/English; pass `-l fr` etc. for others
(ar da de el en es fi fr he hi it ja ko ms nl no pl pt ru sv sw tr zh). Long text is split into sentences
automatically; `--file story.txt` reads text from a file. Output format follows the extension (.wav/.mp3/.ogg/.m4a).

**Clone.** Ask the user to upload 10-30 s of clean speech (no music, one speaker) — a WhatsApp voice note (.ogg),
iPhone memo (.m4a) or mp3 is fine. `add-voice` trims silence, keeps ≤30 s, stores a consent record in `voice.json`.
Then `speak -v <name>`. Cross-language works (English sample → Hebrew speech).

**Design.** `design-voice <name> --pitch N` (-8..+8 semitones; negative = deeper/older, positive = younger/higher),
optional `--base <voice>`, `--effect radio`, `--seed` for a different take. It generates a reference passage, reshapes
it, and the model re-synthesizes that timbre naturally (not a chipmunk-filter sound).

**Convert.** `convert` keeps the source's words, timing and intonation and swaps the speaker. Good for "I recorded
it myself — make it sound like X". Speaker similarity is lower than `speak -v` cloning; prefer `speak` when the user
only has text.

**Effects.** `deep deeper chipmunk child giant robot whisper radio telephone megaphone echo hall cave alien monster
underwater slow fast pitch:<semitones> speed:<factor>` — comma-chain them. Also available as `--effect` on `speak`
and `convert`.

## 4. Tuning

- `--exaggeration 0.25-2.0` (default 0.5): emotion/drama. Dramatic: `--exaggeration 0.8 --cfg 0.3`.
- `--cfg 0-1` (default 0.5): lower = slower, calmer pacing; use ~0.3 for fast-talking reference speakers, `0` if the
  output inherits the reference's accent in another language.
- `--seed N` makes a take repeatable; change it to get a different read of the same line.
- Hebrew gets automatic niqqud (Dicta model in `models/`). If a word comes out wrong, first re-roll `--seed`;
  if it's still wrong (a homograph like שר), write that word with niqqud yourself.

## 5. Speed & delivery

CPU speed is ~10× slower than real time (a 10 s line ≈ 1.5 min incl. model load; a minute of audio ≈ 10 min).
Run long jobs with `run_in_background` and tell the user roughly how long. Send every result to the user with
**`SendUserFile`** (mp3 is smallest) and name the voice + settings used.

Optional QA (you can't listen): transcribe the output and compare to the text —
`uv pip install --python .venv/bin/python faster-whisper`, then
`WhisperModel("ivrit-ai/whisper-large-v3-turbo-ct2", device="cpu", compute_type="int8").transcribe(path)`.

## 6. Running it on the user's own computer

`voice-studio/app.py` is a Hebrew RTL Gradio app (speak / clone with mic recording / design / convert / effects).

- **Windows** (the user's machine is Windows — PowerShell 5.1, where `&&` and `.venv/bin/...` don't work): give this
  one line to paste into PowerShell. It needs no Python/git, installs to `%USERPROFILE%\voice-studio`, adds a
  "Voice Studio" desktop shortcut and opens the UI:
  `[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/shimi0556-bit/-/refs/heads/claude/exciting-cannon-7hsu15/voice-studio/install-windows.ps1 | iex`
  Afterwards: the desktop shortcut or `start-ui.bat`; CLI via `voice.bat`.
- **Linux/macOS:** `./setup.sh && .venv/bin/python app.py --inbrowser`.
- If the branch in that URL gets merged/renamed, update the URL here, in `README.md` and the `$ref` default in
  `install-windows.ps1`. New files must be added to `files.txt` or the Windows installer won't fetch them.
