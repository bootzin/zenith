"""Peek end to end: Alt+Q prompt, instant answers, prefixes, Escape,
Ctrl+Enter, selection + Alt+Q, Shift+Enter in the URL bar."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
ALT, CTRL, SHIFT, ENTER, ESC = "\ue00a", "\ue009", "\ue008", "\ue007", "\ue00c"

def keys(z, seq):
    acts = []
    for kind, val in seq:
        acts.append({"type": "pause", "duration": val} if kind == "pause" else {"type": kind, "value": val})
    z.cmd("Marionette:SetContext", {"value": "chrome"})
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": acts}]})
    z.cmd("WebDriver:ReleaseActions", {})

def type_text(z, text):
    seq = []
    for ch in text:
        seq += [("keyDown", ch), ("keyUp", ch)]
    keys(z, seq + [("pause", 300)])

STATE = """
  const p = document.getElementById('zenith-peek');
  return { prompt: p ? !p.hidden : false, focused: document.activeElement?.id,
           row: p ? [document.getElementById('zenith-peek-tag').textContent, document.getElementById('zenith-peek-text').textContent, document.getElementById('zenith-peek-hint').textContent] : null,
           peekOpen: !!gZenGlanceManager.detachedBrowser,
           peekUrl: gZenGlanceManager.detachedBrowser?.currentURI?.spec ?? null,
           tabs: gBrowser.tabs.length };
"""
res = {}
with Scene() as z:
    base = z.base
    # Point the engine and a test prefix at the local server, so nothing leaves the machine.
    z.js("""zth.set('Zenith Plus', 'zenith.peek.engine', 'custom');
            zth.set('Zenith Plus', 'zenith.peek.custom-engine', arguments[0] + '/page?n=%s', 'string');
            Services.prefs.setStringPref('zenith.peek.custom-engine', arguments[0] + '/page?n=%s');
            Services.prefs.setStringPref('zenith.peek.prefix-list', JSON.stringify([{key: 'lp', name: 'Local', url: arguments[0] + '/page?n=lp-%s'}]));
            zth.open(arguments[0] + '/page?n=start'); await zth.sleep(1200); return 1""", base)
    keys(z, [("keyDown", ALT), ("keyDown", "q"), ("keyUp", "q"), ("keyUp", ALT), ("pause", 400)])
    res["alt+q opens prompt"] = z.js(STATE)
    type_text(z, "2+2*3")
    res["maths"] = z.js(STATE)
    z.js("const i = document.getElementById('zenith-peek-input'); i.value = '10 km to mi'; i.dispatchEvent(new Event('input')); return 1")
    res["units"] = z.js(STATE)
    z.js("const i = document.getElementById('zenith-peek-input'); i.value = 'lp hello'; i.dispatchEvent(new Event('input')); return 1")
    res["prefix"] = z.js(STATE)
    keys(z, [("keyDown", ENTER), ("keyUp", ENTER), ("pause", 2500)])
    res["enter opens peek"] = z.js(STATE)
    z.screenshot(str(out / "peek-open.png"))
    keys(z, [("keyDown", ESC), ("keyUp", ESC), ("pause", 1200)])
    res["escape closes"] = z.js(STATE)
    # Ctrl+Enter keeps it as a tab
    z.js("Prompt_dummy = 0; return 1") if False else None
    keys(z, [("keyDown", ALT), ("keyDown", "q"), ("keyUp", "q"), ("keyUp", ALT), ("pause", 400)])
    type_text(z, "keepme")
    keys(z, [("keyDown", ENTER), ("keyUp", ENTER), ("pause", 2500)])
    before = z.js(STATE)
    keys(z, [("keyDown", CTRL), ("keyDown", ENTER), ("keyUp", ENTER), ("keyUp", CTRL), ("pause", 1500)])
    res["ctrl+enter keeps as tab"] = {"before": before, "after": z.js(STATE),
                                      "selected": z.js("return gBrowser.currentURI.spec")}
    # Selection + Alt+Q
    z.js("""const t = zth.open('data:text/html,' + encodeURIComponent('<p id=p>zenith selection</p><script>const r=document.createRange();r.selectNodeContents(p);getSelection().addRange(r)<\/script>'));
            await zth.sleep(1200); return 1""")
    keys(z, [("keyDown", ALT), ("keyDown", "q"), ("keyUp", "q"), ("keyUp", ALT), ("pause", 2500)])
    res["selection + alt+q"] = z.js(STATE)
    z.js("gZenGlanceManager.closeDetachedGlance({skipPermitUnload: true}); await zth.sleep(800); return 1")
    # Shift+Enter in the URL bar
    z.js("gURLBar.focus(); gURLBar.value = 'fromurlbar'; return 1")
    keys(z, [("keyDown", SHIFT), ("keyDown", ENTER), ("keyUp", ENTER), ("keyUp", SHIFT), ("pause", 2500)])
    res["urlbar shift+enter"] = z.js(STATE)
    res["history has peek pages?"] = z.js("""
      const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
      const out = [];
      for (const n of ['lp-hello', 'keepme', 'fromurlbar']) {
        const info = await PlacesUtils.history.fetch(arguments[0] + '/page?n=' + n);
        out.push([n, !!info]);
      }
      return out;""", base)
    res["console"] = z.chrome("return Services.console.getMessageArray().map(m => m.message || m.errorMessage || '').filter(m => /Zenith|zenith/.test(m)).slice(-10)")
print(json.dumps(res, indent=1))
