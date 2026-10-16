"""Settings helper on Sine's settings page."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
IDS = ["zenith.tabs.numbers", "zenith.motion.reduced", "zenith.peek.engine", "zenith.peek.instant", "zenith.edges.container-style", "zenith.panels.gap"]
READ = """
  const doc = gBrowser.selectedBrowser.contentDocument;
  const out = { helperStyle: [...doc.querySelectorAll('style')].some(s => s.textContent.includes('zenith-why')) };
  for (const n of arguments[0]) { const el = doc.getElementById(n.replaceAll('.', '-'));
    out[n] = el ? [el.hasAttribute('zenith-off'), el.querySelector('.zenith-why')?.getAttribute('value') ?? '', !!el.querySelector('checkbox, menulist, input')?.disabled] : 'missing'; }
  return out;
"""
res = {}
with Scene() as z:
    z.js("zth.open('about:preferences#sineMods'); await zth.sleep(3500); return 1")
    res["defaults"] = z.js(READ, IDS)
    z.js("""Services.prefs.setBoolPref('zenith.plus.numbers-on-ctrl', true); Services.prefs.setBoolPref('zenith.plus.animate-zen', false);
            Services.prefs.setBoolPref('zenith.peek.enabled', false); Services.prefs.setStringPref('zenith.edges.preset', 'quiet');
            Services.prefs.setStringPref('zenith.panels.split', 'hairlines'); await zth.sleep(800); return 1""")
    res["after changes"] = z.js(READ, IDS)
print(json.dumps(res, indent=1))
