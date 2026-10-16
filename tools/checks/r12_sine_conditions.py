"""Sine's settings page: Zenith options hide while they don't apply."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
IDS = ["zenith-tabs-numbers", "zenith-motion-reduced", "zenith-peek-engine", "zenith-peek-instant", "zenith-edges-container-style", "zenith-panels-gap"]
READ = """
  const doc = gBrowser.selectedBrowser.contentDocument;
  const out = { url: doc.location.href, zenithIds: doc.querySelectorAll('[id^="zenith-"]').length };
  for (const id of arguments[0]) { const el = doc.getElementById(id); out[id] = el ? (el.style.display === 'none' ? 'hidden' : 'shown') : 'missing'; }
  return out;
"""
res = {}
with Scene() as z:
    for h in ["#zenMarketplace", "#sineMods", ""]:
        z.js("zth.open('about:preferences' + arguments[0]); await zth.sleep(3000); return 1", h)
        r = z.js(READ, IDS)
        res["page " + (h or "(default)")] = r
        if r["zenithIds"]:
            break
    res["defaults"] = z.js(READ, IDS)
    z.js("""Services.prefs.setBoolPref('zenith.plus.numbers-on-ctrl', true); Services.prefs.setBoolPref('zenith.plus.animate-zen', false);
            Services.prefs.setBoolPref('zenith.peek.enabled', false); Services.prefs.setStringPref('zenith.edges.preset', 'quiet');
            Services.prefs.setStringPref('zenith.panels.split', 'hairlines'); await zth.sleep(800); return 1""")
    res["after changes"] = z.js(READ, IDS)
print(json.dumps(res, indent=1))
