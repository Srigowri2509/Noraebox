# MP4 H.264 fix — AWS Lambda

Two functions in **ap-south-2** that mirror the EC2 `fix_videos.sh` workflow at scale.

## Functions

| Name | Purpose |
|------|---------|
| **fix-mp4-h264** | One file: download → ffmpeg H.264 → upload to `noraebox-audio-storage-fixed` as `fixed_<Language>/...` |
| **fix-mp4-orchestrator** | Lists all `.mp4` in `noraebox-audio-storage` and invokes **fix-mp4-h264** with `InvocationType=Event` for each |

### Worker event

```json
{ "key": "English/song.mp4" }
```

### Worker behavior

- Skips if destination object already exists
- Skips `updates/` paths
- Downloads ffmpeg on cold start from [shaka static ffmpeg](https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n7.1-2/ffmpeg-linux-x64)
- Encode: `-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -movflags +faststart`

### Orchestrator

Fires **all** MP4 keys asynchronously in parallel (subject to account Lambda concurrency limits).

## Deploy

Requires AWS CLI credentials with IAM + Lambda + S3 permissions.

**Linux / EC2:**

```bash
cd lambda
chmod +x deploy.sh
./deploy.sh
```

**Windows:**

```powershell
cd lambda
.\deploy.ps1
```

Creates/updates:

- IAM role `noraebox-fix-mp4-lambda-role` (S3 read/write + `lambda:InvokeFunction` + logs)
- Lambda **fix-mp4-h264** — 900s timeout, 3008 MB RAM, 10 GB `/tmp`
- Lambda **fix-mp4-orchestrator** — 900s timeout

## Run

**All files (~1077 async jobs):**

```bash
aws lambda invoke \
  --function-name fix-mp4-orchestrator \
  --region ap-south-2 \
  --payload '{}' \
  /tmp/orch-out.json && cat /tmp/orch-out.json
```

**Single file (sync test):**

```bash
aws lambda invoke \
  --function-name fix-mp4-h264 \
  --region ap-south-2 \
  --payload '{"key":"English/song.mp4"}' \
  /tmp/worker-out.json && cat /tmp/worker-out.json
```

## Concurrency

Default account concurrency is often **1000**. With ~1077 invokes, some may throttle until slots free. To allow more parallel workers:

```bash
aws lambda put-function-concurrency \
  --function-name fix-mp4-h264 \
  --reserved-concurrent-executions 500 \
  --region ap-south-2
```

Adjust reserved concurrency vs. other Lambdas in the account.

## Logs

```bash
aws logs tail /aws/lambda/fix-mp4-h264 --follow --region ap-south-2
aws logs tail /aws/lambda/fix-mp4-orchestrator --follow --region ap-south-2
```
