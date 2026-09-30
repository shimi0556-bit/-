@echo off
rem Double-click to install voice-studio on Windows. No Python or git needed.
rem Downloads into %USERPROFILE%\claude-voice-studio, adds a "Claude Voice Studio" desktop shortcut, opens the UI.
title Claude Voice Studio installer
echo Installing Claude Voice Studio. This takes a few minutes - keep this window open.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/shimi0556-bit/-/refs/heads/claude/exciting-cannon-7hsu15/voice-studio/install-windows.ps1 | iex"
echo.
echo If you see red error text above, copy it and send it to Claude.
pause
