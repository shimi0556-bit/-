@echo off
rem Starts FastSD CPU fully offline from the folder this file is in.
rem The browser opens by itself at http://127.0.0.1:7860 once the app is ready (can take a few minutes).
set "AI=%~dp0"
set "HF_HOME=%AI%cache\hf"
set "HF_HUB_OFFLINE=1"
set "TRANSFORMERS_OFFLINE=1"
set "GRADIO_ANALYTICS_ENABLED=False"
set "TMP=%AI%cache\tmp"
set "TEMP=%AI%cache\tmp"
if not exist "%TMP%" mkdir "%TMP%"
set "PATH=%AI%fastsdcpu\env\Lib\site-packages\openvino\libs;%PATH%"
title FastSD CPU - keep this window open while making images
echo Starting FastSD CPU. The browser opens by itself when it is ready.
echo To stop it, close this window.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 600; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:7860 | Out-Null; Start-Process http://127.0.0.1:7860; break } catch { Start-Sleep 2 } }"
cd /d "%AI%fastsdcpu"
"%AI%fastsdcpu\env\Scripts\python.exe" src\app.py -w
pause
