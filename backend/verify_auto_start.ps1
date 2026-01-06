# Script to verify backend auto-start is configured

Write-Host "Checking Backend Auto-Start Configuration..." -ForegroundColor Cyan
Write-Host ""

# Check if service exists
$service = Get-Service -Name "NoreboxBackend" -ErrorAction SilentlyContinue

if ($service) {
    Write-Host "✅ Service found: NoreboxBackend" -ForegroundColor Green
    Write-Host "   Status: $($service.Status)" -ForegroundColor White
    Write-Host "   Start Type: $($service.StartType)" -ForegroundColor White
    
    if ($service.StartType -eq "Automatic") {
        Write-Host "   ✅ Auto-start enabled!" -ForegroundColor Green
        Write-Host "   Backend will start automatically when laptop boots" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Auto-start NOT enabled" -ForegroundColor Yellow
        Write-Host "   Setting to Automatic..." -ForegroundColor Yellow
        Set-Service -Name "NoreboxBackend" -StartupType Automatic
        Write-Host "   ✅ Now set to Automatic!" -ForegroundColor Green
    }
    
    # Test if backend is responding
    Write-Host ""
    Write-Host "Testing backend connection..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Backend is running and responding!" -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠️  Backend is not responding (might be starting)" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Service NOT found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To install the service:" -ForegroundColor Yellow
    Write-Host "  1. Download NSSM: https://nssm.cc/download" -ForegroundColor White
    Write-Host "  2. Extract to C:\nssm\" -ForegroundColor White
    Write-Host "  3. Run: .\install_as_service.ps1" -ForegroundColor White
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Auto-Start Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "When laptop boots:" -ForegroundColor Yellow
if ($service -and $service.StartType -eq "Automatic") {
    Write-Host "  ✅ Backend will start automatically" -ForegroundColor Green
} else {
    Write-Host "  ❌ Backend will NOT start automatically" -ForegroundColor Red
    Write-Host "  Install service to enable auto-start" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Current status:" -ForegroundColor Yellow
if ($service) {
    Write-Host "  Service: $($service.Status)" -ForegroundColor White
} else {
    Write-Host "  Service: Not installed" -ForegroundColor White
}

