"""0.8.0: the live panel (Alt+Shift+Z): opens over the page, changes apply
to the page behind it at once, Escape closes it."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

SHOTS = Path(os.environ["TEMP"]) / "claude" / "r28"
SHOTS.mkdir(parents=True, exist_ok=True)
CTRL_ALT_SHIFT = {"alt": "", "shift": ""}


def keys(z, seq):
    acts = [{"type": "pause", "duration": v} if k == "pause" else {"type": k, "value": v} for k, v in seq]
    z.cmd("Marionette:SetContext", {"value": "chrome"})
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": acts}]})


STATE = """const live = document.getElementById('zenith-live'), r = document.documentElement;
  const probe = document.createElement('div'); probe.style.color = 'var(--zth-accent)'; document.body.append(probe);
  const accent = getComputedStyle(probe).color; probe.remove();
  return { open: !!live && !live.hidden, rect: live ? Object.values(live.getBoundingClientRect().toJSON()).slice(0, 4).map(Math.round) : null,
           sections: live ? live.querySelectorAll('.zp-section').length : 0, accent,
           edgesPreset: document.getElementById('theme-Zenith')?.getAttribute('zenith-edges-preset') };"""
res = {}
with Scene() as z:
    z.js("""for (const p of Services.prefs.getChildList('zenith.')) if (!p.startsWith('zenith.internal')) Services.prefs.clearUserPref(p);
            zth.open(arguments[0] + '/page'); await zth.sleep(1500); return 1""", z.base)
    keys(z, [("keyDown", CTRL_ALT_SHIFT["alt"]), ("keyDown", CTRL_ALT_SHIFT["shift"]), ("keyDown", "Z"), ("keyUp", "Z"),
             ("keyUp", CTRL_ALT_SHIFT["shift"]), ("keyUp", CTRL_ALT_SHIFT["alt"]), ("pause", 600)])
    res["Alt+Shift+Z"] = z.js(STATE)
    z.zoom(str(SHOTS / "1-open.png"), 0, 0, 1366, 768, 1)
    res["Edges: Off from the panel"] = z.js("""const live = document.getElementById('zenith-live');
      live.querySelector('[data-section="edges"] .zp-preset[data-value="off"]').click(); await zth.sleep(400);""" + STATE.replace("const live = document.getElementById('zenith-live'), r", "const r"))
    res["accent from the panel's list"] = z.js("""const live = document.getElementById('zenith-live');
      const row = live.querySelector('[data-prop="zenith.core.accent"]'); row.scrollIntoView({ block: 'center' });
      row.querySelector('.zp-select').click(); await zth.sleep(200);
      row.querySelector('.zp-option[data-value="pink"]').click(); await zth.sleep(500);""" + STATE.replace("const live = document.getElementById('zenith-live'), r", "const r"))
    z.js("""const live = document.getElementById('zenith-live'); live.querySelector('[data-section="look"]').scrollIntoView(); await zth.sleep(300); return 1""")
    z.zoom(str(SHOTS / "2-look.png"), 0, 0, 1366, 768, 1)
    res["search 'gap'"] = z.js("""const s = document.querySelector('#zenith-live .zp-search'); s.value = 'gap'; s.dispatchEvent(new Event('input'));
      await zth.sleep(200); return [...document.querySelectorAll('#zenith-live .zp-row:not([zp-hidden])')].map(r => r.dataset.prop)""")
    z.zoom(str(SHOTS / "3-search.png"), 0, 0, 1366, 768, 1)
    z.js("const s = document.querySelector('#zenith-live .zp-search'); s.value = ''; s.dispatchEvent(new Event('input')); return 1")
    res["Escape"] = z.js("""document.querySelector('#zenith-live .zp-search').focus();
      document.querySelector('#zenith-live').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await zth.sleep(300); return !document.getElementById('zenith-live').hidden""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
