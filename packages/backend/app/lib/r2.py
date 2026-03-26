"""Cloudflare R2 storage client (S3-compatible)."""

from __future__ import annotations

import boto3
from botocore.config import Config as BotoConfig

from app.config import get_settings


def _get_r2_client():
    """Create a boto3 S3 client configured for Cloudflare R2."""
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        config=BotoConfig(signature_version="s3v4"),
        region_name="auto",
    )


def upload_file(file_obj, key: str, content_type: str = "application/octet-stream") -> str:
    """Upload a file-like object to R2. Returns the object key."""
    settings = get_settings()
    client = _get_r2_client()
    client.upload_fileobj(file_obj, settings.CLOUDFLARE_R2_BUCKET, key, ExtraArgs={"ContentType": content_type})
    return key


def download_file(key: str, local_path: str) -> str:
    """Download an object from R2 to a local file. Returns the local path."""
    settings = get_settings()
    client = _get_r2_client()
    client.download_file(settings.CLOUDFLARE_R2_BUCKET, key, local_path)
    return local_path


def generate_signed_url(key: str, expires_in: int = 604800) -> str:
    """Generate a pre-signed download URL (default 7 days)."""
    settings = get_settings()
    client = _get_r2_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.CLOUDFLARE_R2_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )


def delete_file(key: str) -> None:
    """Delete an object from R2."""
    settings = get_settings()
    client = _get_r2_client()
    client.delete_object(Bucket=settings.CLOUDFLARE_R2_BUCKET, Key=key)
