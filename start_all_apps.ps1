# PowerShell script to start all Norebox apps
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting Norebox Karaoke System" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if backend is running
Write-Host "Checking backend server..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    Write-Host "✓ Backend server is running" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "WARNING: Backend server is not running!" -ForegroundColor Red
    Write-Host "Please start the backend first:" -ForegroundColor Yellow
    Write-Host "  cd backend" -ForegroundColor White
    Write-Host "  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor White
    Write-Host ""
    $continue = Read-Host "Press Enter to continue anyway or Ctrl+C to cancel"
}

Write-Host ""
Write-Host "Starting all apps in separate windows..." -ForegroundColor Yellow
Write-Host ""

# Start Admin App (Port 5174)
Write-Host "[1/3] Starting Admin App on http://localhost:5174" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\admin-app'; npm run dev"

Start-Sleep -Seconds 2

# Start Tablet App (Port 5175)
Write-Host "[2/3] Starting Tablet App on http://localhost:5175" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\tablet-app'; npm run dev"

Start-Sleep -Seconds 2

# Start Display App (Port 5176)
Write-Host "[3/3] Starting Display App on http://localhost:5176" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\display-app'; npm run dev"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All apps are starting!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Admin App:    http://localhost:5174" -ForegroundColor White
Write-Host "Tablet App:  http://localhost:5175" -ForegroundColor White
Write-Host "Display App: http://localhost:5176" -ForegroundColor White
Write-Host ""
Write-Host "Each app will open in its own PowerShell window." -ForegroundColor Yellow
Write-Host "You can close this window once all apps are running." -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

