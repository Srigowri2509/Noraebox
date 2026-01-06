# 🔄 Auto-Start Guide - Backend Runs Automatically

## ✅ Yes! It Runs Automatically

When you install the backend as a **Windows Service**, it will:
- ✅ **Start automatically** when laptop boots
- ✅ **Run in background** (no window needed)
- ✅ **Restart automatically** if it crashes
- ✅ **Run even if you're not logged in**

---

## 🎯 Two Ways to Auto-Start

### Option 1: NSSM (Windows Service) - RECOMMENDED ✅

**What it does:**
- Runs as a proper Windows service
- Starts automatically on boot
- Runs in background
- Can restart if it crashes
- Professional setup

**How to set up:**

1. **Download NSSM**: https://nssm.cc/download
2. **Extract** to `C:\nssm\`
3. **Run installer**:
   ```powershell
   cd backend
   .\install_as_service.ps1
   ```

**Result:**
- ✅ Service installed
- ✅ Starts automatically on boot
- ✅ Runs 24/7

**To verify:**
```powershell
# Check service status
Get-Service NoreboxBackend

# Should show: Running
```

---

### Option 2: Task Scheduler (Built-in Windows)

**What it does:**
- Uses Windows Task Scheduler
- Starts on boot
- No extra software needed

**How to set up:**

1. **Open Task Scheduler**:
   - Press `Win + R`
   - Type: `taskschd.msc`
   - Press Enter

2. **Create Task**:
   - Right-click "Task Scheduler Library"
   - Click "Create Task"

3. **General Tab**:
   - Name: `Norebox Backend`
   - Check: "Run whether user is logged on or not"
   - Check: "Run with highest privileges"

4. **Triggers Tab**:
   - Click "New"
   - Begin: "At startup"
   - Click OK

5. **Actions Tab**:
   - Click "New"
   - Action: "Start a program"
   - Program: `C:\Users\YourName\Norebox\backend\start_server.bat`
   - Click OK

6. **Settings Tab**:
   - Check: "Allow task to be run on demand"
   - Check: "Run task as soon as possible after a scheduled start is missed"
   - Check: "If the task fails, restart every: 1 minute"

7. **Click OK** (enter password if prompted)

**Result:**
- ✅ Task created
- ✅ Starts automatically on boot
- ✅ Runs in background

---

## 🔍 How to Verify It's Running

### Method 1: Check Service Status

```powershell
# If using NSSM
Get-Service NoreboxBackend

# Should show: Running
```

### Method 2: Test Endpoint

```powershell
# Test if backend is responding
curl http://localhost:8000/

# Should return: {"ok": true}
```

### Method 3: Check Process

```powershell
# See if Python is running
Get-Process python

# Should show python.exe process
```

### Method 4: Open Services

1. Press `Win + R`
2. Type: `services.msc`
3. Press Enter
4. Look for "NoreboxBackend"
5. Status should be "Running"

---

## 🛠️ Managing the Service

### Start Service:
```powershell
# If using NSSM
cd C:\nssm\win64
.\nssm.exe start NoreboxBackend

# Or use Services
Start-Service NoreboxBackend
```

### Stop Service:
```powershell
.\nssm.exe stop NoreboxBackend
# Or
Stop-Service NoreboxBackend
```

### Restart Service:
```powershell
.\nssm.exe restart NoreboxBackend
# Or
Restart-Service NoreboxBackend
```

### Check Status:
```powershell
.\nssm.exe status NoreboxBackend
# Or
Get-Service NoreboxBackend
```

---

## ⚙️ Service Settings

### Set to Auto-Start (NSSM):

```powershell
cd C:\nssm\win64
.\nssm.exe set NoreboxBackend Start SERVICE_AUTO_START
```

### Enable Auto-Restart on Failure:

```powershell
.\nssm.exe set NoreboxBackend AppExit Default Restart
```

### Set Restart Delay:

```powershell
.\nssm.exe set NoreboxBackend AppRestartDelay 5000
```

---

## 🧪 Test Auto-Start

### To verify it starts automatically:

1. **Stop the service**:
   ```powershell
   Stop-Service NoreboxBackend
   ```

2. **Restart your laptop**

3. **After boot, check**:
   ```powershell
   Get-Service NoreboxBackend
   curl http://localhost:8000/
   ```

4. **Should show**: Running and `{"ok": true}`

---

## 📋 Checklist

- [ ] Service installed (NSSM or Task Scheduler)
- [ ] Service set to auto-start
- [ ] Tested manually (service starts)
- [ ] Tested auto-start (reboot laptop)
- [ ] Verified it runs after boot
- [ ] Can access from other devices

---

## 🎯 Summary

**Yes, it runs automatically!**

When installed as a service:
- ✅ Starts when laptop boots
- ✅ Runs in background
- ✅ No need to open terminal
- ✅ No need to log in
- ✅ Runs 24/7

**Just install the service once, and it handles everything!** 🚀

---

## 🆘 Troubleshooting

### Service won't start:
- Check Python is installed
- Check `.env` file exists
- Check logs: `C:\nssm\service\NoreboxBackend\`

### Service stops:
- Check if Python process crashed
- Check logs for errors
- Verify Supabase credentials

### Not starting on boot:
- Verify service is set to "Automatic"
- Check Task Scheduler (if using that method)
- Check Windows Event Viewer for errors

---

**Once set up, your backend will run automatically forever!** ✨

