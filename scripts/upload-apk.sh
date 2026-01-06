#!/bin/bash
# Script to build and upload APK to update server

if [ -z "$1" ]; then
    echo "Usage: ./upload-apk.sh <app-name> [release-notes]"
    echo "Example: ./upload-apk.sh tablet-app 'Fixed bugs'"
    exit 1
fi

APP_NAME=$1
RELEASE_NOTES=${2:-"Auto-generated update"}
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_PATH="$SCRIPT_DIR/../$APP_NAME"
BACKEND_PATH="$SCRIPT_DIR/../backend"
APK_STORAGE="$BACKEND_PATH/apk_storage"

echo "========================================"
echo "Building and Uploading $APP_NAME"
echo "========================================"
echo ""

# Check if app directory exists
if [ ! -d "$APP_PATH" ]; then
    echo "Error: App directory not found: $APP_PATH"
    exit 1
fi

# Create APK storage directory
mkdir -p "$APK_STORAGE"

echo "[1/4] Building $APP_NAME..."
cd "$APP_PATH"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the app
echo "Running build..."
npm run build

if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

echo "[2/4] Building APK..."

# Check if Capacitor is set up
if [ ! -d "android" ]; then
    echo "Capacitor not set up. Setting up now..."
    
    if [ ! -d "node_modules/@capacitor" ]; then
        npm install @capacitor/core @capacitor/cli @capacitor/android
    fi
    
    if [ ! -f "capacitor.config.js" ]; then
        if [ "$APP_NAME" = "tablet-app" ]; then
            APP_ID="com.norebox.tablet"
            APP_DISPLAY="Norebox Tablet"
        else
            APP_ID="com.norebox.display"
            APP_DISPLAY="Norebox Display"
        fi
        npx cap init "$APP_DISPLAY" "$APP_ID"
    fi
    
    npx cap add android
fi

# Sync Capacitor
echo "Syncing Capacitor..."
npx cap sync

# Build APK
cd android
echo "Building APK (this may take a while)..."
./gradlew assembleRelease

if [ $? -ne 0 ]; then
    echo "APK build failed!"
    exit 1
fi

cd ..

# Find the APK
APK_PATH="$APP_PATH/android/app/build/outputs/apk/release/app-release.apk"

if [ ! -f "$APK_PATH" ]; then
    echo "Error: APK not found at $APK_PATH"
    exit 1
fi

echo "[3/4] Getting version..."

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

if [ -z "$VERSION" ] || [ "$VERSION" = "0.0.0" ]; then
    # Generate version from timestamp
    VERSION="1.0.$(date +%Y%m%d%H%M)"
    echo "No version in package.json, using: $VERSION"
fi

APK_FILENAME="$APP_NAME-v$VERSION.apk"
TARGET_APK_PATH="$APK_STORAGE/$APK_FILENAME"

echo "[4/4] Uploading APK..."

# Copy APK to storage
cp "$APK_PATH" "$TARGET_APK_PATH"

# Get file size
FILE_SIZE=$(stat -f%z "$TARGET_APK_PATH" 2>/dev/null || stat -c%s "$TARGET_APK_PATH" 2>/dev/null)

# Create manifest
RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$APK_STORAGE/${APP_NAME}_manifest.json" <<EOF
{
  "version": "$VERSION",
  "app_name": "$APP_NAME",
  "apk_filename": "$APK_FILENAME",
  "release_date": "$RELEASE_DATE",
  "release_notes": "$RELEASE_NOTES",
  "force_update": false,
  "file_size": $FILE_SIZE
}
EOF

echo ""
echo "========================================"
echo "✅ Upload Complete!"
echo "========================================"
echo ""
echo "App: $APP_NAME"
echo "Version: $VERSION"
echo "APK: $APK_FILENAME"
echo "Size: $(echo "scale=2; $FILE_SIZE / 1024 / 1024" | bc) MB"
echo "Location: $TARGET_APK_PATH"
echo ""
echo "Devices will automatically check for this update!"

