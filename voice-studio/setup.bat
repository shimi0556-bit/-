@echo off
rem Double-click to install voice-studio (runs setup.ps1 without changing your PowerShell execution policy).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
pause
