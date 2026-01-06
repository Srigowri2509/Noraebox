# 📱 Complete Norebox System Guide

## 🎯 Overview

This guide covers everything you need to know about building, deploying, and maintaining the Norebox system.

---

## 📦 APK Files - Ready to Use

### ✅ Tablet App APK
**Location:** `tablet-app/android/app/build/outputs/apk/debug/app-debug.apk`

**Works on:** Any Android Tablet

**Installation:**
1. Copy APK to your Android tablet
2. Enable "Install from Unknown Sources" in Settings → Security
3. Tap the APK file to install
4. Done!

### ✅ Display App APK  
**Location:** `display-app/android/app/build/outputs/apk/debug/app-debug.apk`

**Works on:** Android TV

**Installation:**
1. Copy APK to Android TV (via USB, network, or file manager)
2. Enable "Install from Unknown Sources" in TV Settings
3. Install APK using file manager or ADB
4. App will appear in TV launcher

---

## 🔨 Building APKs

### Prerequisites
- Node.js installed
- Java 17+ installed (set JAVA_HOME)
- Android SDK installed (set ANDROID_HOME or configure local.properties)

### Build Tablet App APK

```powershell
cd tablet-app
npm run build
npx cap sync android
cd android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
.\gradlew.bat assembleDebug
```

APK will be at: `tablet-app/android/app/build/outputs/apk/debug/app-debug.apk`

### Build Display App APK

```powershell
cd display-app
npm run build
npx cap sync android
cd android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
.\gradlew.bat assembleDebug
```

APK will be at: `display-app/android/app/build/outputs/apk/debug/app-debug.apk`

### Build Release APKs (Signed)

For production, build release APKs:

```powershell
# Tablet app
cd tablet-app/android
.\gradlew.bat assembleRelease

# Display app
cd display-app/android
.\gradlew.bat assembleRelease
```

Release APKs: `app/build/outputs/apk/release/app-release.apk`

---

## 📤 Uploading APKs to Update Server

After building APKs, upload them to your update server:

```powershell
# From project root
.\scripts\upload-apk.ps1 -AppName tablet-app
.\scripts\upload-apk.ps1 -AppName display-app
```

This will:
1. Copy APK to `backend/apk_storage/`
2. Create manifest file with version info
3. Make it available for auto-updates

---

## 🍎 Building iOS Apps (Requires Mac)

### Prerequisites
- Mac computer with macOS
- Xcode installed (free from Mac App Store)
- Apple Developer Account (free for development)

### Build iOS Apps

```bash
# Tablet app
cd tablet-app
npm install
npm run build
npx cap sync ios
npx cap open ios

# Display app
cd display-app
npm install
npm run build
npx cap sync ios
npx cap open ios
```

### In Xcode:
1. Select your iPad as target device
2. Click Play (▶️) to build and install
3. Or Product → Archive for distribution

**Note:** iOS apps require Mac + Xcode. Cannot build on Windows.

---

## 🚀 Backend Server Setup

### Prerequisites
- Python 3.8+
- Supabase account and credentials

### Initial Setup

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### Configure Environment

Create `.env` file in `backend/`:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

### Start Server

```powershell
cd backend
.\venv\Scripts\activate
python -m app.main
```

Server runs on: `http://localhost:8000`

### Auto-Start on Windows

```powershell
.\backend\install_as_service.ps1
```

---

## 🔄 Remote Updates System

### How It Works

1. **Apps check for updates** on startup and daily
2. **Backend serves latest version** from `backend/apk_storage/`
3. **Apps download and install** updates automatically

### Update Endpoints

- Check update: `GET /updates/check/{app_name}?current_version={version}`
- Download APK: `GET /updates/download/{app_name}`
- List apps: `GET /updates/list`

### Uploading Updates

```powershell
.\scripts\upload-apk.ps1 -AppName tablet-app -ReleaseNotes "Bug fixes"
```

---

## 📱 App Configuration

### Tablet App
- **App ID:** `com.norebox.tablet`
- **Config:** `tablet-app/capacitor.config.json`
- **Update Service:** `tablet-app/src/services/updateService.js`

### Display App
- **App ID:** `com.norebox.display`
- **Config:** `display-app/capacitor.config.json`
- **Update Service:** `display-app/src/services/updateService.js`
- **TV Support:** Configured in AndroidManifest.xml

---

## 🛠️ Development

### Run Tablet App (Web)

```powershell
cd tablet-app
npm install
npm run dev
```

App runs on: `http://localhost:5173`

### Run Display App (Web)

```powershell
cd display-app
npm install
npm run dev
```

App runs on: `http://localhost:5173`

### Run Admin App (Web)

```powershell
cd admin-app
npm install
npm run dev
```

---

## 📂 Project Structure

```
Norebox/
├── tablet-app/          # Tablet app (React + Capacitor)
├── display-app/         # Display/TV app (React + Capacitor)
├── admin-app/           # Admin dashboard (React + Electron)
├── backend/             # Python FastAPI server
│   ├── app/            # Main application
│   ├── apk_storage/    # APK files for updates
│   └── requirements.txt
└── scripts/            # Build/upload scripts
```

---

## 🔧 Troubleshooting

### APK Build Fails

**Error: "Java version mismatch"**
- Set JAVA_HOME to Java 17: `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"`

**Error: "SDK location not found"**
- Create `local.properties` in `android/` folder:
  ```
  sdk.dir=C\:\\Users\\YourName\\AppData\\Local\\Android\\Sdk
  ```

**Error: "Gradle sync failed"**
- Check internet connection
- Run: `.\gradlew.bat clean`
- Try again

### App Won't Install

**Android:**
- Enable "Install from Unknown Sources" in Settings
- Check APK file is not corrupted
- Try installing via ADB: `adb install app-debug.apk`

**iOS:**
- Requires Mac + Xcode
- Check signing certificate
- Verify device UDID is registered

### Updates Not Working

- Check server URL in `capacitor.config.json`
- Verify update endpoint is accessible: `http://your-server:8000/updates/check/tablet-app`
- Check app version matches manifest
- Review console logs

---

## 📝 Quick Reference

### Build Commands
```powershell
# Build tablet APK
cd tablet-app && npm run build && npx cap sync android && cd android && .\gradlew.bat assembleDebug

# Build display APK
cd display-app && npm run build && npx cap sync android && cd android && .\gradlew.bat assembleDebug
```

### Upload Commands
```powershell
# Upload tablet APK
.\scripts\upload-apk.ps1 -AppName tablet-app

# Upload display APK
.\scripts\upload-apk.ps1 -AppName display-app
```

### Server Commands
```powershell
# Start backend
cd backend && .\venv\Scripts\activate && python -m app.main

# Install as service
.\backend\install_as_service.ps1
```

---

## ✅ Checklist

### Initial Setup
- [ ] Node.js installed
- [ ] Python 3.8+ installed
- [ ] Java 17+ installed
- [ ] Android SDK installed
- [ ] Supabase credentials configured

### Building APKs
- [ ] Dependencies installed (`npm install`)
- [ ] Web assets built (`npm run build`)
- [ ] Capacitor synced (`npx cap sync android`)
- [ ] APKs built successfully
- [ ] APKs tested on devices

### Deployment
- [ ] Backend server running
- [ ] APKs uploaded to update server
- [ ] Update system tested
- [ ] Apps installed on devices

---

## 📚 Additional Resources

- **Backend Setup:** See `backend/SERVER_SETUP.md`
- **Architecture:** See `ARCHITECTURE.md`
- **App READMEs:** See `tablet-app/README.md`, `display-app/README.md`

---

## 🆘 Support

For issues:
1. Check error messages in console/logs
2. Verify all prerequisites are installed
3. Check network connectivity
4. Review configuration files

---

**Last Updated:** January 2026
**APKs Status:** ✅ Built and Ready
**Update System:** ✅ Configured

