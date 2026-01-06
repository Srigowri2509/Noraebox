# Configure Windows Firewall to allow backend server

Write-Host "Configuring Windows Firewall..." -ForegroundColor Cyan

$port = 8000
$ruleName = "Norebox Backend"

# Check if rule already exists
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existingRule) {
    Write-Host "Firewall rule already exists. Updating..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName $ruleName
}

# Create new firewall rule
New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -LocalPort $port `
    -Protocol TCP `
    -Action Allow `
    -Description "Allows Norebox Backend API Server on port $port"

Write-Host "Firewall rule created successfully!" -ForegroundColor Green
Write-Host "Port $port is now open for incoming connections" -ForegroundColor Green
Write-Host ""
Write-Host "Your backend will be accessible from other devices on your network" -ForegroundColor Yellow

