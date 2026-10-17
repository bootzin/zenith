"""0.8.1: Peek's "set": find a Zenith setting by name, change it with Tab,
open it in the live panel with Enter, or search Zen's own settings."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

SHOTS = Path(os.environ["TEMP"]) / "claude" / "r31"
SHOTS.mkdir(parents=True, exist_ok=True)
TYPE = """const input = document.getElementById('zenith-peek-input');
  input.value = arguments[0]; input.dispatchEvent(new Event('input')); await zth.sleep(250);
  return [...document.querySelectorAll('#zenith-peek-list .zenith-peek-item')].map(r => r.textContent.trim().replace(/\\s+/g, ' '))"""
KEY = """const input = document.getElementById('zenith-peek-input');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: arguments[0], shiftKey: arguments[1] === true, bubbles: true, cancelable: true }));
  await zth.sleep(300); return 1"""
res = {}
with Scene() as z:
    z.js("zth.open(arguments[0] + '/page'); await zth.sleep(1200); document.getElementById('zenith-peek-command').doCommand(); await zth.sleep(300); return 1", z.base)
    res["set alone"] = z.js(TYPE, "set")
    res["set frost"] = z.js(TYPE, "set frost")
    z.zoom(str(SHOTS / "set-frost.png"), 330, 100, 700, 200, 2)
    res["set numbers"] = z.js(TYPE, "set numbers")
    res["set peek"] = z.js(TYPE, "set peek")[:4]
    res["set edges"] = z.js(TYPE, "set edges")[:3]
    # Tab changes the selected setting (Frost: Subtle -> Strong), Shift+Tab back.
    z.js(TYPE, "set frost")
    before = z.js("return Services.prefs.getStringPref('zenith.core.glass', '')")
    z.js(KEY, "Tab", False)
    after = z.js("return [Services.prefs.getStringPref('zenith.core.glass', ''), document.querySelector('#zenith-peek-list [selected] .zenith-peek-value')?.textContent]")
    z.js(KEY, "Tab", True)
    back = z.js("return Services.prefs.getStringPref('zenith.core.glass', '')")
    res["Tab"] = [before, after, back]
    # A tick box (checkbox) toggles.
    z.js(TYPE, "set thin scrollbars")
    tb = z.js("return Services.prefs.getBoolPref('zenith.page.thin-scrollbars', false)")
    z.js(KEY, "Tab", False)
    res["Tab on a tick box"] = [tb, z.js("return Services.prefs.getBoolPref('zenith.page.thin-scrollbars', false)")]
    z.js(KEY, "Tab", False)
    # Enter: the live panel, at that setting.
    z.js(TYPE, "set frost")
    z.js(KEY, "Enter", False)
    res["Enter"] = z.js("""await zth.sleep(500); const live = document.getElementById('zenith-live'), row = live?.querySelector('[zp-found]');
      const r = row?.getBoundingClientRect(), p = live?.getBoundingClientRect();
      return { open: live && !live.hidden, found: row?.dataset.prop, inView: !!r && r.top >= p.top && r.bottom <= p.bottom,
               focused: [document.activeElement?.closest?.('.zp-row')?.dataset.prop, document.activeElement?.textContent], peekHidden: document.getElementById('zenith-peek').hidden }""")
    z.zoom(str(SHOTS / "live-found.png"), 900, 0, 466, 720, 1)
    z.js("window.ZenithLive.close(); return 1")
    # Nothing matches: Enter searches Zen's own settings.
    z.js("document.getElementById('zenith-peek-command').doCommand(); await zth.sleep(300); return 1")
    res["set cookies"] = z.js(TYPE, "set cookies")
    z.js(KEY, "Enter", False)
    res["Zen's settings"] = z.js("""await zth.sleep(2500); const b = gBrowser.selectedBrowser, doc = b.contentDocument;
      return { url: b.currentURI.spec, search: doc?.getElementById('searchInput')?.value,
               results: !doc?.getElementById('searchResultsPane')?.hidden || doc?.querySelector('[data-category=paneSearchResults]:not([hidden])') !== null }""")
    z.zoom(str(SHOTS / "zen-search.png"), 0, 0, 1366, 720, 1)
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
