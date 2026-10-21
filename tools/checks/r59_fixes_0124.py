"""0.12.5 (the 0.12.4 walkthrough's fixes), inside Zen, with the real
pointer where it matters (it moves the pointer over the test window):
- split views: a split's tab dragged with the pointer swaps with another
  of the split, or leaves it for a loose tab; a click doesn't switch spaces;
- picture-in-picture: back after the pointer stays away, back on a click
  elsewhere, fullscreen stays, inside Zen as an owned window;
- Ctrl+Tab in the sidebar's order, starting after your tab;
- YouTube: the home page (a picture is saved to the scratch folder), the
  history row, theatre undone after another page, a Short you're on stays.
Arguments: only the parts whose names contain them."""
import base64, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
ONLY = [a.lower() for a in sys.argv[1:]]
SHOTS = Path(os.environ["TEMP"]) / "claude" / "r59"
SHOTS.mkdir(parents=True, exist_ok=True)


def check(z, name, body, *args):
    if ONLY and not any(o in name.lower() for o in ONLY):
        return
    try:
        res[name] = z.js(body, *args)
    except Exception as e:
        res[name] = f"FAILED: {e}"
    print(json.dumps({name: res[name]}, ensure_ascii=False), flush=True)


def shot(z, name):
    data = z.cmd("WebDriver:TakeScreenshot", {"full": False, "hash": False})
    png = data.get("value", data) if isinstance(data, dict) else data
    (SHOTS / f"{name}.png").write_bytes(base64.b64decode(png))


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); return 1")

    check(z, "split views, real pointer", r"""
      const base = arguments[0], W = gZenWorkspaces, out = {};
      const was = gZenCompactModeManager.preference; gZenCompactModeManager.preference = false; await zth.sleep(800);
      const t = ['a', 'b', 'c'].map(n => zth.open(base + '/page?n=s' + n)); await zth.sleep(1200);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500);
      const loose = zth.open(base + '/page?n=loose'); await zth.sleep(1000);
      gBrowser.selectedTab = t[0]; await zth.sleep(500);
      const k = devicePixelRatio, wu = windowUtils;
      const at = el => { const r = el.getBoundingClientRect(); return [Math.round((mozInnerScreenX + r.left + r.width / 2) * k), Math.round((mozInnerScreenY + r.top + r.height / 2) * k)]; };
      const ev = (p, m) => wu.sendNativeMouseEvent(p[0], p[1], m, 0, 0, document.documentElement, null);
      const drag = async (from, to) => {
        ev(from, wu.NATIVE_MOUSE_MESSAGE_MOVE); await zth.sleep(150); ev(from, wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN); await zth.sleep(120);
        for (let i = 1; i <= 10; i++) { ev([from[0], Math.round(from[1] + (to[1] - from[1]) * i / 10)], wu.NATIVE_MOUSE_MESSAGE_MOVE); await zth.sleep(50); }
        await zth.sleep(250); const marks = [...document.querySelectorAll('[zenith-split-swap], [zenith-split-join], [zenith-split-before], [zenith-split-after]')].map(n => [...n.attributes].map(a => a.name).find(x => x.startsWith('zenith-split-')));
        ev(to, wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP); await zth.sleep(1200); return marks;
      };
      const order = () => [...t[0].group?.tabs ?? []].map(x => x.linkedBrowser.currentURI.spec.slice(-1));
      // A click on a split's tab: the space stays.
      const space = W.activeWorkspace, p1 = at(t[1]);
      ev(p1, wu.NATIVE_MOUSE_MESSAGE_MOVE); await zth.sleep(100); ev(p1, wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN); await zth.sleep(80); ev(p1, wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP); await zth.sleep(800);
      out['click: same space, that tab'] = [W.activeWorkspace === space, gBrowser.selectedTab === t[1]];
      out['swap: marks, order'] = [await drag(at(t[0]), at(t[2])), order()];
      const c = t.find(x => x.linkedBrowser.currentURI.spec.endsWith('sc'));
      out['onto a loose tab: marks, out of the split'] = [await drag(at(c), at(loose)), !c.group?.hasAttribute('split-view-group')];
      out['sidebar still answers: a click selects'] = await (async () => { const p = at(loose); ev(p, wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN); await zth.sleep(80); ev(p, wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP); await zth.sleep(600); return gBrowser.selectedTab === loose && W.activeWorkspace === space; })();
      gZenCompactModeManager.preference = was;
      return out;""", z.base)

    check(z, "Ctrl+Tab", r"""
      Services.prefs.setStringPref(window.ZenithCtrlTab.PREF, 'pictures'); await zth.sleep(300);
      const tabs = []; for (let i = 0; i < 12; i++) tabs.push(zth.open(arguments[0] + '/page?n=ct' + i, { background: true }));
      await zth.sleep(1500);
      const e = zth.open(arguments[0] + '/page?n=ctess', { background: true }); await zth.sleep(800); gZenPinnedTabManager.addToEssentials(e); await zth.sleep(1000);
      gBrowser.selectedTab = tabs[8]; await zth.sleep(300);
      const row = window.ZenithCtrlTab.inOrder(), vis = gBrowser.visibleTabs;
      const inOrder = row.every((t, i) => !i || vis.indexOf(row[i - 1]) < vis.indexOf(t));
      ctrlTab.open(); await zth.sleep(50);
      const next = ctrlTab.selected?._tab;
      const dbg = [ctrlTab._selectedIndex, ctrlTab.tabList.indexOf(gBrowser.selectedTab), ctrlTab.hasOwnProperty('open'), String(ctrlTab.open).slice(0, 60), ctrlTab.tabList.indexOf(next)];
      ctrlTab.close(); await zth.sleep(300);
      for (const t of [...tabs, e]) gBrowser.removeTab(t);
      Services.prefs.clearUserPref(window.ZenithCtrlTab.PREF);
      return { 'essential first, sidebar order': [row[0] === e, inOrder], 'starts on the tab after yours': next === tabs[9], dbg };""", z.base)

    check(z, "picture-in-picture", r"""
      const P = Services.prefs;
      const open = async () => { zth.open(arguments[0] + '/video'); await zth.sleep(2500); document.getElementById('View:PictureInPicture').doCommand(); await zth.sleep(3000);
        return [...Services.wm.getEnumerator('Toolkit:PictureInPicture')].at(-1); };
      let w = await open();
      if (!w) return 'no picture-in-picture window';
      const R = w.screen.availLeft + w.screen.availWidth, wu = w.windowUtils, cover = w.document.getElementById('zenith-pip-cover');
      const move = (x, y) => { wu.sendNativeMouseEvent(x, y, wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, cover, null); return zth.sleep(60); };
      const tucked = () => w.document.documentElement.hasAttribute('zenith-pip-tucked');
      const out = {};
      const visit = async () => { w.moveTo(R - 60, 200); await zth.sleep(1400); await move(R - 300, 328); await zth.sleep(300); await move(R - 22, 328); await move(R - 20, 331); await zth.sleep(700); return !tucked(); };
      out['out after a rest'] = await visit();
      await move(w.screenX - 150, 328); await zth.sleep(4200);
      out['pointer away: back'] = tucked();
      out['out again'] = await visit();
      const p = [w.screenX - 200, 300];
      await move(...p); wu.sendNativeMouseEvent(p[0], p[1], wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN, 0, 0, cover, null); await zth.sleep(60);
      wu.sendNativeMouseEvent(p[0], p[1], wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP, 0, 0, cover, null); await zth.sleep(1200);
      out['a click elsewhere: back'] = tucked();
      // Out for a visit, then its own fullscreen button.
      await visit(); w.focus(); await zth.sleep(300);
      w.document.getElementById('fullscreen')?.click(); await zth.sleep(2500);
      out['fullscreen (its button) stays'] = [w.windowState === w.STATE_FULLSCREEN, !!w.document.fullscreenElement];
      w.document.exitFullscreen?.(); await zth.sleep(1200);
      w.close(); await zth.sleep(1500);
      // Inside the Zen window: owned by it.
      P.setStringPref('zenith.plus.pip-within', 'zen');
      w = await open();
      if (!w) { P.clearUserPref('zenith.plus.pip-within'); return out; }
      const { ctypes } = ChromeUtils.importESModule('resource://gre/modules/ctypes.sys.mjs');
      const u32 = ctypes.open('user32.dll'), GetWindow = u32.declare('GetWindow', ctypes.winapi_abi, ctypes.voidptr_t, ctypes.voidptr_t, ctypes.uint32_t);
      const hwnd = x => ctypes.voidptr_t(ctypes.UInt64(x.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle));
      out['inside Zen: owned by its window, not on top of all'] = [ctypes.cast(GetWindow(hwnd(w), 4), ctypes.uintptr_t).value.toString() === ctypes.cast(hwnd(window), ctypes.uintptr_t).value.toString(),
        w.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow).zLevel !== Ci.nsIAppWindow.highestZ];
      u32.close();
      P.clearUserPref('zenith.plus.pip-within');
      w.close();
      return out;""", z.base)

    check(z, "pip inside Zen", r"""
      Services.prefs.setStringPref('zenith.plus.pip-within', 'zen');
      zth.open(arguments[0] + '/video'); await zth.sleep(4000);
      let w = null;
      for (let i = 0; i < 3 && !w; i++) {
        document.getElementById('View:PictureInPicture').doCommand();
        for (let j = 0; j < 10 && !w; j++) { await zth.sleep(400); w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')].at(-1); }
      }
      if (!w) { Services.prefs.clearUserPref('zenith.plus.pip-within'); return 'no picture-in-picture window'; }
      await zth.sleep(3500);
      const { ctypes } = ChromeUtils.importESModule('resource://gre/modules/ctypes.sys.mjs');
      const u32 = ctypes.open('user32.dll'), GetWindow = u32.declare('GetWindow', ctypes.winapi_abi, ctypes.voidptr_t, ctypes.voidptr_t, ctypes.uint32_t);
      const hwnd = x => ctypes.voidptr_t(ctypes.UInt64(x.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle));
      const out = { 'owned by its Zen window': ctypes.cast(GetWindow(hwnd(w), 4), ctypes.uintptr_t).value.toString() === ctypes.cast(hwnd(window), ctypes.uintptr_t).value.toString(),
                    'inside the window': w.screenX >= window.screenX && w.screenX + w.outerWidth <= window.screenX + window.outerWidth,
                    errors: Services.console.getMessageArray().map(m => m.message || String(m)).filter(m => /picture-in-picture/.test(m)).slice(-2) };
      u32.close();
      Services.prefs.clearUserPref('zenith.plus.pip-within');
      w.close();
      return out;""", z.base)

    check(z, "youtube home", r"""
      const F = window.ZenithFocus;
      const y = zth.open('https://www.youtube.com/'); await zth.sleep(9000);
      F.toggle(true); await zth.sleep(6000);
      window.zenithYT = y;
      return await y.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus').sendQuery('watched');""")
    if "youtube home" in res:
        shot(z, "youtube-home")

    check(z, "youtube pages", r"""
      const F = window.ZenithFocus, y = window.zenithYT, out = {};
      const ask = () => y.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus').sendQuery('watched');
      const go = async (url, ms = 9000) => { y.linkedBrowser.loadURI(Services.io.newURI(url), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await zth.sleep(ms); };
      await go('https://www.youtube.com/watch?v=jNQXAC9IVRw', 12000);
      out.watch = await ask();
      await go('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 12000);
      F.toggle(false); await zth.sleep(2000);
      out['left focus after another page: theatre'] = (await ask()).theatre;
      await go('https://www.youtube.com/shorts/jNQXAC9IVRw', 9000);
      F.toggle(true); await zth.sleep(5000);
      out['on a Short as focus starts: stays'] = y.linkedBrowser.currentURI.spec;
      F.toggle(false); await zth.sleep(800);
      gBrowser.removeTab(y);
      return out;""")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
