import boto3
import os

AWS_REGION = os.getenv("AWS_REGION", "ap-south-2")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_SIGNED_URL_EXPIRATION = int(os.getenv("S3_SIGNED_URL_EXPIRATION", 3600))

s3_client = boto3.client("s3", region_name=AWS_REGION)

def generate_signed_url(s3_key: str, expiration: int = None):
    if not s3_key:
        return None

    expiration = expiration or S3_SIGNED_URL_EXPIRATION

    return s3_client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": S3_BUCKET_NAME,
            "Key": s3_key
        },
        ExpiresIn=expiration
    )