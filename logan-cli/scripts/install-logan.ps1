# install-logan.ps1 - ONE command install for Logan CLI on Windows
# Author: Yuval Avidani (YUV.AI) - https://yuv.ai
#
# Public install (no clone required):
#   irm https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.ps1 | iex
#
# Optional env:
#   $env:LOGAN_HOME
#   $env:LOGAN_INSTALL_SRC
#   $env:LOGAN_INSTALL_NO_START = "1"
#   $env:CI = "1"   # skip auto-start
#
$ErrorActionPreference = "Stop"

$LoganRepo = if ($env:LOGAN_REPO) { $env:LOGAN_REPO } else { "https://github.com/hoodini/logan-cli.git" }
$LoganRef = if ($env:LOGAN_REF) { $env:LOGAN_REF } else { "main" }
$LoganHome = if ($env:LOGAN_HOME) { $env:LOGAN_HOME } else { Join-Path $env:USERPROFILE ".logan" }
$InstallDir = if ($env:LOGAN_INSTALL_DIR) { $env:LOGAN_INSTALL_DIR } else { Join-Path $LoganHome "src\logan-cli" }
$LocalBin = Join-Path $env:USERPROFILE ".local\bin"
$ManagedBin = Join-Path $LoganHome "bin"
$GitHubRepo = if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { "hoodini/logan-cli" }

function Write-Log($msg) { Write-Host "==> $msg" }
function Die($msg) { Write-Error "error: $msg"; exit 1 }

function Test-Interactive {
  # irm|iex always redirects stdin - do NOT require !IsInputRedirected.
  # Start when this is a real user session unless CI/NO_START opts out.
  if ($env:LOGAN_INSTALL_NO_START -eq "1") { return $false }
  if ($env:CI -or $env:NONINTERACTIVE) { return $false }
  try {
    return [Environment]::UserInteractive
  } catch {
    return $true
  }
}

# Single free-console launch contract for post-install TUI start after irm|iex.
# Start-Process without -NoNewWindow launches the TUI in a NEW console window,
# so it never inherits the consumed irm|iex stdin pipe. Do NOT pass
# -UseShellExecute: that is a .NET ProcessStartInfo property, not a
# Start-Process parameter - passing it throws "parameter cannot be found".
function Get-LoganFreeConsoleStartContract {
  return "start=Start-Process;NewConsole=true"
}

function Start-LoganFreeConsole {
  param(
    [Parameter(Mandatory = $true)][string]$Binary,
    [string]$Cwd = (Get-Location).Path
  )
  # Contract token used by LOGAN_INSTALL_PROBE=start_command (tests drive this).
  $null = Get-LoganFreeConsoleStartContract
  Start-Process -FilePath $Binary -WorkingDirectory $Cwd -Wait
}

# Optional probes for tests (no install):
#   $env:LOGAN_INSTALL_PROBE = "start_command"  -> prints free-console contract
#   $env:LOGAN_INSTALL_PROBE = "is_interactive" -> prints yes/no
if ($env:LOGAN_INSTALL_PROBE -eq "start_command") {
  Write-Output (Get-LoganFreeConsoleStartContract)
  exit 0
}
if ($env:LOGAN_INSTALL_PROBE -eq "is_interactive") {
  if (Test-Interactive) { Write-Output "yes" } else { Write-Output "no" }
  exit 0
}

function Ensure-Dir($p) {
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

function Add-UserPath($dir) {
  Ensure-Dir $dir
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $userPath) { $userPath = "" }
  $parts = $userPath -split ";" | Where-Object { $_ -ne "" }
  if ($parts -notcontains $dir) {
    $newPath = ($parts + $dir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Log "Added $dir to user PATH"
  }
  if ($env:Path -notlike "*$dir*") {
    $env:Path = "$dir;$env:Path"
  }
}

function Install-Binary($src, $dest) {
  Ensure-Dir (Split-Path $dest -Parent)
  $tmp = "$dest.new.$PID"
  Copy-Item -Force $src $tmp
  try {
    Move-Item -Force $tmp $dest -ErrorAction Stop
  } catch {
    # Dest is a RUNNING exe: Windows cannot delete an executing image, but it
    # CAN be renamed. Rename it aside, place the new binary, and let the
    # running instance keep its old image until the user restarts Logan.
    $aside = "$dest.old.$PID"
    Move-Item -Force $dest $aside
    Move-Item -Force $tmp $dest
    Write-Log "Logan is running - installed new binary; restart Logan to load it"
  }
  # Sweep leftovers from earlier running-exe replacements. Deleting one that
  # is still executing fails harmlessly; it gets cleaned on a later install.
  Get-ChildItem -Path "$dest.old.*" -ErrorAction SilentlyContinue | ForEach-Object {
    try { Remove-Item $_.FullName -Force -ErrorAction Stop } catch { }
  }
}

function Ensure-Git {
  if (Get-Command git -ErrorAction SilentlyContinue) { return }
  Write-Log "git missing - trying winget…"
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements | Out-Null
  } else {
    Die "git is required. Install Git for Windows, then re-run the one-liner."
  }
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Die "git still missing after install attempt"
  }
}

function Ensure-Rust {
  $cargoHome = Join-Path $env:USERPROFILE ".cargo\bin"
  $env:Path = "$cargoHome;$env:Path"
  if ((Get-Command cargo -ErrorAction SilentlyContinue) -and (Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Log "Rust: $(rustc --version)"
    return
  }
  Write-Log "Rust missing - installing rustup…"
  $tmp = Join-Path $env:TEMP "rustup-init.exe"
  Invoke-WebRequest -Uri "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe" -OutFile $tmp
  & $tmp -y --default-toolchain stable
  $env:Path = "$cargoHome;" + [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")
  if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Die "cargo still missing after rustup. Open a new PowerShell and re-run."
  }
}

function Import-VcVarsEnv {
  param(
    [Parameter(Mandatory = $true)][string]$VcVarsAll,
    [Parameter(Mandatory = $true)][string]$Arch
  )
  $lines = & cmd.exe /d /c "`"$VcVarsAll`" $Arch >nul 2>&1 && set"
  if ($LASTEXITCODE -ne 0 -or -not $lines) { return $false }
  foreach ($line in $lines) {
    $i = $line.IndexOf('=')
    if ($i -gt 0) {
      Set-Item -Path ("env:" + $line.Substring(0, $i)) -Value $line.Substring($i + 1)
    }
  }
  return $true
}

function Ensure-MsvcBuildTools {
  # rustc on the *-msvc host links with link.exe + the MSVC C runtime libs
  # (libcmt.lib). rustc auto-detects the NEWEST Visual Studio, but a VS
  # instance can ship the compiler WITHOUT the desktop x64 libs (e.g. a
  # partial "onecore-only" C++ install). Then every crate dies with:
  #   LINK : fatal error LNK1104: cannot open file 'libcmt.lib'
  # Fix: find the newest VS instance whose MSVC toolset actually has
  # lib\<arch>\libcmt.lib and import its vcvarsall environment, which rustc
  # honors over its own auto-detection.
  $hostLine = & rustc -vV 2>$null | Select-String '^host:' | Select-Object -First 1
  if ($hostLine -and $hostLine.ToString() -notmatch 'msvc') {
    Write-Log "Rust host is not *-msvc ($hostLine) - skipping MSVC check"
    return
  }
  $arch = if ($env:PROCESSOR_ARCHITECTURE -match "ARM") { "arm64" } else { "x64" }
  if ($env:VCToolsInstallDir -and (Test-Path (Join-Path $env:VCToolsInstallDir "lib\$arch\libcmt.lib"))) {
    Write-Log "MSVC env already active: $env:VCToolsInstallDir"
    return
  }
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  $instances = @()
  if (Test-Path $vswhere) {
    try { $instances = @(& $vswhere -all -products * -format json | ConvertFrom-Json) } catch { $instances = @() }
  }
  if ($instances.Count -eq 0) {
    Write-Log "vswhere found no Visual Studio - letting rustc try its own MSVC detection"
    return
  }
  $good = @()
  $broken = @()
  foreach ($inst in $instances) {
    $msvcRoot = Join-Path $inst.installationPath "VC\Tools\MSVC"
    if (-not (Test-Path $msvcRoot)) { continue }
    $hasLibs = $false
    foreach ($v in (Get-ChildItem $msvcRoot -Directory -ErrorAction SilentlyContinue)) {
      if (Test-Path (Join-Path $v.FullName "lib\$arch\libcmt.lib")) { $hasLibs = $true; break }
    }
    if ($hasLibs) { $good += $inst } else { $broken += $inst }
  }
  if ($good.Count -eq 0) {
    $hint = "Install 'Desktop development with C++' via the Visual Studio Installer, or:`n  winget install Microsoft.VisualStudio.2022.BuildTools --override `"--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive`"`nThen re-run the Logan one-liner."
    if ($broken.Count -gt 0) {
      $names = ($broken | ForEach-Object { $_.installationPath }) -join ", "
      Die "Visual Studio C++ tools found but INCOMPLETE (no lib\$arch\libcmt.lib) in: $names. This causes 'LNK1104: cannot open file libcmt.lib'. $hint"
    }
    Die "No Visual Studio C++ build tools found. $hint"
  }
  $newestGood = $good | Sort-Object { [version]$_.installationVersion } -Descending | Select-Object -First 1
  $vcvarsall = Join-Path $newestGood.installationPath "VC\Auxiliary\Build\vcvarsall.bat"
  if (-not (Test-Path $vcvarsall)) {
    Die "MSVC toolset at $($newestGood.installationPath) has libs but no vcvarsall.bat. Repair the install via the Visual Studio Installer."
  }
  Write-Log "MSVC: importing env from $($newestGood.installationPath) ($arch)"
  if (-not (Import-VcVarsEnv -VcVarsAll $vcvarsall -Arch $arch)) {
    Die "Failed to import MSVC environment from $vcvarsall"
  }
  Write-Log "MSVC ready: $env:VCToolsInstallDir"
}

function Ensure-Protoc {
  if ($env:PROTOC -and (Test-Path $env:PROTOC)) {
    Write-Log "protoc: $env:PROTOC"
    return
  }
  if (Get-Command protoc -ErrorAction SilentlyContinue) {
    Write-Log "protoc: $(protoc --version)"
    return
  }
  # Prefer repo-vendored protoc after clone (Unix binary may not run on Windows)
  Write-Log "protoc missing - trying winget/choco, then GitHub zip…"
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    try {
      winget install --id Google.Protobuf -e --accept-source-agreements --accept-package-agreements | Out-Null
    } catch { }
  }
  if (Get-Command choco -ErrorAction SilentlyContinue) {
    try { choco install protoc -y | Out-Null } catch { }
  }
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (Get-Command protoc -ErrorAction SilentlyContinue) {
    Write-Log "protoc: $(protoc --version)"
    return
  }
  # Official protoc release zip (win64)
  $tag = "v28.3"
  $ver = "28.3"
  $url = "https://github.com/protocolbuffers/protobuf/releases/download/$tag/protoc-$ver-win64.zip"
  $tools = Join-Path $LoganHome "tools\protoc"
  Ensure-Dir $tools
  $zip = Join-Path $env:TEMP "protoc-win64.zip"
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $tools -Force
  } catch {
    Die "protoc is required to build Logan and could not be installed automatically. Install protoc (https://github.com/protocolbuffers/protobuf/releases) and re-run, or set `$env:PROTOC to protoc.exe. Detail: $_"
  }
  $protocExe = Join-Path $tools "bin\protoc.exe"
  if (-not (Test-Path $protocExe)) {
    Die "protoc download finished but $protocExe is missing. Install protoc manually and re-run."
  }
  $env:PROTOC = $protocExe
  $env:Path = "$(Join-Path $tools 'bin');$env:Path"
  Write-Log "protoc ready: $env:PROTOC"
}

function Try-Prebuilt {
  try {
    $arch = if ([Environment]::Is64BitOperatingSystem) {
      if ($env:PROCESSOR_ARCHITECTURE -match "ARM") { "aarch64" } else { "x86_64" }
    } else { "x86_64" }
    $asset = "logan-windows-$arch.exe"
    $api = "https://api.github.com/repos/$GitHubRepo/releases/latest"
    $rel = Invoke-RestMethod -Uri $api -ErrorAction Stop
    $tag = $rel.tag_name
    if (-not $tag) { return $false }
    $url = "https://github.com/$GitHubRepo/releases/download/$tag/$asset"
    Write-Log "Trying prebuilt $asset @ $tag…"
    Ensure-Dir $ManagedBin
    $dest = Join-Path $ManagedBin "logan.exe"
    Invoke-WebRequest -Uri $url -OutFile "$dest.dl" -ErrorAction Stop
    Move-Item -Force "$dest.dl" $dest
    return $dest
  } catch {
    return $false
  }
}

function Resolve-Repo {
  # Records the resolved path in $script:LoganInstallDir - Seed-Config reads it
  # to refresh the skills catalog (it was previously never set, so the catalog
  # silently never seeded on Windows).
  if ($env:LOGAN_INSTALL_SRC -and (Test-Path (Join-Path $env:LOGAN_INSTALL_SRC "Cargo.toml"))) {
    $script:LoganInstallDir = (Resolve-Path $env:LOGAN_INSTALL_SRC).Path
    return $script:LoganInstallDir
  }
  Ensure-Git
  Ensure-Dir (Split-Path $InstallDir -Parent)
  # git stdout MUST be swallowed here: a PowerShell function returns ALL
  # pipeline output, so stray "Already up to date." lines would be prepended
  # to the returned path and corrupt every Join-Path downstream.
  if (Test-Path (Join-Path $InstallDir ".git")) {
    Write-Log "Updating $InstallDir…"
    # Managed clone: local edits must never block updates (checkout+pull
    # refuses silently on a dirty tree, leaving a stale source). Fetch the
    # ref and hard-reset to exactly what origin has.
    git -C $InstallDir fetch --depth 1 origin $LoganRef 2>$null | Out-Null
    git -C $InstallDir reset --hard FETCH_HEAD 2>$null | Out-Null
  } else {
    Write-Log "Cloning $LoganRepo → $InstallDir…"
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    git clone --depth 1 --branch $LoganRef $LoganRepo $InstallDir | Out-Null
  }
  if (-not (Test-Path (Join-Path $InstallDir "Cargo.toml"))) {
    Die "clone failed: no Cargo.toml"
  }
  $script:LoganInstallDir = $InstallDir
  return $InstallDir
}

function Seed-Config {
  Ensure-Dir (Join-Path $LoganHome "memory")
  Ensure-Dir (Join-Path $LoganHome "hooks\bin")
  Ensure-Dir (Join-Path $LoganHome "skills")
  Ensure-Dir (Join-Path $LoganHome "sessions")
  $config = Join-Path $LoganHome "config.toml"
  if (-not (Test-Path $config)) {
    @"
# Logan config - Yuval Avidani (YUV.AI)
# Auth: logan login  OR  `$env:XAI_API_KEY=...

[memory]
enabled = true

[memory.session]
save_on_end = true

[memory.dream]
enabled = true

[memory.initial_injection]
enabled = true

[compat.claude]
skills = true
rules = true
agents = true
mcps = true
hooks = true

[compat.cursor]
skills = true
rules = true
agents = true
mcps = true
hooks = true

[cli]
installer = "internal"
use_leader = false

[ui]
permission_mode = "always-approve"
yolo = false
"@ | Set-Content -Path $config -Encoding UTF8
    Write-Log "Wrote $config"
  }

  Ensure-Dir (Join-Path $LoganHome "rules")
  Ensure-Dir (Join-Path $LoganHome "skills")
  Ensure-Dir (Join-Path $LoganHome "catalog\skills")
  $modes = Join-Path $LoganHome "modes.toml"
  if (-not (Test-Path $modes)) {
    @"
# All OFF by default. Opt-in: /skills add pack modes then /think or /caveman
[modes]
caveman = "off"
ponytail = "off"
think = "off"
"@ | Set-Content -Path $modes -Encoding UTF8
  }
  $impr = Join-Path $LoganHome "memory\IMPROVEMENTS.md"
  if (-not (Test-Path $impr)) {
    "# IMPROVEMENTS`n" | Set-Content -Path $impr -Encoding UTF8
  }
  # Self-improvement hooks: retrospective evidence capture (failed tools,
  # denied permissions, API errors -> IMPROVEMENTS.md at session end).
  # Managed files - safe to refresh on every install.
  if ($script:LoganInstallDir) {
    $srcHooks = Join-Path $script:LoganInstallDir "examples\hooks"
    if (Test-Path (Join-Path $srcHooks "retrospective.json")) {
      Copy-Item -Force (Join-Path $srcHooks "retrospective.json") (Join-Path $LoganHome "hooks\")
      Copy-Item -Force (Join-Path $srcHooks "bin\retro-insight.py") (Join-Path $LoganHome "hooks\bin\")
      Write-Log "Retrospective hooks installed (session-end insights -> ~/.logan/memory/IMPROVEMENTS.md)"
    }
  }

  # Catalog only (not active). User: /skills add …
  if ($script:LoganInstallDir -and (Test-Path (Join-Path $script:LoganInstallDir "skills"))) {
    $srcSkills = Join-Path $script:LoganInstallDir "skills"
    Get-ChildItem -Directory $srcSkills | ForEach-Object {
      $dest = Join-Path $LoganHome "catalog\skills\$($_.Name)"
      Ensure-Dir $dest
      Copy-Item -Path (Join-Path $_.FullName "*") -Destination $dest -Recurse -Force
    }
    Write-Log "Catalog refreshed (skills not auto-enabled). In Logan: /skills catalog"
  }
  if ($env:LOGAN_SEED_SKILLS -eq "1" -or $env:LOGAN_SEED_SKILLS -eq "true") {
    $cat = Join-Path $LoganHome "catalog\skills"
    if (Test-Path $cat) {
      Get-ChildItem -Directory $cat | ForEach-Object {
        $dest = Join-Path $LoganHome "skills\$($_.Name)"
        Ensure-Dir $dest
        Copy-Item -Path (Join-Path $_.FullName "*") -Destination $dest -Recurse -Force
      }
      Write-Log "LOGAN_SEED_SKILLS=1 → installed catalog into active skills"
    }
  }
}

# ---------- main ----------
Write-Log "Logan one-command install (YUV.AI) - Windows"
Write-Log "home: $LoganHome"
Add-UserPath $LocalBin
Ensure-Dir $LoganHome
Ensure-Dir $ManagedBin

$binSrc = $null
$pre = Try-Prebuilt
if ($pre -and (Test-Path $pre)) {
  $binSrc = $pre
} else {
  $repo = Resolve-Repo
  $release = Join-Path $repo "target\release\logan.exe"
  # Reuse only a FRESH build: an exe older than the checked-out HEAD commit is
  # stale (git pull just brought new code) and reinstalling it means /update
  # silently never updates.
  $releaseFresh = $false
  if (Test-Path $release) {
    $headTime = [int64](git -C $repo log -1 --format=%ct 2>$null)
    $exeTime = [DateTimeOffset]::new((Get-Item $release).LastWriteTimeUtc).ToUnixTimeSeconds()
    $releaseFresh = ($headTime -eq 0) -or ($exeTime -ge $headTime)
  }
  if ($releaseFresh -and $env:LOGAN_FORCE_BUILD -ne "1") {
    Write-Log "Using existing build $release"
    $binSrc = $release
  } else {
    Ensure-Rust
    Ensure-MsvcBuildTools
    Ensure-Protoc
    Write-Log "Building Logan release (can take several minutes)…"
    # One-shot installer build: the incremental cache only wastes disk here
    # and adds PDB pressure. CI builds the same way.
    $env:CARGO_INCREMENTAL = "0"
    $buildLog = Join-Path $env:TEMP "logan-install-build-$PID.log"
    Push-Location $repo
    try {
      # cmd merges cargo's stderr progress into stdout so Windows PowerShell
      # 5.1 never wraps it in ErrorRecords (ErrorActionPreference=Stop would
      # otherwise abort on the first progress line).
      cmd /c "cargo build -p xai-grok-pager-bin --release 2>&1" | Tee-Object -FilePath $buildLog
      if ($LASTEXITCODE -ne 0) {
        if (Select-String -Path $buildLog -Pattern "LNK1318" -Quiet) {
          # The MSVC 14.44 (VS 17.14) PDB writer can die with "LNK1318:
          # Unexpected PDB error; LIMIT" on very large Rust binaries. The exe
          # itself is fine - retry the final link without a PDB. Extra flags
          # via `cargo rustc` hit only the bin crate, so nothing else rebuilds.
          Write-Log "Linker PDB bug (LNK1318) - retrying final link with /DEBUG:NONE…"
          cmd /c "cargo rustc -p xai-grok-pager-bin --release --bin logan -- -Clink-arg=/DEBUG:NONE 2>&1"
        }
        if ($LASTEXITCODE -ne 0) {
          Die "cargo build failed (exit $LASTEXITCODE). Scroll up for the first 'error:' line. Common causes: incomplete Visual Studio C++ tools ('LNK1104: cannot open file libcmt.lib' - install 'Desktop development with C++'), or missing protoc (set `$env:PROTOC)."
        }
      }
    } finally {
      Pop-Location
      Remove-Item $buildLog -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path $release)) {
      Die "build finished but $release missing. If cargo failed on protoc, install protoc or set `$env:PROTOC."
    }
    $binSrc = $release
  }
}

$destLocal = Join-Path $LocalBin "logan.exe"
$destManaged = Join-Path $ManagedBin "logan.exe"
Install-Binary $binSrc $destLocal
Install-Binary $binSrc $destManaged
# Also install bare name for Git Bash users who expect `logan`
$destLocalBare = Join-Path $LocalBin "logan"
try { Copy-Item -Force $destLocal $destLocalBare } catch { }

Seed-Config

Write-Log "Installed:"
& $destLocal --version
if ($LASTEXITCODE -ne 0) { Die "logan --version failed" }
Write-Log "  $destLocal"
Write-Log "  $destManaged"

Write-Host ""
Write-Host "Next:"
Write-Host "  logan login"
Write-Host "  logan"
Write-Host "  /stats          # after a turn"
Write-Host "  /context deep"
Write-Host ""

if (Test-Interactive) {
  Write-Log "Starting Logan…"
  # Only free-console path (Start-LoganFreeConsole). Never call-operator start.
  Start-LoganFreeConsole -Binary $destLocal -Cwd (Get-Location).Path
} else {
  Write-Log "Non-interactive install complete. Run: $destLocal"
}
