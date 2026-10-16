"""0.7.2: "wt" alone shows the weather near you, then recent places; the
timer line is a little thicker."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

SHOT = Path(os.environ["TEMP"]) / "claude" / "r23-wt.png"
TYPE = """
  const [text, wait] = arguments;
  if (document.getElementById('zenith-peek')?.hidden !== false) {
    document.getElementById('zenith-peek-command').doCommand();
    await zth.sleep(700);
  }
  const input = document.getElementById('zenith-peek-input');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await zth.sleep(wait);
  const row = document.getElementById('zenith-peek-row'), list = document.getElementById('zenith-peek-list');
  return { row: row.hidden ? null : [row.querySelector('#zenith-peek-tag').textContent, row.querySelector('#zenith-peek-text').textContent],
           list: list.hidden ? null : [...list.querySelectorAll('.zenith-peek-item')].map(i => [i.hasAttribute('selected'), i.textContent]),
           recent: JSON.parse(Services.prefs.getStringPref('zenith.internal.weather-places', '[]')) };
"""
KEY = """document.getElementById('zenith-peek-input').dispatchEvent(new KeyboardEvent('keydown', { key: arguments[0], bubbles: true, cancelable: true }));
         await zth.sleep(arguments[1] ?? 300);
         const list = document.getElementById('zenith-peek-list');
         return { list: list.hidden ? null : [...list.querySelectorAll('.zenith-peek-item')].map(i => [i.hasAttribute('selected'), i.textContent]),
                  recent: JSON.parse(Services.prefs.getStringPref('zenith.internal.weather-places', '[]')) };"""
res = {}
with Scene() as z:
    z.js("""for (const p of ['zenith.internal.weather-places', 'zenith.internal.weather-place', 'zenith.peek.prefix-list', 'zenith.peek.units', 'zenith.peek.weather-history'])
              Services.prefs.clearUserPref(p);
            Services.prefs.setStringPref('zenith.peek.units', 'metric');
            zth.open(arguments[0] + '/page'); await zth.sleep(1200); return 1""", z.base)
    for place in ("Lisbon", "Tokyo", "Paris"):
        res[f"wt {place}"] = z.js(TYPE, f"wt {place}", 4000)["recent"]
    res["wt alone"] = z.js(TYPE, "wt", 5000)
    z.zoom(str(SHOT), 300, 80, 766, 260, 1)
    res["down, down"] = [z.js(KEY, "ArrowDown"), z.js(KEY, "ArrowDown")]
    res["Delete"] = z.js(KEY, "Delete")
    z.js("Services.prefs.setStringPref('zenith.peek.weather-history', '1'); return 1")
    res["history 1"] = z.js(TYPE, "wt ", 800)["list"]
    z.js("Services.prefs.setStringPref('zenith.peek.weather-history', '0'); return 1")
    res["history 0"] = z.js(TYPE, "wt", 800)["list"]
    z.js("Services.prefs.clearUserPref('zenith.peek.weather-history'); document.getElementById('zenith-peek').hidden = true; return 1")
    res["timer line width"] = z.js("""ZenithTimers.start(60000, 'w'); await zth.sleep(1200);
      const w = getComputedStyle(document.getElementById('zenith-timer-edge')).width; ZenithTimers.save([]);
      return [w, getComputedStyle(document.documentElement).getPropertyValue('--zth-edge').trim()]""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
