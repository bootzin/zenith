"""Fixes from the 0.10.0 walkthrough, checked inside Zen:
- the switcher finds tabs in other spaces (and only this space's with the
  setting), with short, readable places under each name;
- the workspace flash takes the colour Zen paints for the new space;
- Zenith's own hover cards are gone (Firefox's preview stays);
- menu icons, even with compact menus;
- see-through pages: no darker header;
- Ctrl+Tab in recently-used order;
- the bookmarks bar in its own strip, and back."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
with Scene() as z:
    res["switcher"] = z.js("""
      const W = gZenWorkspaces, here = W.activeWorkspace, S = window.ZenithSwitcher, out = {};
      zth.open(arguments[0] + '/page?n=2'); await zth.sleep(600);
      zth.open('about:config'); await zth.sleep(600);
      const work = await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500);
      const workId = W.getWorkspaces().find(w => w.name === 'Work').uuid;
      await W.changeWorkspaceWithID(workId); await zth.sleep(800);
      zth.open(arguments[0] + '/page?n=elsewhere&q=' + 'x'.repeat(200)); await zth.sleep(900);
      await W.changeWorkspaceWithID(here); await zth.sleep(800);
      S.show('elsewhere'); await zth.sleep(100);
      out['a tab in Work, from here'] = S.items.slice(0, 2).map(i => [i.title, i.sub, i.space]);
      S.show('config'); out['about:config reads as'] = S.items.filter(i => i.kind === 'tab').map(i => [i.title, i.sub]).slice(0, 1);
      S.show('elsewhere'); S.onKey({ key: 'Enter', preventDefault() {} }); await zth.sleep(1200);
      out['Enter: went to Work and the tab'] = [W.activeWorkspace === workId, gBrowser.selectedTab.label];
      await W.changeWorkspaceWithID(here); await zth.sleep(800);
      Services.prefs.setStringPref('zenith.plus.switcher-scope', 'here');
      S.show('elsewhere'); out['this space only'] = S.items.filter(i => i.kind === 'tab').length;
      Services.prefs.clearUserPref('zenith.plus.switcher-scope'); S.hide();
      window.zthWork = workId;
      return out;""", z.base)

    res["flash colour"] = z.js("""
      const W = gZenWorkspaces, ws = W.getWorkspaceFromId(zthWork), here = W.activeWorkspace;
      // Give Work a pink theme, as the theme picker would.
      ws.theme = { type: 'gradient', gradientColors: [{ c: [214, 51, 132], isPrimary: true, isCustom: false, algorithm: 'floating', lightness: 50, position: { x: 50, y: 50 }, type: 'explicit-lightness' }], opacity: 0.8, texture: 0 };
      await W.saveWorkspace(ws); await zth.sleep(300);
      const flash = document.getElementById('zenith-space-flash');
      await W.changeWorkspaceWithID(zthWork); await zth.sleep(900);
      const out = { painted: document.getElementById('zen-browser-background').style.getPropertyValue('--zen-main-browser-background').slice(0, 90),
                    flash: flash.style.getPropertyValue('--zth-flash'), played: flash.hasAttribute('go') };
      await W.changeWorkspaceWithID(here); await zth.sleep(900);
      out['back home'] = flash.style.getPropertyValue('--zth-flash') || 'accent (no colour)';
      return out;""")

    res["hover cards gone"] = z.js("return !document.getElementById('zenith-hover-card') && !!document.getElementById('tab-preview-panel')")

    res["menu icons"] = z.js("""
      zth.set('Zenith Panels', 'zenith.panels.compact-menus', 'on');
      zth.set('Zenith Panels', 'zenith.panels.menu-icons', 'on');
      const menu = document.getElementById('tabContextMenu'), tab = gBrowser.selectedTab;
      TabContextMenu.contextTab = tab;
      const shown = new Promise(r => menu.addEventListener('popupshown', r, { once: true }));
      menu.openPopup(tab, 'after_start', 0, 0, true, false); await shown; await zth.sleep(200);
      const icon = id => { const n = document.getElementById(id), i = n?.querySelector(':scope > .menu-icon'); if (!i) return 'no icon element'; const cs = getComputedStyle(i); return [cs.display, cs.visibility, cs.content.split('/').pop()]; };
      const out = { reload: icon('context_reloadTab'), close: icon('context_closeTab'), more: icon('tabContextMenu-zenith-more'), 'select all (none)': icon('context_selectAllTabs') };
      const hidden = new Promise(r => menu.addEventListener('popuphidden', r, { once: true })); menu.hidePopup(); await hidden;
      zth.set('Zenith Panels', 'zenith.panels.menu-icons', ''); zth.set('Zenith Panels', 'zenith.panels.compact-menus', '');
      return out;""")

    res["see-through header"] = z.js("""
      Services.prefs.setBoolPref('zenith.plus.see-through-pages', true);
      const t = zth.open('about:preferences'); await zth.sleep(2000);
      const d = t.linkedBrowser.contentDocument, sc = d.getElementById('search-container'), cs = d.defaultView.getComputedStyle(sc);
      const out = [cs.backgroundColor, cs.backdropFilter];
      Services.prefs.clearUserPref('zenith.plus.see-through-pages'); gBrowser.removeTab(t);
      return out;""")

    res["ctrl+tab"] = z.js("""
      Services.prefs.setStringPref('zenith.plus.ctrl-tab', 'recent'); await zth.sleep(100);
      const out = { recent: [Services.prefs.getBoolPref('browser.ctrlTab.sortByRecentlyUsed'), !!ctrlTab.recentlyUsedTabs?.length || ctrlTab._recentlyUsedTabs?.length] };
      Services.prefs.setStringPref('zenith.plus.ctrl-tab', 'order'); await zth.sleep(100);
      out['in order (yours back)'] = [Services.prefs.getBoolPref('browser.ctrlTab.sortByRecentlyUsed'), Services.prefs.prefHasUserValue('browser.ctrlTab.sortByRecentlyUsed')];
      Services.prefs.clearUserPref('zenith.plus.ctrl-tab');
      return out;""")

    res["bookmarks bar"] = z.js("""
      const bar = document.getElementById('PersonalToolbar'), where = () => [bar.parentNode.id, bar.nextElementSibling?.id ?? '', document.documentElement.getAttribute('zenith-bookmarks')];
      setToolbarVisibility(bar, true); await zth.sleep(500);
      const out = { 'above (default)': where(), height: Math.round(bar.getBoundingClientRect().height) };
      Services.prefs.setStringPref('zenith.plus.bookmarks-bar', 'hover'); await zth.sleep(400);
      out.hover = [...where(), getComputedStyle(bar).position, getComputedStyle(bar).opacity];
      Services.prefs.setStringPref('zenith.plus.bookmarks-bar', 'zen'); await zth.sleep(200);
      out["Zen's own"] = where();
      Services.prefs.clearUserPref('zenith.plus.bookmarks-bar'); await zth.sleep(200);
      out['back to above'] = where();
      setToolbarVisibility(bar, false);
      return out;""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
