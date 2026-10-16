"""Does Windows' backdrop (widget.windows.mica.toplevel-backdrop) change
while Zen runs, or only for new windows / after a restart? A visible Zen
window over the striped backdrop, Glass, pinned sidebar: capture with
Acrylic, switch the pref to Mica live, capture again, then open a new
window and capture that. Opens windows on the desktop for about a minute.
"""
import json, os, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

HERE = Path(__file__).resolve().parent / "screen"
SHOTS = Path(os.environ["TEMP"]) / "claude" / "r25"
SHOTS.mkdir(parents=True, exist_ok=True)


def capture(name, w=420):
    out = SHOTS / f"{name}.png"
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "capture.ps1"),
                    "-Out", str(out), "-W", str(w)], check=True)
    return str(out)


backdrop = subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "backdrop.ps1"),
                             "-Seconds", "120", "-Style", "stripes"])
time.sleep(3)
res = {}
try:
    with Scene(headless=False) as z:
        z.js("""window.moveTo(0, 0); window.resizeTo(1366, 720);
                if (document.documentElement.getAttribute('zen-compact-mode') === 'true') gZenCompactModeManager.preference = false;
                zth.set('Zenith Core', 'zenith.core.window-transparency', 'glass');
                await zth.sleep(1200); window.focus(); return 1""")
        z.js("zth.open(arguments[0] + '/page'); await zth.sleep(1500); window.focus(); await zth.sleep(500); return 1", z.base)
        res["acrylic"] = capture("1-acrylic")
        z.js("Services.prefs.setIntPref('widget.windows.mica.toplevel-backdrop', 1); window.focus(); await zth.sleep(2000); return 1")
        res["mica, same window"] = capture("2-mica-live")
        z.js("Services.prefs.setIntPref('widget.windows.mica.toplevel-backdrop', 2); window.focus(); await zth.sleep(2000); return 1")
        res["acrylic again, same window"] = capture("3-acrylic-live")
        # Zen inactive: a small window elsewhere takes the focus.
        thief = subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "focus_thief.ps1")])
        time.sleep(3)
        res["acrylic, Zen inactive"] = capture("3b-acrylic-inactive")
        thief.wait(timeout=20)
        z.js("window.focus(); await zth.sleep(1500); return 1")
        res["acrylic, Zen active again"] = capture("3c-acrylic-active-again")
        z.js("Services.prefs.setBoolPref('widget.windows.mica', false); window.focus(); await zth.sleep(2000); return 1")
        res["mica off, same window"] = capture("4-mica-off-live")
        z.js("Services.prefs.setBoolPref('widget.windows.mica', true); return 1")
finally:
    backdrop.kill()
print(json.dumps(res, indent=1))
