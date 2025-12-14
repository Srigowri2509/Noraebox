@echo off
echo ========================================
echo Starting Norebox Karaoke System
echo ========================================
echo.

REM Check if backend is running
echo Checking backend server...
curl -s http://localhost:8000/ >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Backend server is not running!
    echo Please start the backend first:
    echo   cd backend
    echo   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    echo.
    echo Press any key to continue anyway or Ctrl+C to cancel...
    pause >nul
)

echo.
echo Starting all apps in separate windows...
echo.

REM Start Admin App (Port 5174)
echo [1/3] Starting Admin App on http://localhost:5174
start "Norebox Admin App" cmd /k "cd admin-app && npm run dev"

REM Wait a bit for first app to start
timeout /t 2 /nobreak >nul

REM Start Tablet App (Port 5175)
echo [2/3] Starting Tablet App on http://localhost:5175
start "Norebox Tablet App" cmd /k "cd tablet-app && npm run dev"

REM Wait a bit
timeout /t 2 /nobreak >nul

REM Start Display App (Port 5176)
echo [3/3] Starting Display App on http://localhost:5176
start "Norebox Display App" cmd /k "cd display-app && npm run dev"

echo.
echo ========================================
echo All apps are starting!
echo ========================================
echo.
echo Admin App:    http://localhost:5174
echo Tablet App:  http://localhost:5175
echo Display App: http://localhost:5176
echo.
echo Each app will open in its own terminal window.
echo You can close this window once all apps are running.
echo.
echo Press any key to exit...
pause >nul

