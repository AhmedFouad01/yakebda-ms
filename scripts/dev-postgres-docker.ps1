$ErrorActionPreference = "Stop"

Write-Host "Starting YAKEBDA MS PostgreSQL container..." -ForegroundColor Cyan

$container = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^ykms-postgres$" -Quiet

if (-not $container) {
  docker run -d --name ykms-postgres `
    -e POSTGRES_USER=ykms `
    -e POSTGRES_PASSWORD=ykms `
    -e POSTGRES_DB=ykms `
    -p 5432:5432 `
    postgres:16
} else {
  docker start ykms-postgres | Out-Null
}

Write-Host "Waiting for PostgreSQL..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

try {
  docker exec ykms-postgres psql -U ykms -d postgres -c "CREATE DATABASE ykms_test OWNER ykms;"
} catch {
  Write-Host "ykms_test may already exist. Continuing..." -ForegroundColor Yellow
}

Write-Host "PostgreSQL is ready." -ForegroundColor Green
