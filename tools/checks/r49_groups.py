"""Folders that don't pin, on a real screen with your own settings: a tab
keeps the page it goes to (no "changed" mark), Ctrl+W closes it, and the
folder shows no pin mark while a normal folder does. (0.11.2 also checked
Firefox's tab groups with split views here; they were taken out in 0.12.1.)
Captures in %TEMP%/claude/r49."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screen_kit import Screen

STRIP = r"""
  window.zthStrip = () => {
    const box = gZenWorkspaces.activeWorkspaceStrip;
    const show = n => n.localName === 'tab' ? n.label.replace('Test page ', '') + (n.splitView ? '*' : '')
      : (n.localName === 'tab-group' || n.localName === 'zen-folder')
        ? `[${n.hasAttribute('split-view-group') ? 'split' : (n.label || n.localName)}: ${(n.querySelector(':scope > .tab-group-container') ? [...n.querySelector(':scope > .tab-group-container').children] : [...n.children]).filter(c => ['tab', 'tab-group', 'zen-folder'].includes(c.localName)).map(show).join(' ')}]`
      : '';
    return [...box.children].map(show).filter(Boolean).join(' ');
  };
  window.T = n => gBrowser.visibleTabs.find(t => t.label === 'Test page ' + n);
  return 1;"""

res = {}
with Screen("r49", mine=True) as s:
    z = s.z
    z.js(STRIP)
    step = lambda body: z.js(body + "\n; await zth.sleep(700); return zthStrip();")
    z.js("""const b = arguments[0]; for (const n of ['a', 'b', 'c', 'd', 'e']) { zth.open(b + '/page?n=' + n); await zth.sleep(350); } return 1""", z.base)

    res["folders that don't pin"] = z.js("""
      Services.prefs.clearUserPref('zenith.plus.unpinned-groups'); await zth.sleep(300);
      const W = gZenWorkspaces;
      for (const g of [...document.querySelectorAll('tab-group:not(zen-folder)')]) gBrowser.ungroupTabs?.(g) ?? g.ungroupTabs?.();
      await zth.sleep(300);
      const loose = gZenFolders.createFolder([T('a'), T('b')], { label: 'Loose', workspaceId: W.activeWorkspace });
      const pinned = gZenFolders.createFolder([T('c')], { label: 'Pinned', workspaceId: W.activeWorkspace });
      await zth.sleep(600);
      window.ZenithGroups.setUnpinned(loose, true); await zth.sleep(200);
      const mark = f => getComputedStyle(f.querySelector('.tab-group-folder-icon'), '::before').content !== 'none';
      const out = { 'marked unpinned': loose.hasAttribute('zenith-unpinned'), 'pin mark: loose, normal': [mark(loose), mark(pinned)] };
      // Go somewhere else in a tab of each.
      gBrowser.selectedTab = T('a'); await zth.sleep(200);
      T('a').linkedBrowser.loadURI(Services.io.newURI(arguments[0] + '/page?n=elsewhere-a'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      T('c').linkedBrowser.loadURI(Services.io.newURI(arguments[0] + '/page?n=elsewhere-c'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      await zth.sleep(1500);
      const a = gBrowser.visibleTabs.find(t => t.label === 'Test page elsewhere-a'), c = gBrowser.visibleTabs.find(t => t.label === 'Test page elsewhere-c');
      out['changed mark: loose, normal'] = [a?.hasAttribute('zen-pinned-changed'), c?.hasAttribute('zen-pinned-changed')];
      // Ctrl+W on each.
      const n = gBrowser.tabs.length;
      gBrowser.selectedTab = a; await zth.sleep(200); document.getElementById('cmd_close').doCommand(); await zth.sleep(600);
      out['Ctrl+W in the loose folder closes'] = gBrowser.tabs.length === n - 1 && !a.isConnected;
      gBrowser.selectedTab = c; await zth.sleep(200); document.getElementById('cmd_close').doCommand(); await zth.sleep(600);
      out['Ctrl+W in a normal folder (Zen: sleeps)'] = c.isConnected;
      // The folder menu has the choice.
      const menu = document.getElementById('zenFolderActions');
      Object.defineProperty(menu, 'triggerNode', { value: loose.querySelector('.tab-group-label'), configurable: true });
      menu.dispatchEvent(new Event('popupshowing'));
      const item = document.getElementById('zenith-folder-unpinned');
      out['menu item'] = [item?.getAttribute('label'), item?.hidden, item?.hasAttribute('checked')];
      delete menu.triggerNode;
      return out;""", z.base)
    s.capture("folders", 0, 0, 420, 720)
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
