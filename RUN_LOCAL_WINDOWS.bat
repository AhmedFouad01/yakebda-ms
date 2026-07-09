@echo off
setlocal
cd /d "%~dp0"

echo =========================================
echo YAKEBDA MS - Local Runner
echo =========================================

where node >nul 2>nul || (echo Node.js is missing. Install Node.js 20+ & pause & exit /b 1)
where npm >nul 2>nul || (echo npm is missing. Install Node.js 20+ & pause & exit /b 1)
where docker >nul 2>nul || (echo Docker is missing. Install Docker Desktop & pause & exit /b 1)

powershell -ExecutionPolicy Bypass -File scripts\dev-postgres-docker.ps1 || (echo PostgreSQL startup failed & pause & exit /b 1)

if not exist apps\api\.env copy apps\api\.env.example apps\api\.env

call npm ci || (echo npm ci failed & pause & exit /b 1)
call npm run api:migrate || (echo migration failed & pause & exit /b 1)
call npm run api:seed || (echo seed failed & pause & exit /b 1)
call npm run admin:build || (echo admin build failed & pause & exit /b 1)

start "YAKEBDA API" cmd /k npm run api:dev
start "YAKEBDA Admin" cmd /k npm run admin:dev

timeout /t 6 >nul
start http://localhost:5173

echo Done. API: http://localhost:3001 Admin: http://localhost:5173
pause
