"""Alt+Shift+click peeks right after Zen starts, on a page the session brought
back (loaded before Zenith's scripts), no setting touched."""
import json, os, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({"browser.startup.page": 3})
from harness import Zen
from bench_startup import KeptZen
from scenarios import serve

srv, BASE = serve()
ELEMENT = "element-6066-11e4-a52e-4f735466cecf"
ALT, SHIFT = "", ""


def js(z, body, *args):
    return z.chrome(f"return (async () => {{ const sleep = ms => new Promise(r => setTimeout(r, ms)); {body} }})()", *args)


z = Zen(headless=False).__enter__()
js(z, "for (let i = 0; i < 100 && !window.ZenithPeek; i++) await sleep(100); const t = gBrowser.addTrustedTab(arguments[0]); gBrowser.selectedTab = t; await sleep(2500); return 1", BASE + "/page?n=pkrestart")
js(z, "setTimeout(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit), 300); return 1")
z.proc.wait(40)
time.sleep(2)

z = KeptZen(headless=False).__enter__()
out = {"ready": js(z, "for (let i = 0; i < 150 && !window.ZenithPeek; i++) await sleep(100); await sleep(3000); return gBrowser.selectedBrowser.currentURI.spec.includes('n=pkrestart')")}
z.cmd("Marionette:SetContext", {"value": "content"})
hs = z.cmd("WebDriver:GetWindowHandles", {})
for h in (hs.get("value", hs) if isinstance(hs, dict) else hs):
    z.cmd("WebDriver:SwitchToWindow", {"handle": h})
    if "n=pkrestart" in str(z.cmd("WebDriver:GetCurrentURL", {})):
        break
el = z.cmd("WebDriver:FindElement", {"using": "css selector", "value": "a[href*='n=2']"})
el = el.get("value", el)
z.cmd("WebDriver:PerformActions", {"actions": [
    {"type": "key", "id": "kb", "actions": [{"type": "keyDown", "value": ALT}, {"type": "keyDown", "value": SHIFT}] + [{"type": "pause", "duration": 0}] * 3
     + [{"type": "keyUp", "value": SHIFT}, {"type": "keyUp", "value": ALT}]},
    {"type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"}, "actions": [{"type": "pause", "duration": 0}] * 2 + [
        {"type": "pointerMove", "origin": {ELEMENT: el[ELEMENT]}, "x": 0, "y": 0}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]},
]})
z.cmd("WebDriver:ReleaseActions", {})
z.cmd("Marionette:SetContext", {"value": "chrome"})
hs = z.cmd("WebDriver:GetWindowHandles", {})
out["peek after restart, Alt+Shift+click"] = js(z, """await sleep(2500); const d = gZenGlanceManager.detachedBrowser; const u = d?.currentURI?.spec ?? null;
  if (d) await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true });
  for (const t of [...gBrowser.tabs]) if (/n=pkrestart/.test(t.linkedBrowser?.currentURI?.spec ?? '')) gBrowser.removeTab(t);
  return u;""")
out["shared setting"] = js(z, "return Services.ppmm.sharedData.get('zenith-peek-click') ?? null")
js(z, "setTimeout(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit), 300); return 1")
srv.shutdown()
print(json.dumps(out, indent=1))
