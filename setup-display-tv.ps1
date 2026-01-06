# PowerShell script to set up display-app for TV
Write-Host "Setting up display-app for TV..." -ForegroundColor Cyan

cd display-app

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    npm install
}

# Install Capacitor
Write-Host "Installing Capacitor..." -ForegroundColor Yellow
npm install @capacitor/core @capacitor/cli @capacitor/android

# Build the app
Write-Host "Building the app..." -ForegroundColor Yellow
npm run build

# Initialize Capacitor if not already done
if (-not (Test-Path "capacitor.config.js")) {
    Write-Host "Initializing Capacitor..." -ForegroundColor Yellow
    npx cap init "Norebox Display" "com.norebox.display"
}

# Add Android platform
Write-Host "Adding Android platform..." -ForegroundColor Yellow
npx cap add android

# Sync
Write-Host "Syncing Capacitor..." -ForegroundColor Yellow
npx cap sync

Write-Host "" -ForegroundColor Green
Write-Host "Setup complete! Next steps:" -ForegroundColor Green
Write-Host "1. Open Android Studio" -ForegroundColor White
Write-Host "2. Open the project: display-app/android" -ForegroundColor White
Write-Host "3. Configure for TV in AndroidManifest.xml" -ForegroundColor White
Write-Host "4. Build → Build Bundle(s) / APK(s) → Build APK(s)" -ForegroundColor White
Write-Host "" -ForegroundColor Yellow
Write-Host "Or run: npx cap open android" -ForegroundColor Yellow

