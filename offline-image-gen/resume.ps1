# Finishes the setup in order: packages first, then the model (one at a time, so the USB stick is not overloaded).
# Rerun any time; both scripts skip what is already done.
$AI = Split-Path -Parent $MyInvocation.MyCommand.Path
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$AI\install-fastsd.ps1"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$AI\get-model.ps1"
