# Turns the mouse wheel at (X, Y) on the screen by -Notches (negative is
# down), but only if Zen is the window there: otherwise exits with 3.
param([int]$X, [int]$Y, [int]$Notches = -1)
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class ZthWheel {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
$pt = New-Object ZthWheel+POINT
$pt.X = $X; $pt.Y = $Y
$owner = 0
[ZthWheel]::GetWindowThreadProcessId([ZthWheel]::WindowFromPoint($pt), [ref]$owner) | Out-Null
$name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
if ($name -ne 'zen') { Write-Error "Not scrolling: $name is at ($X, $Y), not Zen"; exit 3 }
[ZthWheel]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 120
[ZthWheel]::mouse_event(0x0800, 0, 0, 120 * $Notches, [UIntPtr]::Zero)
