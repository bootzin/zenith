"""0.12.21, inside Zen: the sidebar moved to the right through Zenith's Dock
(Zen's own setting): window buttons top right in the sidebar, the
"ZenithDock" event; the bookmarks panel across from or beside the sidebar
on either side, an old "right" setting read as "far" after start; a native
trackpad swipe over a Peek draws its arrow (and Motion's slide) on the Peek,
and goes back in it. Screenshots go to argv[1]."""
import json, os, sys
from pathlib import Path
os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({"zenith.plus.bookmarks-place": "right"})
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


BM = r"""const P = Services.prefs, B = window.ZenithBookmarks.Panel;
  const r = el => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right) }; };
  const look = async place => { P.setStringPref('zenith.plus.bookmarks-place', place); B.show(); await zth.sleep(700);
    const page = r(gBrowser.selectedBrowser), panel = r(B.node), bar = r(gNavToolbox);
    return { side: B.node.getAttribute('side'), 'panel left of page': panel.right <= page.left + 2, 'panel over page': panel.left >= page.left - 2 && panel.right <= page.right + 2,
             'panel next to sidebar': Math.abs(panel.right - bar.left) < 20 || Math.abs(panel.left - bar.right) < 20 }; };"""

SWIPE = r"""
  const U = window.windowUtils;
  window.zenithPan = (el, dx, phase) => { const r = el.getBoundingClientRect(), f = window.devicePixelRatio;
    const x = Math.round((window.mozInnerScreenX + r.left + r.width / 2) * f), y = Math.round((window.mozInnerScreenY + r.top + r.height / 2) * f);
    return new Promise(ok => U.sendNativeTouchpadPan(phase, x, y, dx, 0, 0, { observe: (s, t) => t === 'touchpadpanevent' && ok() }) || setTimeout(ok, 300)); };
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; Services.prefs.setBoolPref('zen.view.sidebar-expanded', true); for (const n of ['a', 'b']) zth.open(arguments[0] + '/page?n=side' + n); await zth.sleep(1500); return gZenCompactModeManager.preference", z.base)
    say("old bookmarks setting after start", z.js("return Services.prefs.getStringPref('zenith.plus.bookmarks-place')"))
    say("dock left", z.js(BM + r"""const D = window.ZenithDock; const out = { edge: D.edge, near: D.near, far: D.far };
      out['float: across (right of page)'] = await look('float'); out['near: beside (left)'] = await look('near'); B.hide?.(); return out;"""))
    say("dock right", z.js(BM + r"""const D = window.ZenithDock; let heard = null; window.addEventListener('ZenithDock', e => (heard = e.detail.edge), { once: true });
      D.set('right'); await zth.sleep(1500);
      const btns = document.querySelector('.titlebar-buttonbox-container:has(.titlebar-close)'), b = btns.getBoundingClientRect(), bar = gNavToolbox.getBoundingClientRect();
      const out = { edge: D.edge, near: D.near, 'event heard': heard, 'window buttons in the sidebar, top right': gNavToolbox.contains(btns) && b.right >= window.innerWidth - 20 && b.top < 10 && b.width > 50 };
      out['float: across (over the page, left)'] = await look('float'); """ + "await zth.sleep(300); return out;"))
    z.screenshot(str(OUT / "right-bookmarks-float.png"))
    say("dock right, docked", z.js(BM + r"""const out = {}; out['far: docked across (left of page)'] = await look('far'); out['near: beside (by the sidebar)'] = await look('near'); return out;"""))
    z.screenshot(str(OUT / "right-bookmarks-near.png"))
    z.js("window.ZenithBookmarks.Panel.hide?.(); Services.prefs.setStringPref('zenith.plus.bookmarks-place', 'float'); return 1")

    say("peek swipe arrow", z.js(SWIPE + r"""const base = arguments[0];
      const t = zth.open(base + '/page?n=pbehind'); gBrowser.selectedTab = t; await zth.sleep(1500);
      await window.ZenithPeek.open(base + '/page?n=pw1'); await zth.sleep(2000);
      const d = gZenGlanceManager.detachedBrowser;
      d.loadURI(Services.io.newURI(base + '/page?n=pw2'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await zth.sleep(1500);
      await zenithPan(d, -50, U.PHASE_BEGIN); for (let i = 0; i < 6; i++) { await zenithPan(d, -50, U.PHASE_UPDATE); await zth.sleep(16); }
      await zth.sleep(300);
      const box = document.getElementById('historySwipeAnimationContainer');
      window.zenithMid = { 'arrow on the peek': !!box && d.closest('.browserStack').contains(box), 'arrow not on the tab behind': !t.linkedBrowser.closest('.browserStack').querySelector('#historySwipeAnimationContainer'),
        'peek page slides': getComputedStyle(d).translate, 'tab behind still': getComputedStyle(t.linkedBrowser).translate };
      return 1;""", z.base))
    z.screenshot(str(OUT / "peek-mid-swipe.png"))
    say("peek swipe end", z.js(r"""const d = gZenGlanceManager.detachedBrowser, U = window.windowUtils;
      await zenithPan(d, 0, U.PHASE_END); await zth.sleep(2000);
      const out = Object.assign(window.zenithMid, { 'peek went back': d.currentURI.spec.includes('n=pw1') });
      await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true });
      window.ZenithDock.set('left'); await zth.sleep(800); out['back to left'] = window.ZenithDock.edge; return out;"""))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
