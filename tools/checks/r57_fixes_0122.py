"""0.12.3 (the 0.12.2 walkthrough's fixes), inside Zen:
- float a tab: above its Zen window only (an owned window), the focus on
  it, the bar (pinned, its buttons, typing an address), Alt+Shift+F back,
  rolled up, closed and back floating with Ctrl+Shift+T, home as Zen quits;
- picture-in-picture: resting the real pointer on the sliver brings it out
  (and it stays), a click elsewhere tucks it, controls usable when out;
- split views: a real drag of a split tab onto another swaps them;
- focus mode: one pill, the top toolbar, a video site as a place to watch
  (local: recommendations hidden; YouTube: feed, recommendations, comments
  gone, theatre, autoplay off, all back after), sites left alone as a list;
- tab manager: sorting's third click, a chosen filter again, Just done
  after Ctrl+Z, essentials into a folder said, memory as the system counts
  it, topic names, sleeping a Zen page in another space;
- cookies: a notice with Undo (banner back, site left alone), private
  windows not logged, cookies blocked told;
- start page: this space's essentials first; Ctrl+Tab and the switcher
  with a glance open; the minimap and attention dots; a pinned folder's
  tab back in it; the Library's bin; the settings pane's header and icon.
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
    print(json.dumps({name: res[name]}, indent=1, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); return 1")

    check(z, "float", r"""
      const F = window.ZenithFloat, out = {}, base = arguments[0];
      const t = zth.open(base + '/page?n=float'); await zth.sleep(1200);
      Services.prefs.clearUserPref('zenith.plus.float-above'); Services.prefs.clearUserPref('zenith.internal.float.bar-pinned');
      let w = F.float(t); await new Promise(r => w.addEventListener('load', r, { once: true })); await zth.sleep(1500);
      const { ctypes } = ChromeUtils.importESModule('resource://gre/modules/ctypes.sys.mjs');
      const u32 = ctypes.open('user32.dll'), GetWindow = u32.declare('GetWindow', ctypes.winapi_abi, ctypes.voidptr_t, ctypes.voidptr_t, ctypes.uint32_t);
      const hwnd = x => ctypes.voidptr_t(ctypes.UInt64(x.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle));
      out['above Zen only: owned by its window'] = ctypes.cast(GetWindow(hwnd(w), 4), ctypes.uintptr_t).value.toString() === ctypes.cast(hwnd(window), ctypes.uintptr_t).value.toString();
      u32.close();
      out['has the focus'] = Services.focus.activeWindow === w;
      const d = w.document, bar = d.querySelector('.zenith-float-bar');
      out['bar: pinned, buttons'] = [d.documentElement.hasAttribute('zenith-float-pinned'), [...bar.querySelectorAll('button')].map(b => b.getAttribute('kind'))];
      out['bar: page below it'] = Math.round(w.gBrowser.selectedBrowser.getBoundingClientRect().top - bar.getBoundingClientRect().bottom);
      // Ctrl+L: an address.
      w.focus(); await zth.sleep(200);
      w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true, cancelable: true })); await zth.sleep(200);
      const input = d.querySelector('.zenith-float-address');
      out['Ctrl+L: an address field'] = !!input && input.value;
      if (input) { input.value = base + '/page?n=typed'; input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await zth.sleep(1500); }
      out['typed address loads'] = w.gBrowser.selectedBrowser.currentURI.spec.endsWith('n=typed');
      // Unpinned: hidden until the pointer comes in.
      bar.querySelector('[kind=pin]').click(); await zth.sleep(300);
      out['unpinned: bar hidden'] = [d.documentElement.hasAttribute('zenith-float-pinned'), w.getComputedStyle(bar).opacity];
      bar.querySelector('[kind=pin]').click();
      // Alt+Shift+F there: back.
      w.ZenithFloat.toggle(); await zth.sleep(1200);
      out['Alt+Shift+F in it: back home'] = [w.closed, gBrowser.selectedTab.linkedBrowser.currentURI.spec.endsWith('n=typed')];
      // Closed, and Ctrl+Shift+T: floating again.
      w = F.float(gBrowser.selectedTab); await new Promise(r => w.addEventListener('load', r, { once: true })); await zth.sleep(1200);
      w.ZenithFloat.closeFromWindow(); await zth.sleep(800);
      SessionStore.undoCloseTab(window, 0); await zth.sleep(2500);
      const floats = () => [...Services.wm.getEnumerator('navigator:browser')].filter(x => x.zenithFloatFrom && !x.closed);
      out['Ctrl+Shift+T: floats again'] = floats().map(x => x.gBrowser.selectedBrowser.currentURI.spec.slice(-7));
      // As Zen quits: home, marked.
      const f2 = floats()[0]; const moved = f2?.ZenithFloat.comeHome(); await zth.sleep(800);
      out['quitting: home and marked'] = !!moved && SessionStore.getCustomTabValue(moved, 'zenithFloat') === '1';
      if (moved) gBrowser.removeTab(moved);
      // Above every app.
      Services.prefs.setStringPref('zenith.plus.float-above', 'all');
      const t3 = zth.open(base + '/page?n=all'); await zth.sleep(800);
      const w3 = F.float(t3); await new Promise(r => w3.addEventListener('load', r, { once: true })); await zth.sleep(1200);
      out['above every app: on top, minimise button'] = [w3.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow).zLevel === Ci.nsIAppWindow.highestZ,
                                                          !!w3.document.querySelector('.zenith-float-bar [kind=minimise]')];
      w3.ZenithFloat.closeFromWindow(); await zth.sleep(600);
      Services.prefs.clearUserPref('zenith.plus.float-above');
      return out;""", z.base)

    check(z, "float: its window closes", r"""
      // A second window floats a tab, then closes: the float goes with it,
      // its tab among this window's closed tabs, and Ctrl+Shift+T floats it.
      const w2 = OpenBrowserWindow(); await new Promise(r => w2.addEventListener('load', r, { once: true })); await zth.sleep(2500);
      const t = w2.gBrowser.addTrustedTab(arguments[0] + '/page?n=homeclose'); w2.gBrowser.selectedTab = t; await zth.sleep(1500);
      const f = w2.ZenithFloat.float(t); await new Promise(r => f.addEventListener('load', r, { once: true })); await zth.sleep(1500);
      w2.close(); await zth.sleep(2000);
      const out = { 'float closed with it': f.closed };
      out['closed windows kept'] = SessionStore.getClosedWindowCount();
      const here = gBrowser.tabs.filter(x => /homeclose/.test(x.linkedBrowser?.currentURI?.spec ?? '') || /homeclose/.test(SessionStore.getLazyTabValue(x, 'url') ?? ''));
      out['in this window'] = here.map(x => [!!SessionStore.getCustomTabValue(x, 'zenithFloat'), x.hasAttribute('pending')]);
      out['floats now'] = [...Services.wm.getEnumerator('navigator:browser')].filter(x => x.zenithFloatFrom && !x.closed).length;
      out['closed tabs here: it, marked'] = SessionStore.getClosedTabDataForWindow(window).slice(0, 1).map(x => [x.title, !!x.state?.extData?.zenithFloat]);
      SessionStore.undoCloseTab(window, 0); await zth.sleep(2500);
      const fl = [...Services.wm.getEnumerator('navigator:browser')].filter(x => x.zenithFloatFrom && !x.closed);
      out['Ctrl+Shift+T: floating again'] = fl.map(x => x.gBrowser.selectedBrowser.currentURI.spec.slice(-9));
      for (const x of fl) x.ZenithFloat.closeFromWindow();
      return out;""", z.base)

    check(z, "split view drag", r"""
      // (An OS-level drag of a tab can't be driven from here: Zen ends it at
      // once. Drag events with the pointer's places stand in for it.)
      const t = ['a', 'b', 'c'].map(n => zth.open(arguments[0] + '/page?n=s' + n)); await zth.sleep(1500);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500);
      const was = gZenCompactModeManager.preference; gZenCompactModeManager.preference = false; await zth.sleep(1000);
      const order = () => [...t[0].group.tabs].map(x => x.linkedBrowser.currentURI.spec.slice(-1));
      const before = order();
      const mid = el => { const r = el.getBoundingClientRect(); return { clientX: r.left + 14, clientY: r.top + r.height / 2 }; };
      const dt = new DataTransfer();
      const fire = (type, el, at) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
      t[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...mid(t[0]) }));
      fire('dragstart', t[0].querySelector('.tab-icon-image') ?? t[0], mid(t[0]));
      // (0.12.4: only the tab is dragged, so what's under the pointer is the other tab.)
      fire('dragover', t[2], mid(t[2]));
      const marked = t[2].hasAttribute('zenith-split-swap');
      fire('drop', t[2], mid(t[2])); fire('dragend', t[0], mid(t[2])); await zth.sleep(800);
      const after = order();
      // Out of the split view's box: Zen's drag, no swap.
      fire('dragstart', t[1], mid(t[1]));
      const outside = { clientX: mid(t[1]).clientX, clientY: t[0].group.getBoundingClientRect().bottom + 60 };
      fire('dragover', t[1], outside); const markedOut = !!document.querySelector('[zenith-split-swap]'); fire('dragend', t[1], outside);
      gZenCompactModeManager.preference = was;
      return { before, 'outlined while over it': marked, after, 'outside the box: left to Zen': !markedOut && order().join() === after.join(),
               'still one split view': t.every(x => x.group === t[0].group) };""", z.base)

    check(z, "focus mode", r"""
      const F = window.ZenithFocus, P = Services.prefs, out = {}, base = arguments[0];
      P.setBoolPref('zen.view.use-single-toolbar', false); await zth.sleep(500);
      const t = zth.open(base + '/watch'); await zth.sleep(2500);
      F.toggle(true); await zth.sleep(2500);
      const pills = [...document.querySelectorAll('#zenith-focus-pill[show], #zenith-hint[show]')].map(p => p.id);
      out['one pill at a time'] = pills;
      out['top toolbar hidden while focused'] = P.getBoolPref('zen.view.compact.hide-toolbar', false);
      const st = await t.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus').sendQuery('state');
      const seen = await t.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus').sendQuery('watched');
      out['video site (local): a place to watch, recommendations gone'] = [st.watch, seen.recs, F.pill?.querySelector('.what')?.textContent];
      F.toggle(false); await zth.sleep(800);
      out['toolbar back as it was'] = P.prefHasUserValue('zen.view.compact.hide-toolbar') ? P.getBoolPref('zen.view.compact.hide-toolbar') : 'default';
      P.clearUserPref('zen.view.use-single-toolbar');
      gBrowser.removeTab(t);
      // YouTube, for real.
      const y = zth.open('https://www.youtube.com/watch?v=jNQXAC9IVRw'); await zth.sleep(9000);
      gBrowser.selectedTab = y;
      F.toggle(true); await zth.sleep(12000);
      const seen2 = () => y.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus').sendQuery('watched');
      const before = await seen2();
      out['YouTube: watching'] = before;
      F.toggle(false); await zth.sleep(2000);
      out['YouTube: after'] = await seen2();
      gBrowser.removeTab(y);
      return out;""", z.base)

    check(z, "tab manager", r"""
      const out = {}, Look = window.ZenithTabs.Look, Act = window.ZenithTabs.Act;
      const u = await Look.usage();
      const info = await ChromeUtils.requestProcInfo();
      out['memory: system count vs Firefox commit (MB)'] = [Math.round(u.all / 1e6), Math.round([info, ...info.children].reduce((n, p) => n + p.memory, 0) / 1e6)];
      const tm = zth.open('about:zenith-tabs'); await zth.sleep(2500);
      const w = tm.linkedBrowser.contentWindow, T = w.ZenithTabsPage, doc = w.document;
      T.state.view = 'tabs'; T.render(); await zth.sleep(300);
      const cyc = [];
      for (let i = 0; i < 3; i++) { [...doc.querySelectorAll('#table .thead .th')].find(b => b.textContent === 'Tab').click(); await zth.sleep(150); cyc.push(T.state.sort.key ? `${T.state.sort.key} ${T.state.sort.dir}` : 'none'); }
      out['sorting: one way, the other, none'] = cyc;
      const chip = () => [...doc.querySelectorAll('#filters .chip')].find(c => c.textContent.startsWith('Awake'));
      chip()?.click(); await zth.sleep(150); const f1 = T.state.filter; chip()?.click(); await zth.sleep(150);
      out['filter: chosen, again = All'] = [f1, T.state.filter];
      // Essentials into a folder: said.
      const e = zth.open(arguments[0] + '/page?n=ess'); await zth.sleep(800); gZenPinnedTabManager.addToEssentials(e); await zth.sleep(1200);
      Act.note = ''; T.doing(() => Act.into([e], { name: 'Ess test', kind: 'folder' })); await zth.sleep(400);
      out['essential into a folder: said'] = Act.note;
      gBrowser.removeTab(e);
      out['topic names'] = [T.topicName('Shopping', [{ label: 'React hooks guide' }, { label: 'Using React hooks well' }, { label: 'React hooks: useEffect' }].map(x => Object.assign(document.createXULElement('box'), x))),
                            T.topicName('Travel', [{ label: 'Flights to Lisbon' }, { label: 'Hotels in Porto' }].map(x => Object.assign(document.createXULElement('box'), x)))];
      // Settings in another space, put to sleep from here.
      const W = gZenWorkspaces;
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(600); }
      const here = W.activeWorkspace, other = W.getWorkspaces().find(s => s.uuid !== here).uuid;
      const st = zth.open('about:preferences', { background: true }); await zth.sleep(1200);
      W.moveTabsToWorkspace([st], other); await zth.sleep(500);
      gBrowser.selectedTab = tm; await zth.sleep(300);
      Act.sleep([st], true); await zth.sleep(1500);
      out['sleeping Settings in another space: you stay, it stays there, asleep'] = [W.activeWorkspace === here, st.isConnected && st.getAttribute('zen-workspace-id') === other, !Look.awake(st)];
      // Ctrl+Z: Just done follows.
      T.state.done.unshift({ text: 'x', entry: Act.history.at(-1), name: 'x', space: here, at: Date.now() });
      Act.undoLast(); T.state.view = 'tidy'; T.render(); await zth.sleep(300);
      out['undone: gone from Just done'] = T.state.done.length;
      for (const x of gBrowser.tabs.filter(x => /preferences/.test(x.linkedBrowser?.currentURI?.spec ?? '') || x === tm)) gBrowser.removeTab(x);
      return out;""", z.base)

    check(z, "cookies", r"""
      const C = window.ZenithCookies, out = {}, base = arguments[0];
      await C.actorReady;
      const stack = () => [...document.querySelectorAll('#zenith-toasts .zenith-toast')].map(c => c.querySelector('.zenith-toast-title').textContent);
      for (const c of document.querySelectorAll('#zenith-toasts .zenith-toast')) c.remove();
      Services.cookies.removeAll();
      const t = zth.open(base + '/consent-noreject'); await zth.sleep(2500);
      out['notice'] = stack();
      const undo = [...document.querySelectorAll('#zenith-toasts .zenith-toast-button')].find(b => b.textContent === 'Undo');
      undo?.click(); await zth.sleep(800);
      const st = await t.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithCookies').sendQuery('state');
      out['Undo: banner back, site left alone'] = [st.hidden, C.bannersLeftAlone(C.site('127.0.0.1')) || C.bannersLeftAlone('127.0.0.1')];
      Services.prefs.clearUserPref('zenith.plus.cookie-banners-skip');
      gBrowser.removeTab(t);
      // Private window: nothing kept.
      const before = (await C.lately()).length;
      const pw = OpenBrowserWindow({ private: true }); await new Promise(r => pw.addEventListener('load', r, { once: true })); await zth.sleep(2000);
      pw.gBrowser.selectedTab = pw.gBrowser.addTrustedTab(base + '/consent-generic'); await zth.sleep(3500);
      out['private: not in lately'] = [(await C.lately()).length === before];
      pw.close(); await zth.sleep(500);
      // Cookies blocked beyond Firefox's own: told.
      Services.prefs.setStringPref('zenith.plus.cookie-policy', 'cross'); await zth.sleep(300);
      for (const c of document.querySelectorAll('#zenith-toasts .zenith-toast')) c.remove();
      await C.blocked(gBrowser.selectedBrowser, Ci.nsIWebProgressListener.STATE_COOKIES_BLOCKED_FOREIGN);
      out['blocked: told'] = stack();
      Services.prefs.clearUserPref('zenith.plus.cookie-policy');
      for (const c of document.querySelectorAll('#zenith-toasts .zenith-toast')) c.remove();
      const page = zth.open('about:zenith-cookies'); await zth.sleep(1500);
      const pd = page.linkedBrowser.contentDocument;
      out['page: Find a site beside Sites'] = pd.getElementById('search')?.closest('.sites-head')?.querySelector('h2')?.textContent ?? null;
      gBrowser.removeTab(page);
      return out;""", z.base)

    check(z, "small fixes", r"""
      const out = {}, base = arguments[0], P = Services.prefs;
      // Start page: this space's essentials first.
      P.setBoolPref('zenith.plus.startpage-top', true);
      const e = zth.open(base + '/page?n=essential'); await zth.sleep(900); gZenPinnedTabManager.addToEssentials(e); await zth.sleep(400);
      const sp = zth.open('about:zenith-start'); await zth.sleep(2500);
      const tiles = [...sp.linkedBrowser.contentDocument.querySelectorAll('#top a')].map(a => [a.className, a.textContent]);
      out['start page: essential first, once'] = tiles.slice(0, 3);
      gBrowser.removeTab(sp); P.clearUserPref('zenith.plus.startpage-top');
      // Ctrl+Tab in order with a glance open, and the switcher.
      const a = zth.open(base + '/page?n=ga'), b = zth.open(base + '/page?n=gb'); await zth.sleep(1000);
      gBrowser.selectedTab = a; await zth.sleep(300);
      gZenGlanceManager.openGlance({ url: base + '/page?n=glanced', triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), x: 100, y: 100, width: 10, height: 10 }); await zth.sleep(2500);
      const sel = gBrowser.selectedTab, order = window.ZenithCtrlTab?.inOrder?.() ?? [];
      const vis = gBrowser.visibleTabs.filter(t => !t.hasAttribute('zen-glance-tab') && !t.hasAttribute('zen-empty-tab'));
      const next = vis[(vis.indexOf(a) + 1) % vis.length];
      out['Ctrl+Tab with a glance: starts at it, then the next tab'] = [sel.hasAttribute('zen-glance-tab'), order[0] === sel, order[1] === (next.glanceTab ?? next)];
      gBrowser.selectedTab = b; await zth.sleep(500);
      out['glance kept after leaving its tab'] = !!a.glanceTab;
      await window.ZenithSwitcher?.go?.({ kind: 'tab', tab: a }); await zth.sleep(800);
      out['switcher to a tab with a glance: its glance'] = gBrowser.selectedTab === a.glanceTab;
      out['media cards'] = document.querySelectorAll('.zen-media-card:not([hidden])').length;
      gBrowser.removeTab(b);
      // Minimap: attention off, no attention ticks.
      const M = window.ZenithMinimap;
      if (M) {
        const x = zth.open(base + '/page?n=att', { background: true }); await zth.sleep(500); x.setAttribute('titlechanged', 'true');
        const k1 = M.kind(x); P.setStringPref('zenith.tabs.attention-for', 'alerts'); const k2 = M.kind(x);
        P.clearUserPref('zenith.tabs.attention-for'); P.setStringPref('zenith.tabs.attention', 'off'); x.setAttribute('attention', 'true'); const k3 = M.kind(x);
        P.clearUserPref('zenith.tabs.attention'); gBrowser.removeTab(x);
        out['minimap: title change, alerts only, dots off'] = [k1, k2, k3];
      }
      // A pinned folder's tab, closed and back.
      const f1 = zth.open(base + '/page?n=pf1'), f2 = zth.open(base + '/page?n=pf2'); await zth.sleep(900);
      const folder = gZenFolders.createFolder([f1, f2], { renameFolder: false, label: 'Pinned test' }); await zth.sleep(900);
      window.ZenithGroups?.remember?.(); await zth.sleep(500);
      gBrowser.removeTab(f2); await zth.sleep(500);
      const back = SessionStore.undoCloseTab(window, 0); await zth.sleep(1500);
      out['pinned folder tab: back in it'] = [back?.group === folder, back?.pinned];
      folder.delete?.();
      // The settings pane's header, and the icon.
      window.ZenithLive?.open?.(); await zth.sleep(800);
      const head = document.querySelector('#zenith-live .zp-live-head');
      out['pane header: flat bottom'] = head ? getComputedStyle(head).borderBottomLeftRadius : null;
      window.ZenithLive?.close?.();
      const pref = zth.open('about:preferences'); await zth.sleep(2500);
      const icon = pref.linkedBrowser.contentDocument.querySelector('#category-zenith .category-icon, #category-zenith');
      out['settings: Zenith icon'] = icon ? (icon.getAttribute('iconsrc') ?? icon.style.listStyleImage).slice(0, 40) : null;
      gBrowser.removeTab(pref);
      return out;""", z.base)

    check(z, "settings page", r"""
      const pref = zth.open('about:preferences'); await zth.sleep(2500);
      pref.linkedBrowser.contentWindow.gotoPref('paneZenith'); await zth.sleep(1500);
      const doc = pref.linkedBrowser.contentDocument;
      const list = doc.querySelector('.zp-list');
      const row = list?.closest('.zp-row');
      const out = { 'sites left alone: a list': !!list, 'not greyed out by default': row ? !row.hasAttribute('disabled') && !row.matches('[aria-disabled=true], .zp-off') : null };
      if (list) {
        const input = list.querySelector('input'); input.value = 'example.org'; input.dispatchEvent(new pref.linkedBrowser.contentWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await zth.sleep(400);
        out['added'] = Services.prefs.getStringPref('zenith.plus.focus-skip', '');
        list.querySelector('.zp-list-remove')?.click(); await zth.sleep(300);
        out['removed'] = Services.prefs.getStringPref('zenith.plus.focus-skip', '');
      }
      Services.prefs.clearUserPref('zenith.plus.focus-skip');
      gBrowser.removeTab(pref);
      return out;""")

    check(z, "picture-in-picture, real pointer", r"""
      zth.open(arguments[0] + '/video'); await zth.sleep(2500); document.getElementById('View:PictureInPicture').doCommand(); await zth.sleep(3000);
      const w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')][0];
      if (!w) return 'no picture-in-picture window';
      const R = w.screen.availLeft + w.screen.availWidth, wu = w.windowUtils, cover = w.document.getElementById('zenith-pip-cover');
      const move = (x, y) => { wu.sendNativeMouseEvent(x, y, wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, cover, null); return zth.sleep(60); };
      w.moveTo(600, 200); await zth.sleep(700);
      await move(820, 320); await move(830, 330);
      w.moveTo(R - 60, 200); await zth.sleep(1400);
      const y = 200 + 128, xs = [], sample = setInterval(() => xs.push(Math.round(w.screenX - R)), 50);
      const tucked = () => w.document.documentElement.hasAttribute('zenith-pip-tucked');
      const t0 = tucked();
      await move(R - 300, y); await zth.sleep(300);
      await move(R - 22, y); await zth.sleep(250);
      const early = tucked();
      await move(R - 20, y + 4); await zth.sleep(1500);
      const out1 = [tucked(), w.document.getElementById('zenith-pip-cover').hidden];
      await move(R - 700, y); await zth.sleep(1500);
      const stays = !tucked();
      window.focus(); document.documentElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await zth.sleep(1200);
      clearInterval(sample);
      const moves = xs.filter((v, i) => i && (v > -100) !== (xs[i - 1] > -100)).length;
      return { 'tucked first': t0, 'passing by: still tucked': early, 'rested: out, controls free': out1, 'pointer away: stays out': stays,
               'click elsewhere: tucked': tucked(), 'times it moved in or out': moves };""", z.base)

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
