"""Numbered tabs while holding Ctrl: real key actions through Marionette."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
CTRL = ""
STATE = """
  const t = [...gBrowser.visibleTabs].find(t => !t.pinned && !t.hasAttribute('zen-essential'));
  return { held: document.documentElement.hasAttribute('zenith-ctrl-held'),
           chip: getComputedStyle(t.querySelector('.tab-stack'), '::after').content,
           sidebarOut: gNavToolbox.hasAttribute('flash-popup') };
"""
def keys(z, seq):
    acts = []
    for kind, val in seq:
        acts.append({"type": "pause", "duration": val} if kind == "pause" else {"type": kind, "value": val})
    z.cmd("Marionette:SetContext", {"value": "chrome"})
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": acts}]})

res = {}
with Scene() as z:
    z.js("zth.set('Zenith Tabs', 'zenith.tabs.numbers', 'off'); Services.prefs.setBoolPref('zenith.plus.numbers-on-ctrl', true); for (let i = 0; i < 4; i++) zth.open(arguments[0] + '/page?n=' + i); await zth.sleep(1500); return 1", z.base)
    res["idle"] = z.js(STATE)
    try:
        keys(z, [("keyDown", CTRL), ("pause", 600)])
        res["holding ctrl"] = z.js(STATE)
        keys(z, [("keyUp", CTRL), ("pause", 300)])
        res["released"] = z.js(STATE)
        keys(z, [("keyDown", CTRL), ("pause", 80), ("keyDown", "c"), ("keyUp", "c"), ("pause", 600)])
        res["ctrl+c then still holding"] = z.js(STATE)
        keys(z, [("keyUp", CTRL), ("pause", 200)])
        z.js("Services.prefs.setBoolPref('zenith.plus.numbers-on-ctrl', false); await zth.sleep(200); return 1")
        res["always"] = z.js(STATE)
    except RuntimeError as e:
        res["actions failed"] = str(e)
print(json.dumps(res, indent=1))
