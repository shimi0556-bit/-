# voice-studio setup for Windows (PowerShell 5.1+). Also runs under PowerShell 7 on Linux/macOS.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1      (or double-click setup.bat)
#
# Needs nothing preinstalled: it fetches uv (a small Python package manager) into tools\, lets uv download
# Python 3.11 if needed, installs PyTorch (CUDA build when an NVIDIA GPU is present) and the rest, and
# downloads the Hebrew niqqud model. Model weights (~3 GB) download on the first generation and are cached.
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads non-ASCII characters in files without a BOM.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is very slow with the progress bar on 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location -LiteralPath $PSScriptRoot

$UvVersion = '0.12.21'
$env:UV_HTTP_TIMEOUT = '300'   # large wheels (torch ~200 MB) on slow connections
$env:UV_SYSTEM_CERTS = '1'     # trust the Windows certificate store (antivirus / filtered-internet HTTPS inspection)
$ModelsRelease = 'https://github.com/shimi0556-bit/-/releases/download/voice-models-v1'
$OnWindows = $env:OS -eq 'Windows_NT'

function Invoke-Checked {
    param([string]$Exe, [string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE): $Exe $($Arguments -join ' ')" }
}

function Get-File {
    param([string[]]$Urls, [string]$OutFile)
    $part = "$OutFile.part"
    foreach ($url in $Urls) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $part
            Move-Item -LiteralPath $part -Destination $OutFile -Force
            return
        } catch {
            $status = ''
            if ($_.Exception.Response) { $status = "HTTP $([int]$_.Exception.Response.StatusCode) " }
            Write-Host "  download failed from $url : $status$($_.Exception.Message)"
        }
    }
    throw "Could not download $OutFile"
}

Write-Host '== voice-studio setup =='

# 1. uv
$uv = $null
$cmd = Get-Command uv -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cmd) { $uv = $cmd.Source }
if (-not $uv) {
    $toolsDir = Join-Path $PSScriptRoot 'tools'
    if ($OnWindows) { $uv = Join-Path $toolsDir 'uv.exe' } else { $uv = Join-Path $toolsDir 'uv' }
    if (-not (Test-Path -LiteralPath $uv)) {
        Write-Host "[1/5] Downloading uv $UvVersion ..."
        New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
        if ($OnWindows) { $asset = 'uv-x86_64-pc-windows-msvc.zip' }
        elseif ($IsMacOS) { $asset = 'uv-aarch64-apple-darwin.tar.gz' }
        else { $asset = 'uv-x86_64-unknown-linux-gnu.tar.gz' }
        $archive = Join-Path $toolsDir $asset
        Get-File -Urls @("https://github.com/astral-sh/uv/releases/download/$UvVersion/$asset",
                         "https://releases.astral.sh/github/uv/releases/download/$UvVersion/$asset") -OutFile $archive
        if ($OnWindows) {
            Expand-Archive -LiteralPath $archive -DestinationPath $toolsDir -Force
        } else {
            Invoke-Checked 'tar' @('-xzf', $archive, '-C', $toolsDir, '--strip-components=1')
        }
        Remove-Item -LiteralPath $archive
    } else {
        Write-Host '[1/5] uv already downloaded'
    }
} else {
    Write-Host "[1/5] Using uv at $uv"
}

# 2. Python 3.11 virtual environment (uv downloads Python itself if it is not installed)
if ($OnWindows) { $py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe' } else { $py = Join-Path $PSScriptRoot '.venv/bin/python' }
if (-not (Test-Path -LiteralPath $py)) {
    Write-Host '[2/5] Creating Python 3.11 environment ...'
    Invoke-Checked $uv @('venv', '.venv', '--python', '3.11')
} else {
    Write-Host '[2/5] Python environment already exists'
}

# 3. Dependencies. PyTorch: CUDA build when an NVIDIA GPU is present, else the CPU build.
$torchIndex = @()
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    Write-Host '[3/5] NVIDIA GPU found - installing the CUDA build of PyTorch (large download) ...'
    $torchIndex = @('--index-url', 'https://download.pytorch.org/whl/cu124')
} elseif (-not $OnWindows -and -not $IsMacOS) {
    Write-Host '[3/5] Installing packages (CPU PyTorch) ...'
    $torchIndex = @('--index-url', 'https://download.pytorch.org/whl/cpu')
} else {
    Write-Host '[3/5] Installing packages (CPU PyTorch, about 1 GB) ...'
}
if ($torchIndex.Count -gt 0) {
    $torchIndex += @('--extra-index-url', 'https://pypi.org/simple', '--index-strategy', 'unsafe-best-match')
}
$installArgs = @('pip', 'install', '--python', $py) + $torchIndex + @('-r', 'requirements.txt')
try {
    Invoke-Checked $uv $installArgs
} catch {
    Write-Host 'Package install failed - retrying once (downloads resume from the cache) ...'
    Invoke-Checked $uv $installArgs
}

# 4. Chatterbox itself: vendored pure-Python wheel of the pinned commit (no git needed)
Write-Host '[4/5] Installing Chatterbox ...'
$wheel = Get-ChildItem -Path (Join-Path $PSScriptRoot 'vendor') -Filter 'chatterbox_tts-*.whl' | Select-Object -First 1
if (-not $wheel) { throw 'vendor\chatterbox_tts-*.whl is missing' }
Invoke-Checked $uv @('pip', 'install', '--python', $py, '--no-deps', '--reinstall-package', 'chatterbox-tts', $wheel.FullName)

# 5. Voice models (~3.5 GB), from this repo's GitHub release "voice-models-v1" (a copy of the Hugging Face files,
#    made by .github/workflows/voice-models-release.yml, for networks such as NetFree that block huggingface.co).
#    Resumable: re-running continues partial downloads. Each file is checked against the sha256 in the manifest.
#    If the release can't be reached, voice.py falls back to Hugging Face on first use.
$modelDir = Join-Path $PSScriptRoot 'models'
$ttsDir = Join-Path $modelDir 'chatterbox'
$partsDir = Join-Path $modelDir 'download-parts'   # parts wait here until their file is verified
New-Item -ItemType Directory -Force -Path $ttsDir, $partsDir | Out-Null

# curl.exe ships with Windows 10+ and resumes downloads. Take the first match only: PATH can hold several
# (e.g. Git for Windows bundles its own curl.exe), and an array here would break the call below.
$curl = Get-Command curl.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $curl -and -not $OnWindows) {
    $curl = Get-Command curl -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Save-Asset([string]$url, [string]$outFile) {
    if ($curl) {
        & $curl.Source -fL --retry 5 --retry-delay 3 -C - --progress-bar -o $outFile $url
        if ($LASTEXITCODE -ne 0) { throw "download failed (curl exit $LASTEXITCODE): $url" }
    } else {
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $outFile
    }
}

Write-Host "[5/5] Voice models (~3.5 GB, one time) from GitHub ..."
try {
    $manifest = (Invoke-WebRequest -UseBasicParsing -Uri "$ModelsRelease/models-manifest.txt").Content
    if ($manifest -is [byte[]]) { $manifest = [Text.Encoding]::ASCII.GetString($manifest) }
    foreach ($line in ($manifest -split "`r?`n" | Where-Object { $_.Trim() })) {
        $name, $size, $sha, $parts = $line.Trim() -split '\s+'
        if ($name -like 'dicta-*') { $target = Join-Path $modelDir $name } else { $target = Join-Path $ttsDir $name }
        if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -eq [int64]$size) {
            Write-Host "  $name - already downloaded"
            continue
        }
        $partList = @($parts -split ',')
        Write-Host ("  {0} ({1:N0} MB, {2} part(s))" -f $name, ([int64]$size / 1MB), $partList.Count)
        # Parts are 500 MB (the workflow's `split -b 500M`) except the last. Keep them until the whole file is
        # verified, so an interrupted run resumes instead of starting over.
        $partSize = [int64]524288000
        for ($i = 0; $i -lt $partList.Count; $i++) {
            $partFile = Join-Path $partsDir $partList[$i]
            if ($partList.Count -eq 1) { $expected = [int64]$size }
            elseif ($i -lt $partList.Count - 1) { $expected = $partSize }
            else { $expected = [int64]$size - $partSize * ($partList.Count - 1) }
            if ((Test-Path -LiteralPath $partFile) -and (Get-Item -LiteralPath $partFile).Length -eq $expected) { continue }
            Save-Asset "$ModelsRelease/$($partList[$i])" $partFile
        }
        $tmp = "$target.download"
        $out = [IO.File]::Create($tmp)
        try {
            foreach ($part in $partList) {
                $in = [IO.File]::OpenRead((Join-Path $partsDir $part))
                try { $in.CopyTo($out) } finally { $in.Close() }
            }
        } finally {
            $out.Close()
        }
        $actual = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $sha) {
            Remove-Item -LiteralPath $tmp
            $partList | ForEach-Object { Remove-Item -LiteralPath (Join-Path $partsDir $_) -ErrorAction SilentlyContinue }
            throw "$name is corrupted (sha256 mismatch) - run the installer again"
        }
        $partList | ForEach-Object { Remove-Item -LiteralPath (Join-Path $partsDir $_) -ErrorAction SilentlyContinue }
        Move-Item -LiteralPath $tmp -Destination $target -Force
    }
    Remove-Item -LiteralPath $partsDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '  all voice model files downloaded and verified'
} catch {
    Write-Host "  Could not get the models from GitHub: $($_.Exception.Message)"
    Write-Host '  The app will try Hugging Face on first use instead. Running the installer again resumes the download.'
}

# Windows launchers. Generated here (not downloaded) because the jsDelivr mirror refuses to serve .bat files.
$startUi = @'
@echo off
rem Double-click to open the voice-studio web UI in your browser. Keep this window open while you use it.
title Claude Voice Studio
cd /d "%~dp0"
set HF_HUB_DISABLE_SYMLINKS_WARNING=1
set PYTHONIOENCODING=utf-8
if not exist ".venv\Scripts\python.exe" (
  echo voice-studio is not installed yet - run install-windows.bat or setup.bat first.
  pause
  exit /b 1
)
echo Starting Claude Voice Studio - the browser opens by itself in a few seconds.
echo The first time you generate speech it downloads about 3 GB of models.
".venv\Scripts\python.exe" app.py --inbrowser
pause
'@
$voiceBat = @'
@echo off
rem Command-line use on Windows, e.g.:  voice.bat speak "shalom" -o hello.mp3
set HF_HUB_DISABLE_SYMLINKS_WARNING=1
set PYTHONIOENCODING=utf-8
"%~dp0.venv\Scripts\python.exe" "%~dp0voice.py" %*
'@
foreach ($pair in @(@('start-ui.bat', $startUi), @('voice.bat', $voiceBat))) {
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot $pair[0]), ($pair[1] -replace "`r?`n", "`r`n"))
}

Invoke-Checked $py @('-c', 'import chatterbox.mtl_tts, perth, dicta_onnx, imageio_ffmpeg; assert perth.PerthImplicitWatermarker is not None; print(''  check: all modules import'')')

Write-Host ''
Write-Host 'voice-studio is ready.'
if ($OnWindows) {
    Write-Host '  Web UI:  double-click start-ui.bat  (or the "Claude Voice Studio" desktop shortcut)'
    Write-Host '  CLI:     .\voice.bat speak "shalom" -o hello.mp3'
} else {
    Write-Host '  Web UI:  .venv/bin/python app.py --inbrowser'
    Write-Host '  CLI:     .venv/bin/python voice.py speak "hello" -o hello.mp3'
}
