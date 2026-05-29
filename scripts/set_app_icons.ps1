param(
  [Parameter(Mandatory = $true)][string]$ResRoot,
  [Parameter(Mandatory = $true)][string]$Logo
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Logo))

function Save-Resized {
  param([int]$Size, [string]$Path, [double]$PadFraction)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $draw = [int]($Size * (1.0 - 2.0 * $PadFraction))
  $off = [int](($Size - $draw) / 2)
  $g.DrawImage($src, $off, $off, $draw, $draw)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$map = @(
  @{ d = 'mipmap-mdpi';    l = 48;  f = 108 },
  @{ d = 'mipmap-hdpi';    l = 72;  f = 162 },
  @{ d = 'mipmap-xhdpi';   l = 96;  f = 216 },
  @{ d = 'mipmap-xxhdpi';  l = 144; f = 324 },
  @{ d = 'mipmap-xxxhdpi'; l = 192; f = 432 }
)

foreach ($m in $map) {
  $dir = Join-Path $ResRoot $m.d
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  Save-Resized -Size $m.l -Path (Join-Path $dir 'ic_launcher.png') -PadFraction 0.0
  Save-Resized -Size $m.l -Path (Join-Path $dir 'ic_launcher_round.png') -PadFraction 0.0
  # Foreground: pad into the adaptive safe zone so the mask never crops the logo.
  Save-Resized -Size $m.f -Path (Join-Path $dir 'ic_launcher_foreground.png') -PadFraction 0.20
  Write-Host "  wrote $($m.d) ($($m.l)px launcher, $($m.f)px foreground)"
}

# Match the adaptive background color to the logo's corner (keep white if the
# corner is transparent).
$logoPath = (Resolve-Path $Logo).Path
$probe = New-Object System.Drawing.Bitmap($logoPath)
$c = $probe.GetPixel(3, 3)
$probe.Dispose()
if ($c.A -ge 200) {
  $hex = ('#{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B)
} else {
  $hex = '#FFFFFF'
}
$bgXml = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$hex</color>
</resources>
"@
$bgPath = Join-Path $ResRoot 'values\ic_launcher_background.xml'
Set-Content -Path $bgPath -Value $bgXml -Encoding UTF8
Write-Host "  background color set to $hex"

$src.Dispose()
Write-Host "DONE: $ResRoot"
