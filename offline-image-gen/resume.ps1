# Finishes the setup: installs the packages while the model downloads, then makes a test image.
# Rerun any time; every step skips what is already done. Log: resume.log.
$AI = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Transcript -Path "$AI\resume.log" -Append | Out-Null
$ps = 'powershell.exe'
# The model download (large files, mostly waiting on the network) runs next to the package install
# (many small files, mostly waiting on the drive), so the two overlap instead of queueing.
# PowerShell 5.1 does not quote -ArgumentList items, so the path is quoted here (folders with spaces).
$model = Start-Process $ps -WindowStyle Hidden -PassThru -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "{0}\get-model.ps1"' -f $AI)
$null = $model.Handle  # without this, PowerShell 5.1 may never report the exit code
& $ps -NoProfile -ExecutionPolicy Bypass -File "$AI\install-fastsd.ps1"
$installOk = ($LASTEXITCODE -eq 0)
if (-not $model.HasExited) { Write-Host "`nWaiting for the model download to finish (progress in get-model.log)" }
$model.WaitForExit()
$modelOk = ($model.ExitCode -eq 0)
Write-Host ("`nPackages: {0}" -f $(if ($installOk) { 'OK' } else { 'FAILED, see install.log' }))
Write-Host ("Model: {0}" -f $(if ($modelOk) { 'OK' } else { 'FAILED, see get-model.log' }))
if (-not $modelOk) { Get-Content "$AI\get-model.log" -Tail 8 | Out-Host }
if (-not ($installOk -and $modelOk)) { Write-Host 'Run resume.ps1 again to continue.'; Stop-Transcript | Out-Null; exit 1 }

Write-Host "`n== Making a test image (the first one takes a few minutes)"
$env:HF_HOME = "$AI\cache\hf"
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:TMP = "$AI\cache\tmp"
$env:TEMP = $env:TMP
$log = "$AI\test-image.log"
& "$AI\fastsdcpu\env\Scripts\python.exe" "$AI\test-image.py" 2>&1 | ForEach-Object { "$_" } | Out-File -Encoding utf8 $log
$testOk = ($LASTEXITCODE -eq 0)
$result = Select-String -Path $log -Pattern '^RESULT' | Select-Object -Last 1
if ($testOk -and $result) {
  Write-Host $result.Line
  Write-Host 'All set. Start the app with start-fastsd.bat'
} else {
  Write-Host 'FAILED: test image, see test-image.log'
  Get-Content $log -Tail 15 | Out-Host
  Stop-Transcript | Out-Null
  exit 1
}
Stop-Transcript | Out-Null
