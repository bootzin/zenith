"""After 0.11.0, on a real screen with your own settings: captures (in
%TEMP%/claude/r46) of
- the switcher with a page whose icon is an SVG (moz-remote-image://);
- the bookmarks panel: over the page (list), tiles, docked right, left;
- Firefox's tree, restyled; the bookmarks section in Zen's Library; the
  Library window;
- the tab preview card (Zenith's);
- a pinned tab's pin mark, and a group of unpinned tabs;
- Ctrl+Tab "in order, with pictures";
- Zen's Space routing dialog with "Ask me each time".
Only the test Zen is clicked or typed into."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screen_kit import Screen, ps

res = {}
with Screen("r46", mine=True, extra={"browser.tabs.hoverPreview.enabled": True}) as s:
    z = s.z
    z.js("""const b = arguments[0], P = PlacesUtils, B = P.bookmarks;
      await B.eraseEverything();
      for (const p of ['zenith.internal.bookmarks.space-folders', 'zenith.internal.bookmarks.space-folders.root', 'zenith.internal.bookmarks.open-folders'])
        Services.prefs.clearUserPref(p);
      for (const [title, url] of [['GitHub', 'https://github.com/'], ['Zen Browser', 'https://zen-browser.app/'], ['Mail', 'https://mail.google.com/'], ['Calendar', 'https://calendar.google.com/']])
        await B.insert({ parentGuid: B.toolbarGuid, title, url });
      const reading = await B.insert({ parentGuid: B.toolbarGuid, title: 'Reading', type: B.TYPE_FOLDER });
      for (const [title, url] of [['MDN Web Docs', 'https://developer.mozilla.org/'], ['Wikipedia', 'https://wikipedia.org/']])
        await B.insert({ parentGuid: reading.guid, title, url });
      await B.insert({ parentGuid: B.unfiledGuid, title: 'Recipes', url: 'https://example.org/recipes' });
      Services.prefs.setStringPref('zenith.internal.bookmarks.open-folders', JSON.stringify([reading.guid]));
      for (const u of ['/svgicon', '/page?n=2', '/page?n=3', '/long', '/page?n=4']) { zth.open(b + u); await zth.sleep(500); }
      const W = gZenWorkspaces;
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'Test page 3'); await zth.sleep(400);
      window.focus(); return 1""", z.base)

    s.keys("%w")
    time.sleep(0.4)
    s.keys("icon")
    time.sleep(0.6)
    s.capture("switcher", 300, 0, 800, 300)
    s.keys("{ESC}")

    def bm(name, look="", where=""):
        z.js(f"""Services.prefs.setStringPref('zenith.plus.bookmarks-look', '{look}'); Services.prefs.setStringPref('zenith.plus.bookmarks-place', '{where}');
                 if (window.ZenithBookmarks.Panel.open) window.ZenithBookmarks.Panel.hide();
                 SidebarController.toggle('viewBookmarksSidebar'); await zth.sleep(900); return 1""")
        s.capture(name)
        z.js("window.ZenithBookmarks.Panel.hide(); SidebarController.hide?.(); await zth.sleep(300); return 1")

    bm("bm-float-list")
    bm("bm-float-tiles", "tiles")
    bm("bm-right", "", "right")
    bm("bm-left", "", "left")
    bm("bm-firefox-tree", "firefox", "float")
    z.js("Services.prefs.clearUserPref('zenith.plus.bookmarks-look'); Services.prefs.clearUserPref('zenith.plus.bookmarks-place'); return 1")

    z.js("customElements.get('zen-library').toggle('zenith-bookmarks'); await zth.sleep(1500); return 1")
    s.capture("zen-library")
    z.js("customElements.get('zen-library').close?.(); await zth.sleep(800); return 1")

    z.js("PlacesCommandHook.showPlacesOrganizer('BookmarksToolbar'); await zth.sleep(2000); const w = Services.wm.getMostRecentWindow('Places:Organizer'); w.moveTo(60, 60); w.resizeTo(900, 560); await zth.sleep(500); w.focus(); return 1")
    time.sleep(0.5)
    ps("capture.ps1", "-Out", str(s.shots / "library-window.png"), "-X", "40", "-Y", "40", "-W", "940", "-H", "600")
    res["library window colours"] = z.js("""const w = Services.wm.getMostRecentWindow('Places:Organizer');
      const out = { accent: w.document.documentElement.style.getPropertyValue('--zth-accent').slice(0, 40), bg: w.getComputedStyle(w.document.documentElement).backgroundColor };
      w.close(); await zth.sleep(400); window.focus(); return out""")

    # A pinned tab with its mark, and a group of unpinned tabs.
    z.js("""const tabs = gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-empty-tab'));
      gBrowser.pinTab(tabs.find(t => t.label === 'Test page 2')); await zth.sleep(400);
      Services.prefs.setStringPref('zenith.plus.loose-groups', 'on'); await zth.sleep(200);
      const loose = gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-empty-tab')).slice(0, 2);
      gBrowser.addTabGroup(loose, { label: 'Reading list', color: 'purple', insertBefore: loose[0] }); await zth.sleep(700);
      window.focus(); return 1""")
    s.capture("sidebar-pin-group", 0, 0, 420, 720)

    # The tab preview card.
    at = z.js("""const t = gBrowser.visibleTabs.find(t => t.label === 'Long page'); const r = t.getBoundingClientRect();
                 return [Math.round(mozInnerScreenX + r.left + r.width / 2), Math.round(mozInnerScreenY + r.top + r.height / 2)]""")
    s.click(900, 500, name="away", hover=True, after=200, box=(0, 0, 10, 10))
    s.click(at[0], at[1], name="preview", hover=True, after=1600, box=(0, 0, 720, 460))
    s.click(900, 500, name="away2", hover=True, after=200, box=(0, 0, 10, 10))

    # Ctrl+Tab in order, with pictures.
    z.js("Services.prefs.setStringPref('zenith.plus.ctrl-tab', 'pictures'); gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'Test page 3'); await zth.sleep(300); window.focus(); return 1")
    s.front()
    ps("ctrltab.ps1", "-ZenPid", str(s.pid), "-Presses", "1", "-HoldMs", "900", "-Out", str(s.shots / "ctrl-tab-order.png"))
    time.sleep(0.6)
    res["ctrl+tab from Test page 3 landed on"] = z.js("return [gBrowser.selectedTab.label, gBrowser.visibleTabs.map(t => t.label)]")
    z.js("Services.prefs.clearUserPref('zenith.plus.ctrl-tab'); return 1")

    # Zen's Space routing dialog, with a rule set to ask.
    z.js("""const R = gZenSpaceRoutingManager; for (const r of R.getAllRoutes()) R.removeRoute(r.id);
      const r = R.createNewRoute(); r.reference = 'mail.google.com'; r.openIn = 'zenith-ask'; R.updateRoute(r); R.saveRoutes();
      R.openSpaceRoutingDialog(window); await zth.sleep(1500); return 1""")
    s.capture("routing-dialog")
    z.js("""const f = document.querySelector('.dialogFrame'); f?.contentDocument?.getElementById('sr-close')?.click(); await zth.sleep(400);
      const R = gZenSpaceRoutingManager; for (const r of R.getAllRoutes()) R.removeRoute(r.id); R.saveRoutes();
      Services.prefs.clearUserPref('zenith.plus.loose-groups'); return 1""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
