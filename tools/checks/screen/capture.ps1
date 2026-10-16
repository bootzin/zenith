# Capture part of the screen exactly as it looks (Windows' own blur and
# transparency included, which a page snapshot can't show) into a PNG.
param([string]$Out, [int]$X = 0, [int]$Y = 0, [int]$W = 1366, [int]$H = 720)
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($X, $Y, 0, 0, $bmp.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
