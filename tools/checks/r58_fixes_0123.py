"""0.12.4 (the 0.12.3 walkthrough's fixes), inside Zen:
- float: Zen's own pages float, a glance in a float goes back as its tab,
  an essential floats and comes back an essential, the pin button's icon,
  no roll-up;
- picture-in-picture: out after a short rest, back after the pointer stays
  away, kept inside the Zen window when asked;
- split views: a tab dragged onto a loose tab leaves its split, a loose tab
  dropped on a split joins it, a split's grip;
- focus mode on YouTube: the home page as a search page, history on
  request, the watch page quieter, a Short opens as a video;
- the switcher's Peek row and ":"; Ctrl+Tab keeps essentials in the row;
- cookies: blocked trackers told; the sites popup; media art across spaces.
Arguments: only the parts whose names contain them."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
ONLY = [a.lower() for a in sys.argv[1:]]


def check(z, name, body, *args):
    if ONLY and not any(o in name.lower() for o in ONLY):
        return
    try:
        res[name] = z.js(body, *args)
    except Exception as e:
        res[name] = f"FAILED: {e}"
    print(json.dumps({name: res[name]}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); return 1")

    check(z, "float", r"""
      const F = window.ZenithFloat, out = {}, base = arguments[0];
      const floatOf = async t => { gBrowser.selectedTab = t; await zth.sleep(300); document.getElementById('zenith-float-command').doCommand(); await zth.sleep(2500);
        return [...Services.wm.getEnumerator('navigator:browser')].find(x => x.zenithFloatFrom && !x.closed); };
      for (const url of ['about:preferences', 'about:zenith-tabs', 'about:zenith-start']) {
        const t = zth.open(url); await zth.sleep(1500);
        let w = null;
        try { w = await floatOf(t); out[url] = w ? [w.gBrowser.selectedBrowser.currentURI.spec, !!w.gBrowser.selectedBrowser.contentTitle] : 'no float'; }
        catch (e) { out[url] = 'float: ' + String(e).slice(0, 120) + ' @ ' + (e.stack || '').split(String.fromCharCode(10)).slice(0, 3).join(' | '); }
        try { w?.ZenithFloat.back(); } catch (e) { out[url + ' back'] = String(e).slice(0, 120) + ' @ ' + (e.stack || '').split(String.fromCharCode(10)).slice(0, 3).join(' | '); }
        await zth.sleep(800);
      }
      // A glance open in the float, then back.
      const g = zth.open(base + '/page?n=fg'); await zth.sleep(900);
      let w = await floatOf(g);
      w.gZenGlanceManager.openGlance({ url: base + '/page?n=fglance', triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), x: 50, y: 50, width: 10, height: 10 });
      await zth.sleep(2500);
      const glanced = w.gBrowser.selectedTab.hasAttribute('zen-glance-tab');
      w.ZenithFloat.back(); await zth.sleep(1500);
      out['glance open, back: its tab'] = [glanced, gBrowser.selectedTab.linkedBrowser.currentURI.spec.endsWith('n=fg'), !gBrowser.selectedTab.hasAttribute('zen-glance-tab')];
      // An essential.
      const e = zth.open(base + '/page?n=fess'); await zth.sleep(900); gZenPinnedTabManager.addToEssentials(e); await zth.sleep(1200);
      w = await floatOf(e);
      const bar = w.document.querySelector('.zenith-float-bar');
      out['bar: buttons, pinned icon'] = [[...bar.querySelectorAll('button')].map(b => b.getAttribute('kind')),
        w.getComputedStyle(bar.querySelector('[kind=pin]')).getPropertyValue('--zth-icon').includes('data:')];
      const back = w.ZenithFloat.back(); await zth.sleep(1500);
      out['essential: floats, back an essential'] = !!back?.hasAttribute('zen-essential');
      gBrowser.removeTab(back);
      return out;""", z.base)

    check(z, "split views", r"""
      const R = window.ZenithSplitReorder, base = arguments[0];
      const t = ['a', 'b', 'c'].map(n => zth.open(base + '/page?n=s' + n)); await zth.sleep(1200);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500);
      const was = gZenCompactModeManager.preference; gZenCompactModeManager.preference = false; await zth.sleep(1000);
      const loose = zth.open(base + '/page?n=loose'), loose2 = zth.open(base + '/page?n=loose2'); await zth.sleep(1200);
      const out = {};
      const at = el => { const r = el.getBoundingClientRect(); return { clientX: r.left + 14, clientY: r.top + 3 }; };
      const dt = new DataTransfer();
      const fire = (type, el, where) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...where }));
      t[1].group.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      t[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      out['grip'] = !!t[0].group.querySelector('.zenith-split-grip');
      // A split tab onto a loose tab: leaves the split, goes before it.
      fire('dragstart', t[2], at(t[2])); fire('dragover', loose, at(loose));
      const mark = [...loose.attributes].map(a => a.name).filter(n => n.startsWith('zenith-split'));
      fire('drop', loose, at(loose)); fire('dragend', t[2], at(t[2])); await zth.sleep(1200);
      out['split tab onto a loose tab: mark, left, before it'] = [mark, !t[2].group?.hasAttribute('split-view-group'), t[2].nextElementSibling === loose || gBrowser.tabs.indexOf(t[2]) === gBrowser.tabs.indexOf(loose) - 1];
      // A loose tab onto a split's tab: joins.
      const dt2 = new DataTransfer(); dt2.mozSetDataAt('application/x-moz-tabbrowser-tab', loose2, 0);
      t[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt2, ...at(t[0]) }));
      t[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt2, ...at(t[0]) })); await zth.sleep(1500);
      out['loose tab onto a split: joins'] = loose2.group === t[0].group && !!loose2.group?.hasAttribute('split-view-group');
      gZenCompactModeManager.preference = was;
      return out;""", z.base)

    check(z, "switcher and Ctrl+Tab", r"""
      const S = window.ZenithSwitcher, out = {};
      S.show('zenith walkthrough words'); await zth.sleep(300);
      out['Peek row last'] = S.items.at(-1)?.kind;
      S.hide();
      document.dispatchEvent(new KeyboardEvent('keypress', { charCode: 58, key: ':', bubbles: true, cancelable: true })); await zth.sleep(300);
      out[': opens it for a command'] = [S.open, S.input?.value];
      S.hide();
      const tabs = []; for (let i = 0; i < 12; i++) tabs.push(zth.open(arguments[0] + '/page?n=ct' + i, { background: true }));
      await zth.sleep(1500);
      const e = zth.open(arguments[0] + '/page?n=ctess', { background: true }); await zth.sleep(800); gZenPinnedTabManager.addToEssentials(e); await zth.sleep(800);
      gBrowser.selectedTab = tabs[8]; await zth.sleep(300);
      const row = window.ZenithCtrlTab.inOrder();
      out['Ctrl+Tab row: essential in it, starts here'] = [row.includes(e), row[0] === tabs[8], row.length];
      for (const t of [...tabs, e]) gBrowser.removeTab(t);
      return out;""", z.base)

    check(z, "cookies and settings", r"""
      const C = window.ZenithCookies, out = {};
      for (const c of document.querySelectorAll('#zenith-toasts .zenith-toast')) c.remove();
      await C.blocked(gBrowser.selectedBrowser, Ci.nsIWebProgressListener.STATE_COOKIES_BLOCKED_TRACKER);
      out['trackers blocked, default policy: told'] = [...document.querySelectorAll('#zenith-toasts .zenith-toast-title')].map(n => n.textContent);
      for (const c of document.querySelectorAll('#zenith-toasts .zenith-toast')) c.remove();
      const pref = zth.open('about:preferences'); await zth.sleep(2500);
      pref.linkedBrowser.contentWindow.gotoPref('paneZenith'); await zth.sleep(1500);
      const doc = pref.linkedBrowser.contentDocument, list = doc.querySelector('.zp-list');
      list?.querySelector('button')?.click(); await zth.sleep(300);
      out['sites: count and Edit, popup opens'] = [list?.querySelector('.zp-list-count')?.textContent, !!doc.querySelector('dialog.zp-sites[open]')];
      gBrowser.removeTab(pref);
      return out;""")

    check(z, "media art across spaces", r"""
      const W = gZenWorkspaces, out = {};
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(600); }
      const here = W.activeWorkspace, other = W.getWorkspaces().find(s => s.uuid !== here).uuid;
      const m = zth.open(arguments[0] + '/music'); await zth.sleep(2500);
      zth.open(arguments[0] + '/page?n=after'); await zth.sleep(2500);
      const card = () => document.querySelector('.zen-media-card');
      out['art, another tab'] = card()?.hasAttribute('zenith-art') ?? 'no card';
      await W.changeWorkspaceWithID(other); await zth.sleep(2500);
      out['art, another space'] = [card()?.hasAttribute('zenith-art') ?? 'no card', document.querySelectorAll('.zen-media-card').length];
      await W.changeWorkspaceWithID(here); await zth.sleep(800);
      gBrowser.removeTab(m);
      return out;""", z.base)

    check(z, "picture-in-picture", r"""
      zth.open(arguments[0] + '/video'); await zth.sleep(2500); document.getElementById('View:PictureInPicture').doCommand(); await zth.sleep(3000);
      const w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')][0];
      if (!w) return 'no picture-in-picture window';
      const R = w.screen.availLeft + w.screen.availWidth, wu = w.windowUtils, cover = w.document.getElementById('zenith-pip-cover');
      const move = (x, y) => { wu.sendNativeMouseEvent(x, y, wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, cover, null); return zth.sleep(60); };
      const tucked = () => w.document.documentElement.hasAttribute('zenith-pip-tucked');
      w.moveTo(R - 60, 200); await zth.sleep(1400);
      const y = 200 + 128, out = { tucked: tucked() };
      await move(R - 300, y); await zth.sleep(300);
      await move(R - 22, y); await move(R - 20, y + 3); await zth.sleep(450);
      out['out after a short rest'] = !tucked();
      await zth.sleep(400);
      out['pip left edge'] = [w.screenX, w.outerWidth, R]; await move(w.screenX - 150, y); await zth.sleep(300); await move(w.screenX - 160, y + 5); await zth.sleep(3300);
      out['pointer away a while: tucked'] = tucked();
      // Inside the Zen window.
      Services.prefs.setStringPref('zenith.plus.pip-within', 'zen');
      window.resizeTo(1000, 700); window.moveTo(100, 50); await zth.sleep(800);
      w.moveTo(300, 200); await zth.sleep(1200);
      window.moveTo(160, 80); await zth.sleep(1500);
      out['inside the Zen window, follows it'] = [w.screenX >= window.screenX, w.screenX + w.outerWidth <= window.screenX + window.outerWidth];
      Services.prefs.clearUserPref('zenith.plus.pip-within');
      w.close(); window.resizeTo(1366, 768); window.moveTo(0, 0);
      return out;""", z.base)

    check(z, "youtube", r"""
      const F = window.ZenithFocus, out = {};
      const y = zth.open('https://www.youtube.com/'); await zth.sleep(9000);
      F.toggle(true); await zth.sleep(6000);
      const ask = () => y.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus').sendQuery('watched');
      out.home = await ask();
      y.linkedBrowser.loadURI(Services.io.newURI('https://www.youtube.com/shorts/jNQXAC9IVRw'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      await zth.sleep(9000);
      out['a Short: opens as a video'] = y.linkedBrowser.currentURI.spec;
      await zth.sleep(8000);
      out.watch = await ask();
      F.toggle(false); await zth.sleep(1000);
      return out;""")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
