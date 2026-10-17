# Average colour and "busyness" of a rectangle in a PNG: busyness is the
# mean difference between neighbouring pixels, so a sharp stripe edge
# scores high and a heavy blur scores near zero. Prints JSON.
param([string]$In, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Step = 2)
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($In)
$r = 0; $g = 0; $b = 0; $n = 0; $busy = 0; $m = 0
for ($j = $Y; $j -lt $Y + $H; $j += $Step) {
    $prev = $null
    for ($i = $X; $i -lt $X + $W; $i += $Step) {
        $p = $bmp.GetPixel($i, $j)
        $r += $p.R; $g += $p.G; $b += $p.B; $n++
        if ($prev) { $busy += [Math]::Abs($p.R - $prev.R) + [Math]::Abs($p.G - $prev.G) + [Math]::Abs($p.B - $prev.B); $m++ }
        $prev = $p
    }
}
$bmp.Dispose()
# (Invariant culture: a comma decimal would break the JSON.)
[string]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{{"rgb":[{0},{1},{2}],"busy":{3}}}',
    [Math]::Round($r / $n), [Math]::Round($g / $n), [Math]::Round($b / $n), [Math]::Round($busy / [Math]::Max($m, 1), 1))
