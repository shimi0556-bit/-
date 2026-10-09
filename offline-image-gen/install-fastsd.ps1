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
  # Cloned under another name and renamed only once complete, so an interrupted clone is simply redone
  $cloneTmp = "$AI\fastsdcpu-download"
  if (Test-Path $cloneTmp) { Remove-Item -Recurse -Force $cloneTmp }
  git clone --depth 1 --branch v1.0.0-beta.510 https://github.com/rupeshs/fastsdcpu.git $cloneTmp 2>&1 | Out-Host
  Check 'git clone'
  if (Test-Path $app) { Remove-Item -Recurse -Force $app }
  Rename-Item $cloneTmp 'fastsdcpu'
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
# Windows store. pip needs it in a file. pip's own list goes in too, for sites NetFree does not re-sign.
# Rebuilt on every run, so a certificate added to Windows later is picked up.
Step 'Building certificate bundle (pip''s own list + the Windows certificate store)'
$bundle = "$AI\cache\ca-bundle.pem"
$lines = @(Get-Content "$sp\pip\_vendor\certifi\cacert.pem" -ErrorAction SilentlyContinue)
foreach ($c in @(Get-ChildItem Cert:\LocalMachine\Root) + @(Get-ChildItem Cert:\CurrentUser\Root) + @(Get-ChildItem Cert:\LocalMachine\CA)) {
  $lines += '-----BEGIN CERTIFICATE-----'
  $lines += [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks')
  $lines += '-----END CERTIFICATE-----'
}
$lines | Set-Content -Encoding ascii $bundle
$env:PIP_CERT = $bundle

$wheelDir = "$AI\cache\wheels"
New-Item -ItemType Directory -Force -Path $wheelDir | Out-Null
# Git for Windows can add a second curl.exe; take the first one
$curl = (Get-Command curl.exe | Select-Object -First 1).Source

# torch, OpenCV and OpenVINO need the Microsoft Visual C++ runtime (msvcp140.dll); Python itself ships
# only part of it. When Windows lacks it, the DLLs go next to python.exe (from the msvc-runtime package
# on PyPI) instead of installing anything to drive C.
$pyHome = (& $py -c "import sys; print(sys.base_prefix)" | Out-String).Trim()
if (-not (Test-Path "$env:windir\System32\msvcp140.dll") -and -not (Test-Path "$pyHome\msvcp140.dll")) {
  Step 'Adding the Visual C++ runtime next to Python (Windows does not have it)'
  for ($i = 1; $i -le 10; $i++) {
    & $py -m pip download --no-deps --only-binary :all: -d $wheelDir msvc-runtime==14.44.35112 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host "Retrying in 30s (attempt $i)"; Start-Sleep 30
  }
  Check 'Visual C++ runtime download'
  @'
import glob, os, sys, zipfile
wheel = glob.glob(os.path.join(sys.argv[1], 'msvc_runtime-*.whl'))[0]
with zipfile.ZipFile(wheel) as z:
    for name in z.namelist():
        out = os.path.join(sys.argv[2], os.path.basename(name))
        if '/Scripts/' in name and name.endswith('.dll') and not os.path.exists(out):
            with open(out, 'wb') as f:
                f.write(z.read(name))
'@ | Set-Content -Encoding ascii "$env:TMP\copy-vc-runtime.py"
  & $py "$env:TMP\copy-vc-runtime.py" $wheelDir $pyHome 2>&1 | Out-Host
  Check 'Visual C++ runtime copy'
}

# PyTorch is one 590MB file. Download it with curl so a dropped connection resumes
# from where it stopped instead of starting over.
$torchName = 'torch-2.8.0+cpu-cp311-cp311-win_amd64.whl'
$torchWhl = "$wheelDir\$torchName"
$torchUrl = 'https://download-r2.pytorch.org/whl/cpu/torch-2.8.0%2Bcpu-cp311-cp311-win_amd64.whl'
$torchSize = 619392861
# Reads every file inside the wheel, so a damaged download is caught before pip spends an hour on it
@'
import sys, zipfile
try:
    bad = zipfile.ZipFile(sys.argv[1]).testzip()
except Exception as e:
    bad = repr(e)
print('file check: OK' if bad is None else 'file check: DAMAGED (%s)' % bad)
sys.exit(0 if bad is None else 1)
'@ | Set-Content -Encoding ascii "$env:TMP\check-wheel.py"
if (-not (Test-Path "$sp\torch-2.8.0+cpu.dist-info\RECORD")) {
  # An install cut off near its end leaves the dist-info without RECORD. pip would then call torch
  # already installed and skip it, so the half-installed files are removed first.
  if (Test-Path "$sp\torch-2.8.0+cpu.dist-info") {
    Step 'Removing an interrupted PyTorch install'
    Remove-Item -Recurse -Force "$sp\torch-2.8.0+cpu.dist-info", "$sp\torch", "$sp\torchgen", "$sp\functorch" -ErrorAction SilentlyContinue
  }
  Step 'Downloading PyTorch (590MB, resumes after connection drops)'
  $torchOk = $false
  for ($round = 1; $round -le 3 -and -not $torchOk; $round++) {
    for ($i = 1; $i -le 200; $i++) {
      $have = 0; if (Test-Path $torchWhl) { $have = (Get-Item $torchWhl).Length }
      if ($have -eq $torchSize) { break }
      if ($have -gt $torchSize) { Remove-Item $torchWhl; $have = 0 }
      Write-Host ("{0}  attempt {1}: {2:N0} of {3:N0} MB downloaded" -f (Get-Date -Format HH:mm:ss), $i, ($have / 1MB), ($torchSize / 1MB))
      # -f: never append an error page to the file. No curl --retry: it throws away the bytes of a
      # failed attempt; this loop resumes from them instead.
      & $curl -f -sS -L -C - --connect-timeout 30 --speed-limit 1 --speed-time 120 -o $torchWhl $torchUrl
      if ($LASTEXITCODE -ne 0) { Start-Sleep 60 }
    }
    if (-not (Test-Path $torchWhl) -or (Get-Item $torchWhl).Length -ne $torchSize) { break }
    Write-Host 'Checking the downloaded file (takes a minute or two)'
    & $py "$env:TMP\check-wheel.py" $torchWhl 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) { $torchOk = $true } else { Write-Host 'Downloading it again'; Remove-Item $torchWhl }
  }
  if (-not $torchOk) { Write-Host 'FAILED: PyTorch download incomplete, run this script again to resume'; Stop-Transcript | Out-Null; exit 1 }

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
