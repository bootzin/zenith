"""0.12.2, with real starts and real pointer input (the test profile only; it
moves the pointer over the test window):
- restart with about:zenith-tabs as the tab you're on: it loads (it was put
  in a web page process before Zenith registered it);
- a floating tab as Zen quits: it floats again after the restart (0.12.3).
(0.12.3: the last page's picture is gone; picture-in-picture's resting and
clicking elsewhere are r57's.)
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
      const t = gBrowser.addTrustedTab('https://example.com/', { inBackground: false }); gBrowser.selectedTab = t;
      await new Promise(r => setTimeout(r, 6000));
      return 1""")
    z.__class__ = KeptZen
    z.quit()
time.sleep(2)
with KeptZen(headless=False) as z:
    time.sleep(7)
    js(z, """
      const a = gBrowser.addTrustedTab('about:zenith-tabs', { inBackground: false }); gBrowser.selectedTab = a;
      await new Promise(r => setTimeout(r, 2000));
      const f = gBrowser.addTrustedTab('https://example.org/', { inBackground: true }); await new Promise(r => setTimeout(r, 2500));
      const w = window.ZenithFloat.float(f, { focus: false }); await new Promise(r => w.addEventListener('load', r, { once: true }));
      await new Promise(r => setTimeout(r, 2000));
      gBrowser.selectedTab = a; window.focus(); await new Promise(r => setTimeout(r, 500));
      return 1""")
    z.quit()
time.sleep(2)
with KeptZen(headless=False) as z:
    time.sleep(7)
    res["about:zenith-tabs after a restart"] = js(z, """
      const main = [...Services.wm.getEnumerator('navigator:browser')].find(x => !x.zenithFloatFrom) ?? window;
      const t = main.gBrowser.selectedTab, b = t.linkedBrowser;
      await new Promise(r => setTimeout(r, 6000));
      const floats = [...Services.wm.getEnumerator('navigator:browser')].filter(x => x.zenithFloatFrom && !x.closed);
      return { selected: b.currentURI.spec, 'in the browser itself': !b.isRemoteBrowser, title: b.contentDocument?.title ?? null,
               'the float is back after the restart': floats.map(x => x.gBrowser.selectedBrowser.currentURI.spec),
               'its tab here': gBrowser.tabs.filter(t => /example[.]org[/]$/.test((SessionStore.getLazyTabValue(t, 'url') || '') + (t.linkedBrowser?.currentURI?.spec ?? ''))).map(t => [SessionStore.getCustomTabValue(t, 'zenithFloat'), t.hasAttribute('pending'), !!t.linkedPanel]) };""")
    z.quit()

print(json.dumps(res, indent=1, ensure_ascii=False))
