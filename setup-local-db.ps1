# TRADEGRID Local Database Setup Helper
$mysqlPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
if (-not (Test-Path $mysqlPath)) {
    $mysqlPath = (Get-Command mysql -ErrorAction SilentlyContinue).Source
}

if (-not $mysqlPath) {
    Write-Host "MySQL executable not found automatically. Please run setup-db.sql in MySQL Workbench." -ForegroundColor Red
    exit 1
}

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "TRADEGRID MySQL Database Initialization" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Connecting to MySQL as 'root' to create database and 'tradegrid_user'..."

$rootPass = Read-Host "Enter your MySQL root password (leave blank if none)" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($rootPass)
$plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

$args = @("-u", "root")
if ($plainPass) {
    $args += "-p$plainPass"
}
$args += "-e"
$args += "source setup-db.sql;"

& $mysqlPath $args

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDatabase setup successful! Running migrations and seeds..." -ForegroundColor Green
    npm run migrate:latest
    npm run seed:run
    Write-Host "`nSetup complete! You can now log in or register on http://localhost:5173" -ForegroundColor Green
} else {
    Write-Host "`nFailed to connect with that password. Please verify your root password or run setup-db.sql manually in MySQL Workbench." -ForegroundColor Yellow
}
