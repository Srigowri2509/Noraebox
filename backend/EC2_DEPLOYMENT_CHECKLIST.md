# EC2 Deployment Checklist - Quick Reference

## ✅ Pre-Deployment Verification

All files are ready:
- ✅ `start.sh` - Production startup script
- ✅ `noraebox.service` - Systemd service file
- ✅ `requirements.txt` - All dependencies included
- ✅ `app/db.py` - Loads `.env.production` automatically
- ✅ No hardcoded credentials

## 📋 Step-by-Step Deployment

### STEP 1 — Copy Backend to EC2

**From your local machine (Windows PowerShell or Git Bash):**

```bash
scp -i noraebox-key.pem -r backend ec2-user@<EC2_PUBLIC_IP>:/home/ec2-user/
```

**Or if using Windows (PowerShell):**

```powershell
scp -i noraebox-key.pem -r backend ec2-user@<EC2_PUBLIC_IP>:/home/ec2-user/
```

**If backend is already on EC2, verify:**

```bash
ssh -i noraebox-key.pem ec2-user@<EC2_PUBLIC_IP>
cd /home/ec2-user/backend
ls
```

**You should see:**
- `app/`
- `requirements.txt`
- `start.sh`
- `noraebox.service`

---

### STEP 2 — Create Production Env File

**On EC2:**

```bash
cd /home/ec2-user/backend
nano .env.production
```

**Paste this (replace YOUR_RDS_ENDPOINT):**

```
DATABASE_URL=postgresql://postgres:<YOUR_PASSWORD>@YOUR_RDS_ENDPOINT:5432/noraebox
```

**Example (replace with your actual endpoint):**
```
DATABASE_URL=postgresql://postgres:<YOUR_PASSWORD>@noraebox-postgrss.xxxxxx.ap-south-2.rds.amazonaws.com:5432/noraebox
```

**Save:**
- `CTRL+O` → `Enter`
- `CTRL+X`

**Verify it was created:**
```bash
cat .env.production
```

---

### STEP 3 — Setup Python Environment

**Still in `/home/ec2-user/backend`:**

```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

**Expected output:** All packages install successfully with no errors.

**If you see errors:**
- Take a screenshot
- Check Python version: `python3 --version` (should be 3.8+)
- Check internet connection on EC2

---

### STEP 4 — Test Run Manually

**Make script executable and run:**

```bash
chmod +x start.sh
./start.sh
```

**Expected output:**
```
INFO:     Started server process [xxxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

**Keep this terminal open!**

**In another terminal or browser, test:**

```bash
# From another terminal on EC2
curl http://localhost:8000/
# Should return: {"ok":true}
```

**Or open in browser:**
```
http://<EC2_PUBLIC_IP>:8000/docs
```

**If `/docs` doesn't load → Security group issue (see Step 5)**

---

### STEP 5 — Open Port 8000 in Security Group

**In AWS Console:**

1. Go to **EC2** → **Security Groups**
2. Select your EC2 instance's security group
3. Click **Inbound rules** → **Edit inbound rules**
4. Click **Add rule:**
   - **Type:** Custom TCP
   - **Port:** 8000
   - **Source:** 0.0.0.0/0 (temporary for testing)
   - **Description:** FastAPI Backend
5. Click **Save rules**

**Wait 10-30 seconds, then try again:**
```
http://<EC2_PUBLIC_IP>:8000/docs
```

**Swagger UI should load!** ✅

---

### STEP 6 — Setup Systemd Service

**Stop the manual run first:**
- Go back to terminal running `./start.sh`
- Press `CTRL+C`

**Then setup systemd:**

```bash
sudo cp noraebox.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable noraebox
sudo systemctl start noraebox
```

**Check status:**

```bash
sudo systemctl status noraebox
```

**Expected output:**
```
● noraebox.service - Noraebox FastAPI Backend
   Loaded: loaded (/etc/systemd/system/noraebox.service; enabled; vendor preset: disabled)
   Active: active (running) since ...
```

**If it says "active (running)" → SUCCESS!** ✅

---

## 🔍 Verification Commands

**Check service status:**
```bash
sudo systemctl status noraebox
```

**View logs:**
```bash
sudo journalctl -u noraebox -f
```

**Restart service:**
```bash
sudo systemctl restart noraebox
```

**Test endpoints:**
```bash
# Health check
curl http://localhost:8000/

# Register device
curl -X POST http://localhost:8000/devices/register \
  -H "Content-Type: application/json" \
  -d '{"device_uuid":"test-123","device_type":"tablet","name":"Test Device"}'

# Get devices
curl http://localhost:8000/devices

# Get top songs
curl http://localhost:8000/stats/top-songs
```

---

## ⚠️ Troubleshooting

### Service won't start

**Check logs:**
```bash
sudo journalctl -u noraebox -n 50
```

**Common issues:**
1. **Missing DATABASE_URL:** Check `.env.production` exists and has correct format
2. **Database connection failed:** Verify RDS endpoint and security group allows EC2
3. **Port already in use:** `sudo lsof -i :8000` to see what's using it

### Can't access /docs from browser

1. **Check security group:** Port 8000 must be open
2. **Check service is running:** `sudo systemctl status noraebox`
3. **Check EC2 public IP:** Make sure you're using the correct IP
4. **Test locally first:** `curl http://localhost:8000/docs` from EC2

### Database connection errors

**Test connection from EC2:**
```bash
# Install postgresql client (if needed)
sudo yum install postgresql -y  # Amazon Linux
# or
sudo apt-get install postgresql-client -y  # Ubuntu

# Test connection
psql -h <RDS_ENDPOINT> -U postgres -d noraebox
# Password: <YOUR_PASSWORD>
```

**If connection fails:**
- Check RDS security group allows EC2 instance
- Verify RDS endpoint is correct
- Check RDS is publicly accessible (if needed)

---

## ✅ Success Criteria

- [ ] Backend files copied to EC2
- [ ] `.env.production` created with correct RDS endpoint
- [ ] Python venv created and dependencies installed
- [ ] Manual test run works (`./start.sh`)
- [ ] `/docs` loads in browser
- [ ] Systemd service installed and running
- [ ] `sudo systemctl status noraebox` shows "active (running)"
- [ ] Can access `http://<EC2_PUBLIC_IP>:8000/docs` from browser

---

## 📝 Notes

- **RDS Endpoint Format:** `noraebox-postgrss.xxxxxx.ap-south-2.rds.amazonaws.com`
- **Password:** `<YOUR_PASSWORD>`
- **Database Name:** `noraebox`
- **Port:** `5432` (PostgreSQL default)

**After deployment, the backend will:**
- Auto-start on EC2 reboot
- Auto-restart if it crashes
- Run on port 8000
- Connect to RDS PostgreSQL database
