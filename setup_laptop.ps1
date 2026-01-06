# Complete laptop setup script
# Sets up both backend and admin app on the laptop

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Norebox Laptop Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = $PSScriptRoot
$backendPath = Join-Path $projectRoot "backend"
$adminAppPath = Join-Path $projectRoot "admin-app"

# Check if we're in the right directory
if (-not (Test-Path $backendPath) -or -not (Test-Path $adminAppPath)) {
    Write-Host "ERROR: Please run this script from the project root directory" -ForegroundColor Red
    Write-Host "Expected structure:" -ForegroundColor Yellow
    Write-Host "  Norebox/" -ForegroundColor White
    Write-Host "    backend/" -ForegroundColor White
    Write-Host "    admin-app/" -ForegroundColor White
    exit 1
}

Write-Host "Setting up Norebox on this laptop..." -ForegroundColor Yellow
Write-Host ""

# ============================================
# PART 1: Backend Setup
# ============================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PART 1: Backend Server Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $backendPath

# Check if setup script exists
if (Test-Path "setup_server.ps1") {
    Write-Host "Running backend setup..." -ForegroundColor Yellow
    & ".\setup_server.ps1"
} else {
    Write-Host "Backend setup script not found. Running manual setup..." -ForegroundColor Yellow
    
    # Manual setup
    if (-not (Test-Path "venv")) {
        Write-Host "Creating virtual environment..." -ForegroundColor Gray
        python -m venv venv
    }
    
    Write-Host "Installing dependencies..." -ForegroundColor Gray
    & "$backendPath\venv\Scripts\Activate.ps1"
    pip install -r requirements.txt
    
    Write-Host "Backend setup complete!" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PART 2: Admin App Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $adminAppPath

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Install dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing admin-app dependencies..." -ForegroundColor Yellow
    npm install
} else {
    Write-Host "Dependencies already installed" -ForegroundColor Green
}

# Check/create .env file
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env file..." -ForegroundColor Yellow
    $apiUrl = Read-Host "Enter backend API URL (default: http://localhost:8000)"
    if ([string]::IsNullOrEmpty($apiUrl)) { $apiUrl = "http://localhost:8000" }
    
    "VITE_API_URL=$apiUrl" | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host ".env file created!" -ForegroundColor Green
} else {
    Write-Host ".env file already exists" -ForegroundColor Green
}

# Build web app
Write-Host "Building admin-app..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Web app built successfully!" -ForegroundColor Green

# Install Electron if needed
if (-not (Test-Path "node_modules\electron")) {
    Write-Host "Installing Electron..." -ForegroundColor Yellow
    npm install --save-dev electron electron-builder
}

# Build desktop app
Write-Host "Building desktop application..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray

npm run electron:build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Desktop app build failed!" -ForegroundColor Red
    Write-Host "You can still use the web version at: http://localhost:5174" -ForegroundColor Yellow
} else {
    Write-Host "Desktop app built successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installer location:" -ForegroundColor Yellow
    Write-Host "  admin-app/dist-electron/Norebox Admin Setup.exe" -ForegroundColor White
    Write-Host ""
    Write-Host "Run the installer to install the desktop app!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PART 3: Network Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $backendPath

# Configure firewall
if (Test-Path "configure_firewall.ps1") {
    Write-Host "Configuring firewall..." -ForegroundColor Yellow
    & ".\configure_firewall.ps1"
}

# Get IP address
Write-Host "Finding IP address..." -ForegroundColor Yellow
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*"}).IPAddress | Select-Object -First 1

if ($ipAddress) {
    Write-Host "Your laptop IP address: $ipAddress" -ForegroundColor Green
    Write-Host ""
    Write-Host "Update frontend apps (tablet-app, display-app) with:" -ForegroundColor Yellow
    Write-Host "  VITE_API_URL=http://$ipAddress:8000" -ForegroundColor White
} else {
    Write-Host "Could not determine IP address" -ForegroundColor Yellow
    Write-Host "Run: ipconfig | findstr IPv4" -ForegroundColor White
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Install backend as service: cd backend; .\install_as_service.ps1" -ForegroundColor White
Write-Host "2. Install admin desktop app: Run the installer in admin-app/dist-electron/" -ForegroundColor White
Write-Host "3. Update frontend apps with your IP address" -ForegroundColor White
Write-Host "4. Test backend: curl http://localhost:8000/" -ForegroundColor White
Write-Host ""

