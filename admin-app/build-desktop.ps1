# Build admin-app as desktop application

Write-Host "Building Admin App Desktop Application..." -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Check/create .env
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env file..." -ForegroundColor Yellow
    $apiUrl = Read-Host "Enter backend API URL (default: http://localhost:8000)"
    if ([string]::IsNullOrEmpty($apiUrl)) { $apiUrl = "http://localhost:8000" }
    
    "VITE_API_URL=$apiUrl" | Out-File -FilePath ".env" -Encoding UTF8
}

# Install Electron if needed
if (-not (Test-Path "node_modules\electron")) {
    Write-Host "Installing Electron..." -ForegroundColor Yellow
    npm install --save-dev electron electron-builder
}

# Build web app
Write-Host "Building web app..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Web app build failed!" -ForegroundColor Red
    exit 1
}

# Build desktop app
Write-Host "Building desktop application..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray

npm run electron:build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Build Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installer location:" -ForegroundColor Yellow
    Write-Host "  dist-electron/Norebox Admin Setup.exe" -ForegroundColor White
    Write-Host ""
    Write-Host "Run the installer to install the desktop app!" -ForegroundColor Yellow
} else {
    Write-Host "Desktop app build failed!" -ForegroundColor Red
    Write-Host "You can still use the web version:" -ForegroundColor Yellow
    Write-Host "  npm run dev" -ForegroundColor White
}

