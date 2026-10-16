"""0.8.0: Glass edge (None / Shine / Liquid) on the Peek prompt, the press
light on a tab, and the old "Glass edge shine" tick box becoming Shine.
Run with ZENITH_EXTRA_PREFS='{"zenith.core.glass-shine": true}' to check
the move from the tick box."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

SHOTS = Path(os.environ["TEMP"]) / "claude" / "r29"
SHOTS.mkdir(parents=True, exist_ok=True)
res = {}
with Scene() as z:
    # Headless Zen has no Windows Acrylic and marks the window solid; behave like Windows 11.
    z.js("document.documentElement.removeAttribute('zen-no-acrylic'); zth.open(arguments[0] + '/page'); await zth.sleep(1500); return 1", z.base)
    res["after start"] = z.js("return [Services.prefs.getStringPref('zenith.core.glass-edge', ''), Services.prefs.prefHasUserValue('zenith.core.glass-shine')]")
    for edge in ("off", "shine", "liquid"):
        res[edge] = z.js(f"""zth.set('Zenith Core', 'zenith.core.glass-edge', '{edge}');
          document.getElementById('zenith-peek-command').doCommand(); await zth.sleep(700);
          return getComputedStyle(document.getElementById('zenith-peek-box')).boxShadow.slice(0, 120)""")
        z.zoom(str(SHOTS / f"peek-{edge}.png"), 330, 100, 700, 110, 2)
        z.js("document.getElementById('zenith-peek').hidden = true; return 1")
    # Press a tab: the glow starts where the mouse went down.
    res["press a tab"] = z.js("""zth.reveal(true); await zth.sleep(700);
      const tab = gBrowser.selectedTab, r = tab.getBoundingClientRect();
      tab.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 30, clientY: r.top + r.height / 2, button: 0, bubbles: true }));
      await zth.sleep(90);
      const bg = tab.querySelector('.tab-background');
      return [bg.hasAttribute('zenith-press'), bg.style.getPropertyValue('--zth-press-x'), getComputedStyle(bg).backgroundImage.slice(0, 60)]""")
    rect = z.js("return Object.values(gBrowser.selectedTab.getBoundingClientRect().toJSON()).slice(0, 4)")
    z.zoom(str(SHOTS / "tab-press.png"), max(0, rect[0] - 6), rect[1] - 6, rect[2] + 12, rect[3] + 12, 3)
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
