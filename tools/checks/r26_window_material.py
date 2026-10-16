"""0.8.0: Plus's "Windows: window material", on a real screen: a visible Zen
window (Glass, pinned sidebar) over the striped backdrop, captured for each
material, with Zen inactive (workspace colour instead of Windows' grey),
and back to "Zen default" (Windows' settings handed back).
Opens windows on the desktop for about a minute and a half.
"""
import json, os, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

HERE = Path(__file__).resolve().parent / "screen"
SHOTS = Path(os.environ["TEMP"]) / "claude" / "r26"
SHOTS.mkdir(parents=True, exist_ok=True)
PREFS = """return ['widget.windows.mica', 'widget.windows.mica.toplevel-backdrop'].map(p =>
  [p, Services.prefs.prefHasUserValue(p) ? (Services.prefs.getPrefType(p) === Services.prefs.PREF_BOOL ? Services.prefs.getBoolPref(p) : Services.prefs.getIntPref(p)) : 'default']);"""


def capture(name):
    out = SHOTS / f"{name}.png"
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "capture.ps1"),
                    "-Out", str(out), "-W", "420"], check=True)
    return name


backdrop = subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "backdrop.ps1"),
                             "-Seconds", "150", "-Style", "stripes"])
time.sleep(3)
res = {}
try:
    with Scene(headless=False) as z:
        z.js("""window.moveTo(0, 0); window.resizeTo(1366, 720);
                if (document.documentElement.getAttribute('zen-compact-mode') === 'true') gZenCompactModeManager.preference = false;
                Services.prefs.clearUserPref('zenith.plus.material-windows');
                Services.prefs.setBoolPref('focusmanager.testmode', false);  // let Zen see it's inactive
                zth.set('Zenith Core', 'zenith.core.window-transparency', 'glass');
                await zth.sleep(1200); window.focus(); return 1""")
        z.js("zth.open(arguments[0] + '/page'); await zth.sleep(1500); window.focus(); await zth.sleep(800); return 1", z.base)
        res["start"] = z.chrome(PREFS)
        for value in ("acrylic", "mica", "mica-alt", "off", "auto"):
            z.js(f"Services.prefs.setStringPref('zenith.plus.material-windows', '{value}'); window.focus(); await zth.sleep(1800); return 1")
            res[value] = [capture(f"material-{value}"), z.chrome(PREFS)]
        z.js("Services.prefs.setStringPref('zenith.plus.material-windows', 'acrylic'); window.focus(); await zth.sleep(1800); return 1")
        thief = subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "focus_thief.ps1")])
        time.sleep(3)
        res["acrylic, Zen inactive"] = capture("material-acrylic-inactive")
        thief.wait(timeout=20)
        z.js("Services.prefs.clearUserPref('zenith.plus.material-windows'); window.focus(); await zth.sleep(1500); return 1")
        res["back to Zen default"] = z.chrome(PREFS)
        res["css errors"] = z.console_errors()
finally:
    backdrop.kill()
print(json.dumps(res, indent=1))
