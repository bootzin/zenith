import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
with Scene() as z:
    print(json.dumps(z.js("""
      const out = {};
      const id = () => [document.getElementById('identity-box').className, gBrowser.currentURI.spec, gBrowser.selectedTab.hasAttribute('zen-empty-tab'), gURLBar.getAttribute('pageproxystate')];
      zth.open('about:blank'); await zth.sleep(800); out.blank = id();
      zth.open('about:newtab'); await zth.sleep(800); out.newtab = id();
      const ws = await gZenWorkspaces.createAndSaveWorkspace('Empty space'); await zth.sleep(1500);
      out.emptySpace = id();
      zth.open('http://neverssl.com/'); await zth.sleep(6000); out.http = id();
      return out;"""), indent=1))
