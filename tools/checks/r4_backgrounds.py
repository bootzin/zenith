"""Background layers: window vs docked sidebar vs floating (compact) sidebar."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
LAYERS = """
  const out = [];
  for (const el of document.querySelectorAll('.zen-browser-generic-background')) {
    const a = getComputedStyle(el, '::after'), b = getComputedStyle(el, '::before'), s = getComputedStyle(el);
    out.push({ id: el.id || el.className, inToolbox: !!el.closest('#navigator-toolbox'), rect: zth.style(el, []).rect,
               bg: s.backgroundColor, filter: s.backdropFilter, afterBg: a.backgroundColor, afterOp: a.opacity, beforeOp: b.opacity });
  }
  return { mica: matchMedia('(-moz-windows-mica)').matches, compact: document.documentElement.getAttribute('zen-compact-mode'), layers: out };
"""
with Scene() as z:
    z.js("zth.open(arguments[0] + '/page'); await zth.sleep(800); zth.reveal(true); await zth.sleep(600); return 1", z.base)
    floating = z.js(LAYERS)
    z.js("Services.prefs.setBoolPref('zen.view.compact.should-enable-at-startup', false); gZenCompactModeManager.preference = false; await zth.sleep(800); return 1")
    docked = z.js(LAYERS)
print(json.dumps({"floating": floating, "docked": docked}, indent=1))
