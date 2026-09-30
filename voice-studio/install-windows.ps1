# One-line installer for Windows. Paste into PowerShell:
#
#   [Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/shimi0556-bit/-/refs/heads/claude/exciting-cannon-7hsu15/voice-studio/install-windows.ps1 | iex
#
# Downloads voice-studio into %USERPROFILE%\voice-studio (override with $env:VOICE_STUDIO_DIR), runs setup.ps1,
# adds a "Voice Studio" desktop shortcut and opens the web UI. Re-running it updates the code; your saved voices
# (voices\) and downloaded models are kept. Keep this file ASCII-only (Windows PowerShell 5.1).

function Install-VoiceStudio {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $ref = 'refs/heads/claude/exciting-cannon-7hsu15'
    if ($env:VOICE_STUDIO_REF) { $ref = $env:VOICE_STUDIO_REF }
    $base = "https://raw.githubusercontent.com/shimi0556-bit/-/$ref/voice-studio"
    $dir = Join-Path $HOME 'voice-studio'
    if ($env:VOICE_STUDIO_DIR) { $dir = $env:VOICE_STUDIO_DIR }
    $onWindows = $env:OS -eq 'Windows_NT'

    Write-Host "Installing voice-studio into $dir"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null

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
        try {
            $desktop = [Environment]::GetFolderPath('Desktop')
            $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Voice Studio.lnk'))
            $shortcut.TargetPath = Join-Path $dir 'start-ui.bat'
            $shortcut.WorkingDirectory = $dir
            $shortcut.Description = 'voice-studio web UI'
            $shortcut.Save()
            Write-Host 'Added a "Voice Studio" shortcut to the desktop.'
        } catch {
            Write-Host "Could not create the desktop shortcut: $($_.Exception.Message)"
        }
        Write-Host 'Opening the web UI (a console window stays open while it runs) ...'
        Start-Process -FilePath (Join-Path $dir 'start-ui.bat') -WorkingDirectory $dir
    }
}

Install-VoiceStudio
