"""Peek prefix editor: '?' lists, arrows + Enter edit, add, Delete removes, use it."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
ALT, ENTER, DOWN, UP, DEL, ESC = "\ue00a", "\ue007", "\ue015", "\ue013", "\ue017", "\ue00c"

def keys(z, seq):
    acts = []
    for kind, val in seq:
        acts.append({"type": "pause", "duration": val} if kind == "pause" else {"type": kind, "value": val})
    z.cmd("Marionette:SetContext", {"value": "chrome"})
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": acts}]})
    z.cmd("WebDriver:ReleaseActions", {})

def press(z, *ks):
    seq = []
    for k in ks:
        seq += [("keyDown", k), ("keyUp", k)]
    keys(z, seq + [("pause", 250)])

def typing(z, text):
    press(z, *list(text))

LIST = """
  const l = document.getElementById('zenith-peek-list');
  return { shown: l && !l.hidden, items: [...l.querySelectorAll('.zenith-peek-item:not(.zenith-peek-add)')].map(i => i.hasAttribute('editing') ? 'EDITING' : i.querySelector('.zenith-peek-key').textContent + ' ' + i.querySelector('.zenith-peek-name').textContent),
           selected: [...l.querySelectorAll('.zenith-peek-item')].findIndex(i => i.hasAttribute('selected')), focus: document.activeElement?.className || document.activeElement?.id,
           error: l.querySelector('.zenith-peek-error')?.textContent ?? '', saved: Services.prefs.getStringPref('zenith.peek.prefix-list', '').slice(0, 80) };
"""
res = {}
with Scene() as z:
    z.js("Services.prefs.clearUserPref('zenith.peek.prefix-list'); zth.open(arguments[0] + '/page'); await zth.sleep(1000); return 1", z.base)
    keys(z, [("keyDown", ALT), ("keyDown", "q"), ("keyUp", "q"), ("keyUp", ALT), ("pause", 400)])
    typing(z, "?")
    res["? lists"] = z.js(LIST)
    z.screenshot(str(out / "prefix-list.png"))
    press(z, DOWN)                     # select "w"
    press(z, ENTER)                    # edit it
    res["editing w"] = z.js(LIST)
    z.js("const f = document.querySelector('.zenith-peek-field-url'); f.value = 'not a url'; return 1")
    press(z, ENTER)
    res["bad url"] = z.js(LIST)
    z.js("const f = document.querySelector('.zenith-peek-field-url'); f.value = arguments[0] + '/page?n=wiki-%s'; return 1", z.base)
    press(z, ENTER)
    res["saved w"] = z.js(LIST)
    # add a new one through "+ Add a prefix"
    press(z, UP, UP)                   # from w: up to m, then wrap to "+ Add a prefix"
    res["on add row"] = z.js("return document.querySelector('.zenith-peek-add')?.hasAttribute('selected')")
    press(z, ENTER)
    typing(z, "lp")
    z.js("document.querySelector('.zenith-peek-field-name').value = 'Local'; document.querySelector('.zenith-peek-field-url').value = arguments[0] + '/page?n=lp-%s'; return 1", z.base)
    press(z, ENTER)
    res["added lp"] = z.js(LIST)
    z.screenshot(str(out / "prefix-added.png"))
    # remove the first one (m) with Delete
    z.js("Prompt_sel = 0; return 1")
    press(z, UP, UP, UP, UP, UP, UP, UP, UP, UP, UP, UP)
    res["before delete"] = z.js(LIST)
    press(z, DEL)
    res["after delete"] = z.js(LIST)
    press(z, ESC)                      # back to the plain prompt
    typing(z, "lp hello")
    press(z, ENTER)
    z.js("await new Promise(r => setTimeout(r, 2000)); return 1")
    res["uses lp"] = z.js("return gZenGlanceManager.detachedBrowser?.currentURI?.spec ?? null")
print(json.dumps(res, indent=1))
