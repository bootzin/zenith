"""Docked vs floating sidebar: real pixel colours with the user's workspace colour."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
PIXEL = """
  const [x, y] = arguments;
  const bmp = await window.browsingContext.currentWindowGlobal.drawSnapshot(new DOMRect(x, y, 6, 6), 1, 'rgb(40,40,40)');
  const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = 6; c.height = 6;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(3, 3, 1, 1).data;
  return [d[0], d[1], d[2]];
"""
res = {}
with Scene() as z:
    z.js("document.documentElement.removeAttribute('zen-no-acrylic'); zth.open(arguments[0] + '/page'); await zth.sleep(800); return 1", z.base)
    # The user's Personal space: (156,110,196) at opacity 0.462, through Zen's own colour code.
    res["zen gradient"] = z.js("""
      const tp = gZenThemePicker;
      tp.currentOpacity = 0.462;
      const dot = { c: [156, 110, 196], isCustom: false, isPrimary: true, algorithm: 'floating', lightness: 60, type: 'explicit-lightness' };
      let g; try { g = tp.getGradient([dot]); } catch (e) { g = 'ERR ' + e; }
      let t; try { t = tp.getGradient([dot], true); } catch (e) { t = 'ERR ' + e; }
      document.getElementById('zen-browser-background').style.setProperty('--zen-main-browser-background', g);
      document.querySelector('#navigator-toolbox .zen-toolbar-background').style.setProperty('--zen-main-browser-background-toolbar', t);
      await zth.sleep(300);
      return { window: g, toolbar: t, mirrored: document.documentElement.style.getPropertyValue('--zth-window-paint') };""")
    res["airy default"] = z.js("""
      const cs = getComputedStyle(document.documentElement);
      return ['--zth-window-tint', '--zth-glass-alpha', '--zth-panel-alpha', '--zth-sidebar-alpha', '--zth-glass-filter', '--zth-panel-filter'].map(v => v + ' ' + cs.getPropertyValue(v).trim());""")
    for frost in ["strong", "off", ""]:
        z.js("zth.set('Zenith Core', 'zenith.core.glass', arguments[0]); await zth.sleep(150); return 1", frost)
        res["frost " + (frost or "subtle")] = z.js("return getComputedStyle(document.documentElement).getPropertyValue('--zth-panel-filter').trim()")
    z.js("zth.set('Zenith Core', 'zenith.core.window-transparency', 'balanced'); await zth.sleep(150); return 1")
    res["balanced"] = z.js("const cs = getComputedStyle(document.documentElement); return [cs.getPropertyValue('--zth-window-tint').trim(), cs.getPropertyValue('--zth-panel-alpha').trim()]")
    z.js("zth.set('Zenith Core', 'zenith.core.window-transparency', ''); await zth.sleep(150); return 1")
    res["sidebar alpha"] = z.js("return getComputedStyle(document.querySelector('#navigator-toolbox .zen-toolbar-background')).backgroundColor")
    for mode in ["see-through", "solid"]:
        z.js("zth.set('Zenith Core', 'zenith.core.floating-sidebar', arguments[0] === 'solid' ? 'solid' : ''); return 1", mode)
        z.js("gZenCompactModeManager.preference = true; await zth.sleep(900); zth.reveal(true); await zth.sleep(700); return 1")
        floating = z.js(PIXEL, 100, 600)
        z.js("zth.reveal(false); gZenCompactModeManager.preference = false; await zth.sleep(1200); return 1")
        docked = z.js(PIXEL, 100, 600)
        res[mode] = {"floating": floating, "docked": docked}
print(json.dumps(res, indent=1))
