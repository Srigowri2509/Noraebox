"""
fix-mp4-orchestrator — list all MP4s in noraebox-audio-storage and invoke
fix-mp4-h264 asynchronously for each (InvocationType=Event).
"""

from __future__ import annotations

import json
import os

import boto3

SRC_BUCKET = os.environ.get("SRC_BUCKET", "noraebox-audio-storage")
WORKER_FUNCTION = os.environ.get("WORKER_FUNCTION", "fix-mp4-h264")
AWS_REGION = os.environ.get("AWS_REGION", "ap-south-2")

s3 = boto3.client("s3", region_name=AWS_REGION)
lambda_client = boto3.client("lambda", region_name=AWS_REGION)


def _list_mp4_keys(bucket: str) -> list[str]:
    keys: list[str] = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.lower().endswith(".mp4"):
                keys.append(key)
    return keys


def lambda_handler(event, context):
    keys = _list_mp4_keys(SRC_BUCKET)
    invoked = 0
    errors: list[dict] = []

    print(f"Found {len(keys)} MP4 object(s); invoking {WORKER_FUNCTION} for each")

    for key in keys:
        payload = json.dumps({"key": key})
        try:
            lambda_client.invoke(
                FunctionName=WORKER_FUNCTION,
                InvocationType="Event",
                Payload=payload,
            )
            invoked += 1
        except Exception as exc:  # noqa: BLE001 — collect per-key failures
            errors.append({"key": key, "error": str(exc)})

    result = {
        "status": "ok" if not errors else "partial",
        "total_mp4": len(keys),
        "invoked": invoked,
        "failed_invocations": len(errors),
        "worker": WORKER_FUNCTION,
        "region": AWS_REGION,
    }
    if errors:
        result["errors_sample"] = errors[:20]
    print(json.dumps(result))
    return result
