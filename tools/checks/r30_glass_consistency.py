"""0.8.1: the three kinds of glass with the user's own settings, on a real
screen. The desktop behind Zen and the page inside it show the same
stripes, so the docked sidebar (Windows' blur of the desktop), the floating
sidebar and the live panel (Zenith's blur of the page) can be compared
directly. Also: Peek's opening (mid-animation and after), and a real click
on a tab with Liquid on.

Opens windows on the desktop for about two minutes. Pass --mine to copy
Zenith's settings (and Zen's acrylic ones) from your Zen profile.
"""
import json, os, re, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

HERE = Path(__file__).resolve().parent / "screen"
SHOTS = Path(os.environ["TEMP"]) / "claude" / "r30"
SHOTS.mkdir(parents=True, exist_ok=True)


def mine():
    """Zenith's settings and Zen's acrylic ones from the profile Zen uses."""
    root = Path(os.environ["APPDATA"]) / "zen"
    ini = (root / "profiles.ini").read_text(encoding="utf-8")
    path = re.search(r"^\[Install[^\]]*\]\s*\nDefault=(.+)$", ini, re.M).group(1).strip()
    prefs = {}
    for name, raw in re.findall(r'^user_pref\("([^"]+)",\s*(.+)\);$', (root / path / "prefs.js").read_text(encoding="utf-8"), re.M):
        if (name.startswith("zenith.") and not name.startswith("zenith.internal")) or name.startswith("zen.theme.acrylic"):
            prefs[name] = json.loads(raw)
    return prefs


if "--mine" in sys.argv:
    extra = json.loads(os.environ.get("ZENITH_EXTRA_PREFS", "{}"))
    extra.update(mine())
    os.environ["ZENITH_EXTRA_PREFS"] = json.dumps(extra)

from scenarios import Scene  # noqa: E402  (reads ZENITH_EXTRA_PREFS when the profile is made)

STRIPES = ("data:text/html,<body style='margin:0;height:100vh;background:repeating-linear-gradient(90deg,"
           "orangered 0 70px,gold 70px 140px,limegreen 140px 210px,deepskyblue 210px 280px,mediumorchid 280px 350px,"
           "white 350px 420px,black 420px 490px)'><h1 style='font:bold 85px Segoe UI;margin:0;position:absolute;top:270px;left:40px'>"
           "BEHIND ZEN</h1></body>").replace(" ", "%20").replace("#", "%23")


def ps(script, *args):
    return subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / script), *args],
                          check=True, capture_output=True, text=True).stdout.strip()


ZEN = {}


def front():
    """The test Zen in front of everything, or stop: captures and clicks
    must only ever see (and touch) it."""
    who = ps("front.ps1", "-ZenPid", str(ZEN["pid"]))
    if who != "zen":
        raise SystemExit(f"Zen isn't in front ({who} is); not capturing or clicking")


def capture(name, w=1366, h=720):
    front()
    out = SHOTS / f"{name}.png"
    ps("capture.ps1", "-Out", str(out), "-W", str(w), "-H", str(h))
    return out


def stats(png, x, y, w, h):
    return json.loads(ps("stats.ps1", "-In", str(png), "-X", str(x), "-Y", str(y), "-W", str(w), "-H", str(h)))


SIDEBAR_STYLE = """const bg = gNavToolbox.querySelector('.zen-toolbar-background'), cs = getComputedStyle(bg);
  return { compact: document.documentElement.getAttribute('zen-compact-mode'), backdrop: cs.backdropFilter,
           background: cs.backgroundImage.slice(0, 160) + ' | ' + cs.backgroundColor,
           after: getComputedStyle(bg, '::after').opacity, noAcrylic: document.documentElement.getAttribute('zen-no-acrylic'),
           mica: matchMedia('(-moz-windows-mica)').matches, rect: Object.values(bg.getBoundingClientRect().toJSON()).slice(0, 4).map(Math.round) };"""

backdrop = subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / "backdrop.ps1"),
                             "-Seconds", "200", "-Style", "stripes"])
time.sleep(3)
res = {"prefs": {k: v for k, v in json.loads(os.environ.get("ZENITH_EXTRA_PREFS", "{}")).items()
                 if k.startswith(("zenith.core", "zenith.plus.material", "zen.theme"))}}
try:
    with Scene(headless=False) as z:
        ZEN["pid"] = z.proc.pid
        z.js("""window.moveTo(0, 0); window.resizeTo(1366, 720);
                if (document.documentElement.getAttribute('zen-compact-mode') === 'true') gZenCompactModeManager.preference = false;
                // Windows' Acrylic behind the docked sidebar, so it shows the same stripes as the page (r32 checks Wallpaper).
                Services.prefs.setStringPref('zenith.plus.material-windows', 'acrylic');
                zth.open(arguments[0]); await zth.sleep(1500); window.focus(); await zth.sleep(800); return 1""", STRIPES)
        side = (24, 300, 150, 260)  # an empty stretch of the sidebar

        # 1. Docked: each Window transparency step, then each Frost.
        res["docked"] = {}
        for step in ("solid", "balanced", "airy", "sheer", "glass"):
            z.js(f"Services.prefs.setStringPref('zenith.core.window-transparency', '{step}'); window.focus(); await zth.sleep(900); return 1")
            res["docked"][f"transparency {step}"] = stats(capture(f"docked-{step}"), *side)
        z.js("Services.prefs.setStringPref('zenith.core.window-transparency', arguments[0] || 'airy'); await zth.sleep(500); return 1",
             res["prefs"].get("zenith.core.window-transparency", "airy"))
        for frost in ("off", "subtle", "strong"):
            z.js(f"Services.prefs.setStringPref('zenith.core.glass', '{frost}'); window.focus(); await zth.sleep(900); return 1")
            res["docked"][f"frost {frost}"] = [stats(capture(f"docked-frost-{frost}"), *side), z.chrome(SIDEBAR_STYLE)]
        z.js("Services.prefs.setStringPref('zenith.core.glass', arguments[0] || 'subtle'); await zth.sleep(400); return 1",
             res["prefs"].get("zenith.core.glass", "subtle"))

        # 2. Floating: compact mode, sidebar shown over the same stripes.
        z.js("gZenCompactModeManager.preference = true; await zth.sleep(1200); zth.reveal(true); window.focus(); await zth.sleep(1200); return 1")
        res["floating"] = {}
        for step in ("solid", "balanced", "airy", "sheer", "glass"):
            z.js(f"Services.prefs.setStringPref('zenith.core.window-transparency', '{step}'); zth.reveal(true); window.focus(); await zth.sleep(900); return 1")
            res["floating"][f"transparency {step}"] = stats(capture(f"floating-{step}"), *side)
        z.js("Services.prefs.setStringPref('zenith.core.window-transparency', arguments[0] || 'airy'); await zth.sleep(500); return 1",
             res["prefs"].get("zenith.core.window-transparency", "airy"))
        for frost in ("off", "subtle", "strong"):
            z.js(f"Services.prefs.setStringPref('zenith.core.glass', '{frost}'); zth.reveal(true); window.focus(); await zth.sleep(900); return 1")
            res["floating"][f"frost {frost}"] = [stats(capture(f"floating-frost-{frost}"), *side), z.chrome(SIDEBAR_STYLE)]
        z.js("Services.prefs.setStringPref('zenith.core.glass', arguments[0] || 'subtle'); zth.reveal(false); await zth.sleep(600); return 1",
             res["prefs"].get("zenith.core.glass", "subtle"))

        # 3. The live panel over the stripes.
        z.js("window.ZenithLive.open(); window.focus(); await zth.sleep(1200); return 1")
        res["live panel"] = stats(capture("live-panel"), 1000, 600, 300, 80)
        z.js("window.ZenithLive.close(); await zth.sleep(500); return 1")

        # 4. Peek opening, slowed down: halfway through the fade, and after.
        z.js("""document.documentElement.style.setProperty('--zth-dur', '2400ms');
                document.getElementById('zenith-peek-command').doCommand(); return 1""")
        time.sleep(0.9)
        mid = capture("peek-mid")
        time.sleep(2.6)
        end = capture("peek-end")
        box = z.js("const r = document.getElementById('zenith-peek-box').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round)")
        res["peek"] = {"box": box, "mid": stats(mid, box[0] + box[2] - 60, box[1] + 8, 50, box[3] - 16),
                       "end": stats(end, box[0] + box[2] - 60, box[1] + 8, 50, box[3] - 16)}
        z.js("""document.getElementById('zenith-peek').hidden = true;
                document.documentElement.style.removeProperty('--zth-dur'); await zth.sleep(400); return 1""")

        # 5. A real click on a tab that isn't selected (docked, Liquid).
        z.js("""gZenCompactModeManager.preference = false; zth.open(arguments[0] + '/page?n=2'); await zth.sleep(1200);
                gBrowser.selectedTab = gBrowser.visibleTabs.at(-2); window.focus(); await zth.sleep(900); return 1""", z.base)
        tab = z.js("""const t = gBrowser.visibleTabs.at(-1), r = t.getBoundingClientRect();
                      return [Math.round(mozInnerScreenX + r.left + 40), Math.round(mozInnerScreenY + r.top + r.height / 2),
                              Math.round(mozInnerScreenX + r.left), Math.round(mozInnerScreenY + r.top), Math.round(r.width), Math.round(r.height)]""")
        z.js("""window.zthPresses = []; new MutationObserver(ms => { for (const m of ms) if (m.target.hasAttribute('zenith-press'))
                  window.zthPresses.push(m.target.className + ' ' + m.target.style.getPropertyValue('--zth-press-x')); })
                .observe(document.documentElement, { subtree: true, attributeFilter: ['zenith-press'] }); return 1""")
        front()
        ps("click_capture.ps1", "-X", str(tab[0]), "-Y", str(tab[1]), "-Out", str(SHOTS / "tab-click"),
           "-After", "40,150,350,1000", "-CX", str(max(0, tab[2] - 8)), "-CY", str(tab[3] - 8), "-CW", str(tab[4] + 16), "-CH", str(tab[5] + 16))
        res["tab click"] = {"selected after": z.js("return gBrowser.selectedTab === gBrowser.visibleTabs.at(-1)"),
                            "presses": z.js("return window.zthPresses")}
        res["css errors"] = z.console_errors()
finally:
    backdrop.kill()
print(json.dumps(res, indent=1))
