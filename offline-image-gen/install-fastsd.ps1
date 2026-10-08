# FastSD CPU installer. Everything (tools, Python, packages, models, temp files)
# stays inside the folder this script is in, so drive C does not fill up.
$ErrorActionPreference = 'Continue'
$AI = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Transcript -Path "$AI\install.log" -Append | Out-Null
$host.UI.RawUI.WindowTitle = 'FastSD CPU install - keep this window open'
# Keep the computer awake while this window is open (the download is long on a slow connection)
Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
[Win32.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null

$env:UV_INSTALL_DIR = "$AI\tools\uv"
$env:UV_NO_MODIFY_PATH = '1'
$env:INSTALLER_NO_MODIFY_PATH = '1'
$env:UV_CACHE_DIR = "$AI\cache\uv"
$env:UV_PYTHON_INSTALL_DIR = "$AI\cache\python"
$env:UV_LINK_MODE = 'copy'
# Use the Windows certificate store (needed behind filtered internet such as NetFree)
$env:UV_SYSTEM_CERTS = '1'
$env:HF_HOME = "$AI\cache\hf"
$env:TMP = "$AI\cache\tmp"
$env:TEMP = $env:TMP
New-Item -ItemType Directory -Force -Path $env:UV_INSTALL_DIR, $env:UV_CACHE_DIR, $env:UV_PYTHON_INSTALL_DIR, $env:HF_HOME, $env:TMP | Out-Null

function Step($msg) { Write-Host "`n== $msg" }
function Check($what) { if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $what (exit $LASTEXITCODE)"; Stop-Transcript | Out-Null; exit 1 } }

$uv = Get-ChildItem -Path "$AI\tools\uv" -Filter uv.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $uv) {
  Step 'Installing uv'
  Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
  $uv = Get-ChildItem -Path "$AI\tools\uv" -Filter uv.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
  if (-not $uv) { Write-Host 'FAILED: uv not found after install'; Stop-Transcript | Out-Null; exit 1 }
}
& $uv --version

$app = "$AI\fastsdcpu"
if (-not (Test-Path "$app\src\app.py")) {
  Step 'Downloading FastSD CPU v1.0.0-beta.510'
  git clone --depth 1 --branch v1.0.0-beta.510 https://github.com/rupeshs/fastsdcpu.git $app 2>&1 | Out-Host
  Check 'git clone'
}

$py = "$app\env\Scripts\python.exe"
if (-not (Test-Path $py)) {
  Step 'Creating Python 3.11 environment'
  # FAT32 drives can't hold the folder links uv makes for managed Python, so the
  # install step may report an error after unpacking. We then point at python.exe directly.
  $base = Get-ChildItem "$AI\cache\python" -Filter python.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike '*\.temp\*' } | Select-Object -First 1 -ExpandProperty FullName
  if (-not $base) {
    & $uv python install 3.11.6 2>&1 | Out-Host
    $base = Get-ChildItem "$AI\cache\python" -Filter python.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike '*\.temp\*' } | Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $base) { Write-Host 'FAILED: Python 3.11 not found'; Stop-Transcript | Out-Null; exit 1 }
  & $uv venv --python $base "$app\env" 2>&1 | Out-Host
  Check 'uv venv'
}

$env:UV_HTTP_TIMEOUT = '300'
$env:UV_HTTP_RETRIES = '10'

# Packages are installed with pip, not uv: uv unpacks every file into its cache and then copies it
# into the environment, which doubles the small-file writes that USB sticks handle badly.
$sp = "$app\env\Lib\site-packages"
if (-not (Test-Path "$app\env\Scripts\pip.exe")) {
  Step 'Adding pip to the environment (offline, from Python itself)'
  & $py -m ensurepip --default-pip 2>&1 | Out-Host
  Check 'ensurepip'
}
$env:PIP_CACHE_DIR = "$AI\cache\pip"
$env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
$env:PIP_DEFAULT_TIMEOUT = '120'
$env:PIP_RETRIES = '10'
$pipArgs = @('-m', 'pip', 'install', '--no-compile', '--no-warn-script-location')

# Filtered internet (NetFree) re-signs HTTPS with its own root certificate, which lives in the
# Windows store. Python tools need it as a file.
$bundle = "$AI\cache\ca-bundle.pem"
if (-not (Test-Path $bundle)) {
  Step 'Building certificate bundle from the Windows certificate store'
  $lines = @()
  foreach ($c in @(Get-ChildItem Cert:\LocalMachine\Root) + @(Get-ChildItem Cert:\CurrentUser\Root) + @(Get-ChildItem Cert:\LocalMachine\CA)) {
    $lines += '-----BEGIN CERTIFICATE-----'
    $lines += [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks')
    $lines += '-----END CERTIFICATE-----'
  }
  $lines | Set-Content -Encoding ascii $bundle
}
$env:PIP_CERT = $bundle

# PyTorch is one 590MB file. Download it with curl so a dropped connection resumes
# from where it stopped instead of starting over.
$wheelDir = "$AI\cache\wheels"
New-Item -ItemType Directory -Force -Path $wheelDir | Out-Null
$torchName = 'torch-2.8.0+cpu-cp311-cp311-win_amd64.whl'
$torchWhl = "$wheelDir\$torchName"
$torchUrl = 'https://download-r2.pytorch.org/whl/cpu/torch-2.8.0%2Bcpu-cp311-cp311-win_amd64.whl'
$torchSize = 619392861
if (-not (Test-Path "$sp\torch-2.8.0+cpu.dist-info\RECORD")) {
  Step 'Downloading PyTorch (590MB, resumes after connection drops)'
  for ($i = 1; $i -le 200; $i++) {
    $have = 0; if (Test-Path $torchWhl) { $have = (Get-Item $torchWhl).Length }
    if ($have -ge $torchSize) { break }
    Write-Host ("Attempt {0}: {1:N0} of {2:N0} MB downloaded" -f $i, ($have/1MB), ($torchSize/1MB))
    curl.exe -L -C - --retry 5 --retry-delay 10 --connect-timeout 30 --speed-limit 1 --speed-time 120 -o $torchWhl $torchUrl
    Start-Sleep 5
  }
  if (-not (Test-Path $torchWhl) -or (Get-Item $torchWhl).Length -lt $torchSize) { Write-Host 'FAILED: PyTorch download incomplete, run this script again to resume'; Stop-Transcript | Out-Null; exit 1 }

  Step 'Installing PyTorch (CPU only)'
  for ($i = 1; $i -le 20; $i++) {
    & $py @pipArgs $torchWhl 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host "Retrying in 30s (attempt $i)"; Start-Sleep 30
  }
  Check 'torch install'
}

Step 'Installing FastSD CPU requirements (retries after connection drops)'
# Only what the web UI and plain LCM text-to-image need (checked by running it). Left out:
# mcp/fastapi-mcp (--mcp mode; NetFree also breaks PyPI's page for mcp), PyQt5 (desktop GUI),
# onnx, omegaconf, mediapipe, tomesd, hf_xet (unused or optional).
# torchvision is needed at startup (upscaler, controlnet-aux) and must match torch 2.8.0.
$req = "$AI\cache\requirements-min.txt"
$drop = '^\s*(mcp|fastapi-mcp|PyQt5|onnx|omegaconf|mediapipe|tomesd|hf_xet)\s*([=<>~!]|$)'
@(Get-Content "$app\requirements.txt" | Where-Object { $_ -notmatch $drop }) + @('torch==2.8.0', 'torchvision==0.23.0') | Set-Content -Encoding ASCII $req
for ($i = 1; $i -le 30; $i++) {
  & $py @pipArgs -r $req 2>&1 | Out-Host
  if ($LASTEXITCODE -eq 0) { break }
  Write-Host "Retrying in 30s (attempt $i)"; Start-Sleep 30
}
Check 'requirements install'

Step 'Checking that everything imports'
& $py -c "import torch, torchvision, diffusers, transformers, gradio, openvino, cv2, controlnet_aux, peft; print('imports OK, torch', torch.__version__)" 2>&1 | Out-Host
Check 'import check'

Step 'Cleaning uv download cache'
& $uv cache clean 2>&1 | Out-Host

Step 'DONE'
Stop-Transcript | Out-Null
