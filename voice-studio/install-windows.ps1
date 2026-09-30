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

    function Get-ErrorText($err) {
        $e = $err.Exception
        $text = ''
        if ($e.Response -and $e.Response.StatusCode) { $text = "HTTP $([int]$e.Response.StatusCode) $($e.Response.StatusCode)" }
        $msg = ("$($e.Message) $($e.InnerException.Message)" -replace '\s+', ' ').Trim()
        if ($msg) { $text = ("$text $msg").Trim() }
        if (-not $text) { $text = 'empty response (likely blocked by antivirus web protection or an internet filter)' }
        return $text
    }

    # Read the first 2 KB of a URL - enough to tell "works" from "blocked" without a big download.
    function Test-Url([string]$url) {
        try {
            $req = [System.Net.WebRequest]::Create($url)
            $req.AddRange(0, 2047)
            $req.Timeout = 30000
            $req.UserAgent = 'voice-studio-installer'
            $resp = $req.GetResponse()
            $stream = $resp.GetResponseStream()
            $buf = New-Object byte[] 2048
            $n = $stream.Read($buf, 0, $buf.Length)
            $resp.Close()
            if ($n -le 0) { return 'BLOCKED - empty response' }
            return 'OK'
        } catch {
            return "BLOCKED - $(Get-ErrorText $_)"
        }
    }

    function Test-Network {
        $checks = @(
            @('GitHub raw files (text)',   @("$base/files.txt"), $true),
            @('GitHub raw files (binary)', @("$base/vendor/chatterbox_tts-0.1.7-py3-none-any.whl"), $false),
            @('GitHub releases (uv)',      @('https://github.com/astral-sh/uv/releases/download/0.12.21/uv-x86_64-pc-windows-msvc.zip',
                                             'https://releases.astral.sh/github/uv/releases/download/0.12.21/uv-x86_64-pc-windows-msvc.zip'), $true),
            @('PyPI index',                @('https://pypi.org/simple/six/'), $true),
            @('PyPI packages (binary)',    @('https://files.pythonhosted.org/packages/b7/ce/149a00dd41f10bc29e5921b496af8b574d8413afcd5e30dfa0ed46c2cc5e/six-1.17.0-py2.py3-none-any.whl'), $true),
            @('Hugging Face models',       @('https://huggingface.co/ResembleAI/chatterbox/resolve/main/ve.pt'), 'later')
        )
        if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
            $checks += ,@('PyTorch CUDA builds', @('https://download.pytorch.org/whl/cu124/torch/'), $true)
        }
        # third column: $true = needed to install, $false = has a workaround, 'later' = needed only to create speech
        Write-Host 'Checking internet access ...'
        $blocked = @()
        $hfBlocked = $null
        foreach ($c in $checks) {
            $r = ''
            foreach ($url in $c[1]) {   # a check passes if any of its URLs works
                $r = Test-Url $url
                if ($r -eq 'OK') { break }
            }
            if ($r -ne 'OK' -and $c[2] -eq 'later') { $hfBlocked = $r; $r = "$r  (installing anyway - see the note at the end)" }
            elseif ($r -ne 'OK' -and -not $c[2]) { $r = "$r  (ok: will use the text copies instead)" }
            Write-Host ("  {0,-27} {1}" -f $c[0], $r)
            if ($r -ne 'OK' -and $c[2] -eq $true) { $blocked += $c[0] }
        }
        if ($blocked.Count -gt 0) {
            Write-Host ''
            Write-Host 'Some downloads are blocked on this computer, so the install cannot finish:' -ForegroundColor Red
            $blocked | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
            Write-Host 'Usual causes: antivirus web protection (e.g. Avast Web Shield / HTTPS scanning) or a filtered'
            Write-Host 'internet service. Allow these sites and run the installer again: github.com,'
            Write-Host 'raw.githubusercontent.com, objects.githubusercontent.com, release-assets.githubusercontent.com,'
            Write-Host 'releases.astral.sh, pypi.org, files.pythonhosted.org, huggingface.co, hf.co, download.pytorch.org'
            throw 'Blocked downloads - see the list above. Nothing else was changed.'
        }
        return $hfBlocked   # $null, or the Hugging Face error text (needed only to create speech)
    }

    # Download one repo file. If a binary download is blocked (antivirus / filters sometimes allow text but not
    # binaries), fetch its base64 text copy (<file>.b64, kept in the repo next to it) and decode it.
    function Save-RepoFile([string]$rel, [string]$dest) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "$base/$rel" -OutFile $dest
            return
        } catch {
            $first = Get-ErrorText $_
        }
        if ($rel -match '\.(whl|wav)$') {
            try {
                $b64 = (Invoke-WebRequest -UseBasicParsing -Uri "$base/$rel.b64").Content
                if ($b64 -is [byte[]]) { $b64 = [Text.Encoding]::ASCII.GetString($b64) }
                [IO.File]::WriteAllBytes($dest, [Convert]::FromBase64String(($b64 -replace '\s', '')))
                Write-Host "      (binary download blocked - used the text copy)"
                return
            } catch {
                throw "Could not download $rel`n  $base/$rel -> $first`n  $base/$rel.b64 -> $(Get-ErrorText $_)"
            }
        }
        throw "Could not download $rel`n  $base/$rel -> $first"
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

    $hfBlocked = Test-Network
    Write-Host ''
    Write-Host "Installing Claude Voice Studio into $dir"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Set-Content -LiteralPath (Join-Path $dir $marker) -Value 'Installed by Claude voice-studio install-windows.ps1'

    $manifestFile = Join-Path $dir 'files.txt'
    Save-RepoFile 'files.txt' $manifestFile
    $manifest = [IO.File]::ReadAllText($manifestFile)
    $files = $manifest -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') }
    $i = 0
    foreach ($rel in $files) {
        $i++
        Write-Host ("  [{0}/{1}] {2}" -f $i, $files.Count, $rel)
        $dest = Join-Path $dir ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        Save-RepoFile $rel $dest
    }

    # Run setup in a child process so the execution policy can't block the .ps1 file.
    $shell = (Get-Process -Id $PID).Path
    & $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'setup.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Setup failed (exit $LASTEXITCODE). Scroll up for the error." }

    $launcher = Join-Path $dir 'start-ui.bat'
    if ($onWindows) {
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
    }

    if ($hfBlocked) {
        Write-Host ''
        Write-Host 'Installed - but Hugging Face is blocked on this computer, and the voice models (~3 GB) come from there.' -ForegroundColor Yellow
        if ($hfBlocked -match 'NetFree') {
            Write-Host 'The block comes from NetFree. Ask NetFree to open these addresses:' -ForegroundColor Yellow
        } else {
            Write-Host 'Ask whoever controls the filter / antivirus to allow these addresses:' -ForegroundColor Yellow
        }
        Write-Host '    huggingface.co' -ForegroundColor Yellow
        Write-Host '    *.hf.co   (the download servers, e.g. us.aws.cdn.hf.co / cas-bridge.xethub.hf.co)' -ForegroundColor Yellow
        Write-Host 'After that, double-click "Claude Voice Studio" on the desktop - the first use downloads the models.' -ForegroundColor Yellow
    } elseif ($onWindows) {
        Write-Host 'Opening the web UI (a console window stays open while it runs) ...'
        Start-Process -FilePath $launcher -WorkingDirectory $dir
    }
}

Install-VoiceStudio
