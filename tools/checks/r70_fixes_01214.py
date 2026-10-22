"""0.12.15, inside Zen: New Tab Below on a split's tab (after the split, Zen's
address bar; the tab opened from it goes below; Escape opens nothing);
a tab joined into a split of 3 (four panes, none overlapping); a link from
another app while Zen runs, with a tab left with no page for it in the same
space (closed); back and forward in a Peek."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); return 1")
    say("new tab below", z.js(r"""
      const base = arguments[0], out = {};
      const t = ['a', 'b', 'c'].map(n => zth.open(base + '/page?n=nb' + n)); await zth.sleep(1500);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500); gBrowser.selectedTab = t[1]; await zth.sleep(500);
      const all = () => [...document.querySelectorAll('tab.tabbrowser-tab')];
      // A loose tab: right after it.
      const loose = zth.open(base + '/page?n=nbloose'), after = zth.open(base + '/page?n=nbafter'); await zth.sleep(1200);
      gBrowser.selectedTab = loose; await zth.sleep(300);
      gBrowser.addAdjacentNewTab(loose); await zth.sleep(800);
      gURLBar.value = base + '/page?n=below2'; gURLBar.handleCommand(new KeyboardEvent('keydown', { key: 'Enter' })); await zth.sleep(2000);
      const nt2 = all().find(x => (x.linkedBrowser?.currentURI?.spec ?? '').includes('n=below2'));
      out['loose tab: right after it'] = !!nt2 && gBrowser.tabs.indexOf(nt2) === gBrowser.tabs.indexOf(loose) + 1;
      out.dbg = [gBrowser.tabs.indexOf(loose), gBrowser.tabs.indexOf(after), gBrowser.tabs.indexOf(nt2), nt2?.pinned, loose.pinned, nt2?.group?.id ?? null, gBrowser.tabs.slice(-5).map(x => x.label.slice(-12))];
      // In a split, typed and Enter.
      gBrowser.addAdjacentNewTab(t[1]); await zth.sleep(800);
      out['address bar up'] = gURLBar.focused || !!gURLBar.view?.isOpen;
      gURLBar.value = base + '/page?n=below'; gURLBar.handleCommand(new KeyboardEvent('keydown', { key: 'Enter' })); await zth.sleep(2000);
      const nt = all().find(x => (x.linkedBrowser?.currentURI?.spec ?? '').endsWith('n=below'));
      const list = gBrowser.tabs, last = Math.max(...t.map(x => list.indexOf(x)));
      out['in a split'] = { opened: !!nt, 'not in the split': !!nt && nt.group !== t[0].group, 'right after the split': !!nt && list.indexOf(nt) === last + 1,
                            'split still 3': t[0].group?.tabs.length === 3, selected: !!nt?.selected,
                            dbg: [list.indexOf(nt), last, nt?.hasAttribute('zen-empty-tab'), gBrowser.selectedTab.label.slice(-10), list.map(x => (x.group ? 'g:' : '') + x.label.slice(-6)).slice(0, 8)] };
      if (nt) gBrowser.removeTab(nt);
      // Escape: nothing opens, nothing moves.
      gBrowser.selectedTab = t[1]; await zth.sleep(400);
      const n0 = all().filter(x => !x.hasAttribute('zen-empty-tab')).length;
      gBrowser.addAdjacentNewTab(t[1]); await zth.sleep(800);
      gURLBar.handleRevert?.(); gURLBar.view?.close?.(); gURLBar.blur(); gBrowser.selectedTab = t[1]; await zth.sleep(1500);
      out['escape: nothing opened'] = all().filter(x => !x.hasAttribute('zen-empty-tab')).length === n0;
      for (const x of [...t, loose, after, nt2]) if (x?.isConnected) gBrowser.removeTab(x);
      for (const x of [...document.querySelectorAll('tab.tabbrowser-tab')]) if (/n=below/.test(x.linkedBrowser?.currentURI?.spec ?? '')) gBrowser.removeTab(x);
      return out;""", z.base))

    if len(sys.argv) > 1: raise SystemExit
    say("join a split of 3", z.js(r"""
      const base = arguments[0];
      const t = ['a', 'b', 'c'].map(n => zth.open(base + '/page?n=j' + n)); await zth.sleep(1500);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500); gBrowser.selectedTab = t[0]; await zth.sleep(500);
      const loose = zth.open(base + '/page?n=jloose'); await zth.sleep(1000); gBrowser.selectedTab = t[0]; await zth.sleep(500);
      window.ZenithSplitReorder.apply({ kind: 'join', tab: loose, target: t[0] }); await zth.sleep(1500);
      const g = t[0].group, P = gBrowser.tabpanels.getBoundingClientRect();
      const rects = (g?.tabs ?? []).map(x => x.linkedBrowser.closest('.browserSidebarContainer').getBoundingClientRect());
      const overlap = rects.some((a, i) => rects.some((b, j) => j > i && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 20 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 20));
      const out = { size: g?.tabs.length, overlap, sizes: rects.map(r => [Math.round(r.width), Math.round(r.height)]) };
      for (const x of [...t, loose]) if (x.isConnected) gBrowser.removeTab(x);
      return out;""", z.base))

    say("link while Zen runs, dead tab in the same space", z.js(r"""
      const url = arguments[0] + '/page?n=zenith-tidy-test';
      const dead = gBrowser.addTrustedTab('about:blank', { inBackground: true }); await zth.sleep(800);
      dead.setAttribute('label', url.replace(/^https?:\/\//, ''));
      window.browserDOMWindow.openURI(Services.io.newURI(url), null, Ci.nsIBrowserDOMWindow.OPEN_NEWTAB, Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL,
                                      Services.scriptSecurityManager.getSystemPrincipal());
      await zth.sleep(4500);
      const live = [...document.querySelectorAll('tab.tabbrowser-tab')].filter(t => (t.linkedBrowser?.currentURI?.spec ?? '') === url);
      const out = { 'dead one closed': !dead.isConnected, 'the link open': live.length };
      for (const t of live) gBrowser.removeTab(t);
      if (dead.isConnected) gBrowser.removeTab(dead);
      return out;""", z.base))

    say("peek back and forward", z.js(r"""
      const base = arguments[0], here = gBrowser.selectedBrowser.currentURI.spec;
      await window.ZenithPeek.open(base + '/page?n=pk1'); await zth.sleep(2000);
      const d = gZenGlanceManager.detachedBrowser;
      if (!d) return 'no peek';
      d.loadURI(Services.io.newURI(base + '/page?n=pk2'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await zth.sleep(1500);
      BrowserCommands.back(); await zth.sleep(1500);
      const back = d.currentURI.spec.includes('n=pk1');
      BrowserCommands.forward(); await zth.sleep(1500);
      const out = { back, forward: d.currentURI.spec.includes('n=pk2'), 'tab behind unchanged': gBrowser.selectedBrowser.currentURI.spec === here };
      await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true });
      return out;""", z.base))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
