"""Swipe back/forward animation, normal tab vs split pane."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
SWIPE = """
  const H = gHistorySwipeAnimation;
  if (!H.active) return 'swipe animation inactive';
  H.startAnimation(); H._canGoBack = true; H._canGoForward = true;
  H.updateAnimation({ event: null, delta: 0.6 });
  document.getElementById('historySwipeAnimationPreviousArrow').style.translate = '60px 0px'; await zth.sleep(40);
  const b = gBrowser.selectedBrowser, cs = getComputedStyle(b);
  const prev = document.getElementById('historySwipeAnimationPreviousArrow');
  const r = { arrowStyle: prev?.getAttribute('style'), inSelectedPanel: !!prev?.closest('.browserSidebarContainer.deck-selected'),
              transition: cs.transitionProperty + ' / ' + cs.transitionDuration, anims: b.getAnimations().map(a => a.transitionProperty) };
  await zth.sleep(300);
  r.after = { scale: getComputedStyle(b).scale, translate: getComputedStyle(b).translate };
  H.stopAnimation?.(); H._removeBoxes(); await zth.sleep(300);
  return r;
"""
res = {}
with Scene() as z:
    z.js("""const t = zth.open(arguments[0] + '/page?n=1'); await zth.sleep(800);
            gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0] + '/page?n=2'), {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});
            await zth.sleep(1000); return 1""", z.base)
    res["normal tab"] = z.js(SWIPE)
    z.js("""const a = gBrowser.selectedTab; const b = zth.open(arguments[0] + '/page?n=3'); await zth.sleep(800);
            gZenViewSplitter.splitTabs([a, b]); await zth.sleep(1200); gBrowser.selectedTab = a; await zth.sleep(500); return 1""", z.base)
    res["split pane"] = z.js(SWIPE)
print(json.dumps(res, indent=1))
