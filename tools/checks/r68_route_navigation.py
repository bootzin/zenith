"""A link from another app while Zen runs (browserDOMWindow.openURI with
OPEN_EXTERNAL, as the command line hands it over), that goes on elsewhere
(a server redirect, or a page that sends you on with a script, across
sites), with a Space routing rule (to a space with a container) matching
the link or where it ends up. Lists every tab, in every space, after."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
with Scene(headless=False) as z:
    other = z.base.replace("127.0.0.1", "localhost")
    CASES = [
        ("302, rule on the link", f"{z.base}/redirect?zenith-nav-test&to={other}/page%3Fn%3Dfinal", "zenith-nav-test"),
        ("script, rule on the link", f"{z.base}/jsredirect?zenith-nav-test&to={other}/page%3Fn%3Dfinal", "zenith-nav-test"),
        ("302, rule on where it ends", f"{z.base}/redirect?x=1&to={other}/page%3Fn%3Dfinal-nav", "final-nav"),
        ("script, rule on where it ends", f"{z.base}/jsredirect?x=2&to={other}/page%3Fn%3Dfinal-nav", "final-nav"),
    ]
    for name, url, ref in (CASES if len(sys.argv) == 1 else []):
        res[name] = z.js(r"""
          const [url, ref] = arguments, R = gZenSpaceRoutingManager, W = gZenWorkspaces;
          const id = ContextualIdentityService.create('Zenith nav test', 'fingerprint', 'blue').userContextId;
          const ws = await W.createAndSaveWorkspace('Zenith nav test', undefined, true, id); await zth.sleep(800);
          const here = W.activeWorkspace;
          const route = R.createNewRoute(); route.reference = ref; route.openIn = ws.uuid; R.updateRoute(route);
          const before = new Set(document.querySelectorAll('tab.tabbrowser-tab'));
          window.browserDOMWindow.openURI(Services.io.newURI(url), null, Ci.nsIBrowserDOMWindow.OPEN_NEWTAB, Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL,
                                          Services.scriptSecurityManager.getSystemPrincipal());
          await zth.sleep(6000);
          const where = t => { const w = t.getAttribute('zen-workspace-id'); return w === ws.uuid ? 'rule' : w === here ? 'was' : 'none'; };
          const fresh = [...document.querySelectorAll('tab.tabbrowser-tab')].filter(t => !before.has(t));
          const out = fresh.map(t => ({ label: t.label.slice(0, 40), url: (t.linkedBrowser?.currentURI?.spec ?? 'NO BROWSER').replace(/http:\/\/(127.0.0.1|localhost):\d+/, ''),
                                        space: where(t), container: t.userContextId === id ? 'rule' : t.userContextId, dead: window.ZenithLinks.dead(t), selected: t.selected }));
          for (const t of fresh) gBrowser.removeTab(t, { animate: false });
          await W.changeWorkspaceWithID(here); await zth.sleep(500);
          R.removeRoute(route.id); await W.removeWorkspace(ws.uuid); ContextualIdentityService.remove(id); await zth.sleep(500);
          return out;""", url, ref)
        print(json.dumps({name: res[name]}, ensure_ascii=False), flush=True)

    if len(sys.argv) > 1:
        res.clear()
    # Zen's stop-and-reopen: a tab whose page isn't its first (a blank one,
    # as the tab Zen opens a link in as it starts; or a real page) goes to a
    # link a rule sends elsewhere.
    for name, first in (("control (no fix): stopped, blank before", "about:blank"), ("stopped, blank before", "about:blank"), ("stopped, a page before", z.base + "/page?n=before")):
        res[name] = z.js(r"""
          const L = window.ZenithLinks, fix = L.leftBehind;
          if (arguments[2]) L.leftBehind = () => {};
          const [first, url] = arguments, R = gZenSpaceRoutingManager, W = gZenWorkspaces, sys = Services.scriptSecurityManager.getSystemPrincipal();
          const id = ContextualIdentityService.create('Zenith nav test', 'fingerprint', 'blue').userContextId;
          const ws = await W.createAndSaveWorkspace('Zenith nav test', undefined, true, id); await zth.sleep(800);
          const here = W.activeWorkspace, before = new Set(document.querySelectorAll('tab.tabbrowser-tab'));
          const t = gBrowser.addTrustedTab('about:blank'); gBrowser.selectedTab = t; await zth.sleep(800);
          t.linkedBrowser.loadURI(Services.io.newURI(first), { triggeringPrincipal: sys }); await zth.sleep(1500);
          const initial = t.linkedBrowser.browsingContext?.currentWindowGlobal?.isInitialDocument;
          const route = R.createNewRoute(); route.reference = 'zenith-nav-stop'; route.openIn = ws.uuid; R.updateRoute(route);
          t.linkedBrowser.loadURI(Services.io.newURI(url), { triggeringPrincipal: sys }); await zth.sleep(5000);
          const where = x => { const w = x.getAttribute('zen-workspace-id'); return w === ws.uuid ? 'rule' : w === here ? 'was' : 'none'; };
          const fresh = [...document.querySelectorAll('tab.tabbrowser-tab')].filter(x => !before.has(x));
          L.leftBehind = fix;
          const out = { 'first page initial': initial, 'the tab stays': t.isConnected, 'it is dead': t.isConnected && L.dead(t), label: t.label?.replace(/http:\/\/127.0.0.1:\d+/, ''), tabs: fresh.map(x => [x === t ? 'it' : 'new', where(x), x.userContextId === id ? 'rule' : x.userContextId,
                        (x.linkedBrowser?.currentURI?.spec ?? 'NO BROWSER').replace(/http:\/\/127.0.0.1:\d+/, '')]) };
          for (const x of fresh) gBrowser.removeTab(x, { animate: false });
          await W.changeWorkspaceWithID(here); await zth.sleep(500);
          R.removeRoute(route.id); await W.removeWorkspace(ws.uuid); ContextualIdentityService.remove(id); await zth.sleep(500);
          return out;""", first, z.base + "/page?n=zenith-nav-stop", name.startswith("control"))
        print(json.dumps({name: res[name]}, ensure_ascii=False), flush=True)
