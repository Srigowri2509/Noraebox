# Script to build and upload IPA to update server (requires Mac)
param(
    [Parameter(Mandatory=$true)]
    [string]$AppName,
    
    [string]$UpdateServer = "http://localhost:8000",
    [string]$ReleaseNotes = "Auto-generated update"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building and Uploading iOS App: $AppName" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  NOTE: This script must be run on a Mac with Xcode!" -ForegroundColor Yellow
Write-Host ""

$appPath = Join-Path $PSScriptRoot ".." $AppName
$backendPath = Join-Path $PSScriptRoot ".." "backend"
$ipaStorage = Join-Path $backendPath "apk_storage"

# Check if app directory exists
if (-not (Test-Path $appPath)) {
    Write-Host "Error: App directory not found: $appPath" -ForegroundColor Red
    exit 1
}

# Create IPA storage directory
New-Item -ItemType Directory -Force -Path $ipaStorage | Out-Null

Write-Host "[1/4] Building $AppName web assets..." -ForegroundColor Yellow
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

Write-Host "[2/4] Syncing Capacitor..." -ForegroundColor Yellow
npx cap sync ios

if ($LASTEXITCODE -ne 0) {
    Write-Host "Capacitor sync failed!" -ForegroundColor Red
    exit 1
}

Write-Host "[3/4] Building IPA in Xcode..." -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  MANUAL STEP REQUIRED:" -ForegroundColor Yellow
Write-Host "1. Open Xcode: npx cap open ios" -ForegroundColor White
Write-Host "2. Select your iPad as target device" -ForegroundColor White
Write-Host "3. Product → Archive" -ForegroundColor White
Write-Host "4. Distribute App → Development/Ad Hoc" -ForegroundColor White
Write-Host "5. Export IPA file" -ForegroundColor White
Write-Host ""
Write-Host "After exporting IPA, run this script again with -IpaPath parameter" -ForegroundColor Cyan
Write-Host ""

# Check if IPA path provided
$ipaPath = $null
if ($PSBoundParameters.ContainsKey('IpaPath')) {
    $ipaPath = $IpaPath
} else {
    Write-Host "No IPA path provided. Please build in Xcode first." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To continue after building IPA:" -ForegroundColor Cyan
    Write-Host "  .\scripts\upload-ipa.ps1 -AppName $AppName -IpaPath 'path/to/app.ipa'" -ForegroundColor White
    exit 0
}

if (-not (Test-Path $ipaPath)) {
    Write-Host "Error: IPA file not found: $ipaPath" -ForegroundColor Red
    exit 1
}

Write-Host "[4/4] Uploading IPA..." -ForegroundColor Yellow

# Get version from package.json
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$version = $packageJson.version

if (-not $version -or $version -eq "0.0.0") {
    # Generate version from timestamp
    $version = "1.0." + [int](Get-Date -UFormat "%Y%m%d%H%M")
    Write-Host "No version in package.json, using: $version" -ForegroundColor Yellow
}

$ipaFilename = "$AppName-v$version.ipa"
$targetIpaPath = Join-Path $ipaStorage $ipaFilename

# Copy IPA to storage
Copy-Item $ipaPath $targetIpaPath -Force

# Get file size
$fileSize = (Get-Item $targetIpaPath).Length

# Create manifest (same format as APK manifest)
$manifest = @{
    version = $version
    app_name = $AppName
    ipa_filename = $ipaFilename
    apk_filename = $ipaFilename  # For compatibility
    platform = "ios"
    release_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    release_notes = $ReleaseNotes
    force_update = $false
    file_size = $fileSize
} | ConvertTo-Json -Depth 10

$manifestPath = Join-Path $ipaStorage "${AppName}_manifest.json"
$manifest | Out-File -FilePath $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ Upload Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "App: $AppName" -ForegroundColor White
Write-Host "Platform: iOS" -ForegroundColor White
Write-Host "Version: $version" -ForegroundColor White
Write-Host "IPA: $ipaFilename" -ForegroundColor White
Write-Host "Size: $([math]::Round($fileSize / 1MB, 2)) MB" -ForegroundColor White
Write-Host "Location: $targetIpaPath" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  NOTE: iOS apps require manual installation via:" -ForegroundColor Yellow
Write-Host "   - TestFlight (for beta testing)" -ForegroundColor White
Write-Host "   - Enterprise distribution" -ForegroundColor White
Write-Host "   - Or direct install via Xcode" -ForegroundColor White

