"""0.15.2 (rerun of r84's edges), inside Zen: each bar's own modules (and 0.15.1's settings moved
over), the editor on the settings page, tabs in a bar (where they sit, the
wheel), what's playing in three looks, another clock, the rail's clock not
cut, downloads always there, the window's buttons in one place, hiding bars
reached by the real pointer, a side bar and the sidebar on hover, the Dash
in one place (and its downloads, no scrollbar), the downloads popup's icons,
memory as Windows counts it, tabs in every space, pages light or dark.
Screenshots go to argv[1]."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


KEYS = r"""
const wu = window.windowUtils, P = (window.P = Services.prefs);
window.zset = async o => { for (const [k, v] of Object.entries(o)) { if (v === null) P.clearUserPref(k); else if (typeof v === 'boolean') P.setBoolPref(k, v); else if (typeof v === 'number') P.setIntPref(k, v); else P.setStringPref(k, v); }
  await zth.sleep(500); await window.ZenithBar?.ready; await zth.sleep(450); };
window.zbox = el => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
window.zmods = edge => { const b = document.getElementById(edge === 'top' ? 'zenith-bar' : 'zenith-bar-' + edge); if (!b) return null;
  return ['.zb-left', '.zb-centre', '.zb-right'].map(s => [...b.querySelectorAll(s + ' > .zb-mod')].map(m => m.getAttribute('mod')).join(',')).join(' | '); };
window.zesc = async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(250); };
window.zmove = async (x, y) => { const dpr = devicePixelRatio; await new Promise(r => { const t = setTimeout(r, 400);
  wu.sendNativeMouseEvent(Math.round((mozInnerScreenX + x) * dpr), Math.round((mozInnerScreenY + y) * dpr), wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, null, { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(650); };
window.zclear = () => { for (const k of P.getChildList('zenith.bar.')) P.clearUserPref(k); for (const k of ['zenith.sidebar', 'zenith.dash.place', 'zenith.dash.downloads', 'zenith.plus.appearance-auto',
  'zenith.internal.appearance.global', 'zenith.internal.appearance.spaces', 'layout.css.prefers-color-scheme.content-override', 'zen.view.window.scheme']) P.clearUserPref(k); };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1300, 700); window.moveTo(30, 20); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); P.clearUserPref('zenith.internal.float.kept'); zclear(); return 1")
    z.js(r"""window.zT = [zth.open(arguments[0] + '/page?n=one')]; gBrowser.selectedTab = zT[0]; await zth.sleep(1500);
      await zset({ 'zenith.bar.top': 'on', 'zenith.bar.left': 'on', 'zenith.bar.left.modules': 'spaces|tabs|clock' }); return 1""", z.base)
    say("a left bar and the sidebar on hover", z.js(r"""await zset({ 'zenith.sidebar': 'hover', 'zenith.bar.clock': null }); await zmove(700, 300); await zth.sleep(1200);
      const T = gNavToolbox; let bar = document.getElementById('zenith-bar-left');
      const out = { bar: zbox(bar), sidebar: zbox(T), margin: getComputedStyle(T).marginLeft };
      await zmove(3, 300); out['at the window edge'] = { bar: bar.matches(':hover'), sidebar: T.hasAttribute('zen-has-hover') };
      await zmove(bar.getBoundingClientRect().right + 2, 300); await zth.sleep(500); out['at the bar\'s inner edge'] = { sidebar: T.hasAttribute('zen-has-hover'), box: zbox(T) };
      await zmove(700, 300); await zth.sleep(900);
      await zset({ 'zenith.bar.hide-left': true }); await zmove(700, 300); await zth.sleep(900);
      out.hiding = { bar: zbox(bar = document.getElementById('zenith-bar-left')), 'sidebar answers': getComputedStyle(T).pointerEvents };
      await zmove(3, 300); await zth.sleep(400); out['hiding, reached'] = { bar: document.getElementById('zenith-bar-left').matches(':hover'), translate: getComputedStyle(document.getElementById('zenith-bar-left')).translate,
        reached: document.documentElement.getAttribute('zenith-reached'), 'sidebar answers': getComputedStyle(T).pointerEvents };
      await zmove(700, 300); return out;"""))
    z.screenshot(str(OUT / "left-and-sidebar.png"))
    z.js("await zset({ 'zenith.bar.left': null, 'zenith.bar.left.modules': null, 'zenith.bar.hide-left': null, 'zenith.sidebar': null }); return 1")

    say("hiding bars reached by the pointer", z.js(r"""await zset({ 'zenith.bar.hide-top': true, 'zenith.bar.bottom': 'on', 'zenith.bar.hide-bottom': true }); await zmove(600, 300); await zth.sleep(800);
      const top = document.getElementById('zenith-bar'), bot = document.getElementById('zenith-bar-bottom'), out = { top: {}, bottom: {} };
      for (const y of [2, 5, 10, 12]) { await zmove(600, y); out.top[y] = top.matches(':hover'); await zmove(600, 300); }
      for (const d of [2, 4]) { await zmove(600, innerHeight - d); out.bottom[d] = bot.matches(':hover'); await zmove(600, 300); }
      await zmove(600, 11); await zth.sleep(400); out['top shown'] = zbox(top); await zmove(600, 300);
      return out;"""))
    z.js("await zset({ 'zenith.bar.hide-top': null, 'zenith.bar.bottom': null, 'zenith.bar.hide-bottom': null }); return 1")

    z.js("zclear(); await zth.sleep(800); for (const t of zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
