"""
fix-mp4-h264 — re-encode one MP4 from noraebox-audio-storage to H.264 in
noraebox-audio-storage-fixed with a fixed_<Language>/ prefix.

Event: {"key": "English/song.mp4"}
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.request
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

# Import shared helper (copied into deployment zip at build time).
from s3_keys import dest_key_for

SRC_BUCKET = os.environ.get("SRC_BUCKET", "noraebox-audio-storage")
DEST_BUCKET = os.environ.get("DEST_BUCKET", "noraebox-audio-storage-fixed")
FFMPEG_URL = os.environ.get(
    "FFMPEG_URL",
    "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n7.1-2/ffmpeg-linux-x64",
)
FFMPEG_PATH = "/tmp/ffmpeg"
WORKDIR = Path("/tmp/transcode")

s3 = boto3.client("s3")


def _get_ffmpeg() -> str:
    if os.path.isfile(FFMPEG_PATH) and os.access(FFMPEG_PATH, os.X_OK):
        return FFMPEG_PATH
    print(f"Downloading ffmpeg from {FFMPEG_URL}")
    urllib.request.urlretrieve(FFMPEG_URL, FFMPEG_PATH)
    os.chmod(FFMPEG_PATH, 0o755)
    return FFMPEG_PATH


def _safe_local_name(key: str) -> str:
    return key.replace("/", "__")


def lambda_handler(event, context):
    source_key = (event or {}).get("key")
    if not source_key:
        return {"status": "error", "message": "Missing 'key' in event"}

    dest_key = dest_key_for(source_key)
    if not dest_key:
        return {"status": "skipped", "reason": "non-media path", "key": source_key}

    try:
        s3.head_object(Bucket=DEST_BUCKET, Key=dest_key)
        return {"status": "skipped", "reason": "already exists", "dest_key": dest_key}
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") not in ("404", "NoSuchKey"):
            raise

    WORKDIR.mkdir(parents=True, exist_ok=True)
    safe = _safe_local_name(source_key)
    local_in = WORKDIR / f"in_{safe}"
    local_out = WORKDIR / f"out_{safe}"

    try:
        print(f"Downloading s3://{SRC_BUCKET}/{source_key}")
        s3.download_file(SRC_BUCKET, source_key, str(local_in))

        ffmpeg = _get_ffmpeg()
        cmd = [
            ffmpeg,
            "-y",
            "-i",
            str(local_in),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(local_out),
        ]
        print(f"Running: {' '.join(cmd)}")
        subprocess.run(cmd, check=True, capture_output=True, text=True)

        print(f"Uploading s3://{DEST_BUCKET}/{dest_key}")
        s3.upload_file(
            str(local_out),
            DEST_BUCKET,
            dest_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )

        return {
            "status": "ok",
            "source_key": source_key,
            "dest_key": dest_key,
            "request_id": getattr(context, "aws_request_id", None),
        }
    finally:
        for path in (local_in, local_out):
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
