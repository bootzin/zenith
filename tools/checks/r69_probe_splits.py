"""Probe: New Tab Below (gBrowser.addAdjacentNewTab) on a split's tab, keys
on Alt+T, and a tab joined into a split of 3 (Zenith's drag)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

with Scene(headless=False) as z:
    print(json.dumps(z.js(r"""
      const base = arguments[0], out = {}, errs = () => Services.console.getMessageArray().map(m => m.message || String(m)).filter(m => /error|Error/.test(m)).slice(-3);
      out.altT = [...document.querySelectorAll('key')].filter(k => /^t$/i.test(k.getAttribute('key') || '') && /alt/.test(k.getAttribute('modifiers') || '')).map(k => [k.id, k.getAttribute('modifiers'), k.getAttribute('command')]);
      out.adjacent = String(gBrowser.addAdjacentNewTab).slice(0, 700);
      out.newTabURL = window.BROWSER_NEW_TAB_URL;
      const t = ['a', 'b', 'c'].map(n => zth.open(base + '/page?n=sp' + n)); await zth.sleep(1500);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500); gBrowser.selectedTab = t[1]; await zth.sleep(500);
      const n0 = gBrowser.tabs.length;
      let nt = null, err = null;
      try { nt = gBrowser.addAdjacentNewTab(t[1]); } catch (e) { err = String(e); }
      await zth.sleep(1500);
      out['below, in a split'] = { err, made: !!nt, tabs: gBrowser.tabs.length - n0, group: nt?.group === t[1].group, inSplit: !!nt?.group?.hasAttribute?.('split-view-group'),
                                   selected: nt?.selected, url: nt?.linkedBrowser?.currentURI?.spec, splitSize: t[1].group?.tabs.length, errs: errs() };
      if (nt?.isConnected) gBrowser.removeTab(nt);
      const loose = zth.open(base + '/page?n=sploose'); await zth.sleep(1000);
      window.ZenithSplitReorder.apply({ kind: 'join', tab: loose, target: t[0] }); await zth.sleep(1500);
      const g = t[0].group, P = gBrowser.tabpanels.getBoundingClientRect();
      const rects = (g?.tabs ?? []).map(x => { const r = x.linkedBrowser.closest('.browserSidebarContainer').getBoundingClientRect(); return [Math.round(r.left - P.left), Math.round(r.top - P.top), Math.round(r.width), Math.round(r.height)]; });
      const data = gZenViewSplitter._data.find(d => d.tabs.includes(t[0]));
      out['join a split of 3'] = { size: g?.tabs.length, gridType: data?.gridType, rects, panel: [Math.round(P.width), Math.round(P.height)], errs: errs() };
      for (const x of [...t, loose]) if (x.isConnected) gBrowser.removeTab(x);
      return out;""", z.base), indent=1))
