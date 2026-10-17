# Types keys into the test Zen (process -ZenPid), with SendKeys notation
# ("%w" is Alt+W, "{ENTER}" is Enter), but only while that Zen is the
# window in front: otherwise nothing is typed and it exits with 3.
param([int]$ZenPid, [string]$Keys)
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class ZthKeys {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
$owner = 0
[ZthKeys]::GetWindowThreadProcessId([ZthKeys]::GetForegroundWindow(), [ref]$owner) | Out-Null
$name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
if ($name -ne 'zen') { Write-Error "Not typing: $name is in front, not Zen"; exit 3 }
(New-Object -ComObject WScript.Shell).SendKeys($Keys)
