# Live filtered logcat for 192.168.88.15 — saves to logs/rock_08.06.26.log
# Usage:
#   .\scripts\rock_08.06.26.ps1
#   .\scripts\rock_08.06.26.ps1 -Hours 2

param(
  [string]$Serial = "adb-24FAD4037C73-NsMNdM._adb-tls-connect._tcp",
  [int]$Hours = 2,
  [string]$Exclude = "armed_upgrade_skip"
)

$ErrorActionPreference = "Continue"
$appRoot = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $appRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$logFile = Join-Path $logDir "rock_08.06.26-$stamp.log"
$endAt = (Get-Date).AddHours($Hours)
$pattern = '\[STATE\]|\[CACHE\]|\[HANDOFF\]|PLAY_FAILED|PLAY_SUCCESS|skip detected|transition -> song|FAIL'

Write-Host "Serial:  $Serial"
Write-Host "Log:     $logFile"
Write-Host "Until:   $endAt ($Hours h)"
Write-Host "Filter:  $pattern"
Write-Host "Exclude: $Exclude"
Write-Host ""

"=== rock_08.06.26 capture started $(Get-Date -Format o) serial=$Serial hours=$Hours ===" | Out-File $logFile -Encoding utf8

adb -s $Serial logcat -c 2>$null

try {
  $proc = Start-Process -FilePath "adb" -ArgumentList @("-s", $Serial, "logcat", "-v", "time") `
    -RedirectStandardOutput "$logFile.raw" -NoNewWindow -PassThru

  $offset = 0
  while ((Get-Date) -lt $endAt) {
    if (Test-Path "$logFile.raw") {
      $stream = [System.IO.File]::Open("$logFile.raw", [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
      try {
        if ($offset -gt $stream.Length) { $offset = 0 }
        $stream.Seek($offset, [System.IO.SeekOrigin]::Begin) | Out-Null
        $reader = New-Object System.IO.StreamReader($stream)
        while ($null -ne ($line = $reader.ReadLine())) {
          if ($line -match $pattern) {
            if ($Exclude -and $line -match [regex]::Escape($Exclude)) { continue }
            Add-Content -Path $logFile -Value $line -Encoding utf8
            Write-Host $line
          }
        }
        $offset = $stream.Position
      } finally {
        $stream.Close()
      }
    }

    if ($proc.HasExited) {
      "$(Get-Date -Format o) logcat exited code=$($proc.ExitCode), restarting..." | Add-Content $logFile
      Write-Host "logcat exited, restarting..."
      Start-Sleep -Seconds 3
      $offset = 0
      $proc = Start-Process -FilePath "adb" -ArgumentList @("-s", $Serial, "logcat", "-v", "time") `
        -RedirectStandardOutput "$logFile.raw" -NoNewWindow -PassThru
    }

    Start-Sleep -Seconds 5
  }

  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
} finally {
  "=== capture ended $(Get-Date -Format o) ===" | Add-Content $logFile
  Write-Host "Done. Filtered log: $logFile"
}
