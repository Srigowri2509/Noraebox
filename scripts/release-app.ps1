# Script to create a release for an app
# Usage: .\scripts\release-app.ps1 -AppName [app-name] -Version [version]
# Example: .\scripts\release-app.ps1 -AppName tablet-app -Version 1.0.0

param(
    [Parameter(Mandatory=$true)]
    [string]$AppName,
    
    [Parameter(Mandatory=$true)]
    [string]$Version
)

# Validate app name
$validApps = @("tablet-app", "display-app", "admin-app")
if ($AppName -notin $validApps) {
    Write-Host "Error: App name must be one of: tablet-app, display-app, admin-app" -ForegroundColor Red
    exit 1
}

Write-Host "🚀 Creating release for $AppName v$Version" -ForegroundColor Cyan

# Update version in package.json
$packageJsonPath = "$AppName\package.json"
if (Test-Path $packageJsonPath) {
    $packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
    $packageJson.version = $Version
    $packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath
    Write-Host "✅ Updated version in $packageJsonPath to $Version" -ForegroundColor Green
} else {
    Write-Host "⚠️  Warning: $packageJsonPath not found" -ForegroundColor Yellow
}

# Create git tag
$tagName = "${AppName}-v${Version}"
Write-Host "📌 Creating git tag: $tagName" -ForegroundColor Cyan

git add "$AppName\package.json"
git commit -m "Bump $AppName to v$Version" 2>&1 | Out-Null
git tag $tagName
git push origin main 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    git push origin master 2>&1 | Out-Null
}
git push origin $tagName

Write-Host ""
Write-Host "✅ Release tag created: $tagName" -ForegroundColor Green
Write-Host "📦 GitHub Actions will automatically build and release the APK" -ForegroundColor Cyan
Write-Host "🔗 Check your GitHub repository's Actions tab for build progress" -ForegroundColor Cyan
Write-Host "📱 Once complete, the APK will be available in Releases" -ForegroundColor Cyan

