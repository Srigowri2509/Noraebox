# Deploy fix-mp4-h264 and fix-mp4-orchestrator to AWS Lambda (ap-south-2).
$ErrorActionPreference = "Stop"

$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { "ap-south-2" }
$RoleName = if ($env:LAMBDA_ROLE_NAME) { $env:LAMBDA_ROLE_NAME } else { "noraebox-fix-mp4-lambda-role" }
$WorkerName = "fix-mp4-h264"
$OrchName = "fix-mp4-orchestrator"
$Runtime = "python3.12"
$Root = $PSScriptRoot

$AccountId = aws sts get-caller-identity --query Account --output text
$RoleArn = "arn:aws:iam::${AccountId}:role/${RoleName}"

function Ensure-Role {
    try {
        aws iam get-role --role-name $RoleName | Out-Null
        Write-Host "IAM role exists: $RoleName"
    } catch {
        Write-Host "Creating IAM role: $RoleName"
        aws iam create-role `
            --role-name $RoleName `
            --assume-role-policy-document "file://$Root/iam/trust-policy.json"
        Start-Sleep -Seconds 10
    }
    aws iam put-role-policy `
        --role-name $RoleName `
        --policy-name noraebox-fix-mp4-inline `
        --policy-document "file://$Root/iam/lambda-policy.json"
}

function Build-Zip($Name, $Files, $OutZip) {
    $buildDir = Join-Path $Root ".build\$Name"
    if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
    foreach ($f in $Files) {
        Copy-Item $f.Dest -Destination (Join-Path $buildDir $f.Name)
    }
    if (Test-Path $OutZip) { Remove-Item $OutZip -Force }
    Compress-Archive -Path (Join-Path $buildDir "*") -DestinationPath $OutZip -Force
}

function Upsert-Lambda($Name, $ZipPath, $Handler, $Timeout, $Memory, $Ephemeral) {
    $exists = $true
    try {
        aws lambda get-function --function-name $Name --region $Region | Out-Null
    } catch {
        $exists = $false
    }

    $envVars = "Variables={SRC_BUCKET=noraebox-audio-storage,DEST_BUCKET=noraebox-audio-storage-fixed,AWS_REGION=$Region}"

    if ($exists) {
        Write-Host "Updating Lambda: $Name"
        aws lambda update-function-code --function-name $Name --zip-file "fileb://$ZipPath" --region $Region | Out-Null
        aws lambda wait function-updated --function-name $Name --region $Region
        aws lambda update-function-configuration `
            --function-name $Name `
            --runtime $Runtime `
            --handler $Handler `
            --role $RoleArn `
            --timeout $Timeout `
            --memory-size $Memory `
            --ephemeral-storage "Size=$Ephemeral" `
            --environment $envVars `
            --region $Region | Out-Null
    } else {
        Write-Host "Creating Lambda: $Name"
        aws lambda create-function `
            --function-name $Name `
            --runtime $Runtime `
            --role $RoleArn `
            --handler $Handler `
            --zip-file "fileb://$ZipPath" `
            --timeout $Timeout `
            --memory-size $Memory `
            --ephemeral-storage "Size=$Ephemeral" `
            --environment $envVars `
            --region $Region | Out-Null
    }
}

Ensure-Role

$buildRoot = Join-Path $Root ".build"
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

$workerZip = Join-Path $buildRoot "$WorkerName.zip"
Build-Zip "worker" @(
    @{ Name = "handler.py"; Dest = "$Root/fix-mp4-h264/handler.py" },
    @{ Name = "s3_keys.py"; Dest = "$Root/shared/s3_keys.py" }
) $workerZip

$orchZip = Join-Path $buildRoot "$OrchName.zip"
Build-Zip "orchestrator" @(
    @{ Name = "handler.py"; Dest = "$Root/fix-mp4-orchestrator/handler.py" }
) $orchZip

Upsert-Lambda $WorkerName $workerZip "handler.lambda_handler" 900 3008 10240
Upsert-Lambda $OrchName $orchZip "handler.lambda_handler" 900 512 512

Write-Host ""
Write-Host "Deployed worker ($WorkerName) and orchestrator ($OrchName) in $Region"
Write-Host "Run all: aws lambda invoke --function-name $OrchName --region $Region --payload '{}' out.json"
