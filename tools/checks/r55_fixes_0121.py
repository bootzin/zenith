"""0.12.2 (the 0.12.1 walkthrough's fixes, cookies, extension copies), inside
Zen:
- delete a download: one click by default, two as a choice (a reused row
  asks again), none;
- a tab closed from a folder that doesn't pin comes back into it;
- start page: most visited sites (one per site), bookmarks off;
- tab manager: Memory and CPU, the CPU average column, picked tabs first
  and their filter, essentials in their own container's spaces, Undo's
  list, Undo says what it really put back, Sleep can be undone, Tidy up
  shows where tabs go and what it did (Show, Undo);
- focus mode: what was open opens again, an article in a reading view over
  the page (no reload), a video page's player filling the window, a page
  that's mostly reading tidied (a consent box too, however it's written),
  the pill's Not on this site;
- float a tab: Alt+Shift+F in Zen's list (Alt+Shift+Space moved), the
  menu item beside Duplicate, a window without window buttons that shrinks,
  closing either reopens with Ctrl+Shift+T;
- settings: the bar takes the page's colour, Blend's warning;
- split views: a tab dropped on another swaps them;
- cookies: banners rejected (a consent tool, any banner, in a frame), hidden
  when there's no Reject, left with Reject only, a site left alone; the
  policy and how long cookies are kept, through the bridge and back;
  a site's rule; the page;
- extension copies: made from a packaged extension, own ID and name, no
  updates, the original here and the copy in the other spaces, removed.
Arguments: only the parts whose names contain them. Prints what it measured."""
import json, os, sys, zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
ONLY = [a.lower() for a in sys.argv[1:]]


def want(name):
    return not ONLY or any(o in name.lower() for o in ONLY)


def check(z, name, body, *args):
    if not want(name):
        return
    try:
        res[name] = z.js(body, *args)
    except Exception as e:
        res[name] = f"FAILED: {e}"
    print(json.dumps({name: res[name]}, indent=1, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); return 1")

    check(z, "delete a download", r"""
      const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
      const dir = PathUtils.join(PathUtils.tempDir, 'claude', 'zth-downloads'); await IOUtils.makeDirectory(dir, { ignoreExisting: true });
      const mk = async n => { const target = PathUtils.join(dir, n); const d = await Downloads.createDownload({ source: arguments[0] + '/page?n=' + n, target });
        await (await Downloads.getList(Downloads.ALL)).add(d); await d.start(); return [d, target]; };
      const D = window.ZenithDownloadDelete;
      const [d1, f1] = await mk('one.txt');
      const b = D.button(document, () => d1); document.documentElement.append(b); b.click(); await zth.sleep(800);
      const one = !(await IOUtils.exists(f1));
      Services.prefs.setStringPref('zenith.plus.download-delete', 'confirm');
      const [d2, f2] = await mk('two.txt'), [d3, f3] = await mk('three.txt');
      let cur = d2; const b2 = D.button(document, () => cur); document.documentElement.append(b2);
      b2.click(); await zth.sleep(100); const asked = [b2.hasAttribute('confirm'), await IOUtils.exists(f2)];
      b2.click(); await zth.sleep(800); const gone2 = !(await IOUtils.exists(f2));
      cur = d3; b2.click(); await zth.sleep(300); const reused = [b2.hasAttribute('confirm'), await IOUtils.exists(f3)];
      b.remove(); b2.remove(); Services.prefs.clearUserPref('zenith.plus.download-delete');
      return { 'one click: gone': one, 'two: first asks': asked, 'two: second deletes': gone2, 'reused for another: asks again, file kept': reused };""", z.base)

    check(z, "unpinned folder: reopen", r"""
      const A = window.ZenithTabs.Act;
      const t = [1, 2].map(i => zth.open(arguments[0] + '/page?n=u' + i, { background: true })); await zth.sleep(1500);
      A.into(t, { name: 'Loose', kind: 'group' }); await zth.sleep(800);
      const folder = t[0].group;
      gBrowser.selectedTab = t[0]; await zth.sleep(400);
      document.getElementById('cmd_close').doCommand(); await zth.sleep(800);
      const closed = !t[0].isConnected;
      SessionStore.undoCloseTab(window, 0); await zth.sleep(1500);
      const back = gBrowser.tabs.find(x => /n=u1$/.test(x.linkedBrowser.currentURI.spec));
      const out = { closed, 'back in its folder': back?.group === folder };
      folder.delete(); await zth.sleep(400);
      return out;""", z.base)

    check(z, "start page", r"""
      const P = Services.prefs;
      for (let i = 0; i < 3; i++) { zth.open('https://example.com/?v' + i, { background: true }); }
      P.setStringPref('zenith.plus.startpage', 'on'); P.setBoolPref('zenith.plus.startpage-top', true); P.setBoolPref('zenith.plus.startpage-bookmarks', false);
      await zth.sleep(2500);
      const tab = zth.open('about:zenith-start'); await zth.sleep(2500);
      const d = tab.linkedBrowser.contentDocument, sites = [...d.querySelectorAll('#top a span')].map(s => s.textContent);
      const out = { 'most visited, one per site': [sites.length > 0, sites.length === new Set(sites).size], 'bookmarks off': d.getElementById('marks').hidden };
      P.clearUserPref('zenith.plus.startpage-top'); P.clearUserPref('zenith.plus.startpage-bookmarks'); P.setStringPref('zenith.plus.startpage', '');
      gBrowser.removeTab(tab);
      return out;""")

    check(z, "tab manager", r"""
      const Z = window.ZenithTabs, W = gZenWorkspaces;
      for (let i = 0; i < 6; i++) zth.open(arguments[0] + '/page?n=b' + i, { background: true });
      await zth.sleep(1500);
      document.getElementById('zenith-tabs-command').doCommand(); await zth.sleep(1800);
      const P = gBrowser.selectedTab.linkedBrowser, pw = P.contentWindow, doc = P.contentDocument, T = pw.ZenithTabsPage;
      for (let i = 0; i < 3; i++) { await T.measure(); await zth.sleep(300); }
      const out = { card: doc.querySelector('#insights .insight h3')?.textContent,
                    columns: [...doc.querySelectorAll('#table .thead > *')].map(h => h.textContent).filter(Boolean),
                    'avg in each row': [...doc.querySelectorAll('#table .tr.tab')].every(r => !!r.querySelector('.avg')) };
      // Picked first, and their filter.
      const two = Z.Look.tabs().filter(t => /n=b[24]$/.test(t.linkedBrowser.currentURI.spec));
      for (const t of two) T.state.picked.add(t);
      T.render(); await zth.sleep(100);
      doc.querySelector('#table .thead .pickcell').dispatchEvent(new pw.MouseEvent('click', { bubbles: true })); await zth.sleep(200);
      out['picked first'] = [...doc.querySelectorAll('#table .tr.tab .title')].slice(0, 2).map(e => e.textContent).sort();
      out['Picked chip'] = [...doc.querySelectorAll('#filters .chip')].some(c => c.textContent.startsWith('Picked'));
      T.state.picked.clear(); T.state.sort = { key: 'memory', dir: -1 }; T.render();
      // Sleep, then Undo wakes; Undo's list.
      const s = Z.Look.tabs().find(t => /n=b5$/.test(t.linkedBrowser.currentURI.spec));
      T.doing(() => Z.Act.sleep([s], true)); await zth.sleep(700);
      out['slept'] = !Z.Look.awake(s);
      Z.Act.into(Z.Look.tabs().filter(t => /n=b[01]$/.test(t.linkedBrowser.currentURI.spec)), { name: 'F', kind: 'folder' }); await zth.sleep(500);
      doc.getElementById('undo').click(); await zth.sleep(200);
      out["Undo's list"] = [...doc.querySelectorAll('#menu .item')].map(i => i.firstChild.textContent);
      [...doc.querySelectorAll('#menu .item')].at(-1).click(); await zth.sleep(1200);
      out['back to before both'] = [doc.getElementById('note').textContent, Z.Look.awake(s) || s.hasAttribute('busy'), !Z.Act.folders().some(f => f.label === 'F')];
      // Undo of something already put back by hand says so.
      const one = Z.Look.tabs().find(t => /n=b3$/.test(t.linkedBrowser.currentURI.spec));
      Z.Act.into([one], { name: 'G', kind: 'folder' }); await zth.sleep(400);
      Z.Act.takeOut([one]); Z.Act.history.pop(); await zth.sleep(400); // (by hand, as it were)
      for (const f of Z.Act.folders().filter(f => f.label === 'G')) f.delete();
      const r = Z.Act.undoLast();
      out['already as it was'] = [r?.label, r?.n];
      // Tidy up: where it goes, then what it did.
      doc.querySelector('#views [data-view="tidy"]').click(); await zth.sleep(400);
      const busy = [...doc.querySelectorAll('#tidy .card')].find(c => c.querySelector('.where'));
      out['goes into'] = busy?.querySelector('.where small')?.textContent;
      busy?.querySelector('.row button')?.click(); await zth.sleep(900);
      const done = doc.querySelector('#tidy .card.done');
      out['just done'] = [!!done, [...(done?.querySelectorAll('button') ?? [])].map(b => b.textContent)];
      done?.querySelector('button')?.click(); await zth.sleep(700);
      out['Show: spaces view, folder open'] = [T.state.view, !!doc.querySelector('#board .folder[open]')];
      for (const f of Z.Act.folders()) f.delete?.();
      return out;""", z.base)

    check(z, "essentials in their container's spaces", r"""
      const W = gZenWorkspaces, L = window.ZenithTabs.Look;
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      const t = zth.open(arguments[0] + '/page?n=ess', { background: true, container: 1 }); await zth.sleep(1200);
      const u = zth.open(arguments[0] + '/page?n=ess0', { background: true }); await zth.sleep(1200);
      gZenPinnedTabManager.addToEssentials(t); gZenPinnedTabManager.addToEssentials(u); await zth.sleep(800);
      const withC = W.getWorkspaces().filter(s => (s.containerTabId || 0) === 1).length, without = W.getWorkspaces().filter(s => !(s.containerTabId || 0)).length;
      const out = { separate: W.containerSpecificEssentials ?? null,
                    'in a container: only its spaces': L.essentialSpaces(t).length === withC,
                    'no container: the spaces without one': L.essentialSpaces(u).length === without };
      gBrowser.removeTab(t); gBrowser.removeTab(u);
      return out;""", z.base)

    check(z, "focus mode", r"""
      const F = window.ZenithFocus, act = b => b.browsingContext.currentWindowGlobal.getActor('ZenithFocus');
      const tab = zth.open(arguments[0] + '/reading'); await zth.sleep(2500);
      window.ZenithBookmarks.Panel.show(); await zth.sleep(400);
      F.toggle(true); await zth.sleep(3500);
      const st = await act(tab.linkedBrowser).sendQuery('state');
      const out = { 'article: reading view, no reload': [st.read, tab.linkedBrowser.currentURI.spec.endsWith('/reading')],
                    'put away': window.ZenithBookmarks.Panel.node.hidden, pill: document.getElementById('zenith-focus-pill')?.hasAttribute('show') };
      F.toggle(false); await zth.sleep(1200);
      out['left: as it was, bookmarks back'] = [(await act(tab.linkedBrowser).sendQuery('state')).read, !window.ZenithBookmarks.Panel.node.hidden];
      window.ZenithBookmarks.Panel.hide();
      const v = zth.open(arguments[0] + '/watch'); await zth.sleep(2500);
      F.toggle(true); await zth.sleep(2500);
      out['video page: a place to watch (0.12.3)'] = (await act(v.linkedBrowser).sendQuery('state')).watch;
      document.querySelectorAll('#zenith-focus-pill button')[1].click(); await zth.sleep(800);
      out['Not on this site'] = [Services.prefs.getStringPref('zenith.plus.focus-skip', ''), (await act(v.linkedBrowser).sendQuery('state')).watch];
      F.toggle(false); Services.prefs.clearUserPref('zenith.plus.focus-skip');
      Services.prefs.setStringPref('zenith.plus.cookie-banners', 'off'); // (so focus mode meets the banner itself)
      const c = zth.open(arguments[0] + '/consent-noreject'); await zth.sleep(2000);
      Object.defineProperty(c.linkedBrowser, 'isArticle', { get: () => false, configurable: true });
      F.toggle(true); await zth.sleep(2500);
      const fx = await act(c.linkedBrowser).sendQuery('fixed');
      out['tidied, consent box hidden'] = [(await act(c.linkedBrowser).sendQuery('state')).on, fx.out.filter(x => /cookie-wall/.test(x[2])).map(x => x[7])];
      F.toggle(false); Services.prefs.clearUserPref('zenith.plus.cookie-banners');
      return out;""", z.base)

    check(z, "float a tab", r"""
      const F = window.ZenithFloat, M = gZenKeyboardShortcutsManager;
      const k = M._currentShortcutList.find(x => x.getID() === 'zenith-key-float');
      const out = { key: k?.getKeyName(), 'menu: after': document.getElementById('zenith-float-tab').previousElementSibling?.id };
      const a = zth.open(arguments[0] + '/video'); await zth.sleep(2000);
      zth.open(arguments[0] + '/reading'); await zth.sleep(1000);
      gBrowser.selectedTab = a; await zth.sleep(300);
      // (0.12.3: the pane is gone; float windows are r57's.)
      const b = gBrowser.tabs.find(t => /\/video$/.test(t.linkedBrowser.currentURI.spec)); gBrowser.selectedTab = b; await zth.sleep(300);
      const w = F.float(b); await new Promise(r => w.addEventListener('load', r, { once: true })); await zth.sleep(2500);
      const d = w.document;
      out['window: bar buttons, no window buttons'] = [[...d.querySelectorAll('.zenith-float-bar button')].map(x => x.textContent), w.getComputedStyle(d.querySelector('.titlebar-buttonbox-container') ?? d.documentElement).visibility];
      w.resizeTo(300, 190); await zth.sleep(500);
      out['window: shrinks'] = [w.outerWidth, w.outerHeight];
      d.querySelectorAll('.zenith-float-bar button')[3].click(); await zth.sleep(1500);
      SessionStore.undoCloseTab(window, 0); await zth.sleep(1200);
      out['window: closed, reopened here'] = [w.closed, gBrowser.tabs.some(t => /\/video$/.test(t.linkedBrowser.currentURI.spec))];
      return out;""", z.base)

    check(z, "split view swap", r"""
      const t = ['a', 'b', 'c'].map(n => zth.open(arguments[0] + '/page?n=s' + n)); await zth.sleep(1500);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1200);
      const inset = x => x.linkedBrowser.closest('.browserSidebarContainer').style.inset;
      const before = [inset(t[0]), inset(t[2])];
      window.ZenithSplitReorder.swap(t[0], t[2]); await zth.sleep(600);
      return { 'sidebar order': [...t[0].group.tabs].map(x => x.label.slice(-1)), 'places swapped': inset(t[0]) === before[1] && inset(t[2]) === before[0] };""", z.base)

    check(z, "cookies", r"""
      const P = Services.prefs, base = arguments[0], C = window.ZenithCookies;
      const choice = () => Services.cookies.cookies.filter(c => c.name === 'choice').map(c => c.value);
      const visit = async (path, wait = 2500) => { Services.cookies.removeAll(); const t = zth.open(base + path); await zth.sleep(wait);
        const st = await t.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithCookies').sendQuery('state').catch(e => String(e));
        const r = { choice: choice(), how: st?.done?.how ?? null }; gBrowser.removeTab(t); return r; };
      await C.actorReady;
      const out = {};
      out['consent tool: rejected'] = await visit('/consent-onetrust');
      out['any banner: rejected'] = await visit('/consent-generic');
      out['in a frame: rejected'] = (await visit('/consent-frame', 3500)).choice;
      out['no Reject: hidden'] = await visit('/consent-noreject');
      P.setStringPref('zenith.plus.cookie-banners', 'reject');
      out['Reject only: left'] = await visit('/consent-noreject');
      P.setStringPref('zenith.plus.cookie-banners', 'hide');
      out['Hide: hidden, unanswered'] = await visit('/consent-generic');
      P.clearUserPref('zenith.plus.cookie-banners');
      P.setStringPref('zenith.plus.cookie-banners-skip', '127.0.0.1');
      out['site left alone'] = await visit('/consent-generic');
      P.clearUserPref('zenith.plus.cookie-banners-skip');
      const before = P.getIntPref('network.cookie.cookieBehavior');
      P.setStringPref('zenith.plus.cookie-policy', 'all'); await zth.sleep(200);
      out['policy: only allowed, then back'] = [before, P.getIntPref('network.cookie.cookieBehavior')];
      P.clearUserPref('zenith.plus.cookie-policy'); await zth.sleep(200);
      out['policy: only allowed, then back'].push(P.getIntPref('network.cookie.cookieBehavior'));
      P.setStringPref('zenith.plus.cookie-keep', 'session'); await zth.sleep(200);
      out['until closing: cookies yes, history no'] = [P.getBoolPref('privacy.sanitize.sanitizeOnShutdown'), P.getBoolPref('privacy.clearOnShutdown_v2.cookiesAndStorage'),
                                                       P.getBoolPref('privacy.clearOnShutdown_v2.historyFormDataAndDownloads')];
      P.clearUserPref('zenith.plus.cookie-keep'); await zth.sleep(200);
      out['until closing: back'] = P.prefHasUserValue('privacy.sanitize.sanitizeOnShutdown');
      C.setRule('example.org', 'block');
      out['rule'] = C.rules().get('example.org');
      C.setRule('example.org', '');
      zth.open(base + '/consent-generic'); await zth.sleep(1500);
      document.getElementById('zenith-cookies-command').doCommand(); await zth.sleep(1500);
      const d = gBrowser.selectedBrowser.contentDocument;
      out['page'] = [d.title, d.querySelectorAll('.choice').length, d.querySelector('#here .site .name')?.textContent];
      return out;""", z.base)

    if want("extension copies"):
        ext = Path(os.environ["TEMP"]) / "claude" / "zth-ext3"
        ext.mkdir(parents=True, exist_ok=True)
        (ext / "manifest.json").write_text(json.dumps({
            "manifest_version": 2, "name": "Zenith test extension", "version": "1.0",
            "browser_specific_settings": {"gecko": {"id": "zenith-test@example.com", "update_url": "https://example.com/updates.json"}},
            "browser_action": {"default_title": "Zenith test"}}), encoding="utf-8")
        xpi = Path(os.environ["TEMP"]) / "claude" / "zth-ext3.xpi"
        with zipfile.ZipFile(xpi, "w") as zf:
            zf.write(ext / "manifest.json", "manifest.json")
        z.js("Services.prefs.setBoolPref('zenith.plus.extension-copies', true); return 1")
        z.cmd("Addon:Install", {"path": str(xpi), "temporary": True})
    check(z, "extension copies", r"""
      const C = window.ZenithExtensionCopies, W = gZenWorkspaces, S = window.ZenithSpaceExtensions;
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      await zth.sleep(800);
      const id = await C.make('zenith-test@example.com'); await zth.sleep(1500);
      const copy = await AddonManager.getAddonByID(id);
      const manifest = JSON.parse(await IOUtils.readUTF8(PathUtils.join(C.dir(id), 'manifest.json')));
      const out = { 'copy: name, temporary': copy && [copy.name, copy.temporarilyInstalled], 'own ID, no updates': [manifest.browser_specific_settings.gecko.id === id, manifest.browser_specific_settings.gecko.update_url ?? null],
                    'original here, copy elsewhere': [S.runs['zenith-test@example.com']?.includes(W.activeWorkspace), S.runs[id]?.includes(W.activeWorkspace)] };
      await C.remove(id); await zth.sleep(500);
      out['removed'] = [!(await AddonManager.getAddonByID(id)), !(await IOUtils.exists(C.dir(id)))];
      S.setRuns('zenith-test@example.com', null);
      await (await AddonManager.getAddonByID('zenith-test@example.com'))?.uninstall();
      Services.prefs.clearUserPref('zenith.plus.extension-copies');
      return out;""")

    if want("settings"):
        z.js("""zth.open('about:preferences'); await zth.sleep(3000);
                gBrowser.selectedBrowser.contentWindow.gotoPref('paneZenith'); await zth.sleep(1500); return 1""")
    check(z, "settings", r"""
      const w = gBrowser.selectedBrowser.contentWindow, d = w.document, bar = d.querySelector('.zp-bar');
      const warn = d.querySelector('.zp-row[data-prop="zenith.plus.blend"] .zp-warn');
      const out = { 'bar: the page colour': bar.style.getPropertyValue('--zp-bar-bg') || null, "Blend's warning": warn?.textContent.slice(0, 40) ?? null,
                    'cookies section': !!d.querySelector('.zp-section[data-section="cookies"]') };
      gBrowser.removeTab(gBrowser.selectedTab);
      return out;""")

    res["css errors"] = z.console_errors()
print("css errors", json.dumps(res["css errors"], ensure_ascii=False))
