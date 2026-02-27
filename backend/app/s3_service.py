import boto3
from botocore.config import Config
import os

# Environment variables
AWS_REGION = os.getenv("AWS_REGION", "ap-south-2")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_SIGNED_URL_EXPIRATION = int(os.getenv("S3_SIGNED_URL_EXPIRATION", 3600))

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
    """
    if not s3_key:
        return None

    expiration = expiration or S3_SIGNED_URL_EXPIRATION

    return s3_client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": S3_BUCKET_NAME,
            "Key": s3_key,
        },
        ExpiresIn=expiration,
    )