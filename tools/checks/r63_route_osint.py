"""0.12.9: a link that starts Zen, exactly as Windows starts it (-osint -url;
the profile and Marionette through the environment, as -osint goes alone),
with two windows to restore: it goes where its Space routing rule says, in
that space's container; started again with the rule on "Ask me each time"
and the last start's tab restored (the same link): one card, and the new
tab is the one placed (no duplicate left in the space you were in)."""
import json, os, socket, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
# (Restore the last session, as most people do.)
os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({"browser.startup.page": 3})
from harness import Zen, ZEN_EXE, TEST_PROFILE, PORT

URL = "https://example.com/?zenith-route-test"
res = {}


class LinkZen(Zen):
    """Zen started by a link from another app (profile and session kept)."""

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
  const hits = () => wins().flatMap(w => w.gBrowser.tabs.filter(t => (t.linkedBrowser.currentURI?.spec ?? '').includes('zenith-route-test')).map(t => [w, t]));
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


# 1. A container, a space in it, a rule for the link; two windows.
z = Zen(headless=False).__enter__()
setup = js(z, """
  const R = gZenSpaceRoutingManager;
  for (const r of R.getAllRoutes()) if (r.reference === 'zenith-route-test') R.removeRoute(r.id);
  for (const w of gZenWorkspaces.getWorkspaces()) if (w.name === 'Zenith route test') await gZenWorkspaces.removeWorkspace(w.uuid);
  for (const c of ContextualIdentityService.getPublicIdentities()) if (c.name === 'Zenith route test') ContextualIdentityService.remove(c.userContextId);
  const id = ContextualIdentityService.create('Zenith route test', 'fingerprint', 'blue').userContextId;
  const ws = await gZenWorkspaces.createAndSaveWorkspace('Zenith route test', undefined, true, id);
  await sleep(800);
  const route = R.createNewRoute();
  route.reference = 'zenith-route-test'; route.openIn = ws.uuid; R.updateRoute(route); R.saveRoutes();
  const w2 = OpenBrowserWindow(); await new Promise(r => w2.addEventListener('load', r, { once: true })); await sleep(3000);
  window.focus(); await sleep(500);
  return { container: id, space: ws.uuid, route: route.id, active: gZenWorkspaces.activeWorkspace, windows: wins().length };""")
say("setup", setup)
quit(z)
S, C, A = json.dumps(setup.get("space")), json.dumps(setup.get("container")), json.dumps(setup.get("active"))

# 2. Started by the link, two windows restored: its space, its container.
z = LinkZen(headless=False).__enter__()
say("started by the link", js(z, f"""
  await sleep(7000);
  const h = hits(), [w, tab] = h[0] ?? [];
  const out = {{ windows: wins().length, tabs: h.length, states: wins().map(x => x.ZenithLinks?.startupState),
                'in its space': tab?.getAttribute('zen-workspace-id') === {S}, 'in its container': tab?.userContextId === {C},
                'that space shown': w?.gZenWorkspaces.activeWorkspace === {S}, selected: !!tab?.selected }};
  // (The tab stays, for the next start to restore; the rule asks next time.)
  await w?.gZenWorkspaces.changeWorkspaceWithID({A});
  const R = gZenSpaceRoutingManager, route = R.getRoute({json.dumps(setup.get('route'))});
  route.openIn = 'zenith-ask'; R.updateRoute(route); R.saveRoutes(); await sleep(1500);
  return out;"""))
quit(z)

# 3. Started by the link again, the rule on Ask, last start's tab restored.
z = LinkZen(headless=False).__enter__()
say("started by the link, Ask, same link restored", js(z, f"""
  await sleep(7000);
  const asking = wins().filter(w => w.ZenithLinks?.pending), out = {{ cards: asking.length, tabs: hits().length }};
  if (asking.length) {{
    const w = asking[0];
    await w.ZenithLinks.pending.choose(w.gZenWorkspaces.getWorkspaceFromId({S})); await sleep(1500);
    const h = hits();
    out['tabs after'] = h.length;
    out['left in the space you were in'] = h.filter(([, t]) => t.getAttribute('zen-workspace-id') === {A}).length;
    out['in its space, its container'] = h.filter(([, t]) => t.getAttribute('zen-workspace-id') === {S} && t.userContextId === {C}).length;
  }}
  for (const [w, t] of hits()) w.gBrowser.removeTab(t);
  for (const w of wins()) if (w !== window) w.close();
  await gZenWorkspaces.changeWorkspaceWithID({A}); await sleep(500);
  gZenSpaceRoutingManager.removeRoute({json.dumps(setup.get('route'))}); gZenSpaceRoutingManager.saveRoutes();
  await gZenWorkspaces.removeWorkspace({S});
  ContextualIdentityService.remove({C});
  await sleep(1500);
  return out;"""))
quit(z)

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
