# APK Storage Directory

This directory stores APK files and manifests for the auto-update system.

## Files Stored Here:

- `{app-name}_manifest.json` - Version information and metadata
- `{app-name}-v{version}.apk` - The actual APK files

## Example Manifest:

```json
{
  "version": "1.0.0",
  "app_name": "tablet-app",
  "apk_filename": "tablet-app-v1.0.0.apk",
  "release_date": "2024-01-15T10:30:00Z",
  "release_notes": "Initial release",
  "force_update": false,
  "file_size": 15728640
}
```

## Usage:

Upload APKs using:
```powershell
.\scripts\upload-apk.ps1 -AppName tablet-app
```

The script will automatically:
1. Build the APK
2. Copy it here
3. Create/update the manifest

