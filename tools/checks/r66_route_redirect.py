"""0.12.11: a link that starts Zen (-osint -url) and redirects (a login or
tracking link) with a Space routing rule for it: one tab, in the rule's
space and container, nothing left where it first opened. Lists every tab
after the start. Two starts: one to set up, one started by the link."""
import json, os, socket, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({"browser.startup.page": 3})
from harness import Zen, ZEN_EXE, TEST_PROFILE, PORT
from scenarios import serve

srv, BASE = serve()
URL = f"{BASE}/redirect?zenith-route-test&to=/page%3Fn%3Dredirected"
res = {}


class LinkZen(Zen):
    def __enter__(self):
        env = dict(os.environ, XRE_PROFILE_PATH=str(TEST_PROFILE), MOZ_MARIONETTE="1", MOZ_REMOTE_ALLOW_SYSTEM_ACCESS="1", MOZ_NO_REMOTE="1")
        self.proc = subprocess.Popen([ZEN_EXE, "-osint", "-url", URL], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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


HELP = """const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wins = () => [...Services.wm.getEnumerator('navigator:browser')];
  for (let i = 0; i < 150 && !(window.ZenithLinks && gZenStartup?.isReady); i++) await sleep(100);"""


def js(z, body):
    return z.chrome(f"return (async () => {{ {HELP} {body} }})()")


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
    time.sleep(2)


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


z = Zen(headless=False).__enter__()
setup = js(z, f"""const TWO = {json.dumps(len(sys.argv) > 1 and sys.argv[1] == "two")};
  const R = gZenSpaceRoutingManager;
  for (const r of R.getAllRoutes()) if (r.reference === 'zenith-route-test') R.removeRoute(r.id);
  for (const w of gZenWorkspaces.getWorkspaces()) if (w.name === 'Zenith route test') await gZenWorkspaces.removeWorkspace(w.uuid);
  for (const c of ContextualIdentityService.getPublicIdentities()) if (c.name === 'Zenith route test') ContextualIdentityService.remove(c.userContextId);
  for (const w of wins()) if (w !== window) w.close();
  if (TWO) {{ const w2 = OpenBrowserWindow(); await new Promise(r => w2.addEventListener('load', r, {{ once: true }})); await sleep(3000); window.focus(); await sleep(500); }}
  const id = ContextualIdentityService.create('Zenith route test', 'fingerprint', 'blue').userContextId;
  const ws = await gZenWorkspaces.createAndSaveWorkspace('Zenith route test', undefined, true, id);
  await sleep(800);
  const route = R.createNewRoute();
  route.reference = 'zenith-route-test'; route.openIn = ws.uuid; R.updateRoute(route); R.saveRoutes();
  await sleep(1500);
  return {{ container: id, space: ws.uuid, route: route.id, active: gZenWorkspaces.activeWorkspace }};""")
say("setup", setup)
quit(z)
S, C, A = json.dumps(setup.get("space")), json.dumps(setup.get("container")), json.dumps(setup.get("active"))

z = LinkZen(headless=False).__enter__()
say("started by a redirecting link", js(z, f"""
  await sleep(12000);
  const ws = id => id === {S} ? 'rule' : id === {A} ? 'first' : (id || 'none').slice(1, 6);
  const tabs = wins().flatMap((w, i) => [...w.gBrowser.tabs].map(t => ({{ win: i, label: (t.label || '').slice(0, 24), url: (t.linkedBrowser.currentURI?.spec ?? '').replace({json.dumps(BASE)}, ''),
     space: ws(t.getAttribute('zen-workspace-id')), container: t.userContextId, empty: t.hasAttribute('zen-empty-tab'), pending: t.hasAttribute('pending'),
     panel: !!t.linkedPanel, selected: t.selected }})));
  const out = {{ state: window.ZenithLinks.startupState, tabs: tabs.filter(t => /redirect|Test page|zenith/.test(t.url + t.label)), all: tabs.length, windows: wins().length }};
  for (const w of wins()) for (const t of [...w.gBrowser.tabs]) if (/redirect|n=redirected/.test(t.linkedBrowser.currentURI?.spec ?? '')) w.gBrowser.removeTab(t);
  await gZenWorkspaces.changeWorkspaceWithID({A}); await sleep(500);
  gZenSpaceRoutingManager.removeRoute({json.dumps(setup.get('route'))}); gZenSpaceRoutingManager.saveRoutes();
  await gZenWorkspaces.removeWorkspace({S});
  ContextualIdentityService.remove({C});
  await sleep(1500);
  return out;"""))
quit(z)
srv.shutdown()
print(json.dumps(res, indent=1, ensure_ascii=False))
