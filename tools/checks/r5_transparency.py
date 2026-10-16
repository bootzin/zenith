"""Window transparency scale: computed alpha of every surface at several steps."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
READ = """
  const cs = (el, p, pseudo) => el ? getComputedStyle(el, pseudo || null).getPropertyValue(p) : 'missing';
  const w = document.getElementById('zen-browser-background');
  const f = document.querySelector('#navigator-toolbox .zen-toolbar-background');
  const u = document.querySelector('#urlbar .urlbar-background');
  const probe = document.createElement('div'); document.body.append(probe);
  probe.style.background = 'var(--zth-glass-bg)'; const glass = getComputedStyle(probe).backgroundColor;
  probe.style.background = 'var(--zth-panel-bg)'; const panel = getComputedStyle(probe).backgroundColor; probe.remove();
  return { windowUnder: cs(w, 'background-color'), windowTint: cs(w, 'opacity', '::after'),
           floatBg: cs(f, 'background-color'), floatImg: cs(f, 'background-image').slice(0, 70), floatTint: cs(f, 'opacity', '::after'),
           urlbar: cs(u, 'background-color'), glass, panel };
"""
res = {}
with Scene() as z:
    z.js("zth.open(arguments[0] + '/page'); await zth.sleep(800); zth.reveal(true); await zth.sleep(400); return 1", z.base)
    z.js("document.documentElement.removeAttribute('zen-no-acrylic'); return 1")
    for v in ["0", "30", "", "80", "100"]:
        z.js("zth.set('Zenith Core', 'zenith.core.window-transparency', arguments[0]); await zth.sleep(200); return 1", v)
        res[v or "default (50)"] = z.js(READ)
print(json.dumps(res, indent=1))
