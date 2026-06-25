# AGP 8+ requires namespace in @capacitor-community/http (post npm install).
$ErrorActionPreference = "Stop"
$appRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $appRoot -Parent
$gradle = Join-Path $repoRoot "node_modules\@capacitor-community\http\android\build.gradle"
if (-not (Test-Path $gradle)) {
  Write-Host "Skip: community http plugin not installed"
  exit 0
}
$content = Get-Content $gradle -Raw
if ($content -match 'namespace\s+"com\.getcapacitor\.http\.http"') {
  Write-Host "HTTP plugin already patched"
  exit 0
}
$content = $content -replace 'android \{\r?\n', "android {`n    namespace `"com.getcapacitor.http.http`"`n"
Set-Content -Path $gradle -Value $content -NoNewline
Write-Host "Patched HTTP plugin namespace"
