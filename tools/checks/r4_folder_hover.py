import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
with Scene() as z:
    print(json.dumps(z.js("""
      const a = zth.open(arguments[0] + '/audio'); await zth.sleep(1500);
      const f = gZenFolders.createFolder([a], { label: 'Music', renameFolder: false });
      await zth.sleep(800); f.collapsed = true; zth.open(arguments[0] + '/page?n=2'); await zth.sleep(1200);
      zth.reveal(true); await zth.sleep(500);
      const box = f.querySelector('.tab-group-label-container');
      const before = getComputedStyle(box, '::after').display;
      InspectorUtils.addPseudoClassLock(box, ':hover');
      await zth.sleep(200);
      const r = { idle: before, hovered: getComputedStyle(box, '::after').display,
                  resetShown: getComputedStyle(box.querySelector('.tab-reset-button')).display,
                  hasActive: f.hasAttribute('has-active'), expanded: document.documentElement.hasAttribute('zen-sidebar-expanded') };
      f.removeAttribute('has-active'); await zth.sleep(200);
      r.noActive = { hovered: getComputedStyle(box, '::after').display, resetShown: getComputedStyle(box.querySelector('.tab-reset-button')).display };
      InspectorUtils.removePseudoClassLock(box, ':hover');
      return r;
    """, z.base), indent=1))
