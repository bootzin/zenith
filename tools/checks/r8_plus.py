"""Zenith Plus basics after the split: migration, real-progress switch, minimap gate."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
res = {}
with Scene() as z:
    res["state"] = z.js("""
      const r = document.documentElement;
      return { realProgress: r.hasAttribute('zenith-real-progress'), migrated: Services.prefs.getBoolPref('zenith.internal.migrated-0.6', false),
               scripts: [r.hasAttribute('zenith-script'), typeof gZenGlanceManager.openDetachedGlance],
               peekKey: !!document.getElementById('zenith-peek-key'), loadEdge: !!document.getElementById('zenith-load-edge') || 'created on first load' };""")
    z.js("zth.open(arguments[0] + '/slow'); await zth.sleep(2500); return 1", z.base)
    res["loading"] = z.js("const e = document.getElementById('zenith-load-edge'); return e ? [e.getAttribute('state'), getComputedStyle(e).opacity, getComputedStyle(document.getElementById('zen-loading-progress-bar')).display] : 'no edge'")
    z.js("Services.prefs.setBoolPref('zenith.plus.real-progress', false); await zth.sleep(300); return 1")
    res["real progress off"] = z.js("const e = document.getElementById('zenith-load-edge'); return [document.documentElement.hasAttribute('zenith-real-progress'), getComputedStyle(e).opacity, getComputedStyle(document.getElementById('zen-loading-progress-bar')).display]")
    res["minimap off"] = z.js("Services.prefs.setBoolPref('zenith.plus.minimap', false); await zth.sleep(200); return getComputedStyle(document.getElementById('zenith-minimap')).opacity")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
