"""Zenith under Sine: mods loaded, settings attributes, Plus scripts running."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
from harness import sine_loader
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
print("Sine loader:", sine_loader())
with Scene() as z:
    z.wait(3000)
    res = z.js("""
      const r = document.documentElement;
      const sheets = InspectorUtils.getAllStyleSheets(document).map(s => (s.href || '').split('/').slice(-2).join('/')).filter(h => /sine|zen-themes/.test(h));
      const probe = document.createElement('div'); probe.style.width = 'var(--zth-row, 0px)'; document.body.append(probe);
      const zthRow = getComputedStyle(probe).width; probe.remove();
      return { sheets, zthRow, themeEls: [...document.querySelectorAll('[id^="theme-Zenith"]')].map(e => e.id),
               plusRunning: r.hasAttribute('zenith-script'), realProgress: r.hasAttribute('zenith-real-progress'),
               peekKey: !!document.getElementById('zenith-peek-key'), sineActive: Services.prefs.getStringPref('sine.fork-id', '') };""")
    z.js("zth.open(arguments[0] + '/page'); await zth.sleep(1500); zth.reveal(true); await zth.sleep(600); return 1", z.base)
    z.screenshot(str(out / "sine-sidebar.png"))
    res["errors"] = z.chrome("return Services.console.getMessageArray().map(m => m.message || m.errorMessage || '').filter(m => /Zenith|zenith|Sine|sine/.test(m)).slice(-12)")
print(json.dumps(res, indent=1))
