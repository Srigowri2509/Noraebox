@echo off
REM Norebox Backend Server Startup Script
REM This script starts the backend server

cd /d %~dp0

REM Check if virtual environment exists
if not exist "venv\Scripts\activate.bat" (
    echo Virtual environment not found!
    echo Please run: python -m venv venv
    echo Then: pip install -r requirements.txt
    pause
    exit /b 1
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Check if .env exists
if not exist ".env" (
    echo WARNING: .env file not found!
    echo Please create .env file with DATABASE_URL
    echo Example: DATABASE_URL=postgresql://user:password@host:port/noraebox
    pause
)

REM Start the server
echo Starting Norebox Backend Server...
echo Server will be available at http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

pause

