"""Follow-up: translucent ui.highlight, and do registered sheets reach pages at all?"""
import json, sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
from scenarios import Scene
from r4_selection import SAMPLE, select_text, selection_colour

out = {}
with Scene() as z:
    z.js("Services.prefs.setStringPref('ui.highlight', '#e06c7566'); Services.prefs.clearUserPref('ui.highlighttext'); await zth.sleep(600); return 1")
    out["ui.highlight #e06c7566"] = selection_colour(z)
    z.js("Services.prefs.setStringPref('ui.highlight', 'oklch(0.55 0.0764875 318.845)'); await zth.sleep(600); return 1")
    out["ui.highlight oklch()"] = selection_colour(z)
    z.js("Services.prefs.clearUserPref('ui.highlight'); return 1")
    for kind in ["USER_SHEET", "AGENT_SHEET", "AUTHOR_SHEET"]:
        z.js("""const sss = Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
          const u = Services.io.newURI('data:text/css,' + encodeURIComponent('html{background:rgb(0,200,0)!important} ::selection{background:rgb(200,0,0)!important}'));
          sss.loadAndRegisterSheet(u, sss[arguments[0]]); window._u = u; await zth.sleep(600); return 1""", kind)
        r = select_text(z)
        out[kind + " selection"] = z.js(SAMPLE, r)
        out[kind + " page bg"] = z.js(SAMPLE, [5, 5, 10, 10])
        z.js("const sss = Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService); sss.unregisterSheet(window._u, sss[arguments[0]]); return 1", kind)
print(json.dumps(out, indent=1))
