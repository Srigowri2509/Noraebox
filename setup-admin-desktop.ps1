# PowerShell script to set up admin-app as desktop app
Write-Host "Setting up admin-app as desktop app..." -ForegroundColor Cyan

cd admin-app

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    npm install
}

# Install Electron
Write-Host "Installing Electron..." -ForegroundColor Yellow
npm install --save-dev electron electron-builder

# Build the app
Write-Host "Building the app..." -ForegroundColor Yellow
npm run build

Write-Host "" -ForegroundColor Green
Write-Host "Setup complete! Next steps:" -ForegroundColor Green
Write-Host "1. Update package.json with electron scripts (see DEPLOYMENT_GUIDE.md)" -ForegroundColor White
Write-Host "2. Run: npm run electron:dev (for development)" -ForegroundColor White
Write-Host "3. Run: npm run electron:build (to build executable)" -ForegroundColor White

