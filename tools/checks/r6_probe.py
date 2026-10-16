"""Docked sidebar background layer + Frost values per surface."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
res = {}
with Scene() as z:
    z.js("document.documentElement.removeAttribute('zen-no-acrylic'); zth.open(arguments[0] + '/page'); await zth.sleep(800); return 1", z.base)
    res["vars"] = z.js("""
      const bg = document.getElementById('zen-browser-background'); const tb = document.querySelector('#navigator-toolbox .zen-toolbar-background');
      return { onBgStyle: bg.style.getPropertyValue('--zen-main-browser-background'), onRoot: document.documentElement.style.getPropertyValue('--zen-main-browser-background'),
               inToolbar: getComputedStyle(tb).getPropertyValue('--zen-main-browser-background'), toolbarVar: tb.style.getPropertyValue('--zen-main-browser-background-toolbar'),
               parent: tb.parentElement.id || tb.parentElement.className };""")
    z.js("gZenCompactModeManager.preference = false; await zth.sleep(900); return 1")
    res["docked"] = z.js("""
      const tb = document.querySelector('#navigator-toolbox .zen-toolbar-background');
      tb.style.setProperty('display', 'flex', 'important'); await zth.sleep(200);
      const r = { toolbarRect: zth.style(tb, []).rect, toolboxRect: zth.style('#navigator-toolbox', []).rect, titlebar: zth.style('#titlebar', []).rect };
      tb.style.removeProperty('display'); return r;""")
    z.js("gZenCompactModeManager.preference = true; await zth.sleep(900); zth.reveal(true); await zth.sleep(400); gURLBar.focus(); gURLBar.search('x'); await zth.sleep(600); const fb = await gBrowser.getFindBar(); return 1")
    for frost in ["off", "", "strong"]:
        z.js("zth.set('Zenith Core', 'zenith.core.glass', arguments[0]); await zth.sleep(200); return 1", frost)
        res["frost " + (frost or "subtle")] = z.js("""
          const f = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backdropFilter : 'missing'; };
          return { sidebar: f('#navigator-toolbox .zen-toolbar-background'), urlbar: f('#urlbar .urlbar-background'), toast: 'n/a' };""")
print(json.dumps(res, indent=1))
