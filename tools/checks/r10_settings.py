"""Settings helper in Zen's settings page: dependent options greyed with a reason."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
READ = """
  const doc = gBrowser.selectedBrowser.contentDocument;
  const row = n => doc.querySelector(`[tooltiptext="${n}"]`)?.closest('.zenThemeMarketplaceItemPreference');
  const out = {};
  for (const n of arguments[0]) {
    const r = row(n);
    out[n] = r ? [r.hasAttribute('zenith-off'), r.querySelector('.zenith-why')?.getAttribute('value') ?? '', !!r.querySelector('checkbox, menulist, input')?.disabled] : 'row missing';
  }
  return out;
"""
NAMES = ["zenith.tabs.numbers", "zenith.motion.reduced", "zenith.peek.engine", "zenith.peek.instant", "zenith.edges.container-style", "zenith.panels.gap"]
res = {}
with Scene() as z:
    z.js("const t = zth.open('about:preferences#zenMarketplace'); await zth.sleep(3500); return gBrowser.currentURI.spec")
    res["defaults"] = z.js(READ, NAMES)
    z.js("""Services.prefs.setBoolPref('zenith.plus.numbers-on-ctrl', true); Services.prefs.setBoolPref('zenith.plus.animate-zen', false);
            Services.prefs.setBoolPref('zenith.peek.enabled', false); Services.prefs.setStringPref('zenith.edges.preset', 'quiet');
            Services.prefs.setStringPref('zenith.panels.split', 'hairlines'); await zth.sleep(600); return 1""")
    res["after changes"] = z.js(READ, NAMES)
    z.js("""Services.prefs.setBoolPref('zenith.peek.enabled', true); Services.prefs.setStringPref('zenith.peek.custom-engine', 'https://kagi.com/search?q=%s'); await zth.sleep(400); return 1""")
    res["custom engine"] = z.js(READ, ["zenith.peek.engine"])
    z.screenshot(str(out / "settings.png"))
print(json.dumps(res, indent=1))
