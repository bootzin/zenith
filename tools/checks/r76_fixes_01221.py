"""0.12.22, inside Zen: Zenith's settings page turns "Sidebar on the right"
(a Zen setting) on, off and on again; the page behind a Peek stays as it
is by default and fades like Glance with "Faded, like Glance". A
screenshot of the faded Peek goes to argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    say("sidebar side switch", z.js(r"""zth.open('about:preferences'); await zth.sleep(3000);
      const doc = gBrowser.selectedBrowser.contentDocument;
      for (let i = 0; i < 50 && !doc.querySelector('[data-prop="zen.tabs.vertical.right-side"] .zp-switch'); i++) await zth.sleep(100);
      const sw = () => doc.querySelector('[data-prop="zen.tabs.vertical.right-side"] .zp-switch'), out = [];
      for (let i = 0; i < 3; i++) { sw().click(); await zth.sleep(1200);
        out.push({ pref: Services.prefs.getBoolPref('zen.tabs.vertical.right-side'), shown: sw().getAttribute('aria-checked'), dock: window.ZenithDock.edge }); }
      sw().click(); await zth.sleep(1200); out.push({ pref: Services.prefs.getBoolPref('zen.tabs.vertical.right-side'), shown: sw().getAttribute('aria-checked') });
      gBrowser.removeTab(gBrowser.selectedTab); return out;"""))
    PEEK = r"""const base = arguments[0], P = Services.prefs;
      if (arguments[1]) P.setStringPref('zenith.peek.behind', arguments[1]); else P.clearUserPref('zenith.peek.behind');
      const t = zth.open(base + '/page?n=fade'); gBrowser.selectedTab = t; await zth.sleep(1200);
      await window.ZenithPeek.open(base + '/page?n=fadepk'); await zth.sleep(1000);
      const s = getComputedStyle(document.getElementById('tabbrowser-tabpanels')), d = gZenGlanceManager.detachedBrowser;
      window.zenithFadeTab = t;
      return { 'page behind': [s.opacity, s.scale], 'peek itself': getComputedStyle(d.closest('#zen-glance-detached')).opacity };"""
    say("peek, page behind as it is (default)", z.js(PEEK + "", z.base, ""))
    z.js("await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true }); await zth.sleep(600); gBrowser.removeTab(window.zenithFadeTab); return 1")
    say("peek, faded like glance", z.js(PEEK, z.base, "fade"))
    z.screenshot(str(OUT / "peek-faded.png"))
    say("after closing", z.js(r"""await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true }); await zth.sleep(800);
      const s = getComputedStyle(document.getElementById('tabbrowser-tabpanels')); gBrowser.removeTab(window.zenithFadeTab);
      Services.prefs.clearUserPref('zenith.peek.behind'); return [s.opacity, s.scale, document.documentElement.hasAttribute('zenith-peek-fade')];"""))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
