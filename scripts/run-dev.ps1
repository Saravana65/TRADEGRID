# TRADEGRID — PowerShell Development Launch Script
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting TRADEGRID Hybrid Virtual Stock Exchange (Dev)  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "Copying .env.example to .env..." -ForegroundColor Yellow
    Copy-Item .env.example .env
}

Write-Host "Building shared packages..." -ForegroundColor Green
npm run build:packages

Write-Host "`nTo run development services:" -ForegroundColor White
Write-Host "Terminal 1 (Backend):  npm run dev:backend" -ForegroundColor Yellow
Write-Host "Terminal 2 (Frontend): npm run dev:frontend" -ForegroundColor Yellow
Write-Host "`nTo run tests:" -ForegroundColor White
Write-Host "npm test" -ForegroundColor Yellow
