"""0.13.0's first step, part three: Alt+wheel with Firefox's own Alt+wheel
step set to nothing (as Zenith's Bridge would while the Shell has the
wheel); an Alt+press made in the window, which passes it on to the page
unless the window takes it. (Synthesised in the window, not native: on
Windows a native press moves the real pointer and drops held keys.)"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
NATIVE = (Path(__file__).resolve().parent / "r77_shell_spike.py").read_text(encoding="utf-8").split('NATIVE = r"""', 1)[1].split('"""', 1)[0]

res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(NATIVE)
    say("Alt+wheel, Firefox's Alt+wheel step off, window takes it", z.js(r"""const t = await zn.fresh(arguments[0]);
      Services.prefs.setIntPref('mousewheel.with_alt.action', 0);
      const [x, y] = zn.point(), url = () => gBrowser.currentURI.spec.replace(arguments[0], ''), before = url();
      let seen = 0; const f = e => { if (e.altKey) { seen++; e.preventDefault(); e.stopPropagation(); } };
      window.addEventListener('wheel', f, true); await zn.wheel(x, y, -120, 0x1000); await zth.sleep(1500); window.removeEventListener('wheel', f, true);
      Services.prefs.clearUserPref('mousewheel.with_alt.action');
      const out = { before, after: url(), window: seen, page: zn.page() }; gBrowser.removeTab(t); return out;""", z.base))
    # An Alt+press as Marionette makes it in the window (its own synthesis).
    def press(take, button):
        x, y = z.js(r"""const t = await zn.fresh(arguments[0]), take = arguments[1]; window.zenithT = t; const got = window.zenithGot = [];
          const f = window.zenithF = e => { if (!e.altKey && e.type !== 'contextmenu') return; got.push([e.type, e.button]); if (take) { e.preventDefault(); e.stopPropagation(); } };
          for (const ty of ['mousedown', 'mouseup', 'contextmenu']) window.addEventListener(ty, f, true);
          return zn.point().map(Math.round);""", z.base, take)
        alt = ""
        z.cmd("WebDriver:PerformActions", {"actions": [
            {"type": "key", "id": "kb", "actions": [{"type": "keyDown", "value": alt}] + [{"type": "pause"}] * 3 + [{"type": "keyUp", "value": alt}]},
            {"type": "pointer", "id": "m", "parameters": {"pointerType": "mouse"}, "actions": [
                {"type": "pause"}, {"type": "pointerMove", "x": x, "y": y, "origin": "viewport"},
                {"type": "pointerDown", "button": button}, {"type": "pointerUp", "button": button}, {"type": "pause"}]}]})
        z.cmd("WebDriver:ReleaseActions", {})
        return z.js(r"""await zth.sleep(600); for (const ty of ['mousedown', 'mouseup', 'contextmenu']) window.removeEventListener(ty, window.zenithF, true);
          const m = document.getElementById('contentAreaContextMenu'), out = { window: window.zenithGot, page: zn.page(), 'context menu': m.state };
          if (m.state !== 'closed') m.hidePopup(); gBrowser.removeTab(window.zenithT); return out;""")
    for take in (False, True):
        for button in (0, 2):
            say(f"Alt+{'right' if button else 'left'} press, window {'takes it' if take else 'only watches'}", press(take, button))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
