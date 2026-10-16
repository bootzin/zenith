"""What paints each floating surface's background?"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
BG = """
  const show = (sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return 'missing';
    const c = getComputedStyle(el); return [c.backgroundColor, c.backgroundImage.slice(0, 60), c.backdropFilter, c.opacity]; };
  return Object.fromEntries(arguments[0].map(s => [s, show(s)]));
"""
with Scene() as z:
    z.js("zth.open(arguments[0] + '/page'); await zth.sleep(800); return 1", z.base)
    z.js("gURLBar.focus(); gURLBar.search('test'); await zth.sleep(1000); return 1")
    res = {"urlbar": z.js(BG, ["#urlbar", "#urlbar .urlbar-background", "#urlbar-background", ".urlbarView", "#urlbar > .urlbar-input-container"])}
    z.js("gURLBar.view.close(); gURLBar.blur(); gFindBar.open(); await zth.sleep(500); return 1")
    res["findbar"] = z.js(BG, ["findbar"])
    z.js("gFindBar.close(); document.getElementById('zen-library-button')?.doCommand?.(); await zth.sleep(200); return 1")
    z.js("const l = document.querySelector('zen-library'); if (l && !l.hasAttribute('open')) { gZenLibrary?.toggle?.(); } await zth.sleep(900); return 1")
    res["library"] = z.js(BG + "", ["zen-library", "zen-library .zen-library-content", "zen-library > *"])
    res["library-dom"] = z.js("const l = document.querySelector('zen-library'); return l ? [l.getAttribute('open'), [...l.children].map(c => c.localName + '.' + c.className).slice(0, 6)] : 'none'")
print(json.dumps(res, indent=1))
