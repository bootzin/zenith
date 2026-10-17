"""After 0.10.0, on a real screen with your own settings: captures of each
new piece for a look (in %TEMP%/claude/r42), and a few numbers:
- the switcher's two-line rows, with a very long address among them;
- the tab manager;
- the "where should this link open?" card;
- the bookmarks bar as its own strip above the page, and on hover;
- Ctrl+Tab in recently-used order, held down like Alt+Tab;
- the workspace flash in a pink space (paused at its brightest);
- menu icons on a right-click;
- see-through Settings: the header measures the same as the page below it.
Only the test Zen is clicked or typed into."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screen_kit import Screen, ps

res = {}
with Screen("r42", mine=True) as s:
    z = s.z
    z.js("""const b = arguments[0];
      for (const u of ['/page?n=2', '/page?n=2', '/page?n=3', '/long', '/page?n=very-long&q=' + 'x'.repeat(300)]) { zth.open(b + u); await zth.sleep(500); }
      const W = gZenWorkspaces;
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'Test page 3'); await zth.sleep(500);
      window.focus(); return 1""", z.base)

    s.keys("%w")
    time.sleep(0.5)
    s.keys("test")
    time.sleep(0.5)
    s.capture("switcher")
    s.keys("{ESC}")

    z.js("window.ZenithTabs.show(); await zth.sleep(500); return 1")
    s.capture("tab-manager")
    z.js("window.ZenithTabs.hide(); return 1")

    z.js("""Services.prefs.setStringPref('zenith.plus.external-links', 'ask');
      window.browserDOMWindow.openURI(Services.io.newURI('https://example.com/login?next=/inbox'), null, Ci.nsIBrowserDOMWindow.OPEN_NEWTAB,
                                      Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL, Services.scriptSecurityManager.getSystemPrincipal());
      await zth.sleep(500); return 1""")
    s.capture("link-card")
    z.js("""document.getElementById('zenith-linkask')?.remove(); window.ZenithLinks.pending = null;
            Services.prefs.clearUserPref('zenith.plus.external-links'); return 1""")

    res["bookmarks"] = z.js("""
      const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
      for (const [title, url] of [['GitHub', 'https://github.com/'], ['Zen', 'https://zen-browser.app/'], ['Mail', 'https://mail.google.com/']])
        await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.toolbarGuid, title, url });
      setToolbarVisibility(document.getElementById('PersonalToolbar'), true); await zth.sleep(1200);
      const r = document.getElementById('PersonalToolbar').getBoundingClientRect(), p = document.getElementById('zen-tabbox-wrapper').getBoundingClientRect();
      return { bar: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], 'page starts at': Math.round(p.y) };""")
    s.capture("bookmarks-above", 0, 0, 1366, 140)
    z.js("Services.prefs.setStringPref('zenith.plus.bookmarks-bar', 'hover'); await zth.sleep(600); return 1")
    top = z.js("const p = document.getElementById('zen-tabbox-wrapper').getBoundingClientRect(); return [Math.round(mozInnerScreenX + p.x + 400), Math.round(mozInnerScreenY + p.y + 10)]")
    s.click(top[0], top[1], name="bookmarks-hover", hover=True, after=700, box=(0, 0, 1366, 140))
    z.js("Services.prefs.clearUserPref('zenith.plus.bookmarks-bar'); setToolbarVisibility(document.getElementById('PersonalToolbar'), false); return 1")
    s.click(900, 500, name="away", hover=True, after=200, box=(0, 0, 10, 10))

    z.js("Services.prefs.setStringPref('zenith.plus.ctrl-tab', 'recent'); await zth.sleep(300); return 1")
    s.front()
    ps("ctrltab.ps1", "-ZenPid", str(s.pid), "-Presses", "2", "-HoldMs", "900", "-Out", str(s.shots / "ctrl-tab.png"))
    time.sleep(0.6)
    res["ctrl+tab landed on"] = z.js("return gBrowser.selectedTab.label")
    z.js("Services.prefs.clearUserPref('zenith.plus.ctrl-tab'); return 1")

    z.js("""const W = gZenWorkspaces, ws = W.getWorkspaces().find(w => w.uuid !== W.activeWorkspace);
      ws.theme = { type: 'gradient', gradientColors: [{ c: [214, 51, 132], isPrimary: true, isCustom: false, algorithm: 'floating', lightness: 50, type: 'explicit-lightness' }], opacity: 0.6, texture: 0 };
      await W.saveWorkspace(ws); window.zthHome = W.activeWorkspace;
      W.changeWorkspaceWithID(ws.uuid);
      const f = document.getElementById('zenith-space-flash');
      while (!f.hasAttribute('go')) await zth.sleep(10);
      await zth.sleep(380); f.style.animationPlayState = 'paused'; return 1""")
    s.capture("flash", 0, 0, 1366, 140)
    z.js("const f = document.getElementById('zenith-space-flash'); f.style.animationPlayState = ''; await gZenWorkspaces.changeWorkspaceWithID(zthHome); await zth.sleep(800); return 1")

    z.js("zth.set('Zenith Panels', 'zenith.panels.menu-icons', 'on'); await zth.sleep(200); return 1")
    at = z.js("""const r = gBrowser.selectedBrowser.getBoundingClientRect();
                 return [Math.round(mozInnerScreenX + r.left + r.width * 0.5), Math.round(mozInnerScreenY + r.top + 120)]""")
    s.click(at[0], at[1], name="menu-icons", right=True, after=700, box=(0, 0, 1366, 720))
    z.js("document.getElementById('contentAreaContextMenu').hidePopup(); zth.set('Zenith Panels', 'zenith.panels.menu-icons', ''); return 1")

    z.js("Services.prefs.setBoolPref('zenith.plus.see-through-pages', true); zth.open('about:preferences'); await zth.sleep(2500); return 1")
    shot = s.capture("see-through")
    z.js("gBrowser.selectedBrowser.style.visibility = 'hidden'; await zth.sleep(500); return 1")
    glass = s.capture("see-through-glass")
    z.js("gBrowser.selectedBrowser.style.visibility = ''; return 1")
    # The same two places with the page hidden: what the glass itself is there.
    res["see-through: header, page below (page)"] = [s.stats(shot, 1240, 20, 110, 60), s.stats(shot, 1240, 300, 110, 200)]
    res["see-through: header, page below (glass only)"] = [s.stats(glass, 1240, 20, 110, 60), s.stats(glass, 1240, 300, 110, 200)]
    z.js("Services.prefs.clearUserPref('zenith.plus.see-through-pages'); return 1")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
