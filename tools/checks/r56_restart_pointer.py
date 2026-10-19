"""0.12.2, with real starts and real pointer input (the test profile only; it
moves the pointer over the test window):
- restart with about:zenith-tabs as the tab you're on: it loads (it was put
  in a web page process before Zenith registered it);
- the last page at once: a picture of the page you were on shows as Zen
  starts, until that page has loaded;
- picture-in-picture tucked past the right edge, with OS-level pointer
  events: resting on the sliver brings it out and it stays, leaving tucks
  it, a click brings it back for good.
Prints what it measured."""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({"browser.startup.page": 3, "zen.view.compact.enable-at-startup": False})
from harness import Zen
from bench_startup import KeptZen, js
from scenarios import Scene

res = {}

# 1. about:zenith-tabs, and the page picture, across a restart.
with Zen(headless=False) as z:
    js(z, """
      for (let i = 0; i < 100 && !window.ZenithLastPage; i++) await new Promise(r => setTimeout(r, 100));
      const t = gBrowser.addTrustedTab('https://example.com/', { inBackground: false }); gBrowser.selectedTab = t;
      await new Promise(r => setTimeout(r, 6000));
      return 1""")
    z.__class__ = KeptZen
    z.quit()
time.sleep(2)
with KeptZen(headless=False) as z:
    time.sleep(7)
    res["the last page at once"] = js(z, """
      const info = Services.startup.getStartupInfo(), p = +info.process, origin = performance.timeOrigin;
      const tr = window.ZenithLastPage?.trace ?? null, rel = v => (v == null ? null : Math.round(v + origin - p));
      // Next: about:zenith-tabs as the tab you're on.
      const a = gBrowser.addTrustedTab('about:zenith-tabs', { inBackground: false }); gBrowser.selectedTab = a;
      await new Promise(r => setTimeout(r, 2000));
      return { 'window shown': +(info.firstPaint2 ?? info.firstPaint) - p, 'picture shown': rel(tr?.shown), 'picture gone': rel(tr?.hidden), why: tr?.why ?? null };""")
    z.quit()
time.sleep(2)
with KeptZen(headless=False) as z:
    time.sleep(7)
    res["about:zenith-tabs after a restart"] = js(z, """
      const t = gBrowser.selectedTab, b = t.linkedBrowser;
      return { selected: b.currentURI.spec, 'in the browser itself': !b.isRemoteBrowser, title: b.contentDocument?.title ?? null };""")
    z.quit()

# 2. Picture-in-picture with OS-level pointer events.
with Scene(headless=False) as z:
    z.js("zth.open(arguments[0] + '/video'); await zth.sleep(2500); document.getElementById('View:PictureInPicture').doCommand(); await zth.sleep(3000); return 1", z.base)
    res["picture-in-picture, real pointer"] = z.js("""
      const w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')][0];
      if (!w) return 'no picture-in-picture window';
      const R = w.screen.availLeft + w.screen.availWidth, wu = w.windowUtils, cover = w.document.getElementById('zenith-pip-cover');
      const y = 200 + 128;
      const move = (x, yy) => { wu.sendNativeMouseEvent(x, yy, wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, cover, null); return zth.sleep(60); };
      w.moveTo(600, 200); await zth.sleep(700);
      await move(820, 320); await move(830, 330);
      w.moveTo(R - 60, 200); await zth.sleep(1400);
      const xs = [], sample = setInterval(() => xs.push(w.screenX - R), 50);
      await move(R - 300, y); await zth.sleep(200);
      await move(R - 20, y); await zth.sleep(1500); await move(R - 18, y + 6); await zth.sleep(1000);
      const rest = xs.splice(0);
      await move(R - 700, y); await zth.sleep(1500);
      const away = xs.splice(0);
      await move(R - 20, y); await zth.sleep(80);
      wu.sendNativeMouseEvent(R - 20, y, wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN, 0, 0, cover, null); await zth.sleep(60);
      wu.sendNativeMouseEvent(R - 20, y, wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP, 0, 0, cover, null); await zth.sleep(1000);
      clearInterval(sample);
      const out = { 'resting: out and stays (x from the right edge, times it moved in or out)': [rest.at(-1), rest.filter((v, i) => i && (v > -100) !== (rest[i - 1] > -100)).length],
                    'left: tucked': away.at(-1), 'click: back for good': [w.document.documentElement.hasAttribute('zenith-pip-tucked'), R - (w.screenX + w.outerWidth)] };
      w.close();
      return out;""")
print(json.dumps(res, indent=1, ensure_ascii=False))
