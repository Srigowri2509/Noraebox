#!/usr/bin/env bash
# Deploy fix-mp4-h264 and fix-mp4-orchestrator to AWS Lambda (ap-south-2).
set -euo pipefail

REGION="${AWS_REGION:-ap-south-2}"
ROLE_NAME="${LAMBDA_ROLE_NAME:-noraebox-fix-mp4-lambda-role}"
WORKER_NAME="fix-mp4-h264"
ORCH_NAME="fix-mp4-orchestrator"
RUNTIME="python3.12"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Region: $REGION"
echo "Role:   $ROLE_NAME"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

ensure_role() {
  if aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
    echo "IAM role exists: $ROLE_NAME"
  else
    echo "Creating IAM role: $ROLE_NAME"
    aws iam create-role \
      --role-name "$ROLE_NAME" \
      --assume-role-policy-document "file://${ROOT}/iam/trust-policy.json"
    sleep 10
  fi

  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name noraebox-fix-mp4-inline \
    --policy-document "file://${ROOT}/iam/lambda-policy.json"
}

build_worker_zip() {
  local build_dir="${ROOT}/.build/worker"
  rm -rf "$build_dir"
  mkdir -p "$build_dir"
  cp "${ROOT}/fix-mp4-h264/handler.py" "$build_dir/"
  cp "${ROOT}/shared/s3_keys.py" "$build_dir/"
  (cd "$build_dir" && zip -q "${ROOT}/.build/${WORKER_NAME}.zip" handler.py s3_keys.py)
  echo "${ROOT}/.build/${WORKER_NAME}.zip"
}

build_orchestrator_zip() {
  local build_dir="${ROOT}/.build/orchestrator"
  rm -rf "$build_dir"
  mkdir -p "$build_dir"
  cp "${ROOT}/fix-mp4-orchestrator/handler.py" "$build_dir/"
  (cd "$build_dir" && zip -q "${ROOT}/.build/${ORCH_NAME}.zip" handler.py)
  echo "${ROOT}/.build/${ORCH_NAME}.zip"
}

upsert_lambda() {
  local name="$1"
  local zip_path="$2"
  local handler="$3"
  local timeout="$4"
  local memory="$5"
  local ephemeral="${6:-512}"

  if aws lambda get-function --function-name "$name" --region "$REGION" &>/dev/null; then
    echo "Updating Lambda: $name"
    aws lambda update-function-code \
      --function-name "$name" \
      --zip-file "fileb://${zip_path}" \
      --region "$REGION" >/dev/null
    aws lambda wait function-updated --function-name "$name" --region "$REGION"
    aws lambda update-function-configuration \
      --function-name "$name" \
      --runtime "$RUNTIME" \
      --handler "$handler" \
      --role "$ROLE_ARN" \
      --timeout "$timeout" \
      --memory-size "$memory" \
      --ephemeral-storage "Size=${ephemeral}" \
      --environment "Variables={SRC_BUCKET=noraebox-audio-storage,DEST_BUCKET=noraebox-audio-storage-fixed,AWS_REGION=${REGION}}" \
      --region "$REGION" >/dev/null
  else
    echo "Creating Lambda: $name"
    aws lambda create-function \
      --function-name "$name" \
      --runtime "$RUNTIME" \
      --role "$ROLE_ARN" \
      --handler "$handler" \
      --zip-file "fileb://${zip_path}" \
      --timeout "$timeout" \
      --memory-size "$memory" \
      --ephemeral-storage "Size=${ephemeral}" \
      --environment "Variables={SRC_BUCKET=noraebox-audio-storage,DEST_BUCKET=noraebox-audio-storage-fixed,AWS_REGION=${REGION}}" \
      --region "$REGION" >/dev/null
  fi
}

mkdir -p "${ROOT}/.build"
ensure_role

WORKER_ZIP="$(build_worker_zip)"
ORCH_ZIP="$(build_orchestrator_zip)"

# Worker: long timeout, high memory/disk for ffmpeg transcode
upsert_lambda "$WORKER_NAME" "$WORKER_ZIP" "handler.lambda_handler" 900 3008 10240

# Orchestrator: list + async invoke all workers
upsert_lambda "$ORCH_NAME" "$ORCH_ZIP" "handler.lambda_handler" 900 512 512

echo ""
echo "Deployed:"
echo "  Worker:       ${WORKER_NAME} (ap-south-2)"
echo "  Orchestrator: ${ORCH_NAME} (ap-south-2)"
echo ""
echo "Run all jobs:"
echo "  aws lambda invoke --function-name ${ORCH_NAME} --region ${REGION} --payload '{}' /tmp/orch-out.json && cat /tmp/orch-out.json"
echo ""
echo "Run one file:"
echo "  aws lambda invoke --function-name ${WORKER_NAME} --region ${REGION} --payload '{\"key\":\"English/song.mp4\"}' /tmp/worker-out.json && cat /tmp/worker-out.json"
