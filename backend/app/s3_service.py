import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import os

# Environment variables
AWS_REGION = os.getenv("AWS_REGION", "ap-south-2")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_KEY_PREFIX = os.getenv("S3_KEY_PREFIX", "")  # Optional prefix like "songs/" or "videos/"
S3_PUBLIC_BUCKET = os.getenv("S3_PUBLIC_BUCKET", "true").lower() == "true"  # Default to public bucket

if not S3_BUCKET_NAME:
    raise RuntimeError("S3_BUCKET_NAME environment variable is not set")

# Construct base URL for public bucket
S3_BASE_URL = f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com"

# Only create S3 client if bucket is private (for presigned URLs)
s3_client = None
if not S3_PUBLIC_BUCKET:
    s3_client = boto3.client(
        "s3",
        region_name=AWS_REGION,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"}
        )
    )

def get_file_url(s3_key: str):
    """
    Get the URL for an S3 object.
    
    For public buckets: Returns a simple public URL (no signature, no expiry)
    For private buckets: Returns a presigned URL (with signature and expiry)
    
    s3_key should be only the object key (e.g. 'Undipova.mp4'), NOT a full S3 URL.
    
    If S3_KEY_PREFIX is set, it will be prepended to the key.
    """
    if not s3_key:
        return None
    
    # Apply prefix if set (e.g., "songs/" or "videos/")
    prefix = S3_KEY_PREFIX.strip().strip('/')
    if prefix:
        prefix = prefix + '/'
    
    # Build full key: prefix + s3_key
    # Remove any leading slash from s3_key to avoid double slashes
    full_key = prefix + s3_key.lstrip('/')
    
    # For public buckets, return simple URL
    if S3_PUBLIC_BUCKET:
        # Ensure no double slashes in URL
        base_url = S3_BASE_URL.rstrip('/')
        key_path = full_key.lstrip('/')
        # URL-encode the key path to handle spaces and special characters
        from urllib.parse import quote
        # Encode each segment separately to preserve forward slashes
        # Split by '/' and encode each part, then join back
        path_parts = key_path.split('/')
        encoded_parts = [quote(part, safe='') for part in path_parts]
        encoded_key = '/'.join(encoded_parts)
        url = f"{base_url}/{encoded_key}"
        print(f"✅ Generated public URL: {url}")
        print(f"   - Bucket: {S3_BUCKET_NAME}, Region: {AWS_REGION}")
        print(f"   - Full key: {full_key} (original: {s3_key}, prefix: '{S3_KEY_PREFIX}')")
        print(f"   - Encoded key: {encoded_key}")
        return url
    
    # For private buckets, generate presigned URL
    if not s3_client:
        raise RuntimeError("S3 client not initialized. Set S3_PUBLIC_BUCKET=false for private buckets.")
    
    S3_SIGNED_URL_EXPIRATION = int(os.getenv("S3_SIGNED_URL_EXPIRATION", 3600))
    
    try:
        url = s3_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": S3_BUCKET_NAME,
                "Key": full_key,
            },
            ExpiresIn=S3_SIGNED_URL_EXPIRATION,
        )
        print(f"✅ Generated presigned URL for key: {full_key} (original: {s3_key})")
        return url
    except Exception as e:
        print(f"❌ ERROR generating presigned URL for key '{full_key}' (original: '{s3_key}'): {e}")
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
                    ExpiresIn=S3_SIGNED_URL_EXPIRATION,
                )
                print(f"✅ Generated presigned URL without prefix for key: {s3_key}")
                return url
            except Exception as e2:
                print(f"❌ ERROR generating presigned URL without prefix for key '{s3_key}': {e2}")
        raise


# Keep generate_signed_url for backward compatibility, but it now uses get_file_url
def generate_signed_url(s3_key: str, expiration: int = None):
    """
    Backward compatibility wrapper for get_file_url.
    """
    return get_file_url(s3_key)


def check_key_exists(s3_key: str) -> bool:
    """
    Check if a key exists in S3 bucket.
    Returns True if exists, False otherwise.
    Only works for private buckets (requires S3 client).
    """
    if not s3_key or S3_PUBLIC_BUCKET or not s3_client:
        # For public buckets, we can't easily check without making a request
        # Just return True and let the URL be tried
        return True
    
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