"""0.7.1: the fixes from the 0.7.0 walkthrough."""
import base64, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

SHOTS = Path(os.environ["TEMP"]) / "claude" / "r19"
SHOTS.mkdir(parents=True, exist_ok=True)
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
  const row = document.getElementById('zenith-peek-row');
  return row.hidden ? null : [row.querySelector('#zenith-peek-tag').textContent, row.querySelector('#zenith-peek-text').textContent,
                              row.querySelector('#zenith-peek-hint').textContent];
"""
ENTER = """document.getElementById('zenith-peek-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
           await zth.sleep(500); return ZenithTimers.list().map(t => [t.kind, t.focus, t.rest, t.rounds]);"""


def pip_shot(z, name):
    data = z.js("""
      const w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')][0];
      if (!w) return null;
      const bmp = await w.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, 'rgb(255,0,255)');
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0); return c.toDataURL('image/png');""")
    if data:
        (SHOTS / name).write_bytes(base64.b64decode(data.split(",")[1]))


res = {}
with Scene() as z:
    # Headless Zen has no Windows Acrylic, so it marks the window
    # zen-no-acrylic and Zenith goes solid; behave like Windows 11 instead.
    z.js("document.documentElement.removeAttribute('zen-no-acrylic'); return 1")
    z.js("""for (const p of ['zenith.internal.timers', 'zenith.peek.prefix-list', 'zenith.internal.weather-place', 'zenith.peek.units'])
              Services.prefs.clearUserPref(p);
            zth.open(arguments[0] + '/page'); await zth.sleep(1200); return 1""", z.base)
    # Weather: units, and "wt" on its own.
    res["units automatic"] = z.js("""const { Region } = ChromeUtils.importESModule('resource://gre/modules/Region.sys.mjs');
                                     return [Region.home, Region.current, Services.locale.regionalPrefsLocales[0]]""")
    res["wt Lisbon (auto)"] = z.js(TYPE, "wt Lisbon", 4000)
    z.js("Services.prefs.setStringPref('zenith.peek.units', 'metric'); return 1")
    res["wt Lisbon (metric)"] = z.js(TYPE, "wt Lisbon ", 4000)
    res["wt alone, after Lisbon"] = z.js(TYPE, "wt", 4000)
    z.js("Services.prefs.clearUserPref('zenith.internal.weather-place'); return 1")
    res["wt alone, nothing looked up yet"] = z.js(TYPE, "wt ", 5000)
    # Pomodoro patterns, and the running one counting down.
    res["pomo 15 10 4"] = z.js(TYPE, "pomo 15 10 4", 200)
    res["pomo focus 10, 5 break, 3 rounds"] = z.js(TYPE, "pomo focus 10, 5 break, 3 rounds", 200)
    res["Enter"] = z.js(ENTER)
    first = z.js(TYPE, "pomo", 300)
    second = z.js("await zth.sleep(2200); return document.getElementById('zenith-peek-text').textContent")
    res["pomo while running, 2 s apart"] = [first[1] if first else None, second]
    z.js("ZenithTimers.save([]); document.getElementById('zenith-peek').hidden = true; return 1")
    # Timer line on the left edge.
    z.js("ZenithTimers.start(600000, 'edge'); await zth.sleep(1200); return 1")
    res["timer edge"] = z.js("""const e = document.getElementById('zenith-timer-edge'), r = e.getBoundingClientRect(),
                                     w = document.getElementById('zen-tabbox-wrapper').getBoundingClientRect();
                               return { left: Math.round(r.left - w.left), fromRight: Math.round(w.right - r.right), height: Math.round(r.height) }""")
    z.zoom(str(SHOTS / "timer-left.png"), 0, 0, 1366, 768, 1)
    z.js("ZenithTimers.save([]); return 1")
    # Glass: pinned sidebar fully see-through, floating keeps its tint.
    res["glass sidebar alpha"] = z.js("""
      zth.set('Zenith Core', 'zenith.core.window-transparency', 'glass'); await zth.sleep(300);
      const pinned = document.documentElement.getAttribute('zen-compact-mode') !== 'true';
      const a = getComputedStyle(document.documentElement).getPropertyValue('--zth-sidebar-alpha').trim();
      document.documentElement.setAttribute('zen-compact-mode', pinned ? 'true' : 'false'); await zth.sleep(200);
      const b = getComputedStyle(document.documentElement).getPropertyValue('--zth-sidebar-alpha').trim();
      document.documentElement.setAttribute('zen-compact-mode', pinned ? 'false' : 'true');
      zth.set('Zenith Core', 'zenith.core.window-transparency', ''); return { pinned: pinned ? a : b, floating: pinned ? b : a };""")
    # Cover art follows Frost.
    z.js("zth.open(arguments[0] + '/music'); await zth.sleep(2500); zth.open(arguments[0] + '/page?n=2'); await zth.sleep(2000); return 1", z.base)
    res["cover art filter"] = z.js("""const c = document.querySelector('.zen-media-card'); const out = { default: getComputedStyle(c, '::before').filter };
      zth.set('Zenith Core', 'zenith.core.glass', 'off'); await zth.sleep(200); out.off = getComputedStyle(c, '::before').filter;
      zth.set('Zenith Core', 'zenith.core.glass', 'strong'); await zth.sleep(200); out.strong = getComputedStyle(c, '::before').filter;
      zth.set('Zenith Core', 'zenith.core.glass', ''); return out;""")
    z.js("zth.reveal(true); await zth.sleep(800); return 1")
    rect = z.js("return Object.values(document.querySelector('.zen-media-card').getBoundingClientRect().toJSON()).slice(0, 4)")
    z.zoom(str(SHOTS / "cover-default-frost.png"), max(0, rect[0] - 8), rect[1] - 8, rect[2] + 16, rect[3] + 16, 3)
    # Picture-in-picture: the bar hides with the controls.
    z.js("zth.open(arguments[0] + '/video'); await zth.sleep(2500); document.getElementById('View:PictureInPicture').doCommand(); await zth.sleep(4000); return 1", z.base)
    res["pip bar"] = z.js("""const w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')][0], c = w.document.getElementById('controls');
      c.removeAttribute('showing'); c.removeAttribute('keying'); await zth.sleep(400);
      const idle = w.getComputedStyle(w.document.getElementById('controls-bottom')).opacity;
      c.setAttribute('showing', 'true'); await zth.sleep(400);
      const showing = w.getComputedStyle(w.document.getElementById('controls-bottom')).opacity;
      c.removeAttribute('showing'); await zth.sleep(400); return { idle, showing };""")
    pip_shot(z, "pip-idle.png")
    # Sine's page: a note while auto-update is off.
    res["auto-update note"] = z.js("""Services.prefs.setBoolPref('sine.auto-updates', false);
      zth.open('about:preferences'); await zth.sleep(3000); gBrowser.selectedBrowser.contentWindow.gotoPref('paneSineMods'); await zth.sleep(1500);
      const doc = gBrowser.selectedBrowser.contentDocument; const off = doc.querySelector('.zenith-update-note')?.getAttribute('value') ?? null;
      Services.prefs.setBoolPref('sine.auto-updates', true); await zth.sleep(600);
      return { off, on: doc.querySelector('.zenith-update-note')?.getAttribute('value') ?? null };""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
