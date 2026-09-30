#!/usr/bin/env python3
"""voice-studio: local voice generation, voice cloning, voice conversion and voice effects.

Engine: Chatterbox (Resemble AI, MIT) — Multilingual V3 for text-to-speech in 23 languages
including Hebrew, and Chatterbox VC for speech-to-speech conversion. Runs on CPU; uses a GPU
automatically when one is available. Every generated file carries Resemble's inaudible
Perth watermark so it can later be identified as AI-generated (`voice.py detect`).

Commands:
  speak         text -> speech (built-in voice, a preset, or a saved/cloned voice)
  add-voice     clone: save a voice profile from a short recording (requires a consent declaration)
  design-voice  invent a new synthetic voice (deeper, younger, radio, ...) with no real person involved
  voices        list presets and saved voice profiles
  convert       speech -> speech: re-voice an existing recording into a saved voice
  effects       apply voice effects (deep, chipmunk, robot, radio, echo, ...) to any audio file
  detect        check whether an audio file carries the AI watermark

Run `voice.py <command> -h` for options.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import functools
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

try:  # use the OS certificate store, so model downloads work behind antivirus / filtered-internet HTTPS inspection
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

HERE = Path(__file__).resolve().parent
VOICES_DIR = Path(os.environ.get("VOICE_STUDIO_VOICES", HERE / "voices"))  # your voices (git-ignored)
PRESETS_DIR = HERE / "presets"  # synthetic voices shipped with the repo
DICTA_MODEL = HERE / "models" / "dicta-1.0.int8.onnx"
SR = 24000  # Chatterbox output sample rate

LANGS = ("ar da de el en es fi fr he hi it ja ko ms nl no pl pt ru sv sw tr zh").split()
CONSENT_CHOICES = {
    "self": "The voice in the sample is my own.",
    "permission": "The person in the sample gave me explicit permission to clone their voice.",
    "synthetic": "The sample is itself synthetic / AI-generated, not a real person.",
}
EFFECTS_HELP = (
    "deep, deeper, chipmunk, child, giant, robot, whisper, radio, telephone, megaphone, "
    "echo, hall, cave, alien, monster, underwater, slow, fast, pitch:<semitones>, speed:<factor>"
)


class VoiceError(Exception):
    """A user-facing error (bad input, missing consent, unknown voice)."""


# ---------------------------------------------------------------- audio io

def ffmpeg_exe() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def load_audio(path: str | Path, sr: int = SR) -> np.ndarray:
    """Load any audio/video file (wav, mp3, m4a, ogg/opus, webm, mp4, ...) as mono float32 at `sr`."""
    path = str(path)
    cmd = [ffmpeg_exe(), "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    out = subprocess.run(cmd, capture_output=True)
    if out.returncode != 0:
        raise VoiceError(f"Could not read audio file {path}: {out.stderr.decode(errors='ignore').strip()}")
    return np.frombuffer(out.stdout, dtype=np.float32).copy()


def save_audio(path: str | Path, wav: np.ndarray, sr: int = SR) -> Path:
    """Save mono float audio. .wav is written directly; any other extension (.mp3, .ogg, .m4a) goes via ffmpeg."""
    import soundfile as sf

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    wav = np.asarray(wav, dtype=np.float32).reshape(-1)
    peak = float(np.max(np.abs(wav))) if wav.size else 0.0
    if peak > 0.99:
        wav = wav * (0.99 / peak)
    if path.suffix.lower() == ".wav":
        sf.write(str(path), wav, sr, subtype="PCM_16")
        return path
    fd, tmp = tempfile.mkstemp(suffix=".wav")
    os.close(fd)  # write by name after closing (Windows can't reopen an open temp file)
    try:
        sf.write(tmp, wav, sr, subtype="PCM_16")
        cmd = [ffmpeg_exe(), "-v", "error", "-y", "-i", tmp]
        if path.suffix.lower() == ".mp3":
            cmd += ["-b:a", "192k"]
        subprocess.run(cmd + [str(path)], check=True)
    finally:
        os.unlink(tmp)
    return path


def trim_silence(wav: np.ndarray, sr: int = SR, top_db: float = 35.0) -> np.ndarray:
    import librosa

    trimmed, _ = librosa.effects.trim(wav, top_db=top_db)
    pad = int(0.05 * sr)
    return np.pad(trimmed, (pad, pad))


# ---------------------------------------------------------------- models

def device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    return "cpu"


def enable_hebrew_niqqud() -> None:
    """Chatterbox adds Hebrew niqqud with dicta-onnx but calls Dicta() without the model path it
    needs, so it silently skips it. Inject a working instance so Hebrew gets vowels (much better
    pronunciation)."""
    if not DICTA_MODEL.exists():
        print(f"[voice-studio] note: {DICTA_MODEL.name} missing — Hebrew will be read without niqqud. "
              "Run setup.sh to download it.", file=sys.stderr)
        return
    from dicta_onnx import Dicta
    import chatterbox.models.tokenizers.tokenizer as tok

    tok._dicta = Dicta(str(DICTA_MODEL))


@functools.lru_cache(maxsize=1)
def load_tts():
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    enable_hebrew_niqqud()
    model = ChatterboxMultilingualTTS.from_pretrained(device=device(), t3_model="v3")
    load_tts.default_conds = model.conds  # the built-in voice, restored when voice=None
    return model


@functools.lru_cache(maxsize=1)
def load_vc():
    from chatterbox.vc import ChatterboxVC

    return ChatterboxVC.from_pretrained(device())


# ---------------------------------------------------------------- voices

def voice_dir(name: str) -> Path:
    if not re.fullmatch(r"[\w\-\u0590-\u05FF]+", name):
        raise VoiceError(f"Invalid voice name {name!r}: use letters, digits, - or _ only.")
    return VOICES_DIR / name


def resolve_voice(voice: str | None, consent: str | None) -> Path | None:
    """Return the reference wav for `voice`: None = built-in voice, a saved profile name, or a raw audio path."""
    if not voice or voice == "default":
        return None
    for root in (VOICES_DIR, PRESETS_DIR):
        saved = root / voice / "reference.wav"
        if saved.exists():
            return saved
    if Path(voice).exists():
        if consent not in CONSENT_CHOICES:
            raise VoiceError(
                "Using a raw recording as a voice requires --consent self|permission|synthetic "
                "(or save it first with `add-voice`)."
            )
        return Path(voice)
    known = ", ".join(sorted(p.name for p in _profiles())) or "none"
    raise VoiceError(f"Unknown voice {voice!r}. Saved voices: {known}")


def _profiles() -> list[Path]:
    roots = dict.fromkeys(r.resolve() for r in (VOICES_DIR, PRESETS_DIR))
    return [p for root in roots for p in sorted(root.glob("*")) if (p / "reference.wav").exists()]


def split_text(text: str, max_chars: int = 200) -> list[str]:
    """Split text into chunks of whole sentences, each <= max_chars (the model caps at ~40 s per call and is
    most stable on short inputs). A sentence longer than that is wrapped at a comma, else at a space."""
    text = re.sub(r"[ \t]+", " ", text.strip())
    sentences = [s.strip() for s in re.split(r"(?<=[.!?\u2026\u05C3:;])\s+|\n+", text) if s.strip()]
    pieces: list[str] = []
    for sentence in sentences:
        while len(sentence) > max_chars:
            cut = sentence.rfind(",", max_chars // 2, max_chars)
            if cut < 0:
                cut = sentence.rfind(" ", max_chars // 3, max_chars)
            if cut < 0:
                cut = max_chars - 1
            pieces.append(sentence[: cut + 1].strip())
            sentence = sentence[cut + 1 :].strip()
        if sentence:
            pieces.append(sentence)
    chunks: list[str] = []
    for piece in pieces:  # pack consecutive sentences together while they fit
        if chunks and len(chunks[-1]) + 1 + len(piece) <= max_chars:
            chunks[-1] += " " + piece
        else:
            chunks.append(piece)
    return chunks


def guess_lang(text: str) -> str:
    if re.search(r"[\u0590-\u05FF]", text):
        return "he"
    if re.search(r"[\u0600-\u06FF]", text):
        return "ar"
    if re.search(r"[\u0400-\u04FF]", text):
        return "ru"
    return "en"


# ---------------------------------------------------------------- effects

def _pitch(wav, sr, steps):
    import librosa

    return librosa.effects.pitch_shift(wav, sr=sr, n_steps=float(steps))


def _speed(wav, factor):
    import librosa

    return librosa.effects.time_stretch(wav, rate=float(factor))


def _stft_phase(wav, mode, n_fft=1024, hop=256):
    import librosa

    spec = librosa.stft(wav, n_fft=n_fft, hop_length=hop)
    mag = np.abs(spec)
    if mode == "robot":  # zero phase -> buzzy monotone at sr/hop
        phase = np.ones_like(spec)
    else:  # whisper: random phase removes the pitch
        phase = np.exp(1j * np.random.default_rng(0).uniform(0, 2 * np.pi, spec.shape))
    return librosa.istft(mag * phase, hop_length=hop, length=len(wav))


def _band(wav, sr, lo, hi, order=4):
    from scipy.signal import butter, sosfilt

    sos = butter(order, [lo, hi], btype="band", fs=sr, output="sos")
    return sosfilt(sos, wav)


def _lowpass(wav, sr, hi, order=6):
    from scipy.signal import butter, sosfilt

    return sosfilt(butter(order, hi, btype="low", fs=sr, output="sos"), wav)


def _echo(wav, sr, delay=0.28, feedback=0.45, repeats=5):
    d = int(delay * sr)
    out = np.concatenate([wav, np.zeros(d * repeats, dtype=wav.dtype)])
    for i in range(1, repeats + 1):
        out[d * i : d * i + len(wav)] += wav * (feedback**i)
    return out


def _reverb(wav, sr, seconds=1.6, wet=0.35):
    from scipy.signal import fftconvolve

    n = int(seconds * sr)
    rng = np.random.default_rng(1)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir[0] = 1.0
    ir /= np.sqrt(np.sum(ir**2))
    tail = fftconvolve(wav, ir)  # len(wav) + n - 1 samples
    dry = np.concatenate([wav, np.zeros(n - 1)])
    return (1 - wet) * dry + wet * tail


def _ring(wav, sr, freq):
    t = np.arange(len(wav)) / sr
    return wav * np.sin(2 * np.pi * freq * t)


def apply_effect(wav: np.ndarray, sr: int, name: str) -> np.ndarray:
    name = name.strip().lower()
    if name.startswith("pitch:"):
        return _pitch(wav, sr, float(name.split(":", 1)[1]))
    if name.startswith("speed:"):
        return _speed(wav, float(name.split(":", 1)[1]))
    table = {
        "deep": lambda w: _pitch(w, sr, -4),
        "deeper": lambda w: _pitch(w, sr, -7),
        "chipmunk": lambda w: _pitch(w, sr, 8),
        "child": lambda w: _pitch(w, sr, 5),
        "giant": lambda w: _reverb(_pitch(w, sr, -9), sr, 2.2, 0.4),
        "robot": lambda w: _stft_phase(w, "robot"),
        "whisper": lambda w: _stft_phase(w, "whisper") * 1.4,
        "radio": lambda w: np.tanh(3 * _band(w, sr, 400, 3800)) * 0.6,
        "telephone": lambda w: _band(w, sr, 300, 3400, 6),
        "megaphone": lambda w: np.tanh(6 * _band(w, sr, 600, 3000)) * 0.5,
        "echo": lambda w: _echo(w, sr),
        "hall": lambda w: _reverb(w, sr, 1.8, 0.35),
        "cave": lambda w: _echo(_reverb(w, sr, 2.5, 0.5), sr, 0.45, 0.35, 3),
        "alien": lambda w: 0.6 * _pitch(w, sr, 3) + 0.4 * _ring(_pitch(w, sr, 3), sr, 90),
        "monster": lambda w: np.tanh(2 * _pitch(w, sr, -10)) * 0.8,
        "underwater": lambda w: _lowpass(w, sr, 700) * (1 + 0.3 * np.sin(2 * np.pi * 4 * np.arange(len(w)) / sr)),
        "slow": lambda w: _speed(w, 0.8),
        "fast": lambda w: _speed(w, 1.25),
    }
    if name not in table:
        raise VoiceError(f"Unknown effect {name!r}. Available: {EFFECTS_HELP}")
    return np.asarray(table[name](wav), dtype=np.float32)


def apply_effects(wav: np.ndarray, sr: int, chain: str | None) -> np.ndarray:
    for name in (chain or "").split(","):
        if name.strip():
            wav = apply_effect(wav, sr, name)
    return wav


# ---------------------------------------------------------------- library API (used by the CLI and app.py)

def synthesize(text, voice=None, lang=None, exaggeration=0.5, cfg=0.5, temperature=0.8, seed=None,
               effect=None, consent=None, log=True):
    """Text -> (wav, lang). `voice`: None/'default', a preset or saved profile name, or a recording path (+ consent)."""
    import torch

    if not text or not text.strip():
        raise VoiceError("Nothing to say: the text is empty.")
    lang = lang or guess_lang(text)
    if lang not in LANGS:
        raise VoiceError(f"Unsupported language {lang!r}. Supported: {' '.join(LANGS)}")
    ref = resolve_voice(voice, consent)
    model = load_tts()
    if seed is not None:
        torch.manual_seed(seed)
    if ref is not None:
        model.prepare_conditionals(str(ref), exaggeration=exaggeration)
    else:
        model.conds = load_tts.default_conds  # undo a previous clone in this process
    chunks = split_text(text)
    gap = np.zeros(int(0.25 * SR), dtype=np.float32)
    pieces = []
    for i, chunk in enumerate(chunks, 1):
        if log:
            print(f"[voice-studio] {i}/{len(chunks)}: {chunk}", file=sys.stderr)
        wav = model.generate(chunk, language_id=lang, exaggeration=exaggeration, cfg_weight=cfg, temperature=temperature)
        pieces += [wav.squeeze(0).cpu().numpy(), gap]
    return apply_effects(np.concatenate(pieces[:-1]), SR, effect), lang


def _write_profile(d: Path, wav: np.ndarray, meta: dict) -> dict:
    d.mkdir(parents=True, exist_ok=True)
    save_audio(d / "reference.wav", wav)
    meta = {"name": d.name, **meta, "seconds": round(len(wav) / SR, 1),
            "created": _dt.datetime.now().isoformat(timespec="seconds")}
    (d / "voice.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def add_voice(name, sample, consent, note="", description="", max_seconds=30.0, force=False) -> dict:
    """Clone: save `sample` (any audio format) as voice profile `name`. Requires a consent declaration."""
    if consent not in CONSENT_CHOICES:
        raise VoiceError("A consent declaration is required: self | permission | synthetic")
    d = voice_dir(name)
    if d.exists() and not force:
        raise VoiceError(f"Voice {name!r} already exists (use --force to replace).")
    wav = trim_silence(load_audio(sample))
    if len(wav) / SR < 5:
        raise VoiceError(f"Sample is only {len(wav) / SR:.1f}s of speech — give at least 5-10 seconds.")
    wav = wav[: int(max_seconds * SR)]
    return _write_profile(d, wav, {
        "description": description or "",
        "source_file": Path(sample).name,
        "consent": consent,
        "consent_statement": CONSENT_CHOICES[consent],
        "consent_note": note or "",
    })


DESIGN_TEXT = {
    "he": "שלום לכולם. היום אני רוצה לספר לכם סיפור קצר על מסע ארוך, על אנשים טובים ועל מקומות רחוקים. "
          "בואו נתחיל מההתחלה, לאט ובנחת.",
    "en": "Hello everyone. Today I want to tell you a short story about a long journey, about good people "
          "and faraway places. Let's start from the beginning, slowly and calmly.",
}


def design_voice(name, pitch=0.0, base=None, effect=None, exaggeration=0.5, lang="he", seed=0,
                 description="", consent=None, force=False) -> dict:
    """Invent a new synthetic voice: speak a neutral passage in a base voice, reshape it (pitch/effects) and
    save that as a profile. Cloning from it makes the model re-synthesize the new timbre naturally."""
    d = voice_dir(name)
    if d.exists() and not force:
        raise VoiceError(f"Voice {name!r} already exists (use --force to replace).")
    lang = lang if lang in DESIGN_TEXT else "en"
    wav, _ = synthesize(DESIGN_TEXT[lang], voice=base, lang=lang, exaggeration=exaggeration, seed=seed,
                        consent=consent, log=False)
    if pitch:
        wav = _pitch(wav, SR, pitch)
    wav = trim_silence(apply_effects(wav, SR, effect))
    return _write_profile(d, wav, {
        "description": description or f"designed from {base or 'default'} (pitch {pitch:+g}, effects {effect or '-'})",
        "source_file": "(designed)",
        "consent": "synthetic",
        "consent_statement": CONSENT_CHOICES["synthetic"],
        "consent_note": "",
        "design": {"base": base or "default", "pitch": pitch, "effect": effect, "seed": seed},
    })


def convert(source, voice, effect=None, consent=None) -> np.ndarray:
    """Speech -> speech: keep the words and intonation of `source`, change the speaker to `voice`."""
    ref = resolve_voice(voice, consent)
    if ref is None:
        raise VoiceError("convert needs a target voice (a saved voice name, or a recording + consent).")
    model = load_vc()
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "source.wav"
        save_audio(src, load_audio(source, 16000), 16000)
        wav = model.generate(audio=str(src), target_voice_path=str(ref))
    return apply_effects(wav.squeeze(0).cpu().numpy(), SR, effect)


def watermark_score(path) -> float:
    import librosa
    import perth

    wav, sr = librosa.load(str(path), sr=None)
    return float(perth.PerthImplicitWatermarker().get_watermark(wav, sample_rate=sr))


def list_voices() -> list[dict]:
    rows = [{"name": "default", "kind": "built-in", "seconds": None, "consent": "", "description": "Chatterbox's own voice"}]
    for d in _profiles():
        meta = json.loads((d / "voice.json").read_text(encoding="utf-8")) if (d / "voice.json").exists() else {}
        rows.append({"name": d.name, "kind": "preset" if d.parent == PRESETS_DIR.resolve() else "saved",
                     "seconds": meta.get("seconds"), "consent": meta.get("consent", "?"),
                     "description": meta.get("description", "")})
    return rows


# ---------------------------------------------------------------- CLI commands

def cmd_speak(a):
    text = Path(a.file).read_text(encoding="utf-8") if a.file else a.text
    wav, lang = synthesize(text, a.voice, a.lang, a.exaggeration, a.cfg, a.temperature, a.seed, a.effect, a.consent)
    out = save_audio(a.out, wav)
    print(f"{out}  ({len(wav) / SR:.1f}s, voice={a.voice or 'default'}, lang={lang})")


def cmd_add_voice(a):
    meta = add_voice(a.name, a.sample, a.consent, a.note, a.description, a.max_seconds, a.force)
    print(f"Saved voice {a.name!r} ({meta['seconds']}s) -> {voice_dir(a.name)}")


def cmd_design_voice(a):
    meta = design_voice(a.name, a.pitch, a.base, a.effect, a.exaggeration, a.lang or "he", a.seed,
                        a.description, a.consent, a.force)
    print(f"Designed voice {a.name!r} ({meta['seconds']}s) -> {voice_dir(a.name)}")


def cmd_voices(_a):
    for v in list_voices():
        secs = f"{v['seconds']:>5}s" if v["seconds"] is not None else "      "
        print(f"  {v['name']:<18} {v['kind']:<8} {secs}  {('consent=' + v['consent']) if v['consent'] else '':<18} {v['description']}")


def cmd_convert(a):
    wav = convert(a.source, a.voice, a.effect, a.consent)
    out = save_audio(a.out, wav)
    print(f"{out}  ({len(wav) / SR:.1f}s, voice={a.voice})")


def cmd_effects(a):
    wav = apply_effects(load_audio(a.input), SR, a.effect)
    out = save_audio(a.out, wav)
    print(f"{out}  ({len(wav) / SR:.1f}s, effects={a.effect})")


def cmd_detect(a):
    score = watermark_score(a.input)
    verdict = "AI-generated (watermark found)" if score >= 0.5 else "no watermark found"
    print(f"{a.input}: {verdict}  [score={score:.2f}]")


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):  # Hebrew in a Windows console / redirected output must not crash
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(prog="voice.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("speak", help="text -> speech")
    s.add_argument("text", nargs="?", help="text to say (or use --file)")
    s.add_argument("--file", help="read the text from a UTF-8 file")
    s.add_argument("-o", "--out", default="out.wav", help="output file (.wav, .mp3, .ogg, .m4a)")
    s.add_argument("-v", "--voice", help="saved voice name, or a recording path (+ --consent); default: built-in voice")
    s.add_argument("-l", "--lang", choices=LANGS, help="language code (auto-detected: Hebrew/Arabic/Russian/English)")
    s.add_argument("--exaggeration", type=float, default=0.5, help="emotion intensity 0.25-2.0 (default 0.5)")
    s.add_argument("--cfg", type=float, default=0.5, help="pacing/adherence 0-1; lower = slower, calmer (default 0.5)")
    s.add_argument("--temperature", type=float, default=0.8, help="sampling randomness (default 0.8)")
    s.add_argument("--seed", type=int, help="random seed for a repeatable take")
    s.add_argument("--effect", help=f"comma-separated effect chain: {EFFECTS_HELP}")
    s.add_argument("--consent", choices=CONSENT_CHOICES, help="required when --voice is a raw recording")
    s.set_defaults(func=cmd_speak)

    s = sub.add_parser("add-voice", help="save a voice profile from a recording")
    s.add_argument("name", help="profile name, e.g. shimi")
    s.add_argument("sample", help="recording of the voice: 10-30s of clean speech, any audio format")
    s.add_argument("--consent", required=True, choices=CONSENT_CHOICES,
                   help="self = my own voice; permission = the speaker agreed; synthetic = not a real person")
    s.add_argument("--note", help="free-text consent note, e.g. who agreed and when")
    s.add_argument("--description", help="short description of the voice")
    s.add_argument("--max-seconds", type=float, default=30.0, help="keep at most this much of the sample (default 30)")
    s.add_argument("--force", action="store_true", help="replace an existing profile")
    s.set_defaults(func=cmd_add_voice)

    s = sub.add_parser("design-voice", help="invent a new synthetic voice (no real person needed)")
    s.add_argument("name", help="profile name, e.g. deep_narrator")
    s.add_argument("--pitch", type=float, default=0.0, help="semitones: -6 = much deeper, +5 = younger/higher")
    s.add_argument("--base", help="voice to start from (default: built-in voice)")
    s.add_argument("--effect", help="optional effect chain baked into the reference, e.g. radio")
    s.add_argument("--exaggeration", type=float, default=0.5, help="emotion intensity of the reference take")
    s.add_argument("-l", "--lang", choices=LANGS, help="language of the reference passage (he or en; default he)")
    s.add_argument("--seed", type=int, default=0, help="different seeds give different takes")
    s.add_argument("--description", help="short description of the voice")
    s.add_argument("--consent", choices=CONSENT_CHOICES, help="required when --base is a raw recording")
    s.add_argument("--force", action="store_true", help="replace an existing profile")
    s.set_defaults(func=cmd_design_voice)

    s = sub.add_parser("voices", help="list saved voices")
    s.set_defaults(func=cmd_voices)

    s = sub.add_parser("convert", help="speech -> speech: re-voice a recording into another voice")
    s.add_argument("source", help="recording whose words/intonation to keep")
    s.add_argument("-v", "--voice", required=True, help="target voice: saved name or recording path (+ --consent)")
    s.add_argument("-o", "--out", default="converted.wav")
    s.add_argument("--effect", help=f"comma-separated effect chain: {EFFECTS_HELP}")
    s.add_argument("--consent", choices=CONSENT_CHOICES, help="required when --voice is a raw recording")
    s.set_defaults(func=cmd_convert)

    s = sub.add_parser("effects", help="apply voice effects to an audio file")
    s.add_argument("input")
    s.add_argument("-e", "--effect", required=True, help=EFFECTS_HELP)
    s.add_argument("-o", "--out", default="effect.wav")
    s.set_defaults(func=cmd_effects)

    s = sub.add_parser("detect", help="check an audio file for the AI watermark")
    s.add_argument("input")
    s.set_defaults(func=cmd_detect)

    a = p.parse_args(argv)
    try:
        a.func(a)
    except VoiceError as e:
        raise SystemExit(f"error: {e}")


if __name__ == "__main__":
    main()
