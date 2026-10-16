"""0.7.0: Peek's web cards and the timers, through the real prompt."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

SHOTS = Path(os.environ["TEMP"]) / "claude" / "r16"
SHOTS.mkdir(parents=True, exist_ok=True)

# Type into the prompt (opening it with Peek's own command) and read its row.
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
  return { row: row.hidden ? null : [row.querySelector('#zenith-peek-tag').textContent, row.querySelector('#zenith-peek-text').textContent,
                                     row.querySelector('#zenith-peek-hint').textContent, row.getAttribute('card')],
           list: list.hidden ? null : [...list.querySelectorAll('.zenith-peek-item')].map(i => i.textContent) };
"""
KEY = """
  const input = document.getElementById('zenith-peek-input');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: arguments[0], bubbles: true, cancelable: true }));
  await zth.sleep(arguments[1] ?? 300);
  return { promptOpen: !document.getElementById('zenith-peek').hidden, timers: ZenithTimers.list().map(t => [t.kind, t.label, Math.round((t.end - Date.now()) / 1000)]),
           edge: document.documentElement.getAttribute('zenith-timer'), left: document.documentElement.style.getPropertyValue('--zth-timer-left') };
"""

res = {}
with Scene() as z:
    z.js("Services.prefs.clearUserPref('zenith.internal.timers'); Services.prefs.clearUserPref('zenith.peek.prefix-list'); zth.open(arguments[0] + '/page'); await zth.sleep(1200); return 1", z.base)
    for text, wait in [("2+2*3", 200), ("$ 100 usd eur", 2500), ("100 usd to brl", 2500), ("d serendipity", 3000),
                       ("wt Lisbon", 4000), ("$ 100 xyz eur", 2000), ("timer 10m tea", 200), ("timer banana", 200), ("pomo", 200)]:
        res[text] = z.js(TYPE, text, wait)
    z.js(TYPE, "$ 100 usd eur", 1500)
    z.zoom(str(SHOTS / "card.png"), 300, 80, 766, 220, 1)
    res["Enter on a currency card"] = [z.js(KEY, "Enter", 600),
                                       z.js("return Cc['@mozilla.org/widget/clipboard;1'] ? 'clipboard ok' : ''")]
    z.js(TYPE, "timer 3s tea", 200)
    res["timer 3s tea + Enter"] = z.js(KEY, "Enter", 1200)
    z.js(TYPE, "timer 1h focus block", 200)
    z.js(KEY, "Enter", 600)
    res["timer list"] = z.js(TYPE, "timer", 400)
    z.zoom(str(SHOTS / "timer-list.png"), 300, 80, 766, 260, 1)
    res["after 3s timer ends"] = z.js("await zth.sleep(3500); return [...document.querySelectorAll('.zenith-toast')].map(t => t.textContent)")
    z.js("document.getElementById('zenith-peek').hidden = true; return 1")
    z.zoom(str(SHOTS / "toast-and-edge.png"), 0, 0, 1366, 768, 1)
    z.js(TYPE, "timer", 400)
    res["Delete in the list"] = z.js(KEY, "Delete", 400)
    z.js(TYPE, "pomo", 200)
    res["pomo + Enter"] = z.js(KEY, "Enter", 600)
    res["pomo while running"] = z.js(TYPE, "pomo", 200)
    z.js("ZenithTimers.save([]); return 1")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
