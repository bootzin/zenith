# Brings the test Zen window (process -ZenPid) to the front, so screen
# captures and clicks see it and nothing else, then prints the process name
# of whatever is in front: "zen" when it worked.
param([int]$ZenPid)
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class ZthFront {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@
$p = Get-Process -Id $ZenPid -ErrorAction SilentlyContinue
if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
    # Windows only lets the app the user last used take the front; a tap of
    # Alt counts as input, which lets this call through.
    [ZthFront]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [ZthFront]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [ZthFront]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
    [ZthFront]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 300
}
$fg = [ZthFront]::GetForegroundWindow()
$id = 0
[ZthFront]::GetWindowThreadProcessId($fg, [ref]$id) | Out-Null
(Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName
