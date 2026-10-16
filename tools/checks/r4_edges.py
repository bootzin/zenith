"""Container line (three styles) and the not-secure top edge, with the real
profile's settings. Writes magnified corner crops."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
from harness import REAL_SETTINGS

out_dir = Path(sys.argv[1]); out_dir.mkdir(parents=True, exist_ok=True)
res = {}
with Scene() as z:
    for mod, prop, val in REAL_SETTINGS:
        z.js("zth.set(arguments[0], arguments[1], arguments[2]); return 1", mod, prop, val)
    z.js("zth.open('http://neverssl.com/', {container: 1}); await zth.sleep(10000); return 1")
    res["identity"] = z.js("return document.getElementById('identity-box').className")
    res["page rect"] = z.js("return zth.style('.browserSidebarContainer.deck-selected', ['border-radius', 'corner-shape']).rect")
    for style in ["", "inset", "straight"]:
        z.js("zth.set('Zenith Edges', 'zenith.edges.container-style', arguments[0]); await zth.sleep(400); return 1", style)
        z.zoom(str(out_dir / f"round-{style or 'wrap'}.png"), 0, 0, 90, 60, 5)
    z.js("zth.set('Zenith Edges', 'zenith.edges.container-style', ''); zth.set('Zenith Core', 'zenith.core.page', ''); await zth.sleep(400); return 1")
    z.zoom(str(out_dir / "square-wrap.png"), 0, 0, 90, 60, 5)
    z.screenshot(str(out_dir / "square-full.png"))
print(json.dumps(res, indent=1))
