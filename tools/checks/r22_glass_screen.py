"""Window transparency on a real screen: a visible Zen window over a bright
striped window, captured as the screen shows it (Windows' blur included).
Opens windows on the desktop for about two minutes.

    python r22_glass_screen.py [label]
Screenshots go to %TEMP%/claude/r22/<label>-<state>.png.
"""
import json, os, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

HERE = Path(__file__).resolve().parent / "screen"
SHOTS = Path(os.environ["TEMP"]) / "claude" / "r22"
SHOTS.mkdir(parents=True, exist_ok=True)
LABEL = sys.argv[1] if len(sys.argv) > 1 else "now"
STYLE = sys.argv[2] if len(sys.argv) > 2 else "stripes"   # or "document"


def capture(name):
    out = SHOTS / f"{LABEL}-{name}.png"
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "capture.ps1"),
                    "-Out", str(out)], check=True)
    return str(out)


backdrop = subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "backdrop.ps1"),
                             "-Seconds", "150", "-Style", STYLE])
time.sleep(3)
res = {}
try:
    with Scene(headless=False) as z:
        # A real window in front, pinned sidebar, Glass.
        z.js("""window.moveTo(0, 0); window.resizeTo(1366, 720);
                if (document.documentElement.getAttribute('zen-compact-mode') === 'true') gZenCompactModeManager.preference = false;
                await zth.sleep(800); window.focus(); return 1""")
        z.js("zth.open(arguments[0] + '/page'); await zth.sleep(1500); return 1", z.base)
        STATE = """const r = document.documentElement, cs = getComputedStyle(r);
                   return { compact: r.getAttribute('zen-compact-mode'), noAcrylic: r.getAttribute('zen-no-acrylic'),
                            transparency: document.getElementById('theme-Zenith')?.getAttribute('zenith-core-window-transparency'),
                            sidebarAlpha: cs.getPropertyValue('--zth-sidebar-alpha').trim(), tint: cs.getPropertyValue('--zth-window-tint').trim(),
                            sidebar: Object.values(document.getElementById('navigator-toolbox').getBoundingClientRect().toJSON()).slice(0, 4).map(Math.round) };"""
        for step in ("balanced", "glass"):
            z.js(f"zth.set('Zenith Core', 'zenith.core.window-transparency', '{step}'); window.focus(); await zth.sleep(1500); return 1")
            res[step] = z.js(STATE)
            res[step]["shot"] = capture(f"{step}-pinned")
        # The floating sidebar, for comparison.
        z.js("gZenCompactModeManager.preference = true; await zth.sleep(800); zth.reveal(true); window.focus(); await zth.sleep(1500); return 1")
        res["glass floating"] = z.js(STATE)
        res["glass floating"]["shot"] = capture("glass-floating")
        res["css errors"] = z.console_errors()
finally:
    backdrop.kill()
print(json.dumps(res, indent=1))
