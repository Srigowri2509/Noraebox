#!/usr/bin/env bash
# Check whether a karaoke MP4 is browser-safe (h264) or likely to fail (hevc).
# Usage:
#   ./check_video_codec.sh path/to/video.mp4
#   ./check_video_codec.sh "https://bucket.s3.region.amazonaws.com/English/song.mp4"

set -euo pipefail

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe not found. Install ffmpeg first (e.g. sudo apt install ffmpeg)."
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 <local-file-or-url>"
  exit 1
fi

TARGET="$1"
echo "Probing: $TARGET"
echo "---"

ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height \
  -of default=noprint_wrappers=1 "$TARGET"

VIDEO_CODEC="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$TARGET")"
echo "---"
echo "Video codec: $VIDEO_CODEC"

case "$VIDEO_CODEC" in
  h264|avc1|avc3)
    echo "OK for web/TV HTML5 playback."
    ;;
  hevc|h265|hev1|hvc1)
    echo "PROBLEM: HEVC/H.265 — most browsers and many TVs will show blank/frozen video."
    echo "Re-encode to H.264: ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mp4"
    ;;
  *)
    echo "Unknown codec — verify in a browser <video> tag."
    ;;
esac
