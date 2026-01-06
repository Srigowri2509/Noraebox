# PowerShell script to install backend as Windows service using NSSM
# NSSM (Non-Sucking Service Manager) - https://nssm.cc/

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Norebox Backend Service Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$backendPath = $PSScriptRoot
$pythonPath = Join-Path $backendPath "venv\Scripts\python.exe"

# Check if virtual environment exists
if (-not (Test-Path $pythonPath)) {
    Write-Host "ERROR: Virtual environment not found!" -ForegroundColor Red
    Write-Host "Please run:" -ForegroundColor Yellow
    Write-Host "  python -m venv venv" -ForegroundColor White
    Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor White
    Write-Host "  pip install -r requirements.txt" -ForegroundColor White
    exit 1
}

# Check if NSSM is available
$nssmPath = "C:\nssm\win64\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    Write-Host "NSSM not found at: $nssmPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please download NSSM from: https://nssm.cc/download" -ForegroundColor Yellow
    Write-Host "Extract to C:\nssm\" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or use Task Scheduler instead (see SERVER_SETUP.md)" -ForegroundColor Yellow
    exit 1
}

Write-Host "Installing Norebox Backend as Windows service..." -ForegroundColor Yellow
Write-Host ""

# Install service
& $nssmPath install NoreboxBackend $pythonPath `
    "-m uvicorn app.main:app --host 0.0.0.0 --port 8000" `
    "$backendPath"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Service installed successfully!" -ForegroundColor Green
    
    # Set service description
    & $nssmPath set NoreboxBackend Description "Norebox Backend API Server"
    
    # Set to auto-start (starts automatically when laptop boots)
    & $nssmPath set NoreboxBackend Start SERVICE_AUTO_START
    
    # Enable auto-restart on failure
    & $nssmPath set NoreboxBackend AppExit Default Restart
    
    # Set restart delay (5 seconds)
    & $nssmPath set NoreboxBackend AppRestartDelay 5000
    
    # Set working directory
    & $nssmPath set NoreboxBackend AppDirectory $backendPath
    
    Write-Host ""
    Write-Host "Starting service..." -ForegroundColor Yellow
    & $nssmPath start NoreboxBackend
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Service installed and started!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Service name: NoreboxBackend" -ForegroundColor White
    Write-Host "Status: Running" -ForegroundColor White
    Write-Host ""
    Write-Host "To manage the service:" -ForegroundColor Yellow
    Write-Host "  Start:   nssm start NoreboxBackend" -ForegroundColor White
    Write-Host "  Stop:    nssm stop NoreboxBackend" -ForegroundColor White
    Write-Host "  Restart: nssm restart NoreboxBackend" -ForegroundColor White
    Write-Host "  Remove:  nssm remove NoreboxBackend" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use Services.msc (Windows Services)" -ForegroundColor Yellow
} else {
    Write-Host "Failed to install service!" -ForegroundColor Red
    exit 1
}

