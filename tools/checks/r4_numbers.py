import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
out_dir = Path(sys.argv[1]); out_dir.mkdir(parents=True, exist_ok=True)
with Scene() as z:
    res = z.js("""
      zth.set('Zenith Tabs', 'zenith.tabs.numbers', 'on');
      const long = 'data:text/html,' + encodeURIComponent('<title>A really quite extraordinarily long page title that will not fit in the sidebar</title>');
      const t = zth.open(long); await zth.sleep(800);
      for (let i = 0; i < 11; i++) { zth.open(arguments[0] + '/page?n=' + i, {background: true}); }
      await zth.sleep(1500);
      zth.reveal(true); await zth.sleep(600);
      const lab = t.querySelector('.tab-label-container').getBoundingClientRect();
      const stack = t.querySelector('.tab-stack').getBoundingClientRect();
      const cs = getComputedStyle(t.querySelector('.tab-stack'), '::after');
      const chipLeft = stack.right - parseFloat(cs.right) - parseFloat(cs.width);
      return { labelRight: Math.round(lab.right), chipLeft: Math.round(chipLeft), chip: cs.content, tabRect: zth.style(t, []).rect };
    """, z.base)
    r = res["tabRect"]
    z.zoom(str(out_dir / "numbers.png"), r[0], r[1] - 2, r[2], r[3] * 5, 3)
print(json.dumps(res, indent=1))
