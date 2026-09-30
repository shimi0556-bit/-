# voice-studio

Local voice engine: TTS in 23 languages (good Hebrew), voice cloning from a 10-30 s sample, designing new synthetic
voices, speech-to-speech conversion, 20 DSP voice effects, AI-watermark detection. CLI (`voice.py`) + Hebrew Gradio UI
(`app.py`). Paired skill: `voice-studio` (canonical in `claude-skills/voice-studio/`, installed in `.agents/skills`,
symlinked into `.claude/skills`). Written from scratch in this repo on top of open-source models.

- **Engine:** Chatterbox (Resemble AI, MIT) — `ChatterboxMultilingualTTS` with `t3_model="v3"`, `ChatterboxVC` for
  conversion. Hebrew niqqud via `dicta-onnx` + `models/dicta-1.0.int8.onnx`.
- **Run:** `cd voice-studio && ./setup.sh && .venv/bin/python voice.py speak "שלום" -o hi.mp3`
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
