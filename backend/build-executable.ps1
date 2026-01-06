# PowerShell script to build backend as standalone executable
Write-Host "Building backend as standalone executable..." -ForegroundColor Cyan

cd backend

# Check if PyInstaller is installed
$pyInstallerInstalled = pip show pyinstaller 2>$null
if (-not $pyInstallerInstalled) {
    Write-Host "Installing PyInstaller..." -ForegroundColor Yellow
    pip install pyinstaller
}

# Create executable
Write-Host "Creating executable..." -ForegroundColor Yellow
pyinstaller --onefile --name norebox-backend --add-data "app;app" app/main.py

Write-Host "" -ForegroundColor Green
Write-Host "Build complete! Executable location:" -ForegroundColor Green
Write-Host "dist/norebox-backend.exe" -ForegroundColor White
Write-Host "" -ForegroundColor Yellow
Write-Host "Note: Make sure .env file is in the same directory as the executable" -ForegroundColor Yellow

