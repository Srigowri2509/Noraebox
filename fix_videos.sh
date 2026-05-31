#!/usr/bin/env bash
# Re-encode MP4s from noraebox-audio-storage -> noraebox-audio-storage-fixed
# with fixed_<Language>/ prefixes. Run on EC2 with AWS CLI credentials configured.

set -euo pipefail

SRC_BUCKET="noraebox-audio-storage"
DEST_BUCKET="noraebox-audio-storage-fixed"
WORKDIR="/tmp/noraebox-fix-videos"
LOG_FILE="/home/ec2-user/Noraebox/fix_videos.log"
LANGUAGE_FOLDER_PREFIX="fixed_"
KNOWN_LANGUAGE_ROOTS="Telugu Hindi Korean Punjabi English"

mkdir -p "$WORKDIR"
cd /home/ec2-user/Noraebox

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"
}

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    log "ERROR: required command not found: $1"
    exit 1
  fi
}

install_ffmpeg() {
  if command -v ffmpeg &>/dev/null; then
    log "ffmpeg already installed: $(ffmpeg -version | head -1)"
    return 0
  fi

  log "Installing ffmpeg via yum..."
  if sudo yum install -y ffmpeg >>"$LOG_FILE" 2>&1; then
    log "ffmpeg installed via yum: $(ffmpeg -version | head -1)"
    return 0
  fi

  log "yum install failed; downloading static ffmpeg binary..."
  local arch tar_url extract_dir ffmpeg_bin
  arch="$(uname -m)"
  case "$arch" in
    x86_64) tar_url="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" ;;
    aarch64|arm64) tar_url="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz" ;;
    *)
      log "ERROR: unsupported architecture for static ffmpeg: $arch"
      exit 1
      ;;
  esac

  extract_dir="/tmp/ffmpeg-static-$$"
  mkdir -p "$extract_dir"
  curl -fsSL "$tar_url" | tar -xJ -C "$extract_dir" --strip-components=1
  ffmpeg_bin="$(find "$extract_dir" -maxdepth 2 -type f -name ffmpeg | head -1)"
  if [[ -z "$ffmpeg_bin" ]]; then
    log "ERROR: static ffmpeg binary not found after extract"
    exit 1
  fi
  sudo install -m 0755 "$ffmpeg_bin" /usr/local/bin/ffmpeg
  rm -rf "$extract_dir"
  log "ffmpeg installed from static build: $(ffmpeg -version | head -1)"
}

dest_key_for() {
  local key="$1"
  local folder rest

  # Skip app update bundles; only migrate language media trees.
  if [[ "$key" == updates/* ]]; then
    echo ""
    return 0
  fi

  if [[ "$key" != */* ]]; then
    echo "$key"
    return 0
  fi

  folder="${key%%/*}"
  rest="${key#*/}"

  if [[ "$folder" == ${LANGUAGE_FOLDER_PREFIX}* ]]; then
    echo "$key"
    return 0
  fi

  for lang in $KNOWN_LANGUAGE_ROOTS; do
    if [[ "$folder" == "$lang" ]]; then
      echo "${LANGUAGE_FOLDER_PREFIX}${folder}/${rest}"
      return 0
    fi
  done

  # Unknown top-level folder: still apply fixed_ once (matches backend migration).
  echo "${LANGUAGE_FOLDER_PREFIX}${folder}/${rest}"
}

object_exists_in_dest() {
  local dest_key="$1"
  aws s3api head-object --bucket "$DEST_BUCKET" --key "$dest_key" &>/dev/null
}

process_one() {
  local s3_key="$1"
  local dest_key local_in local_out base

  dest_key="$(dest_key_for "$s3_key")"
  if [[ -z "$dest_key" ]]; then
    log "SKIP (non-media path): s3://$SRC_BUCKET/$s3_key"
    return 2
  fi

  if object_exists_in_dest "$dest_key"; then
    log "SKIP (already in dest): s3://$DEST_BUCKET/$dest_key"
    return 2
  fi

  base="$(basename "$s3_key")"
  # Unique temp names (filenames can repeat across language folders).
  safe_key="${s3_key//\//__}"
  local_in="$WORKDIR/in_${safe_key}"
  local_out="$WORKDIR/out_${safe_key}"

  log "START: s3://$SRC_BUCKET/$s3_key -> s3://$DEST_BUCKET/$dest_key"

  aws s3 cp "s3://${SRC_BUCKET}/${s3_key}" "$local_in" >>"$LOG_FILE" 2>&1

  if ! ffmpeg -y -i "$local_in" \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 192k \
    -movflags +faststart \
    "$local_out" >>"$LOG_FILE" 2>&1; then
    rm -f "$local_in" "$local_out"
    log "ERROR: ffmpeg failed for s3://$SRC_BUCKET/$s3_key"
    return 1
  fi

  if ! aws s3 cp "$local_out" "s3://${DEST_BUCKET}/${dest_key}" \
    --content-type "video/mp4" >>"$LOG_FILE" 2>&1; then
    rm -f "$local_in" "$local_out"
    log "ERROR: upload failed for s3://$DEST_BUCKET/$dest_key"
    return 1
  fi

  rm -f "$local_in" "$local_out"
  log "DONE: s3://$DEST_BUCKET/$dest_key"
  return 0
}

main() {
  log "========== fix_videos.sh started =========="
  log "Source: s3://$SRC_BUCKET  Dest: s3://$DEST_BUCKET  Workdir: $WORKDIR"

  require_cmd aws
  require_cmd curl
  install_ffmpeg

  local keys_file total processed failed skipped
  keys_file="$WORKDIR/mp4_keys.txt"
  : >"$keys_file"

  log "Listing MP4 objects in s3://$SRC_BUCKET ..."
  python3 - <<PY >"$keys_file" 2>>"$LOG_FILE"
import json
import subprocess

bucket = "${SRC_BUCKET}"
token = None
keys = []

while True:
    cmd = ["aws", "s3api", "list-objects-v2", "--bucket", bucket, "--output", "json"]
    if token:
        cmd.extend(["--continuation-token", token])
    resp = json.loads(subprocess.check_output(cmd))
    for obj in resp.get("Contents", []):
        key = obj["Key"]
        if key.lower().endswith(".mp4"):
            keys.append(key)
    if not resp.get("IsTruncated"):
        break
    token = resp.get("NextContinuationToken")

for key in sorted(set(keys)):
    print(key)
PY

  total="$(wc -l <"$keys_file" | tr -d ' ')"
  log "Found $total MP4 file(s) to evaluate"

  processed=0
  failed=0
  skipped=0

  while IFS= read -r s3_key || [[ -n "$s3_key" ]]; do
    [[ -z "$s3_key" ]] && continue
    set +e
    process_one "$s3_key"
    rc=$?
    set -e
    case "$rc" in
      0) processed=$((processed + 1)) ;;
      2) skipped=$((skipped + 1)) ;;
      *) failed=$((failed + 1)) ;;
    esac
  done <"$keys_file"

  log "========== fix_videos.sh finished =========="
  log "Summary: total=$total encoded=$processed skipped=$skipped failed=$failed"
}

main "$@"
