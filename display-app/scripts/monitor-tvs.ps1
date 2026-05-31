# Monitor 4 TV logcats for notable Norebox display events.
$TVs = @(
    @{ Label = "Jazz-.17"; Serial = "192.168.88.17:42675" },
    @{ Label = "TV-.19";   Serial = "192.168.88.19:42801" },
    @{ Label = "TV-.16";   Serial = "192.168.88.16:36139" },
    @{ Label = "TV-.18";   Serial = "192.168.88.18:36173" }
)
$OutFile = Join-Path $PSScriptRoot "..\tv-monitor.log"
$Pattern = "\[STATE\]|PLAY FAILED|hard cut|Error registering|startup failure|timeout|create MediaCodec|Codec released"

"=== Monitor started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $OutFile -Encoding utf8

while ($true) {
    foreach ($tv in $TVs) {
        $status = adb -s $tv.Serial get-state 2>$null
        if ($status -ne "device") {
            $line = "[$(Get-Date -Format 'HH:mm:ss')] $($tv.Label) OFFLINE ($status)"
            Add-Content $OutFile $line
            continue
        }
        $hits = adb -s $tv.Serial logcat -d -t 25 2>$null |
            Select-String "Capacitor/Console.*(\[STATE\]|PLAY FAILED|hard cut|Error|timeout)|create MediaCodec|Codec released" |
            Select-Object -Last 3
        foreach ($h in $hits) {
            $text = $h.Line -replace '\s+', ' '
            if ($text -match 'registration response') { continue }
            $line = "[$(Get-Date -Format 'HH:mm:ss')] $($tv.Label) $text"
            Add-Content $OutFile $line
        }
    }
    Start-Sleep -Seconds 30
}
