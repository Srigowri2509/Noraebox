# Building APK for Norebox Tablet App

## Quick Start

### Windows
```bash
npm run apk
```

Or use the script:
```bash
.\scripts\build-apk.bat
```

### Linux/Mac
```bash
npm run apk
```

Or use the script:
```bash
chmod +x scripts/build-apk.sh
./scripts/build-apk.sh
```

## Build Process

The build process does the following:
1. **Builds the web app** - Compiles React/Vite app to `dist/` folder
2. **Syncs Capacitor** - Copies web assets to Android project
3. **Builds APK** - Compiles Android app and generates APK

## Output Location

The APK will be generated at:
```
android/app/build/outputs/apk/release/app-release.apk
```

## Installing the APK

1. **Enable Unknown Sources** on your Android device:
   - Go to Settings > Security > Enable "Install from unknown sources"
   - Or Settings > Apps > Special access > Install unknown apps

2. **Transfer APK to device**:
   - Use USB cable and file transfer
   - Use ADB: `adb install android/app/build/outputs/apk/release/app-release.apk`
   - Email the APK to yourself
   - Use cloud storage (Google Drive, Dropbox, etc.)

3. **Install**:
   - Open the APK file on your device
   - Tap "Install"
   - Open the app

## Debug vs Release Builds

- **Debug APK**: `npm run build:android:debug` - Larger file, includes debug symbols
- **Release APK**: `npm run build:android` or `npm run apk` - Optimized, smaller file

## Requirements

- Node.js and npm installed
- Java JDK 17 or higher
- Android SDK (installed via Capacitor)
- Gradle (included in Android project)

## Troubleshooting

### Build fails with "gradlew not found"
- Make sure you're in the `tablet-app` directory
- On Windows, use `gradlew.bat` instead of `./gradlew`

### "SDK not found" error
- Run `npx cap sync android` first
- Make sure Android SDK is properly installed

### APK won't install
- Check that "Install from unknown sources" is enabled
- Make sure you're installing a release APK (not debug)
- Try uninstalling the old version first

## Configuration Notes

The APK is configured to use **bundled assets** (local files in the APK). The server URL has been removed from `capacitor.config.json` for standalone builds.

If you need to switch back to server-based loading for development, add this to `capacitor.config.json`:
```json
"server": {
  "url": "http://YOUR_SERVER_URL",
  "cleartext": true,
  "androidScheme": "https"
}
```

## Next Steps

For production releases, you should:
1. Create a keystore for signing
2. Update `build.gradle` to use the keystore
3. Keep the keystore file secure (don't commit to git)
4. Set up automatic updates (see the plan we created earlier)
