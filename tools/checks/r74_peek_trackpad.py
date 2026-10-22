"""A native two-finger trackpad swipe (Windows touchpad pan, the path a real
trackpad takes) goes back in a normal tab, and in a Peek goes back in the
Peek's page; the swipe events Firefox fires are logged."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


SWIPE = r"""
  const log = window.zenithSwipeLog = window.zenithSwipeLog || [];
  if (!window.zenithSwipeLogging) { window.zenithSwipeLogging = 1;
    for (const ev of ['MozSwipeGestureMayStart', 'MozSwipeGestureStart', 'MozSwipeGestureUpdate', 'MozSwipeGestureEnd', 'MozSwipeGesture'])
      window.addEventListener(ev, e => log.push(ev.replace('MozSwipeGesture', '') + (e.defaultPrevented ? '!' : '') + (ev === 'MozSwipeGestureMayStart' ? ':' + e.allowedDirections : '') + (ev === 'MozSwipeGesture' ? ':' + e.direction : '')), true); }
  const U = window.windowUtils;
  const pan = async (el, dx) => {
    const r = el.getBoundingClientRect(), f = window.devicePixelRatio;
    const x = Math.round((window.mozInnerScreenX + r.left + r.width / 2) * f), y = Math.round((window.mozInnerScreenY + r.top + r.height / 2) * f);
    const one = (phase, d) => new Promise(ok => U.sendNativeTouchpadPan(phase, x, y, d, 0, 0, { observe: (s, t) => t === 'touchpadpanevent' && ok() }) || setTimeout(ok, 300));
    await one(U.PHASE_BEGIN, dx);
    for (let i = 0; i < 6; i++) { await one(U.PHASE_UPDATE, dx); await zth.sleep(16); }
    await one(U.PHASE_END, 0);
    await zth.sleep(2000);
  };
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); return 1")
    say("prefs", z.js("return ['widget.disable-swipe-tracker', 'browser.gesture.swipe.left', 'apz.overscroll.enabled'].map(p => [p, Services.prefs.getPrefType(p) ? (Services.prefs.getPrefType(p) === 128 ? Services.prefs.getBoolPref(p) : Services.prefs.getStringPref(p)) : null])"))
    say("normal tab", z.js(SWIPE + r"""const base = arguments[0];
      const t = zth.open(base + '/page?n=tw1'); gBrowser.selectedTab = t; await zth.sleep(1500);
      t.linkedBrowser.loadURI(Services.io.newURI(base + '/page?n=tw2'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await zth.sleep(1500);
      log.length = 0; await pan(t.linkedBrowser, -50);
      const out = { 'went back': t.linkedBrowser.currentURI.spec.includes('n=tw1'), events: [...new Set(log)] };
      gBrowser.removeTab(t); return out;""", z.base))
    say("peek", z.js(SWIPE + r"""const base = arguments[0];
      const t = zth.open(base + '/page?n=pbehind'); gBrowser.selectedTab = t; await zth.sleep(1500);
      await window.ZenithPeek.open(base + '/page?n=pw1'); await zth.sleep(2000);
      const d = gZenGlanceManager.detachedBrowser;
      d.loadURI(Services.io.newURI(base + '/page?n=pw2'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await zth.sleep(1500);
      log.length = 0; await pan(d, -50);
      const out = { 'peek went back': d.currentURI.spec.includes('n=pw1'), 'peek still open': !!gZenGlanceManager.detachedBrowser, 'in tab area': gBrowser.tabbox.contains(d), 'tab behind unchanged': t.linkedBrowser.currentURI.spec.includes('n=pbehind'), events: [...new Set(log)] };
      log.length = 0; await pan(d, 50); out['swipe forward in peek'] = d.currentURI.spec.includes('n=pw2'); out['forward events'] = [...new Set(log)];
      if (gZenGlanceManager.detachedBrowser) await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true });
      gBrowser.removeTab(t); return out;""", z.base))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
