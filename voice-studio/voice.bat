@echo off
rem Command-line use on Windows, e.g.:  voice.bat speak "shalom" -o hello.mp3
set HF_HUB_DISABLE_SYMLINKS_WARNING=1
set PYTHONIOENCODING=utf-8
"%~dp0.venv\Scripts\python.exe" "%~dp0voice.py" %*
