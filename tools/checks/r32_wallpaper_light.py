"""0.9.1, on a real screen with your own settings (--mine):
- Wallpaper (Window material's default): the desktop wallpaper behind the
  docked sidebar follows Frost and Window transparency, and stays put on
  the screen when the window moves.
- Glass light (Liquid): hovering a tab lights it under the pointer, a press
  brighter, on a plain tab and on a container tab.
Opens windows on the desktop for about two minutes; captures and clicks
only happen while the test Zen is in front.
"""
import json, os, re, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

HERE = Path(__file__).resolve().parent / "screen"
SHOTS = Path(os.environ["TEMP"]) / "claude" / "r32"
SHOTS.mkdir(parents=True, exist_ok=True)


def mine():
    root = Path(os.environ["APPDATA"]) / "zen"
    ini = (root / "profiles.ini").read_text(encoding="utf-8")
    path = re.search(r"^\[Install[^\]]*\]\s*\nDefault=(.+)$", ini, re.M).group(1).strip()
    prefs = {}
    for name, raw in re.findall(r'^user_pref\("([^"]+)",\s*(.+)\);$', (root / path / "prefs.js").read_text(encoding="utf-8"), re.M):
        if (name.startswith("zenith.") and not name.startswith("zenith.internal")) or name.startswith("zen.theme.acrylic"):
            prefs[name] = json.loads(raw)
    return prefs


if "--mine" in sys.argv:
    os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({**json.loads(os.environ.get("ZENITH_EXTRA_PREFS", "{}")), **mine()})

from scenarios import Scene  # noqa: E402

ZEN = {}


def ps(script, *args, check=True):
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / script), *args],
                       capture_output=True, text=True)
    if check and r.returncode:
        raise SystemExit(f"{script}: {r.stderr.strip()[:300]}")
    return r.stdout.strip()


def front():
    who = ps("front.ps1", "-ZenPid", str(ZEN["pid"]))
    if who != "zen":
        raise SystemExit(f"Zen isn't in front ({who} is); not capturing or clicking")


def capture(name, x=0, y=0, w=1366, h=720):
    front()
    out = SHOTS / f"{name}.png"
    ps("capture.ps1", "-Out", str(out), "-X", str(x), "-Y", str(y), "-W", str(w), "-H", str(h))
    return out


def stats(png, x, y, w, h):
    return json.loads(ps("stats.ps1", "-In", str(png), "-X", str(x), "-Y", str(y), "-W", str(w), "-H", str(h)))


def pointer(z, name, tab, hover=True):
    """Hover (or click) a tab for real; the spot under the pointer (left)
    against the far end of the same tab (right), 200ms later."""
    r = z.js("""const t = arguments[0] === 'container' ? gBrowser.visibleTabs.find(t => t.userContextId) : gBrowser.visibleTabs.find(t => !t.userContextId && !t.pinned);
      const b = t.querySelector('.tab-background').getBoundingClientRect();
      return [Math.round(mozInnerScreenX + b.left), Math.round(mozInnerScreenY + b.top), Math.round(b.width), Math.round(b.height)]""", tab)
    front()
    args = ["-X", str(r[0] + 24), "-Y", str(r[1] + r[3] // 2), "-Out", str(SHOTS / name), "-After", "200",
            "-CX", str(r[0]), "-CY", str(r[1]), "-CW", str(r[2]), "-CH", str(r[3])]
    ps("click_capture.ps1", *args, *(["-HoverOnly"] if hover else []))
    png = SHOTS / f"{name}-200.png"
    spot, far = stats(png, 12, 4, 24, r[3] - 8), stats(png, r[2] - 40, 4, 24, r[3] - 8)
    return {"spot": spot["rgb"], "far": far["rgb"], "lift": round(sum(spot["rgb"]) / 3 - sum(far["rgb"]) / 3)}


backdrop = subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "backdrop.ps1"),
                             "-Seconds", "200", "-Style", "stripes"])
time.sleep(3)
res = {}
try:
    with Scene(headless=False) as z:
        ZEN["pid"] = z.proc.pid
        z.js("""window.moveTo(0, 0); window.resizeTo(1366, 720);
                if (document.documentElement.getAttribute('zen-compact-mode') === 'true') gZenCompactModeManager.preference = false;
                Services.prefs.clearUserPref('zenith.plus.material-windows');
                zth.open(arguments[0] + '/page'); await zth.sleep(600);
                zth.open(arguments[0] + '/page?n=2', { container: 1 }); await zth.sleep(600);
                zth.open(arguments[0] + '/page?n=3'); await zth.sleep(1500); window.focus(); return 1""", z.base)
        res["wallpaper"] = z.js("""await zth.sleep(1500); const cs = getComputedStyle(document.getElementById('zen-browser-background'), '::before');
          return { on: document.documentElement.getAttribute('zenith-wallpaper'), image: cs.backgroundImage.slice(0, 30), filter: cs.filter,
                   at: ['x', 'y', 'w', 'h'].map(n => document.documentElement.style.getPropertyValue('--zth-wall-' + n)) }""")
        side = (24, 330, 150, 230)
        for frost in ("off", "subtle", "strong"):
            z.js(f"Services.prefs.setStringPref('zenith.core.glass', '{frost}'); await zth.sleep(900); return 1")
            res[f"docked, frost {frost}"] = stats(capture(f"wall-frost-{frost}"), *side)
        for step in ("solid", "balanced", "airy", "sheer", "glass"):
            z.js(f"Services.prefs.setStringPref('zenith.core.window-transparency', '{step}'); await zth.sleep(900); return 1")
            res[f"docked, {step}"] = stats(capture(f"wall-{step}"), *side)
        z.js("Services.prefs.setStringPref('zenith.core.glass', 'off'); Services.prefs.setStringPref('zenith.core.window-transparency', 'glass'); await zth.sleep(800); return 1")
        # The window moves 120px right: the same spot of the screen shows the same wallpaper.
        before = capture("move-before", 140, 330, 50, 200)
        z.js("window.moveTo(120, 0); await zth.sleep(1200); return 1")
        after = capture("move-after", 140, 330, 50, 200)
        res["after moving"] = [stats(before, 0, 0, 50, 200), stats(after, 0, 0, 50, 200)]
        z.js("window.moveTo(0, 0); await zth.sleep(900); return 1")
        # Back to your settings, then the light on tabs.
        z.js("""for (const [p, v] of Object.entries(arguments[0])) if (p.startsWith('zenith.core')) Services.prefs.setStringPref(p, v);
                Services.prefs.setStringPref('zenith.core.glass-edge', 'liquid'); await zth.sleep(900); return 1""",
             {k: v for k, v in json.loads(os.environ.get("ZENITH_EXTRA_PREFS", "{}")).items() if k.startswith("zenith.core") and isinstance(v, str)})
        res["hover, plain tab"] = pointer(z, "hover-plain", "plain")
        res["hover, container tab"] = pointer(z, "hover-container", "container")
        res["click, container tab"] = pointer(z, "click-container", "container", hover=False)
        z.js("Services.prefs.setStringPref('zenith.core.glass-edge', 'off'); await zth.sleep(500); return 1")
        res["hover, glass edge off"] = pointer(z, "hover-off", "plain")
        res["css errors"] = z.console_errors()
finally:
    backdrop.kill()
print(json.dumps(res, indent=1))
