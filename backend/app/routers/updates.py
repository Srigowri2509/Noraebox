from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import json
import os

router = APIRouter()

# Path where APKs/IPAs are stored (relative to backend directory)
APK_STORAGE = Path(__file__).parent.parent.parent / "apk_storage"
IPA_STORAGE = Path(__file__).parent.parent.parent / "apk_storage"  # Same directory for now

# Create storage directory if it doesn't exist
APK_STORAGE.mkdir(exist_ok=True)
IPA_STORAGE.mkdir(exist_ok=True)

@router.get("/check/{app_name}")
def check_update(app_name: str, current_version: str = "0.0.0"):
    """Check if update is available for an app"""
    try:
        manifest_path = APK_STORAGE / f"{app_name}_manifest.json"
        
        if not manifest_path.exists():
            return {
                "update_available": False,
                "message": "No manifest found",
                "current_version": current_version,
                "latest_version": current_version
            }
        
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        
        latest_version = manifest.get("version", "0.0.0")
        
        # Compare versions (simple string comparison, can be improved)
        update_available = latest_version != current_version
        
        return {
            "update_available": update_available,
            "current_version": current_version,
            "latest_version": latest_version,
            "download_url": f"/updates/download/{app_name}" if update_available else None,
            "release_notes": manifest.get("release_notes", ""),
            "force_update": manifest.get("force_update", False),
            "file_size": manifest.get("file_size", 0)
        }
    except Exception as e:
        print(f"Error checking update: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download/{app_name}")
def download_apk(app_name: str, platform: str = "android"):
    """Download the latest APK/IPA for an app"""
    try:
        manifest_path = APK_STORAGE / f"{app_name}_manifest.json"
        
        if not manifest_path.exists():
            raise HTTPException(status_code=404, detail="App not found")
        
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        
        # Check for platform-specific file (ipa_filename for iOS, apk_filename for Android)
        if platform.lower() == "ios":
            filename = manifest.get("ipa_filename") or manifest.get("apk_filename")
            media_type = "application/octet-stream"
            storage_path = IPA_STORAGE
        else:
            filename = manifest.get("apk_filename") or manifest.get("ipa_filename")
            media_type = "application/vnd.android.package-archive"
            storage_path = APK_STORAGE
        
        if not filename:
            raise HTTPException(status_code=404, detail=f"{platform.upper()} file not found in manifest")
        
        file_path = storage_path / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")
        
        return FileResponse(
            file_path,
            media_type=media_type,
            filename=filename,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error downloading file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/manifest/{app_name}")
def get_manifest(app_name: str):
    """Get full update manifest for an app"""
    try:
        manifest_path = APK_STORAGE / f"{app_name}_manifest.json"
        
        if not manifest_path.exists():
            raise HTTPException(status_code=404, detail="App not found")
        
        with open(manifest_path, 'r') as f:
            return json.load(f)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting manifest: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list")
def list_apps():
    """List all available apps for update"""
    try:
        apps = []
        for manifest_file in APK_STORAGE.glob("*_manifest.json"):
            app_name = manifest_file.stem.replace("_manifest", "")
            with open(manifest_file, 'r') as f:
                manifest = json.load(f)
                apps.append({
                    "app_name": app_name,
                    "version": manifest.get("version", "0.0.0"),
                    "release_date": manifest.get("release_date", ""),
                    "release_notes": manifest.get("release_notes", "")
                })
        return {"apps": apps}
    except Exception as e:
        print(f"Error listing apps: {e}")
        raise HTTPException(status_code=500, detail=str(e))

