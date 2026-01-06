# 🔄 Remote Updates System - No APK Reinstall Needed!

## ✅ What's Set Up

Your app now supports **automatic remote updates** without reinstalling APKs!

### How It Works:

1. **App loads web assets from server** (not bundled in APK)
2. **Configuration loaded at runtime** (API URL can be changed remotely)
3. **Updates applied automatically** when you upload new web assets

---

## 🚀 How to Update (No APK Rebuild!)

### Update Web Assets (Code Changes):

```powershell
.\scripts\update-web-assets.ps1 -AppName tablet-app
```

This will:
1. Build the app
2. Copy to `backend/web-assets/tablet-app/`
3. Apps automatically get the new version!

**No APK reinstall needed!** Apps will load the new version on next launch.

---

## ⚙️ Change API URL Remotely

Edit: `backend/web-assets/app-config.json`

```json
{
  "api_url": "http://YOUR_NEW_IP:8000",
  "update_check_url": "http://YOUR_NEW_IP:8000",
  "version": "1.0.1"
}
```

Apps will automatically use the new API URL on next launch!

---

## 📱 First Time Setup

### 1. Install APK Once

Install the APK from:
- `tablet-app/android/app/build/outputs/apk/debug/app-debug.apk`

This is the **only time** you need to install the APK!

### 2. Make Sure Backend is Running

```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Upload Initial Web Assets

```powershell
.\scripts\update-web-assets.ps1 -AppName tablet-app
```

---

## 🔄 Update Workflow

### When You Make Code Changes:

```powershell
# 1. Make your code changes
# 2. Update web assets
.\scripts\update-web-assets.ps1 -AppName tablet-app

# 3. Done! Apps will update automatically
```

### When You Change Server IP:

```powershell
# 1. Edit backend/web-assets/app-config.json
# 2. Change api_url to new IP
# 3. Apps will use new IP on next launch
```

---

## 📂 File Locations

- **Web Assets:** `backend/web-assets/tablet-app/`
- **Config:** `backend/web-assets/app-config.json`
- **APK:** `tablet-app/android/app/build/outputs/apk/debug/app-debug.apk` (install once)

---

## ✅ Benefits

- ✅ **No APK reinstall** - Update code remotely
- ✅ **Change API URL** - Without rebuilding
- ✅ **Instant updates** - Apps get new version automatically
- ✅ **Easy deployment** - Just run one script

---

## 🎯 Summary

**Install APK once** → **Update remotely forever!**

The app loads from `http://192.168.1.16:8000/web-assets/tablet-app/` so you can update it anytime without rebuilding the APK!

