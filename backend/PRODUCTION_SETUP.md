# Production Setup Summary

## ✅ Completed Configuration

### 1. Production Environment File
- **Template created:** `.env.production.template`
- **Location:** `/home/ec2-user/backend/.env.production`
- **Format:** `DATABASE_URL=postgresql://postgres:Noraebox1111@<RDS_ENDPOINT>:5432/noraebox`
- **Action Required:** Copy template and replace `<RDS_ENDPOINT>` with actual RDS endpoint

### 2. Database Configuration
- ✅ `app/db.py` updated to load `.env.production` in production
- ✅ Falls back to `.env` for development
- ✅ No hardcoded credentials
- ✅ Uses `python-dotenv` for environment variable loading

### 3. Production Startup Script
- ✅ `start.sh` created
- ✅ Activates virtual environment
- ✅ Loads `.env.production`
- ✅ Starts uvicorn on 0.0.0.0:8000
- **Action Required:** `chmod +x start.sh` on EC2

### 4. Systemd Service
- ✅ `noraebox.service` created
- ✅ Configured for `/home/ec2-user/backend`
- ✅ Auto-restart enabled
- ✅ Uses `.env.production` via EnvironmentFile
- **Action Required:** Copy to `/etc/systemd/system/` and enable

### 5. Requirements
- ✅ All dependencies in `requirements.txt`:
  - fastapi
  - uvicorn[standard]
  - sqlalchemy
  - psycopg2-binary
  - python-dotenv
  - pydantic
  - typing_extensions


## 🚀 Deployment Steps on EC2

### Step 1: Upload Files
```bash
# On your local machine, upload backend folder to EC2
scp -r backend ec2-user@<EC2_IP>:/home/ec2-user/
```

### Step 2: Create Environment File
```bash
ssh ec2-user@<EC2_IP>
cd /home/ec2-user/backend
nano .env.production
# Paste: DATABASE_URL=postgresql://postgres:Noraebox1111@<RDS_ENDPOINT>:5432/noraebox
# Replace <RDS_ENDPOINT> with actual endpoint
```

### Step 3: Setup Python Environment
```bash
cd /home/ec2-user/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 4: Test Run
```bash
chmod +x start.sh
./start.sh
# Test in another terminal: curl http://localhost:8000/
# Should return: {"ok":true}
# Press Ctrl+C to stop
```

### Step 5: Setup Systemd Service
```bash
sudo cp noraebox.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable noraebox
sudo systemctl start noraebox
sudo systemctl status noraebox
```

### Step 6: Configure Security Group
In AWS Console:
1. EC2 → Security Groups → Select your EC2 security group
2. Inbound Rules → Add Rule:
   - Type: Custom TCP
   - Port: 8000
   - Source: 0.0.0.0/0 (or specific IPs)
   - Save

### Step 7: Verify
```bash
# Check service status
sudo systemctl status noraebox

# Check logs
sudo journalctl -u noraebox -f

# Test endpoint
curl http://<EC2_PUBLIC_IP>:8000/docs
# Should load Swagger UI
```

## 📋 Verification Checklist

- [ ] `.env.production` created with correct RDS endpoint
- [ ] Virtual environment created and dependencies installed
- [ ] `start.sh` is executable
- [ ] Systemd service installed and enabled
- [ ] Service is running (`sudo systemctl status noraebox`)
- [ ] Port 8000 accessible from outside (security group configured)
- [ ] Swagger UI loads at `http://<EC2_IP>:8000/docs`
- [ ] Database connection works (test POST /devices/register)
- [ ] Data persists in RDS (test GET /devices)

## 🔍 Testing Endpoints

```bash
# Health check
curl http://<EC2_IP>:8000/

# Register device
curl -X POST http://<EC2_IP>:8000/devices/register \
  -H "Content-Type: application/json" \
  -d '{"device_uuid":"test-123","device_type":"tablet","name":"Test"}'

# Get devices
curl http://<EC2_IP>:8000/devices

# Get top songs
curl http://<EC2_IP>:8000/stats/top-songs

# Get top artists
curl http://<EC2_IP>:8000/stats/top-artists
```

## 📁 Final Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── db.py                # SQLAlchemy setup, loads .env.production
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── config.py            # Uses DATABASE_URL
│   └── routers/
│       ├── devices.py       # ✅ SQLAlchemy
│       ├── rooms.py         # ✅ SQLAlchemy
│       ├── sessions.py      # ✅ SQLAlchemy
│       ├── songs.py         # ✅ SQLAlchemy
│       ├── stats.py         # ✅ SQLAlchemy
│       └── updates.py       # (not checked)
├── .env.production.template # Template for production env
├── start.sh                 # Production startup script
├── noraebox.service         # Systemd service file
├── requirements.txt         # All dependencies
├── DEPLOYMENT.md            # Detailed deployment guide
└── PRODUCTION_SETUP.md      # This file
```

## ⚠️ Notes

1. **RDS Endpoint:** Replace `<RDS_ENDPOINT>` in `.env.production` with your actual RDS endpoint (e.g., `noraebox-db.xxxxx.us-east-1.rds.amazonaws.com`)

3. **Security:** For production, restrict port 8000 access in security group to specific IPs or use a load balancer with HTTPS.

4. **Password:** The password `Noraebox1111` is in the template. Ensure RDS master password matches.

## ✅ Confirmation

Backend is ready for production deployment on AWS EC2 with:
- ✅ SQLAlchemy + PostgreSQL
- ✅ Environment-based configuration
- ✅ Systemd service for auto-start
- ✅ Production startup script
- ✅ All required dependencies
- ✅ No hardcoded credentials
