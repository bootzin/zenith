"""Not-secure edge: off on blank pages and empty spaces, on for HTTP, with
the hover label; container line styles on a square page."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
EDGE = """
  const p = document.querySelector('.browserSidebarContainer.deck-selected');
  const h = document.getElementById('zenith-insecure-hint');
  return { url: gBrowser.currentURI.spec, edge: getComputedStyle(p, '::before').content !== 'none',
           hint: h ? getComputedStyle(h).display : 'missing' };
"""
res = {}
with Scene() as z:
    z.js("Services.prefs.setBoolPref('dom.security.https_first', false); Services.prefs.setBoolPref('dom.security.https_first_schemeless', false); return 1")
    z.js("zth.open('about:blank'); await zth.sleep(800); return 1"); res["blank"] = z.js(EDGE)
    z.js("await gZenWorkspaces.createAndSaveWorkspace('Empty'); await zth.sleep(1500); return 1"); res["empty space"] = z.js(EDGE)
    z.js("zth.open('http://neverssl.com/', {container: 1}); await zth.sleep(8000); return 1"); res["http"] = z.js(EDGE)
    res["label"] = z.js("""
      const h = document.getElementById('zenith-insecure-hint');
      InspectorUtils.addPseudoClassLock(h, ':hover'); await zth.sleep(700);
      const a = getComputedStyle(h, '::after'); const r = { opacity: a.opacity, text: a.content.slice(0, 40) };
      return r;""")
    z.screenshot(str(out / "http-label.png"))
    z.js("InspectorUtils.removePseudoClassLock(document.getElementById('zenith-insecure-hint'), ':hover'); return 1")
    z.zoom(str(out / "square-straight.png"), 0, 0, 90, 60, 5)
    z.js("zth.set('Zenith Edges', 'zenith.edges.container-style', 'wrap'); await zth.sleep(300); return 1")
    z.zoom(str(out / "square-wrap.png"), 0, 0, 90, 60, 5)
    z.js("zth.set('Zenith Core', 'zenith.core.page', 'flush-round'); await zth.sleep(300); return 1")
    z.zoom(str(out / "round-wrap.png"), 0, 0, 90, 60, 5)
print(json.dumps(res, indent=1))
