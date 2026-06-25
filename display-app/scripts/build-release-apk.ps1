# Build a release APK for the Norebox Display (Capacitor) app.
# Uses Android Studio's JBR if present (Gradle 8+ needs Java 11+).
# Web assets must come from build:tv (dist-tv), not vite build (dist).

$ErrorActionPreference = "Stop"
$appRoot = Split-Path $PSScriptRoot -Parent
Set-Location $appRoot

$androidDir = Join-Path $appRoot "android"
if (-not (Test-Path $androidDir)) {
  Write-Host "Error: android/ folder not found." -ForegroundColor Red
  Write-Host "Run from display-app: npx cap add android" -ForegroundColor Yellow
  Write-Host "Or use setup-display-tv.ps1 from the repo root." -ForegroundColor Yellow
  exit 1
}

$jbr = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path $jbr) {
  $env:JAVA_HOME = $jbr
  $env:PATH = "$jbr\bin;$env:PATH"
  Write-Host "Using JAVA_HOME: $jbr"
} elseif (-not $env:JAVA_HOME) {
  Write-Warning "JAVA_HOME not set and Android Studio JBR not found. Install JDK 17+ or Android Studio, then re-run."
}

Write-Host "[1/3] Building TV web bundle (dist-tv)..." -ForegroundColor Cyan
npm run build:tv
if ($LASTEXITCODE -ne 0) {
  Write-Host "Error: build:tv failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "[2/3] Syncing Capacitor (android)..." -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) {
  Write-Host "Error: cap sync android failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "[3/3] Assembling release APK..." -ForegroundColor Cyan
Set-Location $androidDir
.\gradlew.bat assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Error: assembleRelease failed." -ForegroundColor Red
  Write-Host "If the failure is about signing or keystore:" -ForegroundColor Yellow
  Write-Host "  - Configure a release keystore in android/app/build.gradle, or" -ForegroundColor Yellow
  Write-Host "  - Open android/ in Android Studio: Build -> Generate Signed Bundle / APK" -ForegroundColor Yellow
  exit $LASTEXITCODE
}

$apkRel = "app\build\outputs\apk\release\app-release.apk"
$full = Join-Path (Get-Location) $apkRel
if (-not (Test-Path $full)) {
  Write-Host "Error: APK not found at expected path:" -ForegroundColor Red
  Write-Host "  $full" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Release APK built successfully." -ForegroundColor Green
Write-Host "APK: $full" -ForegroundColor Green
