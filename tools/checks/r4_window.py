"""Window transparency levels, floating sidebar colour, pinned-tab URL bar
navigation, zoom pill hover text."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
LAYERS = """
  const w = document.getElementById('zen-browser-background');
  const f = document.querySelector('#navigator-toolbox .zen-toolbar-background');
  return { window: [getComputedStyle(w).backgroundColor, getComputedStyle(w, '::after').opacity],
           floating: [getComputedStyle(f).backgroundColor, getComputedStyle(f).backdropFilter, getComputedStyle(f, '::after').opacity] };
"""
NAV = """
  const pinned = gBrowser.selectedTab; gBrowser.pinTab(pinned); await zth.sleep(300);
  const before = gBrowser.tabs.length;
  gURLBar.focus(); gURLBar.value = 'http://localhost:' + arguments[0] + '/page?n=elsewhere';
  gURLBar.handleCommand(new KeyboardEvent('keydown', {key: 'Enter'})); await zth.sleep(1500);
  const r = { newTab: gBrowser.tabs.length > before, stayed: gBrowser.selectedTab === pinned };
  gBrowser.unpinTab(pinned);
  return r;
"""
res = {}
with Scene() as z:
    port = z.base.rsplit(":", 1)[1]
    z.js("zth.open(arguments[0] + '/page'); await zth.sleep(800); zth.reveal(true); await zth.sleep(500); return 1", z.base)
    for level in ["", "opaque", "low", "high", "glass"]:
        z.js("zth.set('Zenith Core', 'zenith.core.transparency', arguments[0]); await zth.sleep(200); return 1", level)
        res["transparency " + (level or "default")] = z.js(LAYERS)
    z.js("zth.set('Zenith Core', 'zenith.core.transparency', ''); zth.set('Zenith Core', 'zenith.core.floating-sidebar', 'zen'); await zth.sleep(200); return 1")
    res["floating = zen's frost"] = z.js(LAYERS)
    z.js("zth.reveal(false); return 1")
    z.js("zth.open(arguments[0] + '/page?n=pinned'); await zth.sleep(800); return 1", z.base)
    res["pinned nav, Zen default"] = z.js(NAV, port)
    z.js("zth.open(arguments[0] + '/page?n=pinned2'); await zth.sleep(800); Services.prefs.setBoolPref('zen.tabs.open-pinned-in-new-tab', false); return 1", z.base)
    res["pinned nav, unticked"] = z.js(NAV, port)
    res["zoom pill hover text"] = z.js("""
      FullZoom.enlarge(); await zth.sleep(600);
      const pill = document.querySelector('.zenith-zoom-pill');
      InspectorUtils.addPseudoClassLock(pill, ':hover');
      const t = pill.textContent + getComputedStyle(pill, '::after').content;
      InspectorUtils.removePseudoClassLock(pill, ':hover'); FullZoom.reset(); return t;""")
print(json.dumps(res, indent=1))
