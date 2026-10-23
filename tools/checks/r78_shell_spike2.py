"""0.13.0's first step, part two: whether the window, taking Alt+wheel,
stops Firefox's Alt+wheel history step; whether any mouse press over a
page reaches the window, and with which keys held."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
# (The native helpers, as r77 has them.)
NATIVE = (Path(__file__).resolve().parent / "r77_shell_spike.py").read_text(encoding="utf-8").split('NATIVE = r"""', 1)[1].split('"""', 1)[0]

res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(NATIVE)
    say("Alt+wheel, window takes it", z.js(r"""const t = await zn.fresh(arguments[0]);
      const [x, y] = zn.point(), url = () => gBrowser.currentURI.spec.replace(arguments[0], ''), before = url();
      let seen = 0; const f = e => { if (e.altKey) { seen++; e.preventDefault(); e.stopPropagation(); } };
      window.addEventListener('wheel', f, true); await zn.wheel(x, y, -120, 0x1000); await zth.sleep(1500); window.removeEventListener('wheel', f, true);
      const out = { before, after: url(), window: seen, page: zn.page() }; gBrowser.removeTab(t); return out;""", z.base))
    say("mouse presses over a page", z.js(r"""const t = await zn.fresh(arguments[0]); const [x, y] = zn.point(), got = [];
      const f = e => got.push([e.type, e.button, e.altKey, e.target.localName]);
      for (const ty of ['mousedown', 'mouseup', 'click']) window.addEventListener(ty, f, true);
      await zn.mouse(x, y, 3, 0, 0x1000); await zn.mouse(x, y, 1, 0, 0x1000); await zn.mouse(x, y, 2, 0, 0x1000); await zth.sleep(500);
      for (const ty of ['mousedown', 'mouseup', 'click']) window.removeEventListener(ty, f, true);
      const out = { window: got, page: zn.page() }; gBrowser.removeTab(t); return out;""", z.base))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
