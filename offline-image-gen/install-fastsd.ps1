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

# PyTorch is one 590MB file. Download it with curl so a dropped connection resumes
# from where it stopped instead of starting over.
$wheelDir = "$AI\cache\wheels"
New-Item -ItemType Directory -Force -Path $wheelDir | Out-Null
$torchName = 'torch-2.8.0+cpu-cp311-cp311-win_amd64.whl'
$torchWhl = "$wheelDir\$torchName"
$torchUrl = 'https://download-r2.pytorch.org/whl/cpu/torch-2.8.0%2Bcpu-cp311-cp311-win_amd64.whl'
$torchSize = 619392861
if (-not (Test-Path "$app\env\Lib\site-packages\torch")) {
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
    & $uv pip install --python $py $torchWhl 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host "Retrying in 30s (attempt $i)"; Start-Sleep 30
  }
  Check 'torch install'
}

Step 'Installing FastSD CPU requirements (retries after connection drops)'
# NetFree breaks the PyPI index page of "mcp" (bad chunked response). mcp and fastapi-mcp are only
# used by FastSD's --mcp mode, so they are left out.
$req = "$AI\cache\requirements-netfree.txt"
Get-Content "$app\requirements.txt" | Where-Object { $_ -notmatch '^\s*(mcp|fastapi-mcp)\s*([=<>~!]|$)' } | Set-Content -Encoding ASCII $req
for ($i = 1; $i -le 30; $i++) {
  & $uv pip install --python $py -r $req 2>&1 | Out-Host
  if ($LASTEXITCODE -eq 0) { break }
  Write-Host "Retrying in 30s (attempt $i)"; Start-Sleep 30
}
Check 'requirements install'

Step 'Cleaning download cache to free space'
& $uv cache clean 2>&1 | Out-Host

Step 'Building certificate bundle for model downloads (Windows roots + certifi)'
$bundle = "$AI\cache\ca-bundle.pem"
$certifi = "$app\env\Lib\site-packages\certifi\cacert.pem"
$lines = @()
if (Test-Path $certifi) { $lines += Get-Content $certifi }
foreach ($c in @(Get-ChildItem Cert:\LocalMachine\Root) + @(Get-ChildItem Cert:\CurrentUser\Root) + @(Get-ChildItem Cert:\LocalMachine\CA)) {
  $lines += '-----BEGIN CERTIFICATE-----'
  $lines += [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks')
  $lines += '-----END CERTIFICATE-----'
}
$lines | Set-Content -Encoding ascii $bundle
Write-Host "Wrote $bundle"

Step 'DONE'
Stop-Transcript | Out-Null
