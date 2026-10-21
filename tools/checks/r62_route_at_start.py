"""0.12.8: a link that starts Zen (as another app hands it over; -url, as -osint only goes alone)
goes where its Space routing rule says, in that space's container; with
the rule on "Ask me each time", the card asks. Three starts of Zen: one to
set up a container, a space and a rule; one started with the link; one
started with the link again, the rule on Ask."""
import json, os, socket, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Zen, ZEN_EXE, TEST_PROFILE, PORT

URL = "https://example.com/?zenith-route-test"
res = {}


class LinkZen(Zen):
    """Zen started by a link from another app (profile and session kept)."""

    def __enter__(self):
        args = [ZEN_EXE, "-wait-for-browser", "-no-remote", "-profile", str(TEST_PROFILE), "--marionette",
                "-remote-allow-system-access", f"--window-size={self.width},{self.height}", "-url", URL]
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                self.sock = socket.create_connection(("127.0.0.1", PORT), timeout=5)
                break
            except OSError:
                time.sleep(0.25)
        self.sock.settimeout(120)
        self._read()
        self.cmd("WebDriver:NewSession", {"capabilities": {"pageLoadStrategy": "none"}})
        self.cmd("Marionette:SetContext", {"value": "chrome"})
        return self


def js(z, body):
    return z.chrome(f"return (async () => {{ const sleep = ms => new Promise(r => setTimeout(r, ms)); {body} }})()")


def quit(z):
    js(z, "setTimeout(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit), 300); return 1")
    try:
        z.proc.wait(40)
    except subprocess.TimeoutExpired:
        z.proc.kill()
    try:
        z.sock.close()
    except Exception:
        pass


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


# 1. A container, a space in it, a rule for the link.
z = Zen(headless=False).__enter__()
setup = js(z, """
  for (let i = 0; i < 100 && !(window.ZenithLinks && gZenStartup?.isReady); i++) await sleep(100);
  // (What an earlier run left: rules, spaces and containers of this test.)
  const R0 = gZenSpaceRoutingManager;
  for (const r of R0.getAllRoutes()) if (r.reference === 'zenith-route-test') R0.removeRoute(r.id);
  for (const w of gZenWorkspaces.getWorkspaces()) if (w.name === 'Zenith route test') await gZenWorkspaces.removeWorkspace(w.uuid);
  for (const c of ContextualIdentityService.getPublicIdentities()) if (c.name === 'Zenith route test') ContextualIdentityService.remove(c.userContextId);
  const id = ContextualIdentityService.create('Zenith route test', 'fingerprint', 'blue').userContextId;
  const ws = await gZenWorkspaces.createAndSaveWorkspace('Zenith route test', undefined, true, id);
  await sleep(800);
  const R = gZenSpaceRoutingManager, route = R.createNewRoute();
  route.reference = 'zenith-route-test'; route.openIn = ws.uuid; R.updateRoute(route); R.saveRoutes();
  await sleep(1500);
  return { container: id, space: ws.uuid, route: route.id, active: gZenWorkspaces.activeWorkspace };""")
say("setup", setup)
quit(z)
time.sleep(2)

# 2. Started by the link: its space, its container.
z = LinkZen(headless=False).__enter__()
say("started by the link", js(z, f"""
  for (let i = 0; i < 150 && !(window.ZenithLinks && gZenStartup?.isReady); i++) await sleep(100);
  await sleep(6000);
  const a = window.arguments?.[0];
  const tab = gBrowser.tabs.find(t => (t.linkedBrowser.currentURI?.spec ?? '').includes('zenith-route-test'));
  const out = {{ state: window.ZenithLinks.startupState, now: window.ZenithLinks.routing().getAllRoutes().length, links: window.ZenithLinks.startupLinks(), tab: !!tab,
                'in its space': tab?.getAttribute('zen-workspace-id') === {json.dumps(setup.get('space'))},
                'in its container': tab?.userContextId === {json.dumps(setup.get('container'))},
                'that space shown': gZenWorkspaces.activeWorkspace === {json.dumps(setup.get('space'))}, selected: !!tab?.selected }};
  for (const t of gBrowser.tabs.filter(t => (t.linkedBrowser.currentURI?.spec ?? '').includes('zenith-route-test'))) gBrowser.removeTab(t);
  await gZenWorkspaces.changeWorkspaceWithID({json.dumps(setup.get('active'))});
  const R = gZenSpaceRoutingManager, route = R.getRoute({json.dumps(setup.get('route'))});
  route.openIn = 'zenith-ask'; R.updateRoute(route); R.saveRoutes(); await sleep(1500);
  return out;"""))
quit(z)
time.sleep(2)

# 3. Started by the link, the rule on Ask: the card; picking the space.
z = LinkZen(headless=False).__enter__()
say("started by the link, Ask", js(z, f"""
  for (let i = 0; i < 150 && !(window.ZenithLinks && gZenStartup?.isReady); i++) await sleep(100);
  await sleep(6000);
  const L = window.ZenithLinks, asked = !!L.pending, out = {{ 'the card asks': asked, state: L.startupState }};
  if (asked) {{
    await L.pending.choose(gZenWorkspaces.getWorkspaceFromId({json.dumps(setup.get('space'))})); await sleep(1500);
    const tab = gBrowser.tabs.find(t => (t.linkedBrowser.currentURI?.spec ?? '').includes('zenith-route-test'));
    out['picked: its space'] = tab?.getAttribute('zen-workspace-id') === {json.dumps(setup.get('space'))};
    out['picked: its container'] = tab?.userContextId === {json.dumps(setup.get('container'))};
  }}
  for (const t of gBrowser.tabs.filter(t => (t.linkedBrowser.currentURI?.spec ?? '').includes('zenith-route-test'))) gBrowser.removeTab(t);
  await gZenWorkspaces.changeWorkspaceWithID({json.dumps(setup.get('active'))}); await sleep(500);
  gZenSpaceRoutingManager.removeRoute({json.dumps(setup.get('route'))}); gZenSpaceRoutingManager.saveRoutes();
  await gZenWorkspaces.removeWorkspace({json.dumps(setup.get('space'))});
  ContextualIdentityService.remove({json.dumps(setup.get('container'))});
  await sleep(1500);
  return out;"""))
quit(z)

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
