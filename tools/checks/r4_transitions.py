"""What transitions/animations do Zen's own styles put on the elements Motion touches?
Runs with Zenith Motion disabled (preset off removes Zenith's), reading computed values."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
with Scene() as z:
    print(json.dumps(z.js("""
      const t = gBrowser.selectedTab;
      const q = (el, p) => el ? getComputedStyle(el).getPropertyValue(p) : 'none';
      const out = {};
      for (const [name, el] of [['tab-background', t.querySelector('.tab-background')], ['tab-stack', t.querySelector('.tab-stack')],
                                ['navbar-wrapper', document.getElementById('zen-appcontent-navbar-wrapper')], ['urlbar', document.getElementById('urlbar')],
                                ['tabpanels', document.getElementById('tabbrowser-tabpanels')], ['findbar', gFindBar]]) {
        out[name] = [q(el, 'transition-property'), q(el, 'transition-duration'), q(el, 'animation-name')];
      }
      return out;"""), indent=1))
