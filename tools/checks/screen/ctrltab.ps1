# Holds Ctrl, presses Tab -Presses times, waits -HoldMs, captures the screen
# region to -Out while Ctrl is still down, then lets go: Ctrl+Tab the way a
# person does it (with -Shift, Ctrl+Shift+Tab). Only if the test Zen
# (process -ZenPid) is in front.
param([int]$ZenPid, [int]$Presses = 2, [int]$HoldMs = 900, [string]$Out,
      [int]$CX = 0, [int]$CY = 0, [int]$CW = 1366, [int]$CH = 720, [switch]$Shift)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class ZthCtrlTab {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@
$owner = 0
[ZthCtrlTab]::GetWindowThreadProcessId([ZthCtrlTab]::GetForegroundWindow(), [ref]$owner) | Out-Null
$name = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
if ($name -ne 'zen') { Write-Error "Not typing: $name is in front, not Zen"; exit 3 }
[ZthCtrlTab]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
if ($Shift) { [ZthCtrlTab]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero) }
for ($i = 0; $i -lt $Presses; $i++) {
    Start-Sleep -Milliseconds 120
    [ZthCtrlTab]::keybd_event(0x09, 0, 0, [UIntPtr]::Zero)
    [ZthCtrlTab]::keybd_event(0x09, 0, 2, [UIntPtr]::Zero)
}
Start-Sleep -Milliseconds $HoldMs
$bmp = New-Object System.Drawing.Bitmap $CW, $CH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($CX, $CY, 0, 0, $bmp.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
if ($Shift) { [ZthCtrlTab]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero) }
[ZthCtrlTab]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
