"""Media card vs the Library hover stack at the bottom of the sidebar."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
out_dir = Path(sys.argv[1]); out_dir.mkdir(parents=True, exist_ok=True)
with Scene() as z:
    res = z.js("""
      zth.open(arguments[0] + '/audio'); await zth.sleep(1500);
      zth.open(arguments[0] + '/download'); await zth.sleep(3000);
      zth.open(arguments[0] + '/page?n=2'); await zth.sleep(1500);
      zth.reveal(true); await zth.sleep(600);
      const btn = document.getElementById('zen-library-button');
      const mc = document.getElementById('zen-media-controls-toolbar');
      return { btn: btn && zth.style(btn, []).rect, media: mc && zth.style(mc, ['display', 'opacity']), side: zth.style('#navigator-toolbox', []).rect,
               foot: btn?.parentElement?.id || btn?.parentElement?.className };
    """, z.base)
    sx, sy, sw, sh = res["side"]
    z.zoom(str(out_dir / "media-closed.png"), sx, sy + sh - 230, sw, 230, 2)
    res["open"] = z.js("""
      const btn = document.getElementById('zen-library-button');
      btn.dispatchEvent(new MouseEvent('mouseenter')); await zth.sleep(700);
      await zth.sleep(400);
      return { open: [...document.querySelectorAll('[zen-library-stack-open]')].map(e => e.id || e.className),
               mediaOpacity: getComputedStyle(document.getElementById('zen-media-controls-toolbar')).opacity };""")
    z.zoom(str(out_dir / "media-open.png"), sx, sy + sh - 230, sw, 230, 2)
print(json.dumps(res, indent=1))
