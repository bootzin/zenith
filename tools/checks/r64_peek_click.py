"""0.12.9: Peek a link by clicking it with keys (WebDriver actions: real,
trusted clicks): Alt+Shift peeks (Zen's Glance doesn't open); with "Alt
(instead of Glance)", Alt+click peeks and no Glance opens; the link's
right-click menu has Open Link in Peek."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
ELEMENT = "element-6066-11e4-a52e-4f735466cecf"


def click_link(z, keys):
    """Click the page's link holding keys (WebDriver key codes)."""
    z.cmd("Marionette:SetContext", {"value": "content"})
    try:
        hs = z.cmd("WebDriver:GetWindowHandles", {})
        for h in (hs.get("value", hs) if isinstance(hs, dict) else hs):
            z.cmd("WebDriver:SwitchToWindow", {"handle": h})
            if "n=pk" in str(z.cmd("WebDriver:GetCurrentURL", {})):
                break
        el = z.cmd("WebDriver:FindElement", {"using": "css selector", "value": "a[href*='n=2']"})
        el = el.get("value", el)
        z.cmd("WebDriver:PerformActions", {"actions": [
            {"type": "key", "id": "kb", "actions": [{"type": "keyDown", "value": k} for k in keys] + [{"type": "pause", "duration": 0}] * 3
             + [{"type": "keyUp", "value": k} for k in keys]},
            {"type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"}, "actions": [{"type": "pause", "duration": 0}] * len(keys) + [
                {"type": "pointerMove", "origin": {ELEMENT: el[ELEMENT]}, "x": 0, "y": 0},
                {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]},
        ]})
        z.cmd("WebDriver:ReleaseActions", {})
    finally:
        z.cmd("Marionette:SetContext", {"value": "chrome"})


ALT, SHIFT = "", ""
with Scene(headless=False) as z:
    z.js("window.zenithPK = zth.open(arguments[0] + '/page?n=pk'); await zth.sleep(2500); return 1", z.base)
    state = r"""
      await zth.sleep(2500);
      const d = gZenGlanceManager.detachedBrowser, out = { peek: d?.currentURI?.spec ?? null,
        glance: gBrowser.tabs.some(t => t.hasAttribute('zen-glance-tab')), 'page stayed': window.zenithPK.linkedBrowser.currentURI.spec.includes('n=pk') };
      if (d) await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true });
      for (const t of gBrowser.tabs.filter(t => t.hasAttribute('zen-glance-tab'))) gZenGlanceManager.quickCloseGlance?.();
      gBrowser.selectedTab = window.zenithPK; await zth.sleep(800);
      return out;"""
    click_link(z, [ALT, SHIFT])
    res["Alt+Shift+click"] = z.js(state)
    z.js("Services.prefs.setStringPref('zenith.plus.peek-click', 'alt'); await zth.sleep(500); return Services.prefs.getStringPref('zen.glance.activation-method', '')")
    click_link(z, [ALT])
    res["Alt+click, instead of Glance"] = z.js(state)
    res["Glance key given back"] = z.js("Services.prefs.clearUserPref('zenith.plus.peek-click'); await zth.sleep(500); return Services.prefs.getStringPref('zen.glance.activation-method', '(default)')")
    res["right-click menu"] = z.js(r"""
      const item = document.getElementById('context-zenith-peek');
      return { item: !!item, 'after Open Link in New Tab': item?.previousElementSibling?.id ?? null };""")
    z.js("gBrowser.removeTab(window.zenithPK); return 1")

print(json.dumps(res, indent=1, ensure_ascii=False))
