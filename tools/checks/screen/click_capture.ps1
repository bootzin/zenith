# A real left click at (X, Y) on the screen (or, with -HoverOnly, just the
# pointer moved there), then captures of the screen
# after each delay in -After (milliseconds from the press), for checking
# what a press looks like (Zenith's press light). Captures are named
# <Out>-<ms>.png and cover the rectangle CX, CY, CW, CH.
param([int]$X, [int]$Y, [string]$Out, [string]$After = '60,250,900',
      [int]$CX = 0, [int]$CY = 0, [int]$CW = 420, [int]$CH = 720, [int]$Hold = 0, [switch]$HoverOnly)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class ZthMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
function Shot($name) {
    $bmp = New-Object System.Drawing.Bitmap $CW, $CH
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($CX, $CY, 0, 0, $bmp.Size)
    $bmp.Save($name, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}
# Only ever click Zen: if another window covers the spot, stop.
$pt = New-Object ZthMouse+POINT
$pt.X = $X; $pt.Y = $Y
$owner = 0
[ZthMouse]::GetWindowThreadProcessId([ZthMouse]::WindowFromPoint($pt), [ref]$owner) | Out-Null
$name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
if ($name -ne 'zen') { Write-Error "Not clicking: $name is at ($X, $Y), not Zen"; exit 3 }
[ZthMouse]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 150
$watch = [System.Diagnostics.Stopwatch]::StartNew()
$up = [bool]$HoverOnly
if (-not $HoverOnly) { [ZthMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero) }
foreach ($ms in ($After -split ',' | ForEach-Object { [int]$_ })) {
    if (-not $up -and $watch.ElapsedMilliseconds -ge $Hold) { [ZthMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero); $up = $true }
    while ($watch.ElapsedMilliseconds -lt $ms) { Start-Sleep -Milliseconds 5 }
    Shot "$Out-$ms.png"
}
if (-not $up) { [ZthMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) }
