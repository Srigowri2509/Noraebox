# Noraebox Backend - AWS EC2 Deployment Guide

## Prerequisites

- AWS EC2 instance running (Ubuntu/Amazon Linux)
- AWS RDS PostgreSQL database created
- Database name: `noraebox`
- Tables already created in RDS

## 1. Environment Setup

### Create `.env.production` file

```bash
cd /home/ec2-user/backend
nano .env.production
```

Add the following (replace `<RDS_ENDPOINT>` with your actual RDS endpoint):

```
DATABASE_URL=postgresql://postgres:<YOUR_PASSWORD>@<RDS_ENDPOINT>:5432/noraebox
```

**Important:** Replace `<RDS_ENDPOINT>` with your actual RDS endpoint (e.g., `noraebox-db.xxxxx.us-east-1.rds.amazonaws.com`)

### Verify RDS Security Group

Ensure your RDS security group allows inbound connections from your EC2 instance:
- Type: PostgreSQL
- Port: 5432
- Source: EC2 security group or EC2 private IP

## 2. Install Dependencies

```bash
cd /home/ec2-user/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

## 3. Test Run

```bash
# Make start.sh executable
chmod +x start.sh

# Test run (optional)
./start.sh
```

Press Ctrl+C to stop. If it works, proceed to systemd setup.

## 4. Setup Systemd Service

### Copy service file

```bash
sudo cp noraebox.service /etc/systemd/system/
```

### Update paths if needed

Edit the service file if your paths differ:

```bash
sudo nano /etc/systemd/system/noraebox.service
```

### Enable and start service

```bash
sudo systemctl daemon-reload
sudo systemctl enable noraebox
sudo systemctl start noraebox
```

### Check status

```bash
sudo systemctl status noraebox
```

### View logs

```bash
sudo journalctl -u noraebox -f
```

## 5. Configure EC2 Security Group

In AWS Console → EC2 → Security Groups:

1. Select your EC2 instance's security group
2. Add inbound rule:
   - Type: Custom TCP
   - Port: 8000
   - Source: 0.0.0.0/0 (for testing) or your specific IP range
   - Description: FastAPI Backend

**Security Note:** For production, restrict source to specific IPs or use a load balancer.

## 6. Verify Deployment

### Check if backend is running

```bash
curl http://localhost:8000/
# Should return: {"ok":true}
```

### Access Swagger UI

Open in browser:
```
http://<EC2_PUBLIC_IP>:8000/docs
```

### Test endpoints

```bash
# Test device registration
curl -X POST http://<EC2_PUBLIC_IP>:8000/devices/register \
  -H "Content-Type: application/json" \
  -d '{"device_uuid":"test-123","device_type":"tablet","name":"Test Device"}'

# Test get devices
curl http://<EC2_PUBLIC_IP>:8000/devices

# Test stats
curl http://<EC2_PUBLIC_IP>:8000/stats/top-songs
```

## 7. Service Management

### Stop service
```bash
sudo systemctl stop noraebox
```

### Start service
```bash
sudo systemctl start noraebox
```

### Restart service
```bash
sudo systemctl restart noraebox
```

### Disable auto-start
```bash
sudo systemctl disable noraebox
```

## 8. Troubleshooting

### Check if port is listening
```bash
sudo netstat -tlnp | grep 8000
```

### Check database connection
```bash
# Test from EC2
psql -h <RDS_ENDPOINT> -U postgres -d noraebox
```

### View application logs
```bash
sudo journalctl -u noraebox -n 50
```

### Check environment variables
```bash
sudo systemctl show noraebox | grep EnvironmentFile
```

## 9. Update Application

When updating the code:

```bash
cd /home/ec2-user/backend
source venv/bin/activate
git pull  # or copy new files
pip install -r requirements.txt
sudo systemctl restart noraebox
```

## 10. Production Recommendations

1. **Use HTTPS:** Set up nginx reverse proxy with SSL certificate
2. **Restrict Security Group:** Limit port 8000 access to specific IPs
3. **Use Secrets Manager:** Store DATABASE_URL in AWS Secrets Manager
4. **Enable Logging:** Set up CloudWatch logs
5. **Monitor Health:** Set up health checks and alerts
6. **Backup Database:** Configure automated RDS backups

## Environment Variables

The application uses:
- `DATABASE_URL`: PostgreSQL connection string
- Loads from `.env.production` in production
- Falls back to `.env` for development

No hardcoded credentials are used.
