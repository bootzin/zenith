"""After 0.10.0, inside Zen:
- Links from other apps on Ask: a link handed to Zen from outside (here,
  by starting Zen again with an address, as Windows does for another app)
  stops at the card; choosing the second space with "always" opens it
  there and makes a Space routing rule; the next link to that site skips
  the card; Escape opens a link as Zen would.
- Blend with the page: a green page tints the glass."""
import json, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
from harness import ZEN_EXE, TEST_PROFILE

res = {}
with Scene() as z:
    res["setup"] = z.js("""
      const W = gZenWorkspaces;
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      Services.prefs.setStringPref('zenith.plus.external-links', 'ask');
      window.zthHome = W.activeWorkspace; window.zthWork = W.getWorkspaces().find(w => w.uuid !== zthHome).uuid;
      return [W.getWorkspaces().length, !!window.browserDOMWindow.wrappedJSObject.zenithAsks];""")
    # A link from "another app": Zen started again with an address.
    subprocess.Popen([ZEN_EXE, "-profile", str(TEST_PROFILE), z.base + "/page?n=from-another-app"])
    time.sleep(4)
    res["the card"] = z.js("""
      const card = document.getElementById('zenith-linkask');
      return card ? [card.querySelector('.zth-la-site').textContent, [...card.querySelectorAll('.zth-la-row')].map(r => r.textContent)] : 'no card';""")
    res["chose Work, always"] = z.js("""
      const L = window.ZenithLinks; L.pending.tick.checked = true;
      await L.pending.choose(L.pending.spaces.find(s => s.uuid === zthWork)); await zth.sleep(1500);
      const R = gZenSpaceRoutingManager;
      return { 'in Work': gZenWorkspaces.activeWorkspace === zthWork, tab: gBrowser.selectedTab.label,
               rule: R.getAllRoutes().filter(r => r.reference === '127.0.0.1').map(r => [r.matchType, r.openIn === zthWork]) };""")
    z.js("await gZenWorkspaces.changeWorkspaceWithID(zthHome); await zth.sleep(800); return 1")
    subprocess.Popen([ZEN_EXE, "-profile", str(TEST_PROFILE), z.base + "/page?n=second-link"])
    time.sleep(4)
    res["same site again: no card, Work"] = z.js("""
      return [!document.getElementById('zenith-linkask'), gZenWorkspaces.activeWorkspace === zthWork || gBrowser.tabs.some(t => t.label === 'Test page second-link' && t.getAttribute('zen-workspace-id') === zthWork)];""")
    res["Escape"] = z.js("""
      const R = gZenSpaceRoutingManager; for (const r of R.getAllRoutes()) R.removeRoute(r.id); R.saveRoutes();
      await gZenWorkspaces.changeWorkspaceWithID(zthHome); await zth.sleep(800);
      const n = gBrowser.tabs.length;
      window.browserDOMWindow.openURI(Services.io.newURI(arguments[0] + '/page?n=escaped'), null, Ci.nsIBrowserDOMWindow.OPEN_NEWTAB,
                                      Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL, Services.scriptSecurityManager.getSystemPrincipal());
      await zth.sleep(300);
      const card = document.getElementById('zenith-linkask'), shown = !!card;
      card?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await zth.sleep(1200);
      Services.prefs.clearUserPref('zenith.plus.external-links');
      return { 'card shown': shown, 'opened as usual': gBrowser.tabs.length > n, 'card gone': !document.getElementById('zenith-linkask') };""", z.base)
    res["blend with the page"] = z.js("""
      const bg = () => getComputedStyle(document.getElementById('zen-browser-background'), '::after').backgroundColor; // (with Wallpaper, the tint is drawn over it)
      zth.open('data:text/html,<body style="margin:0;height:100vh;background:rgb(30,140,90)">'); await zth.sleep(1500);
      const before = bg();
      Services.prefs.setStringPref('zenith.plus.blend', 'on'); await zth.sleep(1500);
      const out = { tint: document.documentElement.style.getPropertyValue('--zth-page-tint'), 'glass before': before, 'glass after': bg() };
      Services.prefs.clearUserPref('zenith.plus.blend'); await zth.sleep(900);
      out['off again'] = bg() === before;
      return out;""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
