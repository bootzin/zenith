"""Number chips: centring (glyph box vs chip box) and the equalizer gap."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
with Scene() as z:
    res = z.js("""
      zth.set('Zenith Tabs', 'zenith.tabs.numbers', 'on');
      const a = zth.open(arguments[0] + '/audio'); await zth.sleep(1500);
      for (let i = 0; i < 10; i++) zth.open(arguments[0] + '/page?n=' + i, {background: true});
      await zth.sleep(1500); zth.reveal(true); await zth.sleep(700);
      a.scrollIntoView({block: 'center'}); await zth.sleep(300);
      const stack = a.querySelector('.tab-stack').getBoundingClientRect();
      const eq = getComputedStyle(a.querySelector('.tab-background'), '::after');
      return { tab: zth.style(a, []).rect, eqRight: eq.right, chipPad: getComputedStyle(a.querySelector('.tab-stack'), '::after').padding };
    """, z.base)
    r = res["tab"]
    z.zoom(str(out / "chip-audio.png"), r[0] + r[2] - 70, r[1], 70, r[3], 6)
    tabs = z.js("return [...gBrowser.visibleTabs].filter(t => !t.pinned).slice(-3).map(t => zth.style(t, []).rect)")
    t = tabs[-1]
    z.zoom(str(out / "chip-two-digit.png"), t[0] + t[2] - 50, t[1], 50, t[3], 8)
print(json.dumps(res, indent=1))
