"""Scroll feel, measured on a real screen with real mouse-wheel turns: one
notch down on a long page, and where the page is 50, 100, 200, 400 and
800ms later, for each choice. Instant is all the way there at once; Quick
nearly; Smooth is slower and even; macOS-like goes further and takes
longer; Zen's own is Zen's glide. (A touchpad isn't a wheel: see the README.)"""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screen_kit import Screen, ps

res = {}
with Screen("r38", mine=True) as s:
    z = s.z
    z.js("zth.open(arguments[0] + '/long'); await zth.sleep(1500); window.focus(); return 1", z.base)
    at = z.js("""const r = gBrowser.selectedBrowser.getBoundingClientRect();
                 return [Math.round(mozInnerScreenX + r.left + r.width / 2), Math.round(mozInnerScreenY + r.top + r.height / 2)]""")
    for choice in ("", "instant", "quick", "smooth", "glide"):
        z.js("""if (arguments[0]) Services.prefs.setStringPref('zenith.plus.scroll', arguments[0]); else Services.prefs.clearUserPref('zenith.plus.scroll');
                gBrowser.selectedBrowser.reload(); await zth.sleep(1500); return 1""", choice)
        s.front()
        ps("wheel.ps1", "-X", str(at[0]), "-Y", str(at[1]), "-Notches", "-1")
        time.sleep(1.4)
        res[choice or "Zen's own"] = z.js("return gBrowser.selectedBrowser.contentTitle")
    z.js("Services.prefs.clearUserPref('zenith.plus.scroll'); return 1")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
