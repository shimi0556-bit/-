#!/usr/bin/env bash
# One-time setup for voice-studio on Linux/macOS: Python venv + Chatterbox + Hebrew niqqud model.
# Windows: double-click setup.bat (or run setup.ps1), or use the one-line installer in README.md.
# Model weights (~3 GB) download from Hugging Face on the first `voice.py` run and are cached.
set -euo pipefail
cd "$(dirname "$0")"

DICTA_URL="https://huggingface.co/spaces/thewh1teagle/add-diacritics-in-hebrew/resolve/main/dicta-1.0.int8.onnx"

export UV_HTTP_TIMEOUT="${UV_HTTP_TIMEOUT:-300}"
if command -v uv >/dev/null 2>&1; then
  [ -d .venv ] || uv venv .venv --python 3.11
  PIP=(uv pip install --python .venv/bin/python)
else
  [ -d .venv ] || python3.11 -m venv .venv || python3 -m venv .venv
  .venv/bin/python -m pip install -q --upgrade pip
  PIP=(.venv/bin/python -m pip install)
fi

# CPU-only torch wheels on Linux without an NVIDIA GPU (much smaller); default wheels elsewhere (CUDA / Apple MPS).
EXTRA=()
if [ "$(uname -s)" = "Linux" ] && ! command -v nvidia-smi >/dev/null 2>&1; then
  if [ "${PIP[0]}" = "uv" ]; then
    EXTRA=(--index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple --index-strategy unsafe-best-match)
  else
    EXTRA=(--index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple)
  fi
fi

"${PIP[@]}" ${EXTRA[@]+"${EXTRA[@]}"} -r requirements.txt  # (empty-array safe on bash 3.2)
# Chatterbox: vendored pure-Python wheel of commit 5de7a54 (has Multilingual V3; PyPI 0.1.7 doesn't). No git needed.
if [ "${PIP[0]}" = "uv" ]; then
  "${PIP[@]}" --no-deps --reinstall-package chatterbox-tts vendor/chatterbox_tts-*.whl
else
  "${PIP[@]}" --no-deps --force-reinstall vendor/chatterbox_tts-*.whl
fi

mkdir -p models
if [ ! -s models/dicta-1.0.int8.onnx ]; then
  echo "Downloading Hebrew niqqud model (~300 MB)..."
  curl -fL --retry 3 -o models/dicta-1.0.int8.onnx "$DICTA_URL"
fi

echo
echo "voice-studio is ready. Try:"
echo "  .venv/bin/python voice.py speak \"שלום! זה הקול החדש שלי\" -o hello.wav"
echo "  .venv/bin/python voice.py voices"
