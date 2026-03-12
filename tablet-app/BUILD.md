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

## Recommended Long-Term Release Model

Use a hybrid setup:

1. Build and install the tablet APK once as a stable native shell.
2. Serve the tablet UI from the backend at `/web-assets/tablet-app/`.
3. For normal React/UI changes, update the hosted web assets instead of rebuilding the APK.
4. Only rebuild the APK when you change native Android/Capacitor behavior.

### One-Time Shell APK Setup

The Capacitor shell is configured to load the hosted tablet UI from:

```text
http://16.112.20.5:8000/web-assets/tablet-app/index.html
```

After changing the Capacitor configuration, do one full rebuild/install:

```bash
npm run apk
```

Install that APK on the tablet. After this, most future UI changes can be shipped without reinstalling the APK.

### Publish UI Updates Without Rebuilding APK

When you change React code, publish the new web assets to the backend:

```powershell
.\scripts\update-web-assets.ps1 -AppName tablet-app
```

This will:

1. Build `tablet-app`
2. Copy `dist/` to `backend/web-assets/tablet-app`
3. Make tablets load the new UI automatically on next app launch/reload

### When You Still Need A New APK

Rebuild the APK only when you change:

- Capacitor plugins
- Android permissions
- Native Android code/resources
- App signing/versioning
- `capacitor.config.json`

### Optional APK Release Flow

The app still includes an APK update checker. Keep using GitHub Releases for native-shell updates, but use hosted web assets for day-to-day UI changes.

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

The tablet APK is now configured to load hosted web assets from the backend. Vite is also configured with a relative asset base so the same build works when copied into `backend/web-assets/tablet-app`.

## Next Steps

For production releases, you should:
1. Create a keystore for signing
2. Update `build.gradle` to use the keystore
3. Keep the keystore file secure (don't commit to git)
4. Set up automatic updates (see the plan we created earlier)
