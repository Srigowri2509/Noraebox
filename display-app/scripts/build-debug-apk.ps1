# Build a debug APK for the Norebox Display (Capacitor) app.
# Uses Android Studio's JBR if present (Gradle 8+ needs Java 11+).

$ErrorActionPreference = "Stop"
$appRoot = Split-Path $PSScriptRoot -Parent
Set-Location $appRoot

$jbr = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path $jbr) {
  $env:JAVA_HOME = $jbr
  $env:PATH = "$jbr\bin;$env:PATH"
  Write-Host "Using JAVA_HOME: $jbr"
} elseif (-not $env:JAVA_HOME) {
  Write-Warning "JAVA_HOME not set and Android Studio JBR not found. Install JDK 17+ or Android Studio, then re-run."
}

& (Join-Path $PSScriptRoot "patch-http-plugin.ps1")

npm run build:tv
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location android
.\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$full = Join-Path (Get-Location) "app\build\outputs\apk\debug\app-debug.apk"
Write-Host ""
Write-Host "Debug APK: $full" -ForegroundColor Green

$existing = Get-ChildItem -Path $appRoot -Filter "display-app-*.apk" -File -ErrorAction SilentlyContinue
$maxNum = 0
foreach ($f in $existing) {
  if ($f.BaseName -match '^display-app-(\d+)$') {
    $n = [int]$matches[1]
    if ($n -gt $maxNum) { $maxNum = $n }
  }
}

$nextNum = $maxNum + 1
$namedApk = Join-Path $appRoot ("display-app-{0}.apk" -f $nextNum)
Copy-Item -Path $full -Destination $namedApk -Force
Write-Host "Numbered APK: $namedApk" -ForegroundColor Cyan
