@echo off
rem Double-click to open the voice-studio web UI in your browser. Keep this window open while you use it.
cd /d "%~dp0"
set HF_HUB_DISABLE_SYMLINKS_WARNING=1
set PYTHONIOENCODING=utf-8
if not exist ".venv\Scripts\python.exe" (
  echo voice-studio is not installed yet - double-click setup.bat first.
  pause
  exit /b 1
)
echo Starting Voice Studio - the browser opens by itself in a few seconds.
echo The first time you generate speech it downloads about 3 GB of models.
".venv\Scripts\python.exe" app.py --inbrowser
pause
