# Script to build and upload APK to update server
param(
    [Parameter(Mandatory=$true)]
    [string]$AppName,
    
    [string]$UpdateServer = "http://localhost:8000",
    [string]$ReleaseNotes = "Auto-generated update"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building and Uploading $AppName" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$appPath = Join-Path $PSScriptRoot ".." $AppName
$backendPath = Join-Path $PSScriptRoot ".." "backend"
$apkStorage = Join-Path $backendPath "apk_storage"

# Check if app directory exists
if (-not (Test-Path $appPath)) {
    Write-Host "Error: App directory not found: $appPath" -ForegroundColor Red
    exit 1
}

# Create APK storage directory
New-Item -ItemType Directory -Force -Path $apkStorage | Out-Null

Write-Host "[1/4] Building $AppName..." -ForegroundColor Yellow
Set-Location $appPath

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Gray
    npm install
}

# Build the app
Write-Host "Running build..." -ForegroundColor Gray
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "[2/4] Building APK..." -ForegroundColor Yellow

# Check if Capacitor is set up
if (-not (Test-Path "android")) {
    Write-Host "Capacitor not set up. Setting up now..." -ForegroundColor Yellow
    
    # Install Capacitor if not installed
    if (-not (Test-Path "node_modules/@capacitor")) {
        npm install @capacitor/core @capacitor/cli @capacitor/android
    }
    
    # Initialize if needed
    if (-not (Test-Path "capacitor.config.js")) {
        $appId = if ($AppName -eq "tablet-app") { "com.norebox.tablet" } else { "com.norebox.display" }
        $appDisplayName = if ($AppName -eq "tablet-app") { "Norebox Tablet" } else { "Norebox Display" }
        npx cap init $appDisplayName $appId
    }
    
    npx cap add android
}

# Sync Capacitor
Write-Host "Syncing Capacitor..." -ForegroundColor Gray
npx cap sync

# Build APK
Set-Location android
Write-Host "Building APK (this may take a while)..." -ForegroundColor Gray
./gradlew assembleRelease

if ($LASTEXITCODE -ne 0) {
    Write-Host "APK build failed!" -ForegroundColor Red
    exit 1
}

Set-Location ..

# Find the APK
$apkPath = Join-Path $appPath "android" "app" "build" "outputs" "apk" "release" "app-release.apk"

if (-not (Test-Path $apkPath)) {
    Write-Host "Error: APK not found at $apkPath" -ForegroundColor Red
    exit 1
}

Write-Host "[3/4] Getting version..." -ForegroundColor Yellow

# Get version from package.json
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$version = $packageJson.version

if (-not $version -or $version -eq "0.0.0") {
    # Generate version from timestamp
    $version = "1.0." + [int](Get-Date -UFormat "%Y%m%d%H%M")
    Write-Host "No version in package.json, using: $version" -ForegroundColor Yellow
}

$apkFilename = "$AppName-v$version.apk"
$targetApkPath = Join-Path $apkStorage $apkFilename

Write-Host "[4/4] Uploading APK..." -ForegroundColor Yellow

# Copy APK to storage
Copy-Item $apkPath $targetApkPath -Force

# Get file size
$fileSize = (Get-Item $targetApkPath).Length

# Create manifest
$manifest = @{
    version = $version
    app_name = $AppName
    apk_filename = $apkFilename
    release_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    release_notes = $ReleaseNotes
    force_update = $false
    file_size = $fileSize
} | ConvertTo-Json -Depth 10

$manifestPath = Join-Path $apkStorage "${AppName}_manifest.json"
$manifest | Out-File -FilePath $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ Upload Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "App: $AppName" -ForegroundColor White
Write-Host "Version: $version" -ForegroundColor White
Write-Host "APK: $apkFilename" -ForegroundColor White
Write-Host "Size: $([math]::Round($fileSize / 1MB, 2)) MB" -ForegroundColor White
Write-Host "Location: $targetApkPath" -ForegroundColor White
Write-Host ""
Write-Host "Devices will automatically check for this update!" -ForegroundColor Cyan

