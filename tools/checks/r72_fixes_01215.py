"""0.12.16, inside Zen: a tab left at a link another tab went on from (the
state found in a real session) closes, others stay; Zen's "New empty split"
on a split's tab adds a pane next to it; New Tab Below on a split's tab
joins the split next to it; the split is drawn at once (no overlap); back
and forward in a Peek with real Alt+Left/Right."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
ALT = ""


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


def keys(z, combo, key):
    acts = [{"type": "keyDown", "value": k} for k in combo] + [{"type": "keyDown", "value": key}, {"type": "keyUp", "value": key}] + [{"type": "keyUp", "value": k} for k in reversed(combo)]
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": acts}]})
    z.cmd("WebDriver:ReleaseActions", {})


SPLIT = r"""
  const panes = g => (g?.tabs ?? []).map(x => x.linkedBrowser.closest('.browserSidebarContainer').getBoundingClientRect());
  const overlap = rs => rs.some((a, i) => rs.some((b, j) => j > i && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 20 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 20));
  const typeEnter = async u => { gURLBar.value = u; gURLBar.handleCommand(new KeyboardEvent('keydown', { key: 'Enter' })); await zth.sleep(2500); };
  const find = u => [...document.querySelectorAll('tab.tabbrowser-tab')].find(x => (x.linkedBrowser?.currentURI?.spec ?? '').endsWith(u));
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); return 1")
    if len(sys.argv) == 1: say("strays", z.js(r"""
      const base = arguments[0], url = base + '/once?zenith-stray&to=/page%3Fn%3Dstrayed';
      const left = zth.open(url); await zth.sleep(1500);
      const went = zth.open(url); await zth.sleep(1500);
      const alone = zth.open(base + '/page?n=alone'); await zth.sleep(1200);
      const out = { 'left one at the link': left.linkedBrowser.currentURI.spec === url, 'other went on': went.linkedBrowser.currentURI.spec.endsWith('n=strayed') };
      window.ZenithLinks.closeStrays(0); await zth.sleep(800);
      Object.assign(out, { 'left one closed': !left.isConnected, 'the one that went on stays': went.isConnected, 'unrelated stays': alone.isConnected });
      for (const t of [left, went, alone]) if (t.isConnected) gBrowser.removeTab(t);
      return out;""", z.base))

    if "below" not in sys.argv: say("new empty split on a split", z.js(SPLIT + r"""
      const base = arguments[0], t = ['a', 'b'].map(n => zth.open(base + '/page?n=es' + n)); await zth.sleep(1500);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500); gBrowser.selectedTab = t[0]; await zth.sleep(800);
      const cmd = document.getElementById('cmd_zenNewEmptySplit'), out = { 'command on': !cmd.hasAttribute('disabled') };
      cmd.doCommand(); await zth.sleep(1000);
      out['address bar up'] = gURLBar.focused || !!gURLBar.view?.isOpen;
      await typeEnter(base + '/page?n=espane');
      const n = find('n=espane'), g = t[0].group;
      Object.assign(out, { 'in the split': n?.group === g, size: g?.tabs.length, 'next to it': g?.tabs.indexOf(n) === g?.tabs.indexOf(t[0]) + 1, selected: !!n?.selected, overlap: overlap(panes(g)), dbg: [g?.tabs.map(x => (x.linkedBrowser?.currentURI?.spec ?? '').split('n=')[1] + (x.selected ? '*' : '')), gZenViewSplitter._data.find(d => d.tabs.includes(t[0]))?.tabs.map(x => (x.linkedBrowser?.currentURI?.spec ?? '').split('n=')[1]), [...document.querySelectorAll('tab.tabbrowser-tab')].filter(x => /pane/.test(x.linkedBrowser?.currentURI?.spec ?? '')).map(x => [x.group ? 'g' : '-', x.selected])] });
      for (const x of [...t, n]) if (x?.isConnected) gBrowser.removeTab(x);
      return out;""", z.base))

    if "below" in sys.argv: say("new tab below on a split", z.js(SPLIT + r"""
      const base = arguments[0], t = ['a', 'b', 'c'].map(n => zth.open(base + '/page?n=nb' + n)); await zth.sleep(1500);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500); gBrowser.selectedTab = t[1]; await zth.sleep(600);
      gBrowser.addAdjacentNewTab(t[1]); await zth.sleep(900);
      await typeEnter(base + '/page?n=nbpane');
      const n = find('n=nbpane'), g = t[1].group;
      const out = { 'in the split': n?.group === g, size: g?.tabs.length, 'next to it': g?.tabs.indexOf(n) === g?.tabs.indexOf(t[1]) + 1, selected: !!n?.selected, overlap: overlap(panes(g)), dbg: [g?.tabs.map(x => (x.linkedBrowser?.currentURI?.spec ?? '').split('n=')[1] + (x.selected ? '*' : '')), gZenViewSplitter._data.find(d => d.tabs.includes(t[1]))?.tabs.map(x => (x.linkedBrowser?.currentURI?.spec ?? '').split('n=')[1]), [...document.querySelectorAll('tab.tabbrowser-tab')].filter(x => /pane/.test(x.linkedBrowser?.currentURI?.spec ?? '')).map(x => [x.group ? 'g' : '-', x.selected])] };
      for (const x of [...t, n]) if (x?.isConnected) gBrowser.removeTab(x);
      return out;""", z.base))

    if len(sys.argv) > 1: raise SystemExit
    z.js("""window.zenithPeekHere = gBrowser.selectedBrowser.currentURI.spec; await window.ZenithPeek.open(arguments[0] + '/page?n=pk1'); await zth.sleep(2000);
            gZenGlanceManager.detachedBrowser.loadURI(Services.io.newURI(arguments[0] + '/page?n=pk2'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
            await zth.sleep(1500); gZenGlanceManager.detachedBrowser.focus(); await zth.sleep(300); return 1""", z.base)
    keys(z, [ALT], "")  # Alt+Left
    back = z.js("await zth.sleep(1500); return gZenGlanceManager.detachedBrowser?.currentURI.spec.includes('n=pk1')")
    keys(z, [ALT], "")  # Alt+Right
    fwd = z.js("await zth.sleep(1500); return gZenGlanceManager.detachedBrowser?.currentURI.spec.includes('n=pk2')")
    say("peek back and forward, real keys", {"back": back, "forward": fwd,
        "tab behind unchanged": z.js("const ok = gBrowser.selectedBrowser.currentURI.spec === window.zenithPeekHere; await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true }); return ok")})

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
