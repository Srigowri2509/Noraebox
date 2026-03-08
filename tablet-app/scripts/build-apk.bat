@echo off
echo Building Norebox Tablet APK...
echo.

REM Build the web app
echo [1/3] Building web app...
call npm run build
if %errorlevel% neq 0 (
    echo Error: Web build failed
    exit /b 1
)

REM Sync Capacitor
echo [2/3] Syncing Capacitor...
call npx cap sync android
if %errorlevel% neq 0 (
    echo Error: Capacitor sync failed
    exit /b 1
)

REM Build APK
echo [3/3] Building Android APK...
cd android
call gradlew.bat assembleRelease
if %errorlevel% neq 0 (
    echo Error: APK build failed
    cd ..
    exit /b 1
)
cd ..

echo.
echo ========================================
echo APK Build Complete!
echo ========================================
echo APK location: android\app\build\outputs\apk\release\app-release.apk
echo.
echo To install on your device:
echo 1. Enable "Install from unknown sources" on your Android device
echo 2. Transfer the APK to your device
echo 3. Open the APK file on your device to install
echo.
