"""0.12.0 extras, inside Zen:
- start page: becomes the home page (and Off gives yours back); shows a
  clock, your bookmarks, filters them as you type, opens one with Enter,
  and is see-through;
- picture-in-picture: the wheel resizes it (same shape), let go near an
  edge it settles against it, dropped past a side edge it tucks away and a
  click brings it back;
- float a tab: it moves to a small window of its own (no reload), and back.
Prints what it measured; captures in %TEMP%/claude/r53."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
with Scene(headless=False) as z:
    res["start page"] = z.js("""
      const P = Services.prefs, home = () => P.getStringPref('browser.startup.homepage', '');
      P.setStringPref('browser.startup.homepage', 'https://example.org/mine');
      const before = home();
      P.setStringPref('zenith.plus.startpage', 'on'); await zth.sleep(200);
      const on = home();
      const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
      for (const [title, url] of [['Zenith repo', arguments[0] + '/page?n=repo'], ['Weather today', arguments[0] + '/page?n=weather'], ['Mail', arguments[0] + '/page?n=mail']])
        await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.toolbarGuid, title, url });
      const tab = zth.open('about:zenith-start'); await zth.sleep(2000);
      const doc = tab.linkedBrowser.contentDocument;
      const out = { 'home page: yours, on': [before, on], title: doc?.title, clock: doc?.getElementById('clock')?.textContent,
                    'see-through': tab.linkedBrowser.hasAttribute('zenith-see-through'),
                    bookmarks: [...(doc?.querySelectorAll('#marks .title') ?? [])].map(e => e.textContent) };
      const q = doc.getElementById('q');
      q.value = 'weath'; q.dispatchEvent(new tab.linkedBrowser.contentWindow.Event('input'));
      out['typing weath'] = [...doc.querySelectorAll('#marks .title')].map(e => e.textContent);
      q.dispatchEvent(new tab.linkedBrowser.contentWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await zth.sleep(1500);
      out['Enter opened'] = gBrowser.selectedTab.label;
      P.setStringPref('zenith.plus.startpage', ''); await zth.sleep(200);
      out['Off: home page back'] = home();
      return out;""", z.base)

    z.js("zth.open(arguments[0] + '/video'); await zth.sleep(2500); document.getElementById('View:PictureInPicture').doCommand(); await zth.sleep(3000); return 1", z.base)
    res["picture-in-picture"] = z.js("""
      const w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')][0];
      if (!w) return 'no picture-in-picture window';
      const s = w.screen, L = s.availLeft, T = s.availTop, R = L + s.availWidth;
      const box = () => [w.screenX, w.screenY, w.outerWidth, w.outerHeight];
      const out = { 'looked after': !!w.zenithPiP, start: box() };
      w.moveTo(L + 300, T + 200); await zth.sleep(700);
      const [, , w0, h0] = box();
      w.dispatchEvent(new w.WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); await zth.sleep(400);
      const [, , w1, h1] = box();
      out['wheel up: bigger, same shape'] = [w1 > w0, Math.abs(w1 / h1 - w0 / h0) < 0.02, [w0, h0], [w1, h1]];
      w.dispatchEvent(new w.WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); await zth.sleep(400);
      out['wheel down: back'] = Math.abs(box()[2] - w0) <= 2;
      // Let go 30px from the left edge: settles 12px from it.
      w.moveTo(L + 30, T + 200); await zth.sleep(900);
      out['near the left edge: x from the edge'] = box()[0] - L;
      // Dropped mostly past the right edge: tucked, a sliver left.
      w.moveTo(R - 60, T + 200); await zth.sleep(1100);
      out['past the right edge: tucked, on screen'] = [w.document.documentElement.getAttribute('zenith-pip-tucked'), R - box()[0]];
      w.document.documentElement.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); await zth.sleep(900);
      out['click: back, x from the right edge'] = [w.document.documentElement.hasAttribute('zenith-pip-tucked'), R - (box()[0] + box()[2])];
      w.close(); await zth.sleep(500);
      return out;""")

    res["float a tab"] = z.js("""
      const tab = zth.open(arguments[0] + '/page?n=floated'); await zth.sleep(1500);
      // A mark in the page: still there after the move means no reload.
      await tab.linkedBrowser.browsingContext.currentWindowGlobal; // (remote page)
      const n = gBrowser.tabs.length;
      const win = window.ZenithFloat.out(tab);
      await new Promise(r => win.addEventListener('load', r, { once: true }));
      await zth.sleep(2500);
      const out = { 'window opened': !!win, 'tabs here': gBrowser.tabs.length - n, 'its tab': win.gBrowser.selectedTab.label,
                    'popup': win.document.documentElement.getAttribute('chromehidden'), 'marked float': win.document.documentElement.getAttribute('zenith-float'),
                    size: [win.outerWidth, win.outerHeight] };
      win.ZenithFloat.back(); await zth.sleep(2000);
      out['back: tabs here, selected, float window closed'] = [gBrowser.tabs.length - n, gBrowser.selectedTab.label, win.closed];
      return out;""", z.base)
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
