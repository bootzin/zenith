"""0.18.0, inside Zen: the scroller leaving and tidying up (a strip that
lost its mark, a split past the tile limit), essentials not split, a bar
over the page, Peek's own find bar and keys, a closed tile coming back into
its split, Glance's buttons (reload, placed), menu items off, screenshots.
Screenshots in argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT.mkdir(parents=True, exist_ok=True)
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


KEY = r"""const [vk, ch, mods] = arguments; const wu = window.windowUtils; await new Promise(r => { const t = setTimeout(r, 400);
  wu.sendNativeKeyEvent(0x409, vk, mods, ch, ch, { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(800); return 1"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); return 1")
    z.js(r"""window.P = Services.prefs; window.zB = arguments[0]; const sys = Services.scriptSecurityManager.getSystemPrincipal();
      window.zopen = (u, o = {}) => gBrowser.addTab(u, { triggeringPrincipal: sys, inBackground: true, ...o });
      window.zT = []; for (let i = 0; i < 6; i++) zT.push(zopen(zB + '/page?n=t' + i)); await zth.sleep(2500);
      P.setStringPref('zenith.shell.tiles', '4'); gBrowser.selectedTab = zT[5]; window.ZenithLayouts.set('scroller'); await zth.sleep(1500); return 1""", z.base)
    say("strip that lost its mark, then dwindle", z.js(r"""const S = gZenViewSplitter, d = S._data.find(x => x.tabs.includes(gBrowser.selectedTab)); const before = d?.tabs.length;
      delete d.zenithStrip; window.ZenithLayouts.set('dwindle'); await zth.sleep(1200); return { before, splits: S._data.length };"""))
    say("a split past the limit, tidied", z.js(r"""const S = gZenViewSplitter; P.setStringPref('zenith.shell.tiles', '0'); S.splitTabs(zT.slice(0, 6), 'vsep', 0); await zth.sleep(1000);
      const made = S._data[0]?.tabs.length; P.setStringPref('zenith.shell.tiles', '4'); window.ZenithLayouts.soon(); await zth.sleep(800); return { made, splits: S._data.length };"""))
    say("pinned tab in a strip space", z.js(r"""const pin = zopen(zB + '/page?n=pinned'); await zth.sleep(1000); gBrowser.pinTab(pin); gBrowser.selectedTab = pin; await zth.sleep(400);
      window.ZenithLayouts.set('scroller'); await zth.sleep(1200); const S = gZenViewSplitter, inSplit = !!S._data.find(x => x.tabs.includes(pin));
      const shown = getComputedStyle(pin.linkedBrowser.closest('.browserSidebarContainer')).visibility; gBrowser.selectedTab = zT[2]; await zth.sleep(1200);
      const strip = S._data.find(x => x.tabs.includes(zT[2]))?.tabs.length; window.ZenithLayouts.set('dwindle'); await zth.sleep(1000);
      return { 'pinned in a split': inSplit, 'pinned shown': shown, 'strip once on a column': strip, 'splits after dwindle': S._data.length };"""))
    say("essential split: refused", z.js(r"""const e = zopen(zB + '/page?n=ess'); await zth.sleep(1000); gZenPinnedTabManager.addToEssentials(e); await zth.sleep(500);
      const n = gBrowser.tabs.length; const r = gZenViewSplitter.splitTabs([e, zT[0]], 'vsep', 0); await zth.sleep(800);
      return { returned: r ?? null, 'tabs added': gBrowser.tabs.length - n, splits: gZenViewSplitter._data.length };"""))
    say("closed tile back into its split", z.js(r"""const S = gZenViewSplitter; S.splitTabs([zT[0], zT[1]], 'vsep', 0); await zth.sleep(1000);
      gBrowser.selectedTab = zT[1]; await zth.sleep(300); gBrowser.removeTab(zT[1]); await zth.sleep(800); const back = SessionStore.undoCloseTab(window, 0); await zth.sleep(2500);
      const d = S._data.find(x => x.tabs.includes(back)); return { 'back in a split': !!d, 'with its neighbour': !!d && d.tabs.includes(zT[0]) };"""))
    z.js("P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.display-top', 'overlay'); await zth.sleep(1500); return 1")
    say("bar over the page", z.js(r"""const b = document.querySelector('.zenith-bar[edge="top"]'), r = b.getBoundingClientRect(), page = gBrowser.selectedBrowser.closest('.browserSidebarContainer').getBoundingClientRect();
      return { overlay: b.hasAttribute('overlay'), position: getComputedStyle(b).position, 'page under it': page.top <= r.top + 2 };"""))
    z.screenshot(str(OUT / "a-overlay.png"))
    z.js("P.clearUserPref('zenith.bar.display-top'); return 1")
    say("peek: find bar and keys", z.js(r"""gBrowser.selectedTab = zT[3]; await zth.sleep(500); await window.ZenithPeek.open(zB + '/page?n=peeked'); await zth.sleep(2200);
      const b = gZenGlanceManager.detachedBrowser; b.focus(); await zth.sleep(300); return !!b;"""))
    z.js(KEY, 0x46, "f", 0x0400)
    say("peek: Ctrl+F", z.js(r"""const bar = document.querySelector('.zenith-peek-findbar'), b = gZenGlanceManager.detachedBrowser;
      const tabBar = gBrowser.isFindBarInitialized(gBrowser.selectedTab) && !gBrowser.getCachedFindBar(gBrowser.selectedTab).hidden;
      const r = bar?.getBoundingClientRect(); const at = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { 'peek find bar': !!bar && !bar.hidden, 'its browser is the peek': bar?.browser === b, 'drawn': !!at && bar.contains(at), 'tab beneath find bar': tabBar };"""))
    say("peek: a key's command acts on it", z.js(r"""const b = gZenGlanceManager.detachedBrowser; let seen = null;
      const k = e => { if (e.key === 'q') seen = gBrowser.selectedBrowser === b; }; window.addEventListener('keydown', k, true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', ctrlKey: true, bubbles: true })); window.removeEventListener('keydown', k, true);
      await zth.sleep(50); const after = gBrowser.selectedBrowser === b; return { 'during the key': seen, 'after it': after };"""))
    say("peek: buttons", z.js(r"""const box = document.querySelector('#zen-glance-detached .zen-glance-sidebar-container') ?? document.querySelector('.zen-glance-sidebar-container');
      return { buttons: box ? [...box.querySelectorAll('toolbarbutton')].map(b => b.className.split(' ')[0]) : null };"""))
    z.js("P.setStringPref('zenith.plus.glance-buttons', 'top'); await zth.sleep(400); return 1")
    z.screenshot(str(OUT / "b-peek-buttons-top.png"))
    z.js("P.clearUserPref('zenith.plus.glance-buttons'); gZenGlanceManager.closeDetachedGlance(); await zth.sleep(800); return 1")
    say("menu item off and moved", z.js(r"""P.setStringPref('zenith.internal.menu-items', JSON.stringify({ 'context-viewsource': 'off', 'context-selectall': 'more' }));
      const m = document.getElementById('contentAreaContextMenu'); const shown = new Promise(r => m.addEventListener('popupshown', r, { once: true }));
      m.openPopupAtScreen(300, 300, true); await shown; await zth.sleep(300);
      const vs = document.getElementById('context-viewsource'), back = document.getElementById('context-selectall');
      const out = { 'view source off': vs?.hasAttribute('zenith-menu-off'), 'select all in More': !!back?.closest('.zenith-more') }; m.hidePopup(); P.clearUserPref('zenith.internal.menu-items'); return out;"""))
    z.js("await window.ZenithLooks.toggle('menus'); await zth.sleep(1500); return 1")
    say("picker: menus and buttons", z.js("const h = document.getElementById('zenith-rice'); return { rows: h.querySelectorAll('.zr-item').length, glance: h.querySelectorAll('.zr-seg[pref=\"zenith.plus.glance-buttons\"] .zr-opt').length }"))
    z.screenshot(str(OUT / "c-picker-menus.png"))
    z.js("window.ZenithLooks.toggle(); P.setStringPref('zenith.bar.size', '36'); gBrowser.selectedTab = gBrowser.addTab('about:preferences', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await zth.sleep(2500); " +
         "gBrowser.selectedBrowser.contentWindow.gotoPref?.('paneZenith'); await zth.sleep(1500); const d = gBrowser.selectedBrowser.contentDocument; d.querySelector('[data-prop=\"zenith.bar.size\"]')?.scrollIntoView({ block: 'center' }); await zth.sleep(600); return 1")
    say("settings: slider and changed note", z.js(r"""const d = gBrowser.selectedBrowser.contentDocument, row = d.querySelector('[data-prop="zenith.bar.size"]');
      return { slider: !!row?.querySelector('.zp-slider input[type=range]'), changed: row?.querySelector('.zp-changed')?.textContent ?? null,
        sliders: d.querySelectorAll('.zp-slider').length, 'rice line gone': ![...d.querySelectorAll('.zp-why')].some(w => /changed here/.test(w.textContent)) };"""))
    z.screenshot(str(OUT / "d-settings.png"))
    z.js("P.clearUserPref('zenith.bar.size'); P.clearUserPref('zenith.bar.top'); return 1")

    say("bar: clock whole, title held, window moves", z.js(r"""P.setStringPref('zenith.bar.top', 'on'); window.resizeTo(900, 700); await zth.sleep(800);
      const t = gBrowser.addTab('data:text/html,<title>' + 'A very long title that goes on and on '.repeat(6) + '</title>', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      gBrowser.selectedTab = t; await zth.sleep(1500); const bar = document.querySelector('.zenith-bar[edge="top"]'), clock = bar.querySelector('.zb-mod[mod="clock"]'), title = bar.querySelector('.zb-mod[mod="title"]');
      const right = bar.querySelector('.zb-right').getBoundingClientRect(), tr = title?.getBoundingClientRect();
      const out = { 'clock whole': !!clock && clock.scrollWidth <= clock.clientWidth + 1, 'title before the right side': !tr || tr.right <= right.left + 1, 'agent sheet': !!window.zenithBarDrag };
      const r = bar.getBoundingClientRect(), x = window.screenX, sx = window.mozInnerScreenX + r.left + 300, sy = window.mozInnerScreenY + r.top + r.height / 2;
      const ev = (type, dx, b) => bar.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, buttons: b, pointerId: 1, screenX: sx + dx, screenY: sy, clientX: r.left + 300 + dx, clientY: r.top + 10 }));
      const target = document.elementFromPoint(r.left + 300, r.top + r.height / 2); out['at the empty spot'] = target === bar || target?.parentElement === bar;
      ev('pointerdown', 0, 1); ev('pointermove', 40, 1); ev('pointermove', 80, 1); ev('pointerup', 80, 0); await zth.sleep(300);
      out['window moved by'] = window.screenX - x; window.moveTo(0, 0);
      window.resizeTo(1366, 740); await zth.sleep(500); return out;"""))
    z.js("await window.ZenithDash.toggle(); await zth.sleep(1500); return 1")
    z.screenshot(str(OUT / "e-dash.png"))
    z.js("await window.ZenithDash.toggle(); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
