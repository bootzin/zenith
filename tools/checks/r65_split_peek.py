"""0.12.10, inside Zen with real keys and clicks (WebDriver actions):
Alt+F fills the view with one pane of a split and back (nothing moves or
reloads; Firefox's File menu doesn't open); what Alt+H/V/G and Ctrl+Alt+
H/V/G do with a split; a tab floated out of a split comes back into it, in
its place; Peek swapped with Glance (Alt peeks, Alt+Shift Glances).
Arguments: only the parts whose names contain them."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
ONLY = [a.lower() for a in sys.argv[1:]]
ELEMENT = "element-6066-11e4-a52e-4f735466cecf"
ALT, SHIFT, CTRL = "", "", ""


def want(name):
    return not ONLY or any(o in name.lower() for o in ONLY)


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


def keys(z, combo, key):
    """Press keys in the browser window (chrome)."""
    acts = [{"type": "keyDown", "value": k} for k in combo] + [{"type": "keyDown", "value": key}, {"type": "keyUp", "value": key}] \
        + [{"type": "keyUp", "value": k} for k in reversed(combo)]
    try:
        z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": acts}]})
        z.cmd("WebDriver:ReleaseActions", {})
        return True
    except Exception as e:
        return f"FAILED: {e}"


def click_link(z, combo, marker):
    z.cmd("Marionette:SetContext", {"value": "content"})
    try:
        hs = z.cmd("WebDriver:GetWindowHandles", {})
        for h in (hs.get("value", hs) if isinstance(hs, dict) else hs):
            z.cmd("WebDriver:SwitchToWindow", {"handle": h})
            if marker in str(z.cmd("WebDriver:GetCurrentURL", {})):
                break
        el = z.cmd("WebDriver:FindElement", {"using": "css selector", "value": "a[href*='n=2']"})
        el = el.get("value", el)
        z.cmd("WebDriver:PerformActions", {"actions": [
            {"type": "key", "id": "kb", "actions": [{"type": "keyDown", "value": k} for k in combo] + [{"type": "pause", "duration": 0}] * 3
             + [{"type": "keyUp", "value": k} for k in combo]},
            {"type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"}, "actions": [{"type": "pause", "duration": 0}] * len(combo) + [
                {"type": "pointerMove", "origin": {ELEMENT: el[ELEMENT]}, "x": 0, "y": 0},
                {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]},
        ]})
        z.cmd("WebDriver:ReleaseActions", {})
    finally:
        z.cmd("Marionette:SetContext", {"value": "chrome"})
        handles = z.cmd("WebDriver:GetWindowHandles", {})
        z.cmd("WebDriver:SwitchToWindow", {"handle": (handles.get("value", handles) if isinstance(handles, dict) else handles)[0]})


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); return 1")

    if want("solo"):
        z.js(r"""const t = ['a', 'b'].map(n => zth.open(arguments[0] + '/page?n=so' + n)); await zth.sleep(1500);
                 gZenViewSplitter.splitTabs(t); await zth.sleep(1500); gBrowser.selectedTab = t[0]; await zth.sleep(600);
                 window.zenithSo = t; window.zenithSoIds = t.map(x => x.linkedBrowser.browsingContext.currentWindowGlobal.innerWindowId); return 1""", z.base)
        state = r"""const t = window.zenithSo, P = gBrowser.tabpanels, box = n => n?.getBoundingClientRect(), c = x => x.linkedBrowser.closest('.browserSidebarContainer');
          const pr = box(P), r0 = box(c(t[0])), r1 = box(c(t[1]));
          return { solo: P.hasAttribute('zenith-solo'), marked: t.map(x => c(x).hasAttribute('zenith-split-solo')),
                   'fills': [Math.round(r0.width) >= Math.round(pr.width) - 12, Math.round(r1.width) >= Math.round(pr.width) - 12],
                   hidden: t.map(x => getComputedStyle(c(x)).visibility === 'hidden'), 'still a split of 2': t[0].group?.tabs.length === 2 && t[0].group === t[1].group,
                   'no reload': t.every((x, i) => x.linkedBrowser.browsingContext.currentWindowGlobal.innerWindowId === window.zenithSoIds[i]),
                   menu: !!document.querySelector('menupopup[open], menu[open]') };"""
        say("solo: Alt+F", [keys(z, [ALT], "f"), z.js("await zth.sleep(600); " + state)])
        say("solo: other tab of the split", z.js("gBrowser.selectedTab = window.zenithSo[1]; await zth.sleep(600); " + state))
        say("solo: Alt+F again", [keys(z, [ALT], "f"), z.js("await zth.sleep(600); " + state)])

    if want("layout keys"):
        z.js("gBrowser.selectedTab = window.zenithSo?.[1] ?? gBrowser.selectedTab; await zth.sleep(400); return 1")
        say("layout keys: key elements", z.js(r"""
          return [...document.querySelectorAll('key')].filter(k => /^[hvg]$/i.test(k.getAttribute('key') || '') && /alt/.test(k.getAttribute('modifiers') || ''))
            .map(k => [k.id, k.getAttribute('modifiers'), k.getAttribute('key'), k.getAttribute('command') || (k.getAttribute('oncommand') || '').slice(0, 40), k.hasAttribute('disabled')]);"""))
        for combo, name in (([ALT], "Alt"), ([CTRL, ALT], "Ctrl+Alt")):
            for k in "hvg":
                z.js("window.zenithBefore = [gBrowser.selectedTab, gBrowser.tabs.length, gZenWorkspaces.activeWorkspace]; return 1")
                ok = keys(z, combo, k)
                say(f"layout keys: {name}+{k.upper()}", [ok, z.js(r"""await zth.sleep(700); const [sel, n, ws] = window.zenithBefore, now = gBrowser.selectedTab;
                  const out = { 'selected changed': now !== sel, 'now': now.label?.slice(0, 30), essential: now.hasAttribute('zen-essential'), 'tabs added': gBrowser.tabs.length - n,
                                'space changed': gZenWorkspaces.activeWorkspace !== ws, layout: gZenViewSplitter._data.find(d => d.tabs.includes(window.zenithSo[1]))?.gridType ?? null, 'split size': window.zenithSo[1].group?.tabs.length ?? 0,
                                menu: !!document.querySelector('menupopup[open], menu[open]') };
                  for (const p of document.querySelectorAll('menupopup[open]')) p.hidePopup?.();
                  if (now !== sel && sel.isConnected) { gBrowser.selectedTab = sel; await zth.sleep(300); }
                  return out;""")])
        z.js("for (const t of window.zenithSo ?? []) if (t.isConnected) gBrowser.removeTab(t); return 1")

    if want("float"):
        say("float back into its split", z.js(r"""
          const base = arguments[0], out = {};
          for (const n of [3, 2]) {
            const t = [...Array(n).keys()].map(i => zth.open(base + '/page?n=fl' + n + i)); await zth.sleep(1500);
            gZenViewSplitter.splitTabs(t); await zth.sleep(1500); gBrowser.selectedTab = t[1]; await zth.sleep(500);
            const spec = t[1].linkedBrowser.currentURI.spec;
            const win = await window.ZenithFloat.float(t[1]); await zth.sleep(2500);
            const loose = n === 2 ? !t[0].group : t[0].group?.tabs.length === 2;
            win.ZenithFloat.back(); await zth.sleep(2500);
            const back = gBrowser.tabs.find(x => x.linkedBrowser.currentURI.spec === spec);
            out[`split of ${n}`] = { 'left it while floating': loose, 'back in the split': !!back && back.group === t[0].group && !!t[0].group?.hasAttribute('split-view-group'),
                                     'its place': back?.group?.tabs.indexOf(back), selected: !!back?.selected };
            for (const x of [...t, back]) if (x?.isConnected) gBrowser.removeTab(x);
            await zth.sleep(500);
          }
          return out;""", z.base))

    if want("peek swap"):
        z.js("window.zenithPK = zth.open(arguments[0] + '/page?n=pk'); await zth.sleep(2500); Services.prefs.setStringPref('zenith.plus.peek-click', 'alt-swap'); await zth.sleep(600); return 1", z.base)
        state = r"""await zth.sleep(2500);
          const d = gZenGlanceManager.detachedBrowser, out = { peek: !!d, glance: gBrowser.tabs.some(t => t.hasAttribute('zen-glance-tab')),
            'glance key': Services.prefs.getStringPref('zen.glance.activation-method', '(default)') };
          if (d) await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true });
          if (out.glance) { gZenGlanceManager.closeGlance?.({ noAnimation: true }); await zth.sleep(800); }
          gBrowser.selectedTab = window.zenithPK; await zth.sleep(800);
          return out;"""
        click_link(z, [ALT], "n=pk")
        say("peek swap: Alt+click peeks", z.js(state))
        click_link(z, [ALT, SHIFT], "n=pk")
        say("peek swap: Alt+Shift+click Glances", z.js(state))
        say("peek swap: Glance key given back", z.js("Services.prefs.clearUserPref('zenith.plus.peek-click'); await zth.sleep(500); gBrowser.removeTab(window.zenithPK); return Services.prefs.getStringPref('zen.glance.activation-method', '(default)')"))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
