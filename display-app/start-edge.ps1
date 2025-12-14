# Start display-app and open in Edge
Set-Location $PSScriptRoot

Write-Host "🚀 Starting display-app..." -ForegroundColor Cyan

# Start npm dev server in background
Start-Process npm -ArgumentList "run dev" -WindowStyle Hidden

# Wait for server
Write-Host "⏳ Waiting for server..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Open in Edge
$url = "http://localhost:5175"
Write-Host "✅ Opening in Edge: $url" -ForegroundColor Green
Start-Process "msedge.exe" $url

Write-Host "📺 Display-app running in Edge!" -ForegroundColor Green
Write-Host "🔗 Connected to room: default-room" -ForegroundColor Cyan
