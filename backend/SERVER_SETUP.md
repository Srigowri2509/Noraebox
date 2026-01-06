# 🖥️ Backend Server Setup Guide

## Overview

This guide helps you set up the Norebox backend to run as a server on a laptop, accessible 24/7 to all your devices.

---

## 📋 Prerequisites

- Windows laptop (or Linux/Mac)
- Python 3.8+ installed
- Internet connection
- Supabase account (for database)

---

## 🚀 Quick Setup (Windows)

### Step 1: Install Python

1. Download Python: https://www.python.org/downloads/
2. **Important**: Check "Add Python to PATH" during installation
3. Verify installation:
   ```powershell
   python --version
   ```

### Step 2: Clone/Download Project

If you have the project:
```powershell
cd C:\Users\YourName\
# Copy your Norebox folder here
```

### Step 3: Set Up Backend

```powershell
cd C:\Users\YourName\Norebox\backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### Step 4: Configure Environment

Create `backend/.env` file:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
PORT=8000
```

### Step 5: Test Backend

```powershell
# Make sure virtual environment is activated
.\venv\Scripts\Activate.ps1

# Test run
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open browser: `http://localhost:8000` - Should see `{"ok": true}`

---

## 🔄 Running 24/7 (Windows Service)

### Option 1: Windows Task Scheduler (Easiest)

1. **Create startup script**: `backend/start_server.bat`
   ```batch
   @echo off
   cd /d C:\Users\YourName\Norebox\backend
   call venv\Scripts\activate.bat
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

2. **Set up Task Scheduler**:
   - Open Task Scheduler
   - Create Basic Task
   - Name: "Norebox Backend"
   - Trigger: "When the computer starts"
   - Action: "Start a program"
   - Program: `C:\Users\YourName\Norebox\backend\start_server.bat`
   - Check "Run whether user is logged on or not"
   - Check "Run with highest privileges"

### Option 2: NSSM (Windows Service Manager) - Recommended

1. **Download NSSM**: https://nssm.cc/download
2. **Extract** to a folder (e.g., `C:\nssm`)
3. **Install service**:
   ```powershell
   cd C:\nssm\win64
   .\nssm.exe install NoreboxBackend
   ```
   
   In the GUI that opens:
   - **Path**: `C:\Users\YourName\Norebox\backend\venv\Scripts\python.exe`
   - **Startup directory**: `C:\Users\YourName\Norebox\backend`
   - **Arguments**: `-m uvicorn app.main:app --host 0.0.0.0 --port 8000`
   
4. **Start service**:
   ```powershell
   .\nssm.exe start NoreboxBackend
   ```

5. **Set to auto-start**:
   ```powershell
   .\nssm.exe set NoreboxBackend Start SERVICE_AUTO_START
   ```

---

## 🌐 Making Server Accessible on Network

### Step 1: Find Your Laptop's IP Address

```powershell
ipconfig
# Look for "IPv4 Address" under your network adapter
# Example: 192.168.1.100
```

### Step 2: Configure Firewall

```powershell
# Allow port 8000 through firewall
New-NetFirewallRule -DisplayName "Norebox Backend" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

### Step 3: Update Frontend Apps

In each app's `.env` file:
```env
VITE_API_URL=http://192.168.1.100:8000
```
(Replace `192.168.1.100` with your laptop's IP)

### Step 4: Test from Another Device

From a phone/tablet on same network:
```
http://192.168.1.100:8000/
```
Should see: `{"ok": true}`

---

## 🔧 Production Configuration

### Use Production Server (Gunicorn for Windows)

1. **Install Gunicorn**:
   ```powershell
   pip install gunicorn
   ```

2. **Create production script**: `backend/start_production.bat`
   ```batch
   @echo off
   cd /d C:\Users\YourName\Norebox\backend
   call venv\Scripts\activate.bat
   gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
   ```

### Or Use Waitress (Windows-friendly)

1. **Install Waitress**:
   ```powershell
   pip install waitress
   ```

2. **Create production script**: `backend/start_production.bat`
   ```batch
   @echo off
   cd /d C:\Users\YourName\Norebox\backend
   call venv\Scripts\activate.bat
   waitress-serve --host=0.0.0.0 --port=8000 app.main:app
   ```

---

## 📝 Maintenance

### Check if Backend is Running

```powershell
# Test endpoint
curl http://localhost:8000/

# Check process
Get-Process python
```

### View Logs

If using NSSM:
```powershell
cd C:\nssm\win64
.\nssm.exe status NoreboxBackend
```

### Restart Service

```powershell
# If using NSSM
.\nssm.exe restart NoreboxBackend

# If using Task Scheduler
# Restart the task in Task Scheduler GUI
```

### Stop Service

```powershell
# If using NSSM
.\nssm.exe stop NoreboxBackend
```

---

## 🔄 Updating Backend

1. **Stop service**:
   ```powershell
   .\nssm.exe stop NoreboxBackend
   ```

2. **Update code** (pull from git, copy files, etc.)

3. **Update dependencies** (if needed):
   ```powershell
   cd backend
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

4. **Restart service**:
   ```powershell
   .\nssm.exe start NoreboxBackend
   ```

---

## 🛡️ Security Tips

1. **Keep Python updated**
2. **Use firewall** (Windows Firewall is fine)
3. **Don't expose to internet** (unless you know what you're doing)
4. **Keep Supabase keys secure** (never commit `.env`)
5. **Use HTTPS in production** (if exposing to internet)

---

## 📊 Monitoring

### Check Server Status

Create a simple status page or use:
```powershell
# Health check
curl http://localhost:8000/
curl http://localhost:8000/updates/list
```

### Set Up Logging

Backend already logs to console. To save logs:
```powershell
# Redirect output to file
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1
```

---

## 🆘 Troubleshooting

### "Port 8000 already in use"
- Find and stop the process using port 8000
- Or change PORT in `.env` file

### "Can't connect from other devices"
- Check firewall settings
- Verify IP address is correct
- Ensure devices on same network

### "Service won't start"
- Check logs in NSSM
- Verify Python path is correct
- Check `.env` file exists and has correct values

### "Backend stops after closing terminal"
- Use NSSM or Task Scheduler (runs in background)

---

## ✅ Checklist

- [ ] Python installed
- [ ] Backend dependencies installed
- [ ] `.env` file configured
- [ ] Backend runs manually (test)
- [ ] Service installed (NSSM or Task Scheduler)
- [ ] Service starts automatically
- [ ] Firewall configured
- [ ] IP address found
- [ ] Frontend apps updated with IP
- [ ] Tested from other device

---

## 🎯 Summary

1. **Install Python** and dependencies
2. **Configure** `.env` file
3. **Test** backend runs manually
4. **Set up service** (NSSM recommended)
5. **Configure firewall**
6. **Update frontend** with laptop IP
7. **Done!** Backend runs 24/7

---

**Your backend will now run as a server, accessible to all devices on your network!** 🚀

