# Capture filtered logcat from multiple TVs in parallel (one log file per device).
# Usage:
#   .\scripts\capture-all-tvs.ps1
#   .\scripts\capture-all-tvs.ps1 -Hours 2 -Serials "192.168.88.10:45351","192.168.88.14:45891"

param(
  [string[]]$Serials = @(),
  [int]$Hours = 1
)

$ErrorActionPreference = "Continue"
$scriptDir = $PSScriptRoot
$captureScript = Join-Path $scriptDir "capture-tv-logcat.ps1"

if (-not (Test-Path $captureScript)) {
  Write-Host "Missing $captureScript" -ForegroundColor Red
  exit 1
}

if ($Serials.Count -eq 0) {
  $Serials = adb devices | Select-String "^\d+\.\d+\.\d+\.\d+:\d+\s+device" | ForEach-Object {
    ($_.Line -split "\s+")[0]
  }
}

if ($Serials.Count -eq 0) {
  Write-Host "No wireless ADB devices found. Run: adb connect <IP>:<PORT>" -ForegroundColor Red
  exit 1
}

Write-Host "Starting $($Serials.Count) capture(s) for $Hours hour(s)..." -ForegroundColor Cyan
foreach ($serial in $Serials) {
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $captureScript,
    "-Serial", $serial,
    "-Hours", $Hours
  )
  Start-Process -FilePath "powershell.exe" -ArgumentList $args -WindowStyle Minimized
  Write-Host "  -> $serial"
}

Write-Host ""
Write-Host "Logs will appear under display-app\logs\ as tv-<ip>_<port>-<timestamp>.log" -ForegroundColor Green
