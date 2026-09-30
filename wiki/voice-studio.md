# voice-studio

Local voice engine: TTS in 23 languages (good Hebrew), voice cloning from a 10-30 s sample, designing new synthetic
voices, speech-to-speech conversion, 20 DSP voice effects, AI-watermark detection. CLI (`voice.py`) + Hebrew Gradio UI
(`app.py`). Paired skill: `voice-studio` (canonical in `claude-skills/voice-studio/`, installed in `.agents/skills`,
symlinked into `.claude/skills`). Written from scratch in this repo on top of open-source models.

- **Engine:** Chatterbox (Resemble AI, MIT) — `ChatterboxMultilingualTTS` with `t3_model="v3"`, `ChatterboxVC` for
  conversion. Hebrew niqqud via `dicta-onnx` + `models/dicta-1.0.int8.onnx`.
- **Run:** Linux/macOS `cd voice-studio && ./setup.sh && .venv/bin/python voice.py speak "שלום" -o hi.mp3`;
  Windows: the one-line `install-windows.ps1` installer (see `voice-studio/README.md`), then the desktop shortcut.
- **Voices:** `presets/` (synthetic, committed) and `voices/` (clones, git-ignored — never commit a real person's voice).

## How it fits together

- `voice.py` is both CLI and library: `synthesize()`, `add_voice()`, `design_voice()`, `convert()`, `apply_effects()`,
  `watermark_score()`, `list_voices()`. `load_tts()`/`load_vc()` are `lru_cache`d so the UI keeps models loaded;
  `synthesize(voice=None)` restores the built-in conditionals saved at load time.
- Voice lookup order: `voices/<name>` → `presets/<name>` → a raw file path (raw paths need `--consent`).
- Long text is split into ≤220-char sentence chunks (the model caps at 1000 speech tokens ≈ 40 s) and joined with
  0.25 s gaps.
- `design-voice` = speak a fixed neutral passage with a base voice → librosa pitch-shift (+ optional effects) → save as
  the reference. Cloning from that reference makes the model re-synthesize the shifted timbre *naturally* (no
  chipmunk artifacts), which is how the four presets were made.
- Audio I/O goes through ffmpeg (system one, else the `imageio-ffmpeg` bundled binary), so any input format works
  (WhatsApp .ogg/opus, iPhone .m4a, mp3, video files).

## Notes

### 2026-09-30 — built and verified
- **Why Chatterbox:** open, runs on CPU, supports Hebrew (`he`) in the multilingual model, zero-shot cloning + VC,
  and embeds a Perth watermark by default. XTTS-v2 has no Hebrew; ElevenLabs needs a paid key (the
  `threejs-audio-generator` skill already covers ElevenLabs if a key ever shows up).
- **PyPI `chatterbox-tts==0.1.7` has no Multilingual V3** (`t3_model` kwarg missing) → install from git commit
  `5de7a54` with `--no-deps`; deps come from `requirements.txt`.
- **Perth watermark silently disabled** unless `setuptools<81` is installed: `perth.perth_net` imports
  `pkg_resources`, the ImportError is swallowed and `PerthImplicitWatermarker` becomes `None` → Chatterbox crashes
  with `'NoneType' object is not callable`. Pinned in requirements.
- **Hebrew niqqud was silently skipped upstream:** Chatterbox calls `Dicta()` without the model path it requires.
  `enable_hebrew_niqqud()` injects `Dicta(models/dicta-1.0.int8.onnx)` into
  `chatterbox.models.tokenizers.tokenizer._dicta`. The ONNX file isn't reachable from GitHub releases through the
  sandbox proxy; it's downloaded from the HF Space `thewh1teagle/add-diacritics-in-hebrew`.
- **Measured (4-core CPU, no GPU):** model load ≈37 s; generation ≈10× slower than real time. First run downloads
  ≈3 GB to `~/.cache/huggingface`.
- **QA method** (no ears in the sandbox): transcribe with faster-whisper `ivrit-ai/whisper-large-v3-turbo-ct2`,
  median F0 with `librosa.pyin`, speaker similarity with Chatterbox's own `VoiceEncoder` (cosine):
  - Hebrew TTS, built-in voice → exact transcript.
  - Clone of a male LibriSpeech reader (English sample → Hebrew speech): similarity to target 0.92 vs 0.74 to the
    default voice; F0 140 Hz (target 116, default 162–186); exact transcript.
  - `convert` (default-voice Hebrew → that reader): similarity 0.86 to target vs 0.81 to source — VC keeps more of the
    source than `speak -v` does. Exact transcript.
  - Presets: `narrator_deep` 117 Hz, default 186 Hz, `bright_young` 257 Hz, all exact transcripts.
  - All effects keep speech intelligible (robot/whisper/chipmunk/deep/radio transcribed correctly).
  - A 230-char Hebrew story in one chunk: 2 words off ("היום אני שר" came out wrong) — Hebrew homographs get the
    wrong niqqud sometimes. Chunk size lowered to 200 chars; for a misread word, write it with niqqud by hand.
  - `detect`: generated mp3 → 1.00, the real LibriSpeech recording → 0.00 (watermark survives mp3).
  - `app.py` driven headless with `gradio_client`: speak, effects, clone (+ dropdown refresh), consent/filename
    validation; screenshot in Playwright Chromium confirmed the RTL layout.
  - `samples/voice-tour.mp3` (34 s, 9 lines across all voices + robot/radio effects + English): 8/9 lines exact on the
    first take; `narrator_deep` slurred "קריין" with seed 7 and was re-taken with seed 11 (exact). Takeaway: when a
    word comes out wrong, re-roll the seed before rewriting the text.
- **Consent guard:** cloning requires `--consent self|permission|synthetic` (stored in `voice.json`); the skill tells
  Claude to refuse cloning public figures / non-consenting people / deception and never to strip the watermark.
- **Open:** no GPU here, so long narration is slow (≈10 min per minute of audio). `app.py` uses Gradio 6.8, where
  `css` goes to `launch()`, not `Blocks()`. Microphone recording in the UI wasn't tested (no mic in the sandbox).

### 2026-09-30 — Windows install (the user's machine is Windows, PowerShell 5.1)
- First attempt failed on the user's PC: they pasted the Linux commands (`cd voice-studio && ./setup.sh`) into Windows
  PowerShell 5.1 — `&&` doesn't exist there, `.venv/bin/python` is a Linux path, and the repo wasn't on their PC at all.
- Fix: `install-windows.ps1` (run via `irm <raw url> | iex`) downloads the files listed in `files.txt` from
  raw.githubusercontent into `%USERPROFILE%\voice-studio`, runs `setup.ps1` in a child `powershell -ExecutionPolicy
  Bypass` (a `.ps1` *file* would be blocked by the default policy; `iex` of a string isn't), adds a desktop shortcut to
  `start-ui.bat`, and starts it. No Python or git needed: `setup.ps1` downloads a pinned `uv` (0.12.21) into `tools\`
  and `uv venv --python 3.11` fetches Python itself. `.bat` files are rewritten to CRLF after download.
- Chatterbox is now a **vendored wheel** (`vendor/`, 107 KB, built with `uv build` from commit `5de7a54`) instead of
  `git+https://...` — removes the git dependency on Windows. `setup.sh` uses it too.
- Windows wheel availability checked with `uv pip compile --python-platform x86_64-pc-windows-msvc --only-binary
  :all:`: fine on Python 3.11/3.12; 3.13 fails (numpy<2). CUDA: `download.pytorch.org/whl/cu124` has torch/torchaudio
  2.6.0 win_amd64 for cp311/cp312.
- Tested here with PowerShell 7.4 on Linux (the scripts branch on `$env:OS`): parse check, PSScriptAnalyzer
  compatibility rules for Windows PowerShell 5.1 (0 findings), full `setup.ps1` run from a clean folder with uv hidden
  from PATH, then a Hebrew `speak` from that environment (exact transcript). A first run hit a uv 30 s network timeout on
  a big wheel → `UV_HTTP_TIMEOUT=300` plus one automatic retry.
- **Not tested on real Windows:** `Expand-Archive` of the uv zip, `.venv\Scripts\` paths, the desktop shortcut COM
  call, `start-ui.bat`, the CUDA branch. Keep `.ps1`/`.bat` files ASCII-only (PS 5.1 reads BOM-less files as ANSI).
- Second report from the user was the log of a Doom port (dsda-doom playing Freedoom's demo), not installer output:
  the line had been pasted into the game's log console, which ignores input. Added `install-windows.bat` (double-click,
  runs the same `irm | iex` line; CRLF, ASCII) and `.gitattributes` (`*.bat eol=crlf`) so non-technical use doesn't
  depend on finding the right terminal. The .bat's PowerShell command was run verbatim against the live URL here.
- The user's desktop has a **"VoiceStudio"** shortcut (custom pink-waveform icon) from an unrelated GitHub program another
  Claude session installed. It is not this project. Because the first installer wrote into `%USERPROFILE%\voice-studio`
  unconditionally (overwriting same-named files like `app.py`/`README.md`), `install-windows.ps1` now:
  installs to `%USERPROFILE%\claude-voice-studio`; writes a `.claude-voice-studio` marker and refuses (changing nothing)
  to write into an existing non-empty folder without that marker; reuses an old `%USERPROFILE%\voice-studio` only if it
  is recognisably ours (`voice.py` + `presets/narrator_deep/voice.json`); names the shortcut **"Claude Voice Studio"**
  with the `SndVol.exe` speaker icon and deletes the old "Voice Studio.lnk" only if it points into our folder.
  Tested with a fake `$HOME` under pwsh: foreign folder refused and untouched; someone else's `voice-studio` left alone
  while installing into `claude-voice-studio`; a legacy install updated in place with `voices/` kept.
- Third report: on the user's PC the download died at the first **binary** file (`vendor/*.whl`) with an empty
  WebException, after 8 text files downloaded fine. Raw GitHub serves it normally from here (200,
  application/octet-stream), so something on their side blocks binary downloads — they have **Avast One** (Web Shield
  / HTTPS scanning) and possibly a filtered ISP. Everything after that step is binary too (uv zip, Python, ~120 wheels,
  3 GB of models). Changes:
  - `install-windows.ps1` first probes every host it needs with a 2 KB range read (HttpWebRequest.AddRange) and prints
    OK/BLOCKED per host; if a required one is blocked it stops **before writing anything** and lists the sites to
    allow. Simulated here by pointing URLs at `.invalid` hosts.
  - Dead end: a jsDelivr mirror. It served some files and 403'd others (`.bat`, `voice.py`) with "Package size
    exceeded the configured limit of 50 MB" — this repo is too big for jsDelivr's gh endpoint. It also caches the
    branch→commit mapping for hours (a path purge doesn't refresh it). Removed.
  - Instead, since the user's text downloads worked and only the binary failed: every `.whl`/`.wav` in `files.txt` has
    a base64 text copy `<file>.b64` in the repo; `Save-RepoFile` falls back to it and decodes. Regenerate the copies
    when a binary changes (command in `files.txt`). `start-ui.bat`/`voice.bat` are generated by `setup.ps1` (no longer
    in git) — keeps the installer's file list small.
  - `UV_SYSTEM_CERTS=1` in setup (uv 0.12.21 otherwise uses its bundled roots and fails behind HTTPS inspection) and
    `truststore.inject_into_ssl()` in `voice.py` for Hugging Face downloads. The sandbox proxy doesn't inspect
    huggingface.co, so the inspection failure itself couldn't be reproduced here.
