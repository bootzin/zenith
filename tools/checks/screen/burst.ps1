# Captures a rectangle of the screen over and over (-Frames times, about
# -Every ms apart) into <Out>-<n>.png, with the time of each in
# <Out>-times.txt: for watching something animate (Peek opening).
param([string]$Out, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Frames = 40, [int]$Every = 25)
Add-Type -AssemblyName System.Drawing
$watch = [System.Diagnostics.Stopwatch]::StartNew()
$times = @()
for ($i = 0; $i -lt $Frames; $i++) {
    $bmp = New-Object System.Drawing.Bitmap $W, $H
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($X, $Y, 0, 0, $bmp.Size)
    $bmp.Save("$Out-$i.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    $times += $watch.ElapsedMilliseconds
    while ($watch.ElapsedMilliseconds -lt ($i + 1) * $Every) { Start-Sleep -Milliseconds 2 }
}
$times -join ',' | Set-Content "$Out-times.txt"
