# Downloads the image model (SDXS-512 + TAESD, about 3GB) from this repo's GitHub Release into the
# Hugging Face cache next to this script, so FastSD CPU finds it with no internet.
# NetFree blocks Hugging Face downloads but lets GitHub release downloads through.
# Rerun any time: finished files are skipped and partial downloads resume.
$ErrorActionPreference = 'Continue'
$AI = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Transcript -Path "$AI\get-model.log" -Append | Out-Null
# Keep the computer awake while downloading
Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
[Win32.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null

$base = 'https://github.com/shimi0556-bit/-/releases/download/sdxs-models-v1'
$hub = "$AI\cache\hf\hub"
$tmp = "$AI\cache\model-download"
$partSize = 524288000
New-Item -ItemType Directory -Force -Path $hub, $tmp | Out-Null
# Git for Windows can add a second curl.exe; take the first one
$curl = (Get-Command curl.exe | Select-Object -First 1).Source

# Downloads one release asset to $out, resuming, until it has $size bytes.
function Get-Asset($name, $out, $size) {
  for ($i = 1; $i -le 200; $i++) {
    $have = 0
    if (Test-Path $out) { $have = (Get-Item $out).Length }
    if ($have -eq $size) { return $true }
    if ($have -gt $size) { Remove-Item $out; $have = 0 }
    Write-Host ("{0}  {1}  {2:N0} of {3:N0} MB (attempt {4})" -f (Get-Date -Format HH:mm:ss), $name, ($have / 1MB), ($size / 1MB), $i)
    # No curl --retry: it throws away the bytes of a failed attempt; this loop resumes from them instead
    & $curl -f -sS -L -C - --connect-timeout 30 --speed-limit 1 --speed-time 120 -o $out "$base/$name"
    # Wait a minute after a failure (connection drop) and try again
    if ($LASTEXITCODE -ne 0) { Start-Sleep 60 }
  }
  return $false
}

# True when every line is "<name> <size> <sha256> <parts> <dest>" and the last one (the license) arrived,
# so a manifest cut off by a dropped connection is never used.
function Test-Manifest($path) {
  $lines = @(Get-Content $path | Where-Object { $_ -ne '' })
  if ($lines.Count -eq 0) { return $false }
  foreach ($l in $lines) {
    if ($l -notmatch '^\S+ \d+ [0-9a-f]{64} \S+ \S+$') { return $false }
  }
  return ($lines[-1] -like 'LICENSE-* * -')
}

Write-Host "`n== Reading the file list from GitHub"
$manifest = "$tmp\manifest.txt"
$gotManifest = $false
for ($i = 1; $i -le 20; $i++) {
  if (Test-Path $manifest) { Remove-Item $manifest }
  # -f: never keep an error page as the manifest
  $code = & $curl -f -sS -L --connect-timeout 30 --max-time 120 -o $manifest -w '%{http_code}' "$base/manifest.txt"
  if ($LASTEXITCODE -eq 0 -and $code -eq '200' -and (Test-Manifest $manifest)) { $gotManifest = $true; break }
  if ($code -eq '418') { Write-Host 'BLOCKED by NetFree: github.com release downloads. Ask NetFree to open github.com releases.'; Stop-Transcript | Out-Null; exit 1 }
  Write-Host "No complete answer yet (HTTP $code, curl exit $LASTEXITCODE), retrying in 30s"; Start-Sleep 30
}
if (-not $gotManifest) { Write-Host 'FAILED: could not get manifest.txt'; Stop-Transcript | Out-Null; exit 1 }

$allOk = $true
$entries = 0
foreach ($line in Get-Content $manifest) {
  $f = $line -split ' '
  if ($f.Count -ne 5) { continue }
  $name = $f[0]; $size = [int64]$f[1]; $sha = $f[2]; $parts = $f[3] -split ','; $dest = $f[4]
  if ($dest -eq '-') { continue }
  $entries++
  $final = Join-Path $hub ($dest -replace '/', '\')
  # snapshots\<commit>\... also needs refs\main = <commit> so the model is found offline by its name
  if ($dest -match '^(models--[^/]+)/snapshots/([0-9a-f]{40})/') {
    $refs = Join-Path $hub "$($Matches[1])\refs"
    New-Item -ItemType Directory -Force -Path $refs | Out-Null
    [IO.File]::WriteAllText("$refs\main", $Matches[2])
  }
  if ((Test-Path $final) -and (Get-Item $final).Length -eq $size) { continue }

  Write-Host "`n== $name"
  $ok = $true
  for ($p = 0; $p -lt $parts.Count; $p++) {
    $want = $size
    if ($parts.Count -gt 1) { $want = [math]::Min($partSize, $size - $p * $partSize) }
    if (-not (Get-Asset $parts[$p] "$tmp\$($parts[$p])" $want)) { $ok = $false; break }
  }
  if (-not $ok) { Write-Host "FAILED: $name"; $allOk = $false; continue }

  $joined = "$tmp\$($parts[0])"
  if ($parts.Count -gt 1) {
    Write-Host 'Joining parts'
    $joined = "$tmp\$name"
    $out = [IO.File]::Create($joined)
    foreach ($part in $parts) {
      $in = [IO.File]::OpenRead("$tmp\$part")
      $in.CopyTo($out, 4MB)
      $in.Close()
    }
    $out.Close()
  }
  Write-Host 'Checking sha256'
  $got = (Get-FileHash -Algorithm SHA256 $joined).Hash.ToLower()
  if ($got -ne $sha) {
    Write-Host "FAILED: $name is damaged (sha256 $got), it will be downloaded again on the next run"
    Remove-Item $joined
    foreach ($part in $parts) { Remove-Item "$tmp\$part" -ErrorAction SilentlyContinue }
    $allOk = $false
    continue
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $final) | Out-Null
  Move-Item -Force $joined $final
  foreach ($part in $parts) { Remove-Item "$tmp\$part" -ErrorAction SilentlyContinue }
}

if ($entries -eq 0) { $allOk = $false }
if ($allOk) { Write-Host "`n== MODEL DONE" } else { Write-Host "`n== MODEL INCOMPLETE, run this script again" }
Stop-Transcript | Out-Null
if (-not $allOk) { exit 1 }
