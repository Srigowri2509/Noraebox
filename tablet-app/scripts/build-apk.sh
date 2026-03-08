#!/bin/bash

echo "Building Norebox Tablet APK..."
echo ""

# Build the web app
echo "[1/3] Building web app..."
npm run build
if [ $? -ne 0 ]; then
    echo "Error: Web build failed"
    exit 1
fi

# Sync Capacitor
echo "[2/3] Syncing Capacitor..."
npx cap sync android
if [ $? -ne 0 ]; then
    echo "Error: Capacitor sync failed"
    exit 1
fi

# Build APK
echo "[3/3] Building Android APK..."
cd android
./gradlew assembleRelease
if [ $? -ne 0 ]; then
    echo "Error: APK build failed"
    cd ..
    exit 1
fi
cd ..

echo ""
echo "========================================"
echo "APK Build Complete!"
echo "========================================"
echo "APK location: android/app/build/outputs/apk/release/app-release.apk"
echo ""
echo "To install on your device:"
echo "1. Enable 'Install from unknown sources' on your Android device"
echo "2. Transfer the APK to your device"
echo "3. Open the APK file on your device to install"
echo ""
