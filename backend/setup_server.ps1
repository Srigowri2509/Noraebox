# Complete server setup script for Windows
# This script sets up everything needed to run the backend as a server

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Norebox Backend Server Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$backendPath = $PSScriptRoot
Set-Location $backendPath

# Step 1: Check Python
Write-Host "[1/5] Checking Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Step 2: Create virtual environment
Write-Host "[2/5] Setting up virtual environment..." -ForegroundColor Yellow
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Gray
    python -m venv venv
    Write-Host "Virtual environment created!" -ForegroundColor Green
} else {
    Write-Host "Virtual environment already exists" -ForegroundColor Green
}

# Step 3: Install dependencies
Write-Host "[3/5] Installing dependencies..." -ForegroundColor Yellow
& "$backendPath\venv\Scripts\Activate.ps1"
pip install --upgrade pip
pip install -r requirements.txt
Write-Host "Dependencies installed!" -ForegroundColor Green

# Step 4: Check .env file
Write-Host "[4/5] Checking configuration..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "WARNING: .env file not found!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please create .env file with:" -ForegroundColor Yellow
    Write-Host "  SUPABASE_URL=your-supabase-url" -ForegroundColor White
    Write-Host "  SUPABASE_SERVICE_KEY=your-service-key" -ForegroundColor White
    Write-Host "  PORT=8000" -ForegroundColor White
    Write-Host ""
    $createEnv = Read-Host "Create .env file now? (y/n)"
    if ($createEnv -eq "y") {
        $supabaseUrl = Read-Host "Enter Supabase URL"
        $supabaseKey = Read-Host "Enter Supabase Service Key"
        $port = Read-Host "Enter Port (default: 8000)"
        if ([string]::IsNullOrEmpty($port)) { $port = "8000" }
        
        @"
SUPABASE_URL=$supabaseUrl
SUPABASE_SERVICE_KEY=$supabaseKey
PORT=$port
"@ | Out-File -FilePath ".env" -Encoding UTF8
        
        Write-Host ".env file created!" -ForegroundColor Green
    }
} else {
    Write-Host ".env file found!" -ForegroundColor Green
}

# Step 5: Test run
Write-Host "[5/5] Testing backend..." -ForegroundColor Yellow
Write-Host "Starting test server (will stop after 5 seconds)..." -ForegroundColor Gray

$job = Start-Job -ScriptBlock {
    param($path)
    Set-Location $path
    & "$path\venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
} -ArgumentList $backendPath

Start-Sleep -Seconds 3

try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
        Write-Host "Backend is working! ✓" -ForegroundColor Green
    }
} catch {
    Write-Host "Could not test backend (might need .env configured)" -ForegroundColor Yellow
}

Stop-Job $job
Remove-Job $job

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Test run: .\start_server.bat" -ForegroundColor White
Write-Host "2. Install as service: .\install_as_service.ps1" -ForegroundColor White
Write-Host "3. Or use Task Scheduler (see SERVER_SETUP.md)" -ForegroundColor White
Write-Host ""
Write-Host "Find your IP address:" -ForegroundColor Yellow
Write-Host "  ipconfig | findstr IPv4" -ForegroundColor White
Write-Host ""
Write-Host "Update frontend apps with your IP:" -ForegroundColor Yellow
Write-Host "  VITE_API_URL=http://YOUR_IP:8000" -ForegroundColor White
Write-Host ""

