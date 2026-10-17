"""0.10.0, on a real screen with your own settings: see-through Zen pages.
- Off: Settings is opaque (one flat colour).
- On: Settings, Add-ons and about:config show the window's glass: an empty
  part of the page looks like the window's glass at the same spot with the
  page hidden.
- A web page without a background of its own, opened in the same tab the
  way the URL bar opens it, is opaque (white): only Zen's own pages are
  see-through. Going back makes Settings see-through again.
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screen_kit import Screen

EMPTY = (1240, 300, 110, 300)  # right of the cards, below the header
res = {}
with Screen("r35", mine=True) as s:
    z = s.z
    z.js("Services.prefs.setBoolPref('zenith.plus.see-through-pages', false); zth.open('about:preferences'); await zth.sleep(2500); return 1")
    res["off: settings"] = s.stats(s.capture("off"), *EMPTY)
    z.js("Services.prefs.setBoolPref('zenith.plus.see-through-pages', true); await zth.sleep(800); return 1")
    res["on: settings"] = s.stats(s.capture("on"), *EMPTY)
    res["attributes"] = z.js("const b = gBrowser.selectedBrowser; return [b.getAttribute('transparent'), b.getAttribute('zenith-see-through')]")
    z.js("gBrowser.selectedBrowser.style.visibility = 'hidden'; await zth.sleep(500); return 1")
    res["the glass there (page hidden)"] = s.stats(s.capture("glass"), *EMPTY)
    z.js("gBrowser.selectedBrowser.style.visibility = ''; return 1")
    for page in ("about:addons", "about:config"):
        z.js(f"zth.open('{page}'); await zth.sleep(2000); return 1")
        res[f"on: {page}"] = s.stats(s.capture(page.replace(':', '-')), *EMPTY)
    # A web page in the same tab, as the URL bar opens it.
    z.js("""gBrowser.selectedTab = gBrowser.tabs.find(t => t.linkedBrowser.currentURI.spec.startsWith('about:preferences'));
            await zth.sleep(500);
            gBrowser.fixupAndLoadURIString(arguments[0] + '/page?n=web', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
            await zth.sleep(2500); return 1""", z.base)
    res["web page in that tab"] = s.stats(s.capture("web"), *EMPTY)
    res["web page: attributes, remote"] = z.js("const b = gBrowser.selectedBrowser; return [b.getAttribute('transparent'), b.getAttribute('zenith-see-through'), b.isRemoteBrowser]")
    z.js("gBrowser.goBack(); await zth.sleep(2500); return 1")
    res["back to settings"] = s.stats(s.capture("back"), *EMPTY)
    z.js("Services.prefs.setBoolPref('zenith.plus.see-through-pages', false); await zth.sleep(800); return 1")
    res["off again"] = s.stats(s.capture("off-again"), *EMPTY)
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
