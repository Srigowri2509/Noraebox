import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import os
from urllib.parse import quote, unquote, urlparse

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

# Always available for server-side streaming (fixes browser playback when S3
# objects have application/octet-stream or missing CORS).
_streaming_s3_client = None


def get_streaming_s3_client():
    global _streaming_s3_client
    if _streaming_s3_client is None:
        _streaming_s3_client = boto3.client(
            "s3",
            region_name=AWS_REGION,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "virtual"},
            ),
        )
    return _streaming_s3_client


def _presign_get_params(full_key: str):
    return {
        "Bucket": S3_BUCKET_NAME,
        "Key": full_key,
        "ResponseContentType": "video/mp4",
        "ResponseContentDisposition": 'inline; filename="video.mp4"',
    }


def resolve_full_s3_key(s3_key: str, language: str = None):
    """
    Resolve DB file_url + language into the full S3 object key.
    Returns None when s3_key is empty or a non-S3 HTTP URL.
    """
    if not s3_key:
        return None

    if s3_key.startswith("http://") or s3_key.startswith("https://"):
        parsed = urlparse(s3_key)
        host = (parsed.netloc or "").lower()
        path = unquote((parsed.path or "").lstrip("/"))

        is_s3_url = S3_BUCKET_NAME.lower() in host or "amazonaws.com" in host

        if is_s3_url and path:
            if path.startswith(f"{S3_BUCKET_NAME}/"):
                path = path[len(S3_BUCKET_NAME) + 1 :]
            s3_key = path
        else:
            return None

    prefix = None
    if language:
        prefix = language.strip().strip("/")
    elif S3_KEY_PREFIX:
        prefix = S3_KEY_PREFIX.strip().strip("/")

    if prefix:
        key_starts_with_prefix = s3_key.startswith(prefix + "/")
        has_any_language_prefix = "/" in s3_key and not s3_key.startswith("/")

        if not key_starts_with_prefix:
            if has_any_language_prefix:
                full_key = s3_key.lstrip("/")
            else:
                full_key = prefix + "/" + s3_key.lstrip("/")
        else:
            full_key = s3_key.lstrip("/")
    else:
        full_key = s3_key.lstrip("/")

    _, key_ext = os.path.splitext(full_key.rsplit("/", 1)[-1])
    if not key_ext:
        full_key = f"{full_key}.mp4"

    return full_key


def open_s3_object(full_key: str, range_header: str = None):
    """Open an S3 object for streaming (supports HTTP Range for HTML5 video)."""
    params = {"Bucket": S3_BUCKET_NAME, "Key": full_key}
    if range_header:
        params["Range"] = range_header
    return get_streaming_s3_client().get_object(**params)


def get_file_url(s3_key: str, language: str = None):
    """
    Get the URL for an S3 object.
    
    For public buckets: Returns a simple public URL (no signature, no expiry)
    For private buckets: Returns a presigned URL (with signature and expiry)
    
    Args:
        s3_key: The S3 object key (e.g. 'Undipova.mp4' or 'Telugu/song.mp4')
        language: Optional language name (e.g. 'Telugu', 'Hindi', 'English') to use as prefix.
                  If provided, will be used instead of S3_KEY_PREFIX.
                  If not provided, falls back to S3_KEY_PREFIX if set.
    
    s3_key can be:
    - Just the object key (e.g. 'Undipova.mp4')
    - A full S3 URL (will be returned as-is if it's already a URL)
    - Already prefixed (e.g. 'Telugu/song.mp4') - will be used as-is
    
    The language prefix will be automatically added if the key doesn't already have it.
    """
    if not s3_key:
        return None

    if s3_key.startswith("http://") or s3_key.startswith("https://"):
        parsed = urlparse(s3_key)
        host = (parsed.netloc or "").lower()
        is_s3_url = S3_BUCKET_NAME.lower() in host or "amazonaws.com" in host
        if not is_s3_url:
            return s3_key

    full_key = resolve_full_s3_key(s3_key, language=language)
    if not full_key:
        return None

    # For public buckets, return simple URL
    if S3_PUBLIC_BUCKET:
        if not S3_BUCKET_NAME:
            raise RuntimeError("S3_BUCKET_NAME must be set when using public bucket mode")
        
        # Ensure no double slashes in URL
        base_url = S3_BASE_URL.rstrip('/')
        key_path = full_key.lstrip('/')
        # URL-encode the key path to handle spaces and special characters,
        # but DO NOT encode '+' or other safe characters that S3 keys
        # commonly use literally (e.g. 'arere+yekkada.mp4').
        #
        # If we encode '+' as '%2B', it won't match your actual object key
        # and S3 will return 404, which is exactly what was causing
        # "Failed to load video" for keys like 'Telugu/Some+Song.mp4'.
        # Encode each segment separately to preserve forward slashes
        # Allow typical safe characters used in S3 keys
        SAFE_CHARS = "-_.~+"
        path_parts = key_path.split('/')
        encoded_parts = [quote(part, safe=SAFE_CHARS) for part in path_parts]
        encoded_key = '/'.join(encoded_parts)
        url = f"{base_url}/{encoded_key}"
        return url
    
    # For private buckets, generate presigned URL
    if not s3_client:
        raise RuntimeError("S3 client not initialized. Set S3_PUBLIC_BUCKET=false for private buckets.")
    
    S3_SIGNED_URL_EXPIRATION = int(os.getenv("S3_SIGNED_URL_EXPIRATION", 3600))
    
    try:
        url = s3_client.generate_presigned_url(
            "get_object",
            Params=_presign_get_params(full_key),
            ExpiresIn=S3_SIGNED_URL_EXPIRATION,
        )
        return url
    except Exception as e:
        print(f"❌ ERROR generating presigned URL for key '{full_key}' (original: '{s3_key}'): {e}")
        # Fallback: try the raw key from DB (without language/prefix expansion).
        raw_key = s3_key.lstrip("/")
        if raw_key and raw_key != full_key:
            try:
                print(f"⚠️ Trying raw key fallback: {raw_key}")
                url = s3_client.generate_presigned_url(
                    "get_object",
                    Params=_presign_get_params(raw_key),
                    ExpiresIn=S3_SIGNED_URL_EXPIRATION,
                )
                print(f"✅ Generated presigned URL using raw key: {raw_key}")
                return url
            except Exception as e2:
                print(f"❌ ERROR generating presigned URL with raw key '{raw_key}': {e2}")
        raise


# Keep generate_signed_url for backward compatibility, but it now uses get_file_url
def generate_signed_url(s3_key: str, expiration: int = None, language: str = None):
    """
    Backward compatibility wrapper for get_file_url.
    
    Args:
        s3_key: The S3 object key
        expiration: Ignored (kept for backward compatibility)
        language: Optional language name to use as prefix (e.g. 'Telugu', 'Hindi')
    """
    return get_file_url(s3_key, language=language)


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