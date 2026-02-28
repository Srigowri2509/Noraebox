import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import os

# Environment variables
AWS_REGION = os.getenv("AWS_REGION", "ap-south-2")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_SIGNED_URL_EXPIRATION = int(os.getenv("S3_SIGNED_URL_EXPIRATION", 3600))
S3_KEY_PREFIX = os.getenv("S3_KEY_PREFIX", "")  # Optional prefix like "songs/" or "videos/"

if not S3_BUCKET_NAME:
    raise RuntimeError("S3_BUCKET_NAME environment variable is not set")

# Force regional + virtual hosted style endpoint
s3_client = boto3.client(
    "s3",
    region_name=AWS_REGION,
    config=Config(
        signature_version="s3v4",
        s3={"addressing_style": "virtual"}
    )
)

def generate_signed_url(s3_key: str, expiration: int = None):
    """
    Generate a presigned URL for a private S3 object.
    s3_key should be only the object key (e.g. 'Undipova.mp4'),
    NOT a full S3 URL.
    
    If S3_KEY_PREFIX is set, it will be prepended to the key.
    """
    if not s3_key:
        return None

    expiration = expiration or S3_SIGNED_URL_EXPIRATION
    
    # Apply prefix if set (e.g., "songs/" or "videos/")
    # Remove leading slash from prefix if present, and ensure it ends with /
    prefix = S3_KEY_PREFIX.strip().strip('/')
    if prefix:
        prefix = prefix + '/'
    
    # Build full key: prefix + s3_key
    # Remove any leading slash from s3_key to avoid double slashes
    full_key = prefix + s3_key.lstrip('/')
    
    try:
        url = s3_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": S3_BUCKET_NAME,
                "Key": full_key,
            },
            ExpiresIn=expiration,
        )
        print(f"✅ Generated signed URL for key: {full_key} (original: {s3_key})")
        return url
    except Exception as e:
        print(f"❌ ERROR generating signed URL for key '{full_key}' (original: '{s3_key}'): {e}")
        # Try without prefix as fallback
        if prefix:
            try:
                print(f"⚠️ Trying without prefix: {s3_key}")
                url = s3_client.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": S3_BUCKET_NAME,
                        "Key": s3_key.lstrip('/'),
                    },
                    ExpiresIn=expiration,
                )
                print(f"✅ Generated signed URL without prefix for key: {s3_key}")
                return url
            except Exception as e2:
                print(f"❌ ERROR generating signed URL without prefix for key '{s3_key}': {e2}")
        raise


def check_key_exists(s3_key: str) -> bool:
    """
    Check if a key exists in S3 bucket.
    Returns True if exists, False otherwise.
    """
    if not s3_key:
        return False
    
    # Apply prefix if set
    prefix = S3_KEY_PREFIX.strip().strip('/')
    if prefix:
        prefix = prefix + '/'
    full_key = prefix + s3_key.lstrip('/')
    
    try:
        s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=full_key)
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            # Try without prefix
            if prefix:
                try:
                    s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=s3_key.lstrip('/'))
                    return True
                except:
                    return False
            return False
        raise