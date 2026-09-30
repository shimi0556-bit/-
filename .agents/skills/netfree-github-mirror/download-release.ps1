# Download the files of a GitHub Release made by mirror-release.yml (netfree-github-mirror skill): reads
# manifest.txt, downloads each file's parts (curl.exe with resume when available, else Invoke-WebRequest), joins them,
# checks the sha256 and puts the file in -Dest. Re-running skips finished files and resumes partial parts.
# Windows PowerShell 5.1+ (also PowerShell 7 on Linux/macOS). Keep this file ASCII-only.
#
#   powershell -ExecutionPolicy Bypass -File download-release.ps1 `
#       -Release https://github.com/<owner>/<repo>/releases/download/<tag> -Dest C:\path\to\folder [-Only a.bin,b.bin]
#
# -Manifest defaults to manifest.txt (voice-studio's release uses models-manifest.txt).

param(
    [Parameter(Mandatory = $true)] [string]$Release,
    [Parameter(Mandatory = $true)] [string]$Dest,
    [string[]]$Only = @(),
    [string]$Manifest = 'manifest.txt'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Release = $Release.TrimEnd('/')
# With -File, "-Only a,b" arrives as one string "a,b" (arrays are only parsed by -Command), so split it here.
$Only = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$onWindows = $env:OS -eq 'Windows_NT'

# First match only: PATH can hold several curl.exe (Git for Windows ships one). On Windows PowerShell, plain
# "curl" is an alias for Invoke-WebRequest, hence curl.exe.
$curl = Get-Command curl.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $curl -and -not $onWindows) {
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

$text = (Invoke-WebRequest -UseBasicParsing -Uri "$Release/$Manifest").Content
if ($text -is [byte[]]) { $text = [Text.Encoding]::ASCII.GetString($text) }
$partSize = [int64]524288000   # mirror-release.yml splits with `split -b 500M`
$listed = @($text -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { ($_.Trim() -split '\s+')[0] })
$unknown = @($Only | Where-Object { $listed -notcontains $_ })
if ($unknown.Count -gt 0) { throw "Not in $Manifest : $($unknown -join ', ') (it lists: $($listed -join ', '))" }

$partsDir = Join-Path $Dest 'download-parts'   # parts wait here until their joined file is verified
New-Item -ItemType Directory -Force -Path $Dest, $partsDir | Out-Null

foreach ($line in ($text -split "`r?`n" | Where-Object { $_.Trim() })) {
    $name, $size, $sha, $parts = $line.Trim() -split '\s+'
    if ($Only.Count -gt 0 -and $Only -notcontains $name) { continue }
    $target = Join-Path $Dest $name
    if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -eq [int64]$size) {
        Write-Host "  $name - already downloaded"
        continue
    }
    $partList = @($parts -split ',')
    Write-Host ("  {0} ({1:N0} MB, {2} part(s))" -f $name, ([int64]$size / 1MB), $partList.Count)
    for ($i = 0; $i -lt $partList.Count; $i++) {
        $partFile = Join-Path $partsDir $partList[$i]
        if ($partList.Count -eq 1) { $expected = [int64]$size }
        elseif ($i -lt $partList.Count - 1) { $expected = $partSize }
        else { $expected = [int64]$size - $partSize * ($partList.Count - 1) }
        if ((Test-Path -LiteralPath $partFile) -and (Get-Item -LiteralPath $partFile).Length -eq $expected) { continue }
        Save-Asset "$Release/$($partList[$i])" $partFile
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
    $partList | ForEach-Object { Remove-Item -LiteralPath (Join-Path $partsDir $_) -ErrorAction SilentlyContinue }
    if ($actual -ne $sha) {
        Remove-Item -LiteralPath $tmp
        throw "$name is corrupted (sha256 $actual, expected $sha) - run again"
    }
    Move-Item -LiteralPath $tmp -Destination $target -Force
}
Remove-Item -LiteralPath $partsDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'All files downloaded and verified.'
