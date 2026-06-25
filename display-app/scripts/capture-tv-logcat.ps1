# Long-running logcat capture for Norebox Display (TV debugging).
# Usage:
#   .\scripts\capture-tv-logcat.ps1 -Serial "adb-24FAD4037DD4-rCAcxB._adb-tls-connect._tcp"
#   .\scripts\capture-tv-logcat.ps1 -Serial "192.168.88.17:35645" -Hours 5

param(
  [string]$Serial = "",
  [int]$Hours = 5
)

$ErrorActionPreference = "Continue"
$appRoot = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $appRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not $Serial) {
  $dev = adb devices -l | Select-String "device product" | Select-Object -First 1
  if (-not $dev) {
    Write-Host "No ADB device online. Run: adb connect <TV_IP>:<PORT>" -ForegroundColor Red
    exit 1
  }
  $Serial = ($dev -split "\s+")[0]
}

$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$safe = ($Serial -replace "[^a-zA-Z0-9._-]", "_")
$logFile = Join-Path $logDir "tv-$safe-$stamp.log"
$endAt = (Get-Date).AddHours($Hours)

Write-Host "Serial:  $Serial"
Write-Host "Log:     $logFile"
Write-Host "Until:   $endAt ($Hours h)"
Write-Host "Filter:  Capacitor/Console + app keywords"
Write-Host ""

"=== capture started $(Get-Date -Format o) serial=$Serial hours=$Hours ===" | Out-File $logFile -Encoding utf8

adb -s $Serial logcat -c 2>$null
adb -s $Serial shell am start -n com.norebox.display/.MainActivity 2>$null | Out-Null

$pattern = "Capacitor/Console|Capacitor|norebox\.display|\[STATE\]|\[HANDOFF\]|\[VIDEO\]|\[POLL\]|\[DRIVE\]|\[WATCHDOG\]|\[CACHE\]|\[PLAY FAILED\]|Request timeout|Failed to fetch|registration|enterSong|logo recovery|hard cut|SONG ended|skip detected|TV direct|low-power|prepareForNext|MediaCodec|Codec released|NO_MEMORY"

function Flush-NewLogLines {
  param([string]$RawPath, [ref]$Offset)
  if (-not (Test-Path $RawPath)) { return }
  $stream = [System.IO.File]::Open($RawPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    if ($Offset.Value -gt $stream.Length) { $Offset.Value = 0 }
    $stream.Seek($Offset.Value, [System.IO.SeekOrigin]::Begin) | Out-Null
    $reader = New-Object System.IO.StreamReader($stream)
    while ($null -ne ($line = $reader.ReadLine())) {
      if ($line -match $pattern) {
        Add-Content -Path $logFile -Value $line -Encoding utf8
        Write-Host $line
      }
    }
    $Offset.Value = $stream.Position
  } finally {
    $stream.Close()
  }
}

try {
  $rawPath = "$logFile.raw"
  $rawOffset = 0
  $proc = Start-Process -FilePath "adb" -ArgumentList @("-s", $Serial, "logcat", "-v", "time") `
    -RedirectStandardOutput $rawPath -NoNewWindow -PassThru

  while ((Get-Date) -lt $endAt) {
    Flush-NewLogLines -RawPath $rawPath -Offset ([ref]$rawOffset)
    if ($proc.HasExited) {
      "$(Get-Date -Format o) logcat exited code=$($proc.ExitCode), restarting..." | Add-Content $logFile
      Write-Host "logcat exited, restarting..."
      Start-Sleep -Seconds 3
      $rawOffset = 0
      $proc = Start-Process -FilePath "adb" -ArgumentList @("-s", $Serial, "logcat", "-v", "time") `
        -RedirectStandardOutput $rawPath -NoNewWindow -PassThru
    }
    Start-Sleep -Seconds 15
  }
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
} finally {
  Flush-NewLogLines -RawPath "$logFile.raw" -Offset ([ref]$rawOffset)
  "=== capture ended $(Get-Date -Format o) ===" | Add-Content $logFile
  Write-Host "Done. Filtered log: $logFile"
}
