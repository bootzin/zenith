import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
with Scene() as z:
    z.js("zth.open(arguments[0] + '/page'); await zth.sleep(1000); return 1", z.base)
    res = z.js("""
      const fb = await gBrowser.getFindBar(); fb.open(); await zth.sleep(700);
      fb._findField.value = 'zenith'; fb._find(); await zth.sleep(400);
      const cs = getComputedStyle(fb);
      return { hidden: fb.hidden, display: cs.display, opacity: cs.opacity, anims: fb.getAnimations().map(a => [a.animationName, a.playState]),
               rect: zth.style(fb, []).rect, bg: cs.backgroundColor };""")
    z.screenshot(str(out / "findbar.png"))
print(json.dumps(res, indent=1))
