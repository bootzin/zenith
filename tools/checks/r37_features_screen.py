"""0.10.0 on a real screen with your own settings: real keys, right-clicks
and hovers.
- Alt+W opens the switcher; typing and Enter goes to the tab.
- Alt+Z: focus mode from the docked sidebar (compact on), Alt+Z again: back.
- A right-click on a page: the menu has a More submenu, with rare items.
- Hovering a tab: the hover card.
- Switching space: the dots and the flash.
- Push: the hidden sidebar slides out on hover and the page moves aside.
Captures go to %TEMP%/claude/r37 for a look. Only the test Zen is clicked
or typed into."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screen_kit import Screen

res = {}
with Screen("r37", mine=True) as s:
    z = s.z
    z.js("""zth.open(arguments[0] + '/page?n=2'); await zth.sleep(600);
            zth.open(arguments[0] + '/page?n=3'); await zth.sleep(600);
            zth.open(arguments[0] + '/page?n=4'); await zth.sleep(1200);
            if (gZenWorkspaces.getWorkspaces().length < 2) { await gZenWorkspaces.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
            window.focus(); return 1""", z.base)

    # The switcher, with real keys.
    s.keys("%w")
    time.sleep(0.6)
    res["Alt+W"] = z.js("return [window.ZenithSwitcher.open, document.activeElement?.id]")
    s.keys("test page 2")
    time.sleep(0.5)
    s.capture("switcher")
    s.keys("{ENTER}")
    time.sleep(0.8)
    res["typed and Enter"] = z.js("return [gBrowser.selectedTab.label, window.ZenithSwitcher.open]")

    # Focus mode from the docked sidebar.
    res["before Alt+Z"] = z.js("return document.documentElement.getAttribute('zen-compact-mode')")
    s.keys("%z")
    time.sleep(0.9)
    s.capture("focus")
    res["Alt+Z"] = z.js("return [document.documentElement.getAttribute('zenith-focus'), document.documentElement.getAttribute('zen-compact-mode')]")
    s.keys("%z")
    time.sleep(0.9)
    res["Alt+Z again"] = z.js("return [document.documentElement.getAttribute('zenith-focus'), document.documentElement.getAttribute('zen-compact-mode')]")

    # A right-click on the page.
    at = z.js("""const r = gBrowser.selectedBrowser.getBoundingClientRect();
                 return [Math.round(mozInnerScreenX + r.left + r.width * 0.6), Math.round(mozInnerScreenY + r.top + r.height * 0.6)]""")
    s.click(at[0], at[1], name="menu", right=True, after=700, box=(0, 0, 1366, 720))
    res["page menu"] = z.js("""const menu = document.getElementById('contentAreaContextMenu'); await zth.sleep(200);
      const more = menu.querySelector('.zenith-more');
      const shown = n => !n.hidden && getComputedStyle(n).display !== 'none';
      const out = { open: menu.state, more: more && shown(more), main: [...menu.children].filter(n => shown(n) && n.localName !== 'menuseparator').map(n => n.id || n.getAttribute('label')),
                    'in More': more ? [...more.menupopup.children].filter(n => shown(n) && n.localName !== 'menuseparator').map(n => n.id) : [] };
      menu.hidePopup(); await zth.sleep(300); return out;""")

    # A hover card, with a real hover.
    tab = z.js("""const t = gBrowser.visibleTabs.find(t => t.label === 'Test page 3'); const b = t.getBoundingClientRect();
                  return [Math.round(mozInnerScreenX + b.left + 30), Math.round(mozInnerScreenY + b.top + b.height / 2)]""")
    s.click(tab[0], tab[1], name="hover", hover=True, after=900, box=(0, 0, 700, 720))
    res["hover card"] = z.js("""const c = document.getElementById('zenith-hover-card');
      return [!c.hidden, c.querySelector('.zenith-hover-title').textContent, c.querySelector('.zenith-hover-site').textContent]""")
    s.click(900, 400, name="away", hover=True, after=300, box=(0, 0, 10, 10))

    # Switching space: dots and flash.
    home = z.js("""const here = gZenWorkspaces.activeWorkspace, other = gZenWorkspaces.getWorkspaces().find(w => w.uuid !== here);
            window.zthT0 = performance.now(); gZenWorkspaces.changeWorkspaceWithID(other.uuid);
            const d = document.getElementById('zenith-dots');
            while (!d.hasAttribute('show') && performance.now() - zthT0 < 2000) await zth.sleep(10);
            window.zthDotsAfter = Math.round(performance.now() - zthT0); return here""")
    time.sleep(0.15)
    s.capture("dots")
    res["dots"] = z.js("const d = document.getElementById('zenith-dots'); return [d.hasAttribute('show'), d.textContent, d.querySelectorAll('.zenith-dot').length, 'shown after ' + zthDotsAfter + 'ms']")
    z.js("await gZenWorkspaces.changeWorkspaceWithID(arguments[0]); await zth.sleep(800); return 1", home)

    # Push: compact mode, the pointer at the window's left edge.
    z.js("""zth.set('Zenith Tabs', 'zenith.tabs.reveal', 'push'); gZenCompactModeManager.preference = true; await zth.sleep(1200); return 1""")
    edge = z.js("return [Math.round(mozInnerScreenX + 2), Math.round(mozInnerScreenY + 360)]")  # the sidebar's visible strip
    s.click(edge[0], edge[1], name="push", hover=True, after=900, box=(0, 0, 1366, 720))
    res["push"] = z.js("""return [document.documentElement.style.getPropertyValue('--zth-sidebar-push'),
                                  getComputedStyle(document.getElementById('zen-tabbox-wrapper')).translate,
                                  gNavToolbox.hasAttribute('zen-has-hover')]""")
    s.click(900, 400, name="push-away", hover=True, after=1500, box=(0, 0, 1366, 720))
    res["push, pointer away"] = z.js("return getComputedStyle(document.getElementById('zen-tabbox-wrapper')).translate")
    z.js("zth.set('Zenith Tabs', 'zenith.tabs.reveal', ''); gZenCompactModeManager.preference = false; await zth.sleep(600); return 1")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
