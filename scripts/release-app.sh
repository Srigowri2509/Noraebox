#!/bin/bash

# Script to create a release for an app
# Usage: ./scripts/release-app.sh [app-name] [version]
# Example: ./scripts/release-app.sh tablet-app 1.0.0

APP_NAME=$1
VERSION=$2

if [ -z "$APP_NAME" ] || [ -z "$VERSION" ]; then
    echo "Usage: ./scripts/release-app.sh [app-name] [version]"
    echo "Example: ./scripts/release-app.sh tablet-app 1.0.0"
    exit 1
fi

# Validate app name
if [ "$APP_NAME" != "tablet-app" ] && [ "$APP_NAME" != "display-app" ] && [ "$APP_NAME" != "admin-app" ]; then
    echo "Error: App name must be one of: tablet-app, display-app, admin-app"
    exit 1
fi

echo "🚀 Creating release for $APP_NAME v$VERSION"

# Update version in package.json
if [ -f "$APP_NAME/package.json" ]; then
    # Use node to update version (works on all platforms)
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('$APP_NAME/package.json', 'utf8'));
        pkg.version = '$VERSION';
        fs.writeFileSync('$APP_NAME/package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "✅ Updated version in $APP_NAME/package.json to $VERSION"
else
    echo "⚠️  Warning: $APP_NAME/package.json not found"
fi

# Create git tag
TAG_NAME="${APP_NAME}-v${VERSION}"
echo "📌 Creating git tag: $TAG_NAME"

git add "$APP_NAME/package.json"
git commit -m "Bump $APP_NAME to v$VERSION" || true
git tag "$TAG_NAME"
git push origin main || git push origin master
git push origin "$TAG_NAME"

echo ""
echo "✅ Release tag created: $TAG_NAME"
echo "📦 GitHub Actions will automatically build and release the APK"
echo "🔗 Check your GitHub repository's Actions tab for build progress"
echo "📱 Once complete, the APK will be available in Releases"

