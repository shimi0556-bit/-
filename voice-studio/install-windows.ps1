# One-line installer for Windows. Paste into PowerShell (or double-click install-windows.bat, which runs it):
#
#   [Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/shimi0556-bit/-/refs/heads/claude/exciting-cannon-7hsu15/voice-studio/install-windows.ps1 | iex
#
# Downloads voice-studio into %USERPROFILE%\claude-voice-studio (override with $env:VOICE_STUDIO_DIR), runs setup.ps1,
# adds a "Claude Voice Studio" desktop shortcut and opens the web UI. Re-running it updates the code; your saved voices
# (voices\) and downloaded models are kept. It only ever writes into a folder it created itself (marked with
# .claude-voice-studio), so an unrelated program with a similar name is never touched.
# Keep this file ASCII-only (Windows PowerShell 5.1).

function Install-VoiceStudio {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $ref = 'refs/heads/claude/exciting-cannon-7hsu15'
    if ($env:VOICE_STUDIO_REF) { $ref = $env:VOICE_STUDIO_REF }
    $base = "https://raw.githubusercontent.com/shimi0556-bit/-/$ref/voice-studio"
    $marker = '.claude-voice-studio'
    $onWindows = $env:OS -eq 'Windows_NT'

    function Test-OurFolder([string]$path) {
        if (Test-Path -LiteralPath (Join-Path $path $marker)) { return $true }
        # the first version of this installer wrote no marker; recognise its files instead
        return (Test-Path -LiteralPath (Join-Path $path 'voice.py')) -and
               (Test-Path -LiteralPath (Join-Path $path 'presets/narrator_deep/voice.json'))
    }

    $dir = Join-Path $HOME 'claude-voice-studio'
    $legacy = Join-Path $HOME 'voice-studio'   # folder used by the first version of this installer
    if ($env:VOICE_STUDIO_DIR) {
        $dir = $env:VOICE_STUDIO_DIR
    } elseif (-not (Test-Path -LiteralPath $dir) -and (Test-Path -LiteralPath $legacy) -and (Test-OurFolder $legacy)) {
        $dir = $legacy   # update the earlier install in place instead of installing a second copy
    }

    if ((Test-Path -LiteralPath $dir) -and (Get-ChildItem -LiteralPath $dir -Force | Select-Object -First 1) -and
        -not (Test-OurFolder $dir)) {
        throw ("The folder $dir already exists and contains files from something else. Nothing was changed. " +
               "To install elsewhere, run first:  `$env:VOICE_STUDIO_DIR = 'C:\some\other\folder'")
    }

    Write-Host "Installing Claude Voice Studio into $dir"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Set-Content -LiteralPath (Join-Path $dir $marker) -Value 'Installed by Claude voice-studio install-windows.ps1'

    $manifest = (Invoke-WebRequest -UseBasicParsing -Uri "$base/files.txt").Content
    $files = $manifest -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') }
    $i = 0
    foreach ($rel in $files) {
        $i++
        Write-Host ("  [{0}/{1}] {2}" -f $i, $files.Count, $rel)
        $dest = Join-Path $dir ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        Invoke-WebRequest -UseBasicParsing -Uri "$base/$rel" -OutFile $dest
        if ($rel.EndsWith('.bat')) {
            # raw GitHub files have LF line endings; cmd.exe is happiest with CRLF
            $text = [IO.File]::ReadAllText($dest) -replace "`r?`n", "`r`n"
            [IO.File]::WriteAllText($dest, $text)
        }
    }

    # Run setup in a child process so the execution policy can't block the .ps1 file.
    $shell = (Get-Process -Id $PID).Path
    & $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'setup.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Setup failed (exit $LASTEXITCODE). Scroll up for the error." }

    if ($onWindows) {
        $launcher = Join-Path $dir 'start-ui.bat'
        try {
            $desktop = [Environment]::GetFolderPath('Desktop')
            $wsh = New-Object -ComObject WScript.Shell
            # remove the shortcut the first installer version made, but only if it points at this install
            $old = Join-Path $desktop 'Voice Studio.lnk'
            if ((Test-Path -LiteralPath $old) -and
                $wsh.CreateShortcut($old).TargetPath.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $old
            }
            $shortcut = $wsh.CreateShortcut((Join-Path $desktop 'Claude Voice Studio.lnk'))
            $shortcut.TargetPath = $launcher
            $shortcut.WorkingDirectory = $dir
            $shortcut.Description = 'Claude voice-studio web UI'
            $icon = Join-Path $env:SystemRoot 'System32\SndVol.exe'
            if (Test-Path -LiteralPath $icon) { $shortcut.IconLocation = "$icon,0" }
            $shortcut.Save()
            Write-Host 'Added a "Claude Voice Studio" shortcut (speaker icon) to the desktop.'
        } catch {
            Write-Host "Could not create the desktop shortcut: $($_.Exception.Message)"
        }
        Write-Host 'Opening the web UI (a console window stays open while it runs) ...'
        Start-Process -FilePath $launcher -WorkingDirectory $dir
    }
}

Install-VoiceStudio
