"""0.12.1 (the 0.12.0 walkthrough's fixes), inside Zen:
- folders that don't pin sit below the pinned separator; Firefox's tab
  groups are gone (0.11.2's "firefox" setting is cleared);
- every Zenith key is in Zen's Keyboard shortcuts (labelled "Zenith: …"),
  Zen's keys run Zenith's commands, a feature that's off disables its own;
- float a tab: in the tab's menu, the window gets Zenith's bar (no title
  bar), sits on screen, and the tab goes back;
- Ctrl+Shift+Tab with pictures waits like Ctrl+Tab before showing them;
- focus mode puts away what's open, sends an article to Reader view, tidies
  a page that's mostly reading (banners, side column, stuck header), and
  puts it all back;
- start page: "new tabs too" makes it the new tab page, and stops;
- palette sync: every space, or only this one;
- AI download names: which names count as vague;
- picture-in-picture: a tucked window glides out under the pointer and
  back when it leaves;
- delete a download: two clicks on the bin in the sidebar's list;
- extensions per space: unticking a button's last space unpins it (as Pin
  to Toolbar does) and ticking one pins it; "Runs in spaces" turns an
  extension off in other spaces and on again, never one you turned off;
- settings: the bar of sections stays at the top and marks where you are;
- tab manager: All tabs (insights, sorting, filters), the name being typed
  survives the usage updates, Undo takes away a folder it made, an emptied
  folder is offered for deleting, Zen's own pages can sleep, a rule's
  second tab joins the first's folder and a deleted folder is made again;
- the first page sooner: the restored page's site is connected early.
Prints what it measured. Arguments: only the parts whose names contain
them (e.g. `settings focus`)."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
ONLY = [a.lower() for a in sys.argv[1:]]


def want(name):
    return not ONLY or any(o in name.lower() for o in ONLY)


def check(z, name, body, *args):
    """One part: what it measured (or what went wrong), printed as it goes."""
    if not want(name):
        return
    try:
        res[name] = z.js(body, *args)
    except Exception as e:
        res[name] = f"FAILED: {e}"
    print(json.dumps({name: res[name]}, indent=1, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    check(z, "groups below the separator", """
      const P = Services.prefs, G = window.ZenithGroups, A = window.ZenithTabs.Act;
      P.setStringPref('zenith.plus.unpinned-groups', '');
      const t = [1, 2, 3, 4].map(i => zth.open(arguments[0] + '/page?n=g' + i, { background: true }));
      await zth.sleep(1500);
      A.into([t[0], t[1]], { name: 'Pinned one', kind: 'folder' });
      A.into([t[2], t[3]], { name: 'Loose one', kind: 'group' });
      await zth.sleep(600);
      const box = gZenWorkspaces.activeWorkspaceElement ?? document.querySelector('zen-workspace[active]');
      const pinned = box.pinnedTabsContainer, sep = pinned.querySelector(':scope > .pinned-tabs-container-separator');
      const kids = [...pinned.children].map(c => c === sep ? '—' : c.localName === 'zen-folder' ? c.label : null).filter(Boolean);
      const out = { mode: G.mode, 'order (— is the separator)': kids,
                    'Firefox groups': document.querySelectorAll('tab-group:not([split-view-group])').length };
      P.setStringPref('zenith.plus.unpinned-groups', 'off'); await zth.sleep(300);
      out['off: no folder below'] = [...pinned.children].slice([...pinned.children].indexOf(sep) + 1).filter(c => c.localName === 'zen-folder').length;
      P.setStringPref('zenith.plus.unpinned-groups', ''); await zth.sleep(300);
      for (const f of [...document.querySelectorAll('zen-folder')]) f.delete?.();
      await zth.sleep(300);
      return out;""", z.base)

    check(z, "keys in Zen's shortcuts", """
      const M = gZenKeyboardShortcutsManager, ids = window.ZenithKeys.LIST.map(k => k[0]);
      for (let i = 0; i < 30 && !ids.every(id => M._currentShortcutList?.some(s => s.getID() === id)); i++) await zth.sleep(100);
      const have = ids.filter(id => M._currentShortcutList.some(s => s.getID() === id));
      const zenKeys = window.ZenithKeys.LIST.map(k => k[3]).filter(c => document.querySelector(`key[zen-keybind][command="${c}"]`));
      const own = window.ZenithKeys.LIST.map(k => k[6]).filter(id => document.getElementById(id));
      Services.prefs.setBoolPref('zenith.plus.float-tab', false); await zth.sleep(100);
      const off = document.getElementById('zenith-float-command').hasAttribute('disabled');
      Services.prefs.clearUserPref('zenith.plus.float-tab'); await zth.sleep(100);
      const tab = zth.open('about:preferences#zenCKS'); await zth.sleep(3500);
      const doc = tab.linkedBrowser.contentDocument;
      const labels = [...doc.querySelectorAll("input.zenCKSOption-input[data-id^='zenith-key-']")]
        .map(i => i.closest('.zenCKSOption')?.querySelector('.zenCKSOption-label')?.textContent);
      gBrowser.removeTab(tab);
      return { 'in Zen\\'s list': `${have.length}/${ids.length}`, 'Zen\\'s keys run them': `${zenKeys.length}/${ids.length}`,
               'Zenith\\'s own keys left': own, 'float off: command disabled': off, 'labels in Settings': labels };""")

    check(z, "float a tab", """
      for (const t of gBrowser.tabs.filter(t => !t.hasAttribute('zen-empty-tab'))) gBrowser.removeTab(t, { animate: false });
      const tab = zth.open(arguments[0] + '/page?n=floated'); await zth.sleep(1500);
      const item = document.getElementById('zenith-float-tab');
      const out = { 'menu item after Move tab': item?.previousElementSibling?.id };
      const win = window.ZenithFloat.float(tab);
      await new Promise(r => win.addEventListener('load', r, { once: true }));
      await zth.sleep(2500);
      const d = win.document, bar = d.querySelector('.zenith-float-bar'), s = win.screen;
      out['bar: buttons'] = [...(bar?.querySelectorAll('button') ?? [])].map(b => b.getAttribute('kind'));
      out['no title bar'] = d.documentElement.getAttribute('chromehidden');
      out['on screen'] = win.screenX >= s.availLeft && win.screenY >= s.availTop &&
                         win.screenX + win.outerWidth <= s.availLeft + s.availWidth + 1 && win.screenY + win.outerHeight <= s.availTop + s.availHeight + 1;
      out['your only tab: this window stays, with'] = gBrowser.tabs.filter(t => !t.hasAttribute('zen-empty-tab')).map(t => t.label);
      // Its menu says Put back.
      const wmenu = d.getElementById('tabContextMenu');
      win.TabContextMenu.contextTab = win.gBrowser.selectedTab;
      wmenu.dispatchEvent(new win.Event('popupshowing'));
      out['its menu'] = d.getElementById('zenith-float-tab')?.getAttribute('label');
      bar.querySelector('[kind=back]').click(); await zth.sleep(2000);
      out['↩: back, float closed'] = [gBrowser.selectedTab.label, win.closed];
      return out;""", z.base)

    check(z, "Ctrl+Shift+Tab waits", """
      Services.prefs.setStringPref('zenith.plus.ctrl-tab', 'recent'); await zth.sleep(300);
      for (let i = 0; i < 4; i++) { zth.open(arguments[0] + '/page?n=c' + i); await zth.sleep(250); }
      await zth.sleep(800);
      const e = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
      ctrlTab.onKeyDown(e);
      const at0 = { timer: !!ctrlTab._timer, panel: ctrlTab.panel?.state };
      await zth.sleep(450);
      const later = ctrlTab.panel?.state;
      const picked = ctrlTab.selected?._tab?.label;
      try { ctrlTab.onKeyUp?.(new KeyboardEvent('keyup', { key: 'Control', keyCode: 17 })); } catch {}
      try { ctrlTab.close?.(); } catch {}
      await zth.sleep(300);
      Services.prefs.clearUserPref('zenith.plus.ctrl-tab');
      return { 'at once: waiting, panel': [at0.timer, at0.panel], 'after 450ms': later, 'goes to': picked };""", z.base)

    check(z, "focus mode", """
      const F = window.ZenithFocus, P = Services.prefs;
      P.setStringPref('zenith.plus.focus-pages', '');
      // An article: the reading view over the page (0.12.2; 0.12.1 used Firefox's Reader view).
      const tab = zth.open(arguments[0] + '/reading'); await zth.sleep(2500);
      window.ZenithBookmarks.Panel.show(); await zth.sleep(500);
      (await gBrowser.getFindBar()).open(); await zth.sleep(500);
      const before = { bookmarks: !window.ZenithBookmarks.Panel.node?.hidden, find: !gBrowser.getCachedFindBar()?.hidden };
      F.toggle(true); await zth.sleep(3000);
      const out = { 'open before': before, 'put away': { bookmarks: !window.ZenithBookmarks.Panel.node?.hidden, find: !gBrowser.getCachedFindBar()?.hidden },
                    'article: reading view, same address': [(await tab.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus').sendQuery('state')).read,
                                                            !tab.linkedBrowser.currentURI.spec.startsWith('about:reader')] };
      F.toggle(false); await zth.sleep(2500);
      out['left: page back'] = tab.linkedBrowser.currentURI.spec.replace(arguments[0], '');
      // A page that's mostly reading but not an article (as Firefox sees it): tidied.
      const tab2 = zth.open(arguments[0] + '/reading?n=2'); await zth.sleep(2500);
      Object.defineProperty(tab2.linkedBrowser, 'isArticle', { get: () => false, configurable: true });
      F.toggle(true); await zth.sleep(2000);
      const actor = () => tab2.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus');
      out['other page: tidied'] = await actor().sendQuery('state');
      F.toggle(false); await zth.sleep(800);
      out['left: untidied'] = await actor().sendQuery('state');
      // Pages off: nothing touched.
      P.setStringPref('zenith.plus.focus-pages', 'off');
      F.toggle(true); await zth.sleep(1500);
      out['pages off'] = (await actor().sendQuery('state')).on;
      F.toggle(false);
      P.clearUserPref('zenith.plus.focus-pages');
      gBrowser.removeTab(tab); gBrowser.removeTab(tab2);
      return out;""", z.base)

    check(z, "start page on new tabs", """
      const P = Services.prefs, { AboutNewTab } = ChromeUtils.importESModule('resource:///modules/AboutNewTab.sys.mjs');
      P.setStringPref('zenith.plus.startpage', 'newtab'); await zth.sleep(300);
      const out = { 'new tab page': AboutNewTab.newTabURL, 'Zen\\'s URL bar on new tab': P.getBoolPref('zen.urlbar.replace-newtab', true),
                    home: P.getStringPref('browser.startup.homepage', '') };
      P.setStringPref('zenith.plus.startpage', 'on'); await zth.sleep(300);
      out['On: new tab page'] = AboutNewTab.newTabURL;
      out['On: Zen\\'s URL bar back'] = P.getBoolPref('zen.urlbar.replace-newtab', true);
      P.setStringPref('zenith.plus.startpage', ''); await zth.sleep(300);
      out['Off: home'] = P.getStringPref('browser.startup.homepage', '');
      return out;""")

    check(z, "palette: every space or this one", """
      const W = gZenWorkspaces, P = Services.prefs;
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      const saved = W.getWorkspaces().map(s => [s.uuid, structuredClone(s.theme)]);
      const json = { colors: { color1: '#c0392b', color2: '#27ae60', color3: '#2980b9', color4: '#8e44ad', color5: '#d35400', color6: '#16a085' } };
      const sig = () => W.getWorkspaces().map(s => JSON.stringify(s.theme?.gradientColors?.[0]?.c ?? null));
      const a = sig();
      P.setStringPref('zenith.plus.palette-spaces', 'current');
      window.ZenithPalette.apply(json); await zth.sleep(300);
      const b = sig();
      P.clearUserPref('zenith.plus.palette-spaces');
      window.ZenithPalette.apply({ colors: { color1: '#2ecc71', color2: '#e74c3c', color3: '#3498db' } }); await zth.sleep(300);
      const c = sig();
      for (const [uuid, theme] of saved) { const s = W.getWorkspaces().find(x => x.uuid === uuid); if (s) { s.theme = theme; W.saveWorkspace(s); } }
      const active = W.getWorkspaces().findIndex(s => s.uuid === W.activeWorkspace);
      return { 'this one: changed': a.map((x, i) => x !== b[i]), 'active space': active, 'every space: changed': b.map((x, i) => x !== c[i]) };""")

    check(z, "AI: vague names", """
      const N = window.ZenithAI?.names;
      if (!N) return 'no AI names';
      const names = ['image', 'images (3)', 'IMG_20240812_101523', 'download (1)', 'a8f3c2e91b7d', '----final----copy', 'x7Kq9ZpL2mWv',
                     'Douro valley hike', 'quarterly-report-2024', 'invoice_march', 'Rust in Action'];
      return Object.fromEntries(names.map(n => [n, N.vague(n)]));""")

    want("picture") and z.js("zth.open(arguments[0] + '/video'); await zth.sleep(2500); document.getElementById('View:PictureInPicture').doCommand(); await zth.sleep(3000); return 1", z.base)
    # (0.12.3: picture-in-picture's peek is gone; r57 checks resting and clicking elsewhere.)

    check(z, "delete a download", """
      const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
      const dir = PathUtils.join(PathUtils.tempDir, 'claude', 'zth-downloads');
      await IOUtils.makeDirectory(dir, { ignoreExisting: true });
      const target = PathUtils.join(dir, 'zenith-delete-me.txt');
      const d = await Downloads.createDownload({ source: arguments[0] + '/page?n=file', target });
      const list = await Downloads.getList(Downloads.ALL); await list.add(d); await d.start();
      await zth.sleep(800);
      // The sidebar's downloads list.
      const row = await (async () => {
        for (let i = 0; i < 20; i++) {
          const r = [...document.querySelectorAll('#zen-library-download-list .zen-library-download-list-download')].find(r => r.download === d);
          if (r) return r; await zth.sleep(150);
        }
        return null;
      })();
      if (!row) {
        // No sidebar list in this layout: the button still works on its own.
        const b = window.ZenithDownloadDelete.button(document, () => d);
        b.click(); const first = await IOUtils.exists(target); b.click(); await zth.sleep(800);
        return { 'sidebar list': 'not shown', 'first click: still there': first, 'second click: gone': !(await IOUtils.exists(target)) };
      }
      const b = row.querySelector('.zenith-download-delete');
      Services.prefs.setStringPref('zenith.plus.download-delete', 'confirm'); // (one click by default since 0.12.2)
      const out = { 'bin in the row': !!b };
      b?.click(); await zth.sleep(200);
      out['first click: asks, file there'] = [b?.hasAttribute('confirm'), await IOUtils.exists(target)];
      b?.click(); await zth.sleep(1000);
      out['second click: file gone'] = !(await IOUtils.exists(target));
      Services.prefs.clearUserPref('zenith.plus.download-delete');
      return out;""", z.base)

    if want("extensions"):
        # A small extension with a button, made here and installed for this
        # run only.
        ext = Path(os.environ["TEMP"]) / "claude" / "zth-ext"
        ext.mkdir(parents=True, exist_ok=True)
        (ext / "manifest.json").write_text(json.dumps({
            "manifest_version": 2, "name": "Zenith test extension", "version": "1.0",
            "browser_specific_settings": {"gecko": {"id": "zenith-test@example.com"}},
            "browser_action": {"default_title": "Zenith test"}}), encoding="utf-8")
        z.cmd("Addon:Install", {"path": str(ext), "temporary": True})
    check(z, "extensions per space", """
      const S = window.ZenithSpaceExtensions, W = gZenWorkspaces, CUI = CustomizableUI;
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      const home = W.activeWorkspace, work = W.getWorkspaces().find(s => s.uuid !== home).uuid;
      const ID = 'zenith-test@example.com', widget = 'zenith-test_example_com-browser-action';
      await zth.sleep(800);
      const out = { 'button placed': CUI.getPlacementOfWidget(widget)?.area };
      // Its right-click menu has both lists.
      const node = document.getElementById(widget), menu = document.getElementById('toolbar-context-menu');
      if (node) {
        // (As a right-click on the button would: the menu knows what was clicked.)
        Object.defineProperty(menu, 'triggerNode', { value: node.querySelector('toolbarbutton') ?? node, configurable: true });
        menu.openPopup(node, 'after_start'); await zth.sleep(400);
        delete menu.triggerNode;
        out['menu: lists'] = [...menu.children].filter(m => m.localName === 'menu' && !m.hidden && /spaces/.test(m.label)).map(m => m.label);
        menu.hidePopup(); await zth.sleep(200);
      }
      await S.pin(widget, true); await zth.sleep(300);
      await S.flip(widget, home); await zth.sleep(200);
      out['unticked here: pinned in'] = S.map[widget]?.length;
      await S.flip(widget, work); await zth.sleep(300);
      out['unticked the last: unpinned (panel), spaces forgotten'] = [CUI.getPlacementOfWidget(widget)?.area, S.map[widget] ?? null];
      await S.flip(widget, work); await zth.sleep(300);
      out['ticked one from the panel: pinned there only'] = [S.onToolbar(widget), S.map[widget]?.length === 1 && S.map[widget][0] === work];
      S.set(widget, null);
      // Runs only in Work.
      S.setRuns(ID, [work]); await zth.sleep(900);
      out['here (not Work): off'] = [(await AddonManager.getAddonByID(ID)).isActive, [...S.resting]];
      out['sync told not to copy'] = Services.prefs.getBoolPref('services.sync.addons.ignoreUserEnabledChanges', false);
      await W.changeWorkspaceWithID(work); await zth.sleep(1500);
      out['in Work: on'] = (await AddonManager.getAddonByID(ID)).isActive;
      await W.changeWorkspaceWithID(home); await zth.sleep(1500);
      out['back: off again'] = (await AddonManager.getAddonByID(ID)).isActive;
      // Every space again: on, nothing resting.
      S.setRuns(ID, null); await zth.sleep(900);
      out['every space: on, none resting, sync back'] = [(await AddonManager.getAddonByID(ID)).isActive, S.resting.size,
                                                         Services.prefs.prefHasUserValue('services.sync.addons.ignoreUserEnabledChanges')];
      // One you turned off yourself stays off.
      await (await AddonManager.getAddonByID(ID)).disable();
      S.setRuns(ID, [work]); await zth.sleep(700);
      await W.changeWorkspaceWithID(work); await zth.sleep(1500);
      out['yours, off: stays off in Work'] = (await AddonManager.getAddonByID(ID)).isActive;
      await W.changeWorkspaceWithID(home); await zth.sleep(800);
      S.setRuns(ID, null);
      await (await AddonManager.getAddonByID(ID)).uninstall();
      return out;""")

    want("settings") and z.js("""zth.open('about:preferences'); await zth.sleep(3000);
            gBrowser.selectedBrowser.contentWindow.gotoPref('paneZenith'); await zth.sleep(1500); return 1""")
    check(z, "settings: sections bar", """
      const w = gBrowser.selectedBrowser.contentWindow, doc = w.document;
      const bar = doc.querySelector('.zp-bar'), chips = [...doc.querySelectorAll('.zp-bar .zp-chip')];
      const current = () => doc.querySelector('.zp-bar .zp-chip[aria-current]')?.textContent;
      const out = { 'bar sticky': bar && w.getComputedStyle(bar).position, chips: chips.length, 'at the top': current(),
                    'hero banner mark gone': !doc.querySelector('.zp-mark') };
      const fourth = chips[3], last = chips.at(-1);
      fourth?.click(); await zth.sleep(1500);
      const sec = doc.querySelector(`.zp-section[data-section="${fourth.dataset.section}"]`);
      out['picked the 4th: marked, gap below the bar'] = [fourth?.textContent, current(), Math.round(sec.getBoundingClientRect().top - bar.getBoundingClientRect().bottom)];
      out['bar still in view'] = Math.round(bar.getBoundingClientRect().top) >= 0 && bar.getBoundingClientRect().bottom < 300;
      doc.querySelector('.main-content').scrollBy(0, 900); await zth.sleep(600);
      out['scrolled on: marked'] = current();
      last.click(); await zth.sleep(1500);
      out['picked the last: marked'] = [last.textContent, current()];
      gBrowser.removeTab(gBrowser.selectedTab);
      // The same over the page (Alt+Shift+Z).
      const L = window.ZenithLive; L.open(); await zth.sleep(600);
      const head = L.host.querySelector('.zp-live-head'), pchips = [...head.querySelectorAll('.zp-chip')];
      const pcurrent = () => head.querySelector('.zp-chip[aria-current]')?.textContent;
      out['panel: chips in its head, at the top'] = [pchips.length, pcurrent()];
      pchips[4].click(); await zth.sleep(1500);
      const psec = L.host.querySelector(`.zp-section[data-section="${pchips[4].dataset.section}"]`);
      out['panel: picked the 5th, gap below the head'] = [pchips[4].textContent, pcurrent(), Math.round(psec.getBoundingClientRect().top - head.getBoundingClientRect().bottom)];
      L.close();
      return out;""")

    check(z, "tab manager", """
      const Z = window.ZenithTabs;
      for (let i = 0; i < 6; i++) zth.open(arguments[0] + '/page?n=m' + i, { background: true });
      zth.open(arguments[0] + '/page?n=m0', { background: true }); // a duplicate
      await zth.sleep(1500);
      document.getElementById('zenith-tabs-command').doCommand(); await zth.sleep(2000);
      const P = gBrowser.selectedTab.linkedBrowser, pw = P.contentWindow, doc = P.contentDocument, T = pw.ZenithTabsPage;
      await T.measure(); await zth.sleep(500);
      const out = { view: T.state.view, insights: [...doc.querySelectorAll('#insights .insight h3')].map(h => h.textContent),
                    filters: [...doc.querySelectorAll('#filters .chip')].map(c => c.textContent.trim()),
                    columns: [...doc.querySelectorAll('#table .thead .th')].map(h => h.textContent).filter(Boolean),
                    'CPU shown': /CPU/.test(doc.getElementById('insights').textContent) };
      const titles = () => [...doc.querySelectorAll('#table .tr.tab .title')].map(e => e.textContent);
      out['rows, no stray text'] = [titles().length, !/\\[object|null/.test(doc.getElementById('table').textContent + doc.getElementById('insights').textContent)];
      const mems = [...doc.querySelectorAll('#table .tr.tab')].map(r => r.querySelector('.mem .v').textContent);
      out['by memory (first rows)'] = mems.slice(0, 4);
      [...doc.querySelectorAll('#table .thead .th')].find(h => h.textContent === 'Tab').click(); await zth.sleep(200);
      const az = titles();
      out['sort by Tab: A to Z'] = az.length > 3 && az.join('|') === [...az].sort((a, b) => a.localeCompare(b)).join('|');
      Z.Act.sleep(Z.Look.tabs().filter(t => /n=m5$/.test(t.linkedBrowser.currentURI.spec))); await zth.sleep(800); T.render();
      [...doc.querySelectorAll('#filters .chip')].find(c => c.textContent.startsWith('Asleep'))?.click(); await zth.sleep(200);
      out['Asleep filter: rows'] = [T.state.filter, titles()];
      T.state.filter = 'all'; T.state.sort = { key: 'memory', dir: -1 }; T.render();
      // A new folder from the bar: the name survives the 3s updates.
      const mine = Z.Look.tabs().filter(t => /n=m[1-3]$/.test(t.linkedBrowser.currentURI.spec));
      for (const t of mine) T.state.picked.add(t);
      T.ask('Folder name', name => Z.Act.into(mine, { name, kind: 'folder' }));
      const input = doc.querySelector('#bar input'); input.value = 'Reading';
      await T.measure(); T.render(); await zth.sleep(3500);
      out['typing survives updates'] = [doc.querySelector('#bar input') === input, input.value, input.isConnected];
      input.dispatchEvent(new pw.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await zth.sleep(600);
      const made = Z.Act.folders().find(f => f.label === 'Reading');
      out['made the folder'] = !!made && [...made.tabs].filter(t => !t.hasAttribute('zen-empty-tab')).length;
      Z.Act.undoLast(); await zth.sleep(600);
      out['undo: folder taken away'] = !Z.Act.folders().some(f => f.label === 'Reading' && f.isConnected);
      // Emptying a folder offers to delete it.
      Z.Act.into(mine, { name: 'Empty me', kind: 'folder' }); await zth.sleep(500);
      T.doing(() => Z.Act.takeOut(mine)); await zth.sleep(500);
      out['emptied: offer'] = [...doc.querySelectorAll('#note button')].map(b => b.textContent);
      [...doc.querySelectorAll('#note button')].find(b => b.textContent.startsWith('Delete'))?.click(); await zth.sleep(400);
      out['deleted'] = !Z.Act.folders().some(f => f.label === 'Empty me');
      // Zen's own page (Settings) goes to sleep.
      const settings = zth.open('about:preferences', { background: true }); await zth.sleep(2000);
      const n = Z.Act.sleep([settings]); await zth.sleep(800);
      const copy = Z.Look.tabs().find(t => t.linkedBrowser.currentURI?.spec?.startsWith('about:preferences') || /preferences/.test(SessionStore.getLazyTabValue?.(t, 'url') ?? ''));
      out['Settings asleep (in place, 0.12.3)'] = [n, settings.isConnected, !Z.Look.awake(settings)];
      // A rule: the second tab joins, a deleted folder comes back.
      Z.Rules.save([{ on: true, match: 'url', value: 'n=rule', name: 'Ruled', kind: 'folder' }]);
      const r1 = zth.open(arguments[0] + '/page?n=rule1', { background: true }); await zth.sleep(1500);
      const r2 = zth.open(arguments[0] + '/page?n=rule2', { background: true }); await zth.sleep(1500);
      const f1 = Z.Look.ownGroup(r1), f2 = Z.Look.ownGroup(r2);
      out['rule: both in one folder'] = [f1?.label, f1 === f2, Z.Act.folders().filter(f => f.label === 'Ruled').length];
      f1?.delete(); await zth.sleep(500);
      const r3 = zth.open(arguments[0] + '/page?n=rule3', { background: true }); await zth.sleep(1500);
      out['folder deleted: made again'] = Z.Look.ownGroup(r3)?.label;
      Z.Rules.save([]);
      for (const f of Z.Act.folders()) f.delete?.();
      return out;""", z.base)

    check(z, "first page sooner", "return { 'started': !!window.ZenithWarmStart, 'warmed (a page from the last session)': window.ZenithWarmStart?.warmed ?? null }")
    res["css errors"] = z.console_errors()
print("css errors", json.dumps(res["css errors"], ensure_ascii=False))
