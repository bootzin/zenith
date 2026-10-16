"""Motion on a machine that reports reduced motion (like the real laptop)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
from harness import REAL_SETTINGS

STATE = """
  const p = document.createElement('div'); p.style.transitionDuration = 'var(--zth-dur)'; document.body.append(p);
  const d = getComputedStyle(p).transitionDuration; p.remove();
  return { reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, dur: d,
           pref: Services.prefs.getPrefType('ui.prefersReducedMotion') ? Services.prefs.getIntPref('ui.prefersReducedMotion') : '(unset)' };
"""
CROSSFADE = """
  const tabs = gBrowser.visibleTabs.filter(t => !t.pinned);
  const target = tabs.find(t => !t.selected);
  gBrowser.selectedTab = target;
  const panel = () => document.getElementById(target.linkedPanel);
  const samples = [];
  const t0 = performance.now();
  for (let i = 0; i < 12; i++) {
    await new Promise(r => requestAnimationFrame(r));
    samples.push([Math.round(performance.now() - t0), Number(getComputedStyle(panel()).opacity).toFixed(2)]);
  }
  return { anims: panel().getAnimations().map(a => a.animationName), samples };
"""
res = {}
with Scene() as z:
    for mod, prop, val in REAL_SETTINGS:
        z.js("zth.set(arguments[0], arguments[1], arguments[2]); return 1", mod, prop, val)
    z.js("zth.open(arguments[0] + '/page?n=1'); await zth.sleep(700); zth.open(arguments[0] + '/page?n=2'); await zth.sleep(900); return 1", z.base)
    res["default (animate everything)"] = z.js(STATE)
    res["crossfade"] = z.js(CROSSFADE)
    z.js("zth.set('Zenith Motion', 'zenith.motion.reduced', 'zenith'); await zth.sleep(400); return 1")
    res["zenith only"] = z.js(STATE)
    z.js("zth.set('Zenith Motion', 'zenith.motion.reduced', 'follow'); await zth.sleep(400); return 1")
    res["follow windows"] = z.js(STATE)
    z.js("zth.set('Zenith Motion', 'zenith.motion.reduced', ''); zth.set('Zenith Motion', 'zenith.motion.preset', 'smooth'); await zth.sleep(400); return 1")
    res["smooth"] = z.js(STATE)
    res["smooth sidebar"] = z.js("""const tb = gNavToolbox; return { show: getComputedStyle(tb).getPropertyValue('--zen-compact-mode-time'), hide: getComputedStyle(tb).transition.slice(0, 120) };""")
print(json.dumps(res, indent=1))
