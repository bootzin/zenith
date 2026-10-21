"""0.12.12: a link that started Zen, with the tabs Zen may have left for it:
one loaded in the wrong space and container, one dead (never loaded, no
space; only its address bar shows the link), and one Zen routed itself.
Zenith keeps one, in the rule's space and container (or where Ask says),
and closes the rest."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
with Scene(headless=False) as z:
    res["dedupe"] = z.js(r"""
      const L = window.ZenithLinks, R = gZenSpaceRoutingManager, W = gZenWorkspaces, out = {};
      const id = ContextualIdentityService.create('Zenith dedupe test', 'fingerprint', 'blue').userContextId;
      const ws = await W.createAndSaveWorkspace('Zenith dedupe test', undefined, true, id); await zth.sleep(800);
      const here = W.activeWorkspace, url = arguments[0] + '/page?n=zenith-dedupe-test';
      let route = null;
      const rule = openIn => { if (!route) route = R.createNewRoute(); route.reference = 'zenith-dedupe-test'; route.openIn = openIn; R.updateRoute(route); };
      const norule = () => { if (route) { R.removeRoute(route.id); route = null; } };
      const count = () => L.tabsFor(url).length;
      const desc = t => [(t.getAttribute('zen-workspace-id') || 'none').slice(1, 6), t.userContextId, !!t.linkedPanel, t.hasAttribute('pending'), String(t.linkedBrowser?.userTypedValue ?? '').slice(-20), String(t.linkedBrowser?.currentURI?.spec ?? '').slice(-24), t.id.slice(-6), t.closing];
      const report = keep => ({ tabs: count(), 'its space': keep?.getAttribute('zen-workspace-id') === ws.uuid, 'its container': keep?.userContextId === id,
                                selected: !!keep?.selected, 'space shown': W.activeWorkspace === ws.uuid });
      const dead = () => { const d = gBrowser.addTrustedTab('about:blank', { skipRoute: true, inBackground: true }); d.linkedBrowser.userTypedValue = url; d.removeAttribute('zen-workspace-id'); return d; };
      const back = async () => { norule(); for (const t of document.querySelectorAll('tab.tabbrowser-tab')) if (/dedupe/.test((t.linkedBrowser?.currentURI?.spec ?? '') + (t.linkedBrowser?.userTypedValue ?? ''))) gBrowser.removeTab(t); await W.changeWorkspaceWithID(here); await zth.sleep(600); };

      // 1. Loaded in the wrong place, and a dead one.
      gBrowser.selectedTab = gBrowser.addTrustedTab(url, { skipRoute: true }); await zth.sleep(1500);
      if (gBrowser.selectedTab.getAttribute('zen-workspace-id') !== here) W.moveTabToWorkspace(gBrowser.selectedTab, here);
      dead(); await zth.sleep(300); rule(ws.uuid);
      out['wrong place + dead: found'] = count();
      out['wrong place + dead'] = report(await L.route(L.tabsFor(url), url)); await zth.sleep(1500); out['wrong place + dead'].after = count();
      await back();

      // 2. One Zen routed itself, and a dead one.
      const ok = gBrowser.addTrustedTab(url, { userContextId: id, skipRoute: true }); W.moveTabToWorkspace(ok, ws.uuid); await zth.sleep(1500);
      const dd = dead(); await zth.sleep(300); rule(ws.uuid);
      out['routed + dead: before'] = L.tabsFor(url).map(t => (t === ok ? 'ok ' : t === dd ? 'dead ' : 'other ') + desc(t).join(' '));
      out['routed + dead'] = report(await L.route(L.tabsFor(url), url)); await zth.sleep(1500); out['routed + dead'].after = count();
      out['routed + dead']['kept the routed one'] = ok.isConnected;
      out['routed + dead: after'] = L.tabsFor(url).map(t => (t === ok ? 'ok ' : t === dd ? 'dead ' : 'other ') + desc(t).join(' '));
      await back();

      // 3. Only a dead one (handed on to an app): closed, not opened again.
      dead(); await zth.sleep(300); rule(ws.uuid);
      out['only dead'] = report(await L.route(L.tabsFor(url), url)); await zth.sleep(1500); out['only dead'].after = count();
      await back();

      // 4. Ask: one card, the pick keeps one.
      gBrowser.selectedTab = gBrowser.addTrustedTab(url, { skipRoute: true }); await zth.sleep(1500); dead(); await zth.sleep(300); rule('zenith-ask');
      L.route(L.tabsFor(url), url); await zth.sleep(500);
      out['ask: card'] = !!L.pending;
      if (L.pending) { await L.pending.choose(ws); await zth.sleep(1500); }
      out['ask'] = report(L.tabsFor(url)[0]);
      await back();

      norule(); await W.removeWorkspace(ws.uuid); ContextualIdentityService.remove(id);
      return out;""", z.base)
print(json.dumps(res, indent=1, ensure_ascii=False))
