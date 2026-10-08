# Finishes the setup: installs the packages while the model downloads, then makes a test image.
# Rerun any time; every step skips what is already done.
$AI = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps = 'powershell.exe'
# The model download (large files, mostly waiting on the network) runs next to the package install
# (many small files, mostly waiting on the drive), so the two overlap instead of queueing.
$model = Start-Process $ps -WindowStyle Hidden -PassThru -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$AI\get-model.ps1"
$null = $model.Handle  # without this, PowerShell 5.1 may never report the exit code
& $ps -NoProfile -ExecutionPolicy Bypass -File "$AI\install-fastsd.ps1"
$installOk = ($LASTEXITCODE -eq 0)
$model.WaitForExit()
$modelOk = ($model.ExitCode -eq 0)
if ($installOk -and $modelOk) {
  $env:HF_HOME = "$AI\cache\hf"
  $env:HF_HUB_OFFLINE = '1'
  $env:TRANSFORMERS_OFFLINE = '1'
  $env:TMP = "$AI\cache\tmp"
  $env:TEMP = $env:TMP
  & "$AI\fastsdcpu\env\Scripts\python.exe" "$AI\test-image.py" *> "$AI\test-image.log"
} else {
  "Not testing: install ok=$installOk, model ok=$modelOk. Run resume.ps1 again." | Set-Content "$AI\test-image.log"
}
