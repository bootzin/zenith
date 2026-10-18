"""Fixes from the 0.11.0 walkthrough, checked inside Zen:
- the switcher shows a page's SVG icon (moz-remote-image://) as a picture,
  never as text;
- a space in a container flashes (and dots) in the container's colour;
- Zen's Space routing dialog offers "Ask me each time" for a rule and for
  the default, a rule that asks brings up the card, and the default follows
  Zenith's setting;
- Ctrl+Tab "In order, with pictures": Firefox's row of pictures, in the
  sidebar's order from this tab;
- the pin mark on a pinned tab (not on an essential);
- groups for unpinned tabs: Firefox's groups on (and off again), the tabs
  stay unpinned, drawn without the coloured chip;
- the live settings panel keeps the line beside dependent settings clear
  of their words."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
with Scene() as z:
    res["switcher icon"] = z.js("""
      zth.open(arguments[0] + '/svgicon'); await zth.sleep(1500);
      const tab = gBrowser.selectedTab, S = window.ZenithSwitcher;
      zth.open(arguments[0] + '/page?n=2'); await zth.sleep(600);
      S.show('icon page'); await zth.sleep(600);
      const row = [...document.querySelectorAll('.zenith-switch-row')].find(r => r.textContent.includes('Icon page'));
      const icon = row?.querySelector('.zenith-switch-icon'), img = icon?.querySelector('img');
      const out = { 'tab image': (tab.getAttribute('image') || '').slice(0, 30), 'text in the icon': icon?.textContent ?? null,
                    picture: img ? [img.complete, img.naturalWidth > 0] : 'no picture' };
      S.hide();
      return out;""", z.base)

    res["container colour"] = z.js("""
      const W = gZenWorkspaces, here = W.activeWorkspace;
      const id = ContextualIdentityService.create('Zenith test', 'fingerprint', 'green').userContextId;
      await W.createAndSaveWorkspace('Green', undefined, true); await zth.sleep(500);
      const ws = W.getWorkspaces().find(w => w.name === 'Green');
      ws.containerTabId = id;
      ws.theme = { type: 'gradient', gradientColors: [{ c: [214, 51, 132], isPrimary: true, isCustom: false, algorithm: 'floating', lightness: 50, position: { x: 50, y: 50 }, type: 'explicit-lightness' }], opacity: 0.8, texture: 0 };
      await W.saveWorkspace(ws); await zth.sleep(300);
      const flash = document.getElementById('zenith-space-flash');
      await W.changeWorkspaceWithID(ws.uuid); await zth.sleep(900);
      const dot = document.querySelector('#zenith-dots .zenith-dot[active]');
      const out = { flash: flash.style.getPropertyValue('--zth-flash'), dot: dot?.style.getPropertyValue('--zth-dot'),
                    'Firefox green': getComputedStyle(Object.assign(document.createElement('span'), { className: 'identity-color-green' })).getPropertyValue('--identity-tab-color') };
      await W.changeWorkspaceWithID(here); await zth.sleep(900);
      window.zthHome = here; window.zthGreen = ws.uuid;
      return out;""")

    res["routing dialog"] = z.js("""
      const R = gZenSpaceRoutingManager;
      for (const r of R.getAllRoutes()) R.removeRoute(r.id);
      const route = R.createNewRoute(); route.reference = '127.0.0.1'; R.updateRoute(route); R.saveRoutes();
      R.openSpaceRoutingDialog(window);
      let doc = null;
      for (let i = 0; i < 50 && !doc; i++) {
        await zth.sleep(100);
        const f = document.querySelector('#window-modal-dialog .dialogFrame, .dialogFrame');
        const d = f?.contentDocument;
        if (d?.querySelector('.open-in-select menuitem.zenith-route-ask')) doc = d;
      }
      if (!doc) return 'no dialog with our item';
      await zth.sleep(300);
      const ruleList = doc.querySelector('.open-in-select'), def = doc.getElementById('sr-default-external-open-in');
      const out = { 'rule list': [...ruleList.querySelectorAll('menuitem')].map(m => m.getAttribute('label')),
                    'default list has it': !!def.querySelector('menuitem.zenith-route-ask') };
      // Choose "Ask me each time" for the rule, as a click would.
      ruleList.value = 'zenith-ask'; ruleList.dispatchEvent(new Event('command', { bubbles: true }));
      def.value = 'zenith-ask'; def.dispatchEvent(new Event('command', { bubbles: true }));
      out['rule now'] = R.getAllRoutes()[0].openIn;
      out['default now'] = R.getDefaultExternalRoute();
      out['Zenith setting follows'] = Services.prefs.getStringPref('zenith.plus.external-links', '');
      doc.getElementById('sr-close').click(); await zth.sleep(500);
      // A link from another app that the rule matches: the card.
      window.browserDOMWindow.openURI(Services.io.newURI(arguments[0] + '/page?n=asked'), null, Ci.nsIBrowserDOMWindow.OPEN_NEWTAB,
                                      Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL, Services.scriptSecurityManager.getSystemPrincipal());
      await zth.sleep(400);
      out['rule asks'] = !!document.getElementById('zenith-linkask');
      const L = window.ZenithLinks; L.pending.tick.checked = true;
      await L.pending.choose(L.pending.spaces.find(s => s.uuid === zthGreen)); await zth.sleep(1200);
      out['always there: new rule first'] = R.getAllRoutes().map(r => [r.reference, r.openIn === zthGreen ? 'Green' : r.openIn]);
      await gZenWorkspaces.changeWorkspaceWithID(zthHome); await zth.sleep(800);
      Services.prefs.clearUserPref('zenith.plus.external-links'); await zth.sleep(100);
      out['setting off: default back'] = R.getDefaultExternalRoute();
      for (const r of R.getAllRoutes()) R.removeRoute(r.id); R.saveRoutes();
      return out;""", z.base)

    res["ctrl+tab in order with pictures"] = z.js("""
      for (const n of [3, 4, 5]) { zth.open(arguments[0] + '/page?n=' + n); await zth.sleep(400); }
      const tabs = gBrowser.visibleTabs.filter(t => !t.hasAttribute('zen-empty-tab'));
      gBrowser.selectedTab = tabs[1]; await zth.sleep(300);
      Services.prefs.setStringPref('zenith.plus.ctrl-tab', 'pictures'); await zth.sleep(200);
      const out = { 'Firefox pref': Services.prefs.getBoolPref('browser.ctrlTab.sortByRecentlyUsed'),
                    order: ctrlTab.tabList.map(t => t.label), sidebar: tabs.map(t => t.label) };
      Services.prefs.setStringPref('zenith.plus.ctrl-tab', 'recent'); await zth.sleep(200);
      out['recent: first'] = ctrlTab.tabList[0]?.label;
      Services.prefs.clearUserPref('zenith.plus.ctrl-tab'); await zth.sleep(200);
      out['off: yours back'] = [Services.prefs.getBoolPref('browser.ctrlTab.sortByRecentlyUsed'), Services.prefs.prefHasUserValue('browser.ctrlTab.sortByRecentlyUsed')];
      return out;""", z.base)
    res["pin mark"] = z.js("""
      const tabs = gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-empty-tab'));
      gBrowser.pinTab(tabs[0]); gZenPinnedTabManager?.addToEssentials?.(tabs[1]); await zth.sleep(600);
      const mark = t => { const cs = getComputedStyle(t.querySelector('.tab-icon-stack'), '::before');
                          return cs.content === 'none' || cs.maskImage === 'none' ? '' : `pin in ${cs.backgroundColor}`; };
      return { pinned: mark(tabs[0]), essential: tabs[1].hasAttribute('zen-essential') ? mark(tabs[1]) || 'none' : 'not an essential', plain: mark(tabs[2]) || 'none' };""")

    res["groups for unpinned tabs"] = z.js("""
      Services.prefs.clearUserPref('browser.tabs.groups.enabled'); // (a probe may have left it on)
      const out = { 'Zen value': Services.prefs.getBoolPref('browser.tabs.groups.enabled') };
      Services.prefs.setStringPref('zenith.plus.loose-groups', 'on'); await zth.sleep(200);
      out.on = Services.prefs.getBoolPref('browser.tabs.groups.enabled');
      const tabs = gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-empty-tab')).slice(0, 2);
      const g = gBrowser.addTabGroup(tabs, { label: 'Reading', color: 'purple', insertBefore: tabs[0] }); await zth.sleep(600);
      const label = g.querySelector('.tab-group-label');
      out.group = { pinned: tabs.map(t => t.pinned), 'label background': getComputedStyle(label).backgroundColor,
                    'colour square': getComputedStyle(g.querySelector('.tab-group-label-container'), '::before').backgroundColor };
      const menu = document.getElementById('tabContextMenu'); TabContextMenu.contextTab = tabs[0];
      const shown = new Promise(r => menu.addEventListener('popupshown', r, { once: true }));
      menu.openPopup(tabs[0], 'after_start', 0, 0, true, false); await shown; await zth.sleep(150);
      out['menu: add to a group'] = ['context_moveTabToNewGroup', 'context_moveTabToGroup'].filter(id => !document.getElementById(id).hidden);
      menu.hidePopup();
      gBrowser.ungroupTabs?.(g) ?? g.ungroupTabs?.(); await zth.sleep(300);
      Services.prefs.clearUserPref('zenith.plus.loose-groups'); await zth.sleep(200);
      out.off = [Services.prefs.getBoolPref('browser.tabs.groups.enabled'), Services.prefs.prefHasUserValue('browser.tabs.groups.enabled')];
      return out;""")

    res["live panel: line beside dependent settings"] = z.js("""
      window.ZenithLive.toggle(); await zth.sleep(900);
      const live = document.getElementById('zenith-live');
      const row = live?.querySelector('.zp-row[child]');
      if (!row) return 'no dependent row';
      const line = getComputedStyle(row, '::before'), text = row.querySelector('.zp-text').getBoundingClientRect(), box = row.getBoundingClientRect();
      const out = { 'padding': getComputedStyle(row).paddingInlineStart, 'line ends at': parseFloat(line.insetInlineStart) + parseFloat(line.width), 'words start at': Math.round(text.left - box.left) };
      window.ZenithLive.toggle();
      return out;""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
