# Script to update web assets for remote updates (no APK rebuild needed!)
param(
    [Parameter(Mandatory=$true)]
    [string]$AppName
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Updating Web Assets for $AppName" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$appPath = Join-Path (Join-Path $PSScriptRoot "..") $AppName
$backendPath = Join-Path $PSScriptRoot ".." "backend"
$webAssetsPath = Join-Path (Join-Path $backendPath "web-assets") $AppName

# Check if app directory exists
if (-not (Test-Path $appPath)) {
    Write-Host "Error: App directory not found: $appPath" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Building $AppName..." -ForegroundColor Yellow
Set-Location $appPath

# Build the app
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "[2/3] Copying to web-assets..." -ForegroundColor Yellow

# Create web-assets directory
New-Item -ItemType Directory -Force -Path $webAssetsPath | Out-Null

# Copy dist folder
Copy-Item -Path "dist\*" -Destination $webAssetsPath -Recurse -Force

Write-Host "[3/3] Web assets updated!" -ForegroundColor Yellow

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ Update Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "App: $AppName" -ForegroundColor White
Write-Host "Location: $webAssetsPath" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Apps will automatically load the new version!" -ForegroundColor Cyan
Write-Host "   No APK reinstall needed!" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 To change API URL, edit:" -ForegroundColor Yellow
Write-Host "   backend/web-assets/app-config.json" -ForegroundColor White

