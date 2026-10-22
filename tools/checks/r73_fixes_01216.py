"""0.12.17, inside Zen: a tab stuck loading at a link another tab went on
from closes by itself (the state read from the real session, still
loading); Ctrl+W (real keys) on a split's tab keeps the split on screen;
a tab dragged out of a split is selected; a swipe in a Peek goes back in it."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
CTRL = ""


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); return 1")
    say("stuck tab at the link, by itself", z.js(r"""
      const base = arguments[0], url = base + '/once?zenith-stray2&hang=1&to=/page%3Fn%3Dwenton';
      const left = zth.open(url); await zth.sleep(1500);
      const out = { 'left one at the link': left.linkedBrowser.currentURI.spec === url, 'still loading': !!left.linkedBrowser.webProgress?.isLoadingDocument };
      const went = zth.open(url); await zth.sleep(9000);
      Object.assign(out, { 'other went on': went.linkedBrowser.currentURI.spec.endsWith('n=wenton'), 'left one closed (nobody asked)': !left.isConnected, 'the other stays': went.isConnected });
      for (const t of [left, went]) if (t.isConnected) gBrowser.removeTab(t);
      return out;""", z.base))

    z.js(r"""const t = ['a', 'b', 'c'].map(n => zth.open(arguments[0] + '/page?n=cw' + n)); await zth.sleep(1500);
             gZenViewSplitter.splitTabs(t); await zth.sleep(1500); gBrowser.selectedTab = t[1]; await zth.sleep(800); window.zenithCW = t; return 1""", z.base)
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": [
        {"type": "keyDown", "value": CTRL}, {"type": "keyDown", "value": "w"}, {"type": "keyUp", "value": "w"}, {"type": "keyUp", "value": CTRL}]}]})
    z.cmd("WebDriver:ReleaseActions", {})
    say("ctrl+w in a split of 3", z.js(r"""await zth.sleep(1500); const t = window.zenithCW, sel = gBrowser.selectedTab;
      const out = { 'closed it': !t[1].isConnected, 'selected in the split': sel === t[0] || sel === t[2], 'split on screen': gBrowser.tabpanels.hasAttribute('zen-split-view'),
                    'still a split of 2': t[0].group === t[2].group && t[0].group?.tabs.length === 2 };
      return out;"""))
    say("dragged out of a split: selected", z.js(r"""const t = window.zenithCW, loose = zth.open(arguments[0] + '/page?n=cwloose'); await zth.sleep(1000);
      gBrowser.selectedTab = t[2]; await zth.sleep(500);
      window.ZenithSplitReorder.apply({ kind: 'after', tab: t[0], target: loose }); await zth.sleep(1000);
      const out = { 'out of the split': !t[0].group, selected: t[0].selected };
      for (const x of [...t, loose]) if (x.isConnected) gBrowser.removeTab(x);
      return out;""", z.base))

    say("peek swipe", z.js(r"""const base = arguments[0];
      await window.ZenithPeek.open(base + '/page?n=sw1'); await zth.sleep(2000);
      const d = gZenGlanceManager.detachedBrowser;
      d.loadURI(Services.io.newURI(base + '/page?n=sw2'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await zth.sleep(1500);
      const out = { 'swipe allowed': gHistorySwipeAnimation.canGoBack() };
      gGestureSupport._doCommand(new MouseEvent('click'), 'Browser:BackOrBackDuplicate'); await zth.sleep(1500);
      out['went back'] = d.currentURI.spec.includes('n=sw1');
      await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true });
      return out;""", z.base))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
