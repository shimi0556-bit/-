# voice-studio — סטודיו הקולות

Local voice generation: text-to-speech in 23 languages (strong Hebrew), **voice cloning** from a 10-30 s sample,
**designing new synthetic voices**, **speech-to-speech voice conversion**, and 20 **voice effects**. Free, offline after
the first model download, no API key. CPU works (≈10× slower than real time); a GPU is used automatically.

Engine: [Chatterbox](https://github.com/resemble-ai/chatterbox) by Resemble AI (MIT) — Multilingual V3 for TTS/cloning,
Chatterbox VC for conversion — plus [dicta-onnx](https://github.com/thewh1teagle/dicta-onnx) for Hebrew niqqud.
Every output carries Resemble's inaudible **Perth watermark**, so it can be identified as AI-generated (`detect`).

## Setup

**Windows (PowerShell 5.1+), one line.** Nothing needs to be installed first (no Python, no git):

```powershell
[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/shimi0556-bit/-/refs/heads/claude/exciting-cannon-7hsu15/voice-studio/install-windows.ps1 | iex
```

Or download [`install-windows.bat`](install-windows.bat) and double-click it — it runs the same line.
It downloads this folder into `%USERPROFILE%\claude-voice-studio`, the ~3.5 GB of voice models from this repo's
GitHub release `voice-models-v1` (a verified copy of the Hugging Face files — for networks like NetFree that block
huggingface.co; made by `.github/workflows/voice-models-release.yml`; resumable), fetches `uv` into `tools\`, lets uv download Python 3.11,
installs everything (CUDA PyTorch if `nvidia-smi` is found, CPU otherwise), adds a **Claude Voice Studio** desktop
shortcut (speaker icon) and opens the web UI. Re-run it to update; `voices\` and `models\` are kept. It only writes
into a folder it created (marker file `.claude-voice-studio`) and stops if the target holds anything else. Already have the folder (git clone / zip)?
Double-click `setup.bat`, then `start-ui.bat`.

**Linux / macOS:**

```bash
cd voice-studio
./setup.sh                      # venv + torch + Chatterbox + Hebrew niqqud model (~300 MB)
```

The first generation downloads ~3 GB of model weights from Hugging Face into `~/.cache/huggingface` (one time).
Chatterbox comes from `vendor/` — a pure-Python wheel built from commit `5de7a54`, which has Multilingual V3 (the
PyPI release doesn't) — so no git is needed. Needs Python 3.11 or 3.12 (3.13 has no `numpy<2` wheels).

## Use

```bash
PY=.venv/bin/python        # Windows: use voice.bat instead of "$PY voice.py", e.g.  .\voice.bat speak "שלום" -o hi.mp3

$PY voice.py speak "שלום! זה הקול החדש שלי." -o hello.mp3                  # built-in voice
$PY voice.py speak "Welcome to the studio" -v narrator_deep -o hi.wav       # a shipped preset
$PY voice.py speak --file story.txt -v warm_low -o story.mp3                # long text, auto-split

$PY voice.py add-voice me my_voice_note.ogg --consent self                  # clone (10-30 s of clean speech)
$PY voice.py speak "משפט חדש שמעולם לא אמרתי" -v me -o me.mp3

$PY voice.py design-voice old_captain --pitch -6 --effect radio             # invent a voice, no real person
$PY voice.py convert my_recording.m4a -v old_captain -o captain.wav         # same words, other voice
$PY voice.py effects hello.mp3 -e robot,hall -o robot.mp3                   # effects on any audio
$PY voice.py voices                                                         # list voices
$PY voice.py detect captain.wav                                             # AI watermark check

$PY app.py --inbrowser                                                      # Hebrew web UI on :7860
```

Tuning: `--exaggeration` (0.25-2, emotion), `--cfg` (0-1, lower = slower/calmer), `--seed` (repeatable take),
`--effect` (chain on output), `-l` language code (auto for he/ar/ru/en).

Effects: `deep deeper chipmunk child giant robot whisper radio telephone megaphone echo hall cave alien monster
underwater slow fast pitch:<semitones> speed:<factor>`.

## Voices

- `presets/` — synthetic voices committed with the repo (`narrator_deep`, `warm_low`, `bright_young`, `child_like`, `host_male`),
  all made with `design-voice` from the built-in voice.
- `voices/` — your cloned voices. **Git-ignored on purpose**: a real person's voice never goes into the repo.

## Consent

Cloning needs `--consent self|permission|synthetic`, stored in each profile's `voice.json`. Only clone your own voice
or the voice of someone who explicitly agreed. Don't use this to impersonate people, fake messages from them, or get
past voice authentication — and don't remove the watermark.

## Files

| File | What |
|---|---|
| `voice.py` | CLI + library (`synthesize`, `add_voice`, `design_voice`, `convert`, `apply_effects`, ...) |
| `app.py` | Gradio web UI (Hebrew RTL) on top of `voice.py` |
| `setup.sh`, `requirements.txt` | Linux/macOS setup |
| `install-windows.ps1`, `install-windows.bat`, `files.txt` | Windows installer (paste the line, or double-click the .bat) and the list of files it downloads (update it when adding files). It first checks every site it needs and stops with a list if antivirus or an internet filter blocks one. `.whl`/`.wav` files have `.b64` text copies used when binary downloads are blocked |
| `setup.ps1`, `setup.bat` | Windows setup (ASCII-only: PowerShell 5.1). It also writes the `start-ui.bat` (UI) and `voice.bat` (CLI) launchers (generated, not in git) |
| `vendor/` | Chatterbox wheel built from commit `5de7a54` |
| `presets/` | synthetic preset voices |
| `samples/` | demo outputs |
