"""Folder header layout and the activity indicator."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

out_dir = Path(sys.argv[1]); out_dir.mkdir(parents=True, exist_ok=True)
with Scene() as z:
    res = z.js("""
      const a = zth.open(arguments[0] + '/audio'); await zth.sleep(1500);
      const b = zth.open(arguments[0] + '/page?n=2'); await zth.sleep(800);
      const f = gZenFolders.createFolder([a], { label: 'Music and more', renameFolder: false });
      await zth.sleep(800);
      f.collapsed = true; await zth.sleep(800);
      zth.reveal(true); await zth.sleep(600);
      const box = f.querySelector('.tab-group-label-container');
      const kids = [...box.children].map(k => [k.className, zth.style(k, ['display', 'flex-grow', 'order']).rect, getComputedStyle(k).display]);
      return { playing: a.hasAttribute('soundplaying'), collapsed: f.collapsed, box: zth.style(box, ['display']).rect, kids,
               after: zth.style(box, ['content', 'width', 'height', 'background-image', 'animation-name', 'order'], '::after') };
    """, z.base)
    r = res["box"]
    z.zoom(str(out_dir / "folder.png"), r[0], r[1] - 4, r[2], r[3] + 8, 4)
    z.chrome("document.querySelector('zen-folder .tab-reset-button').style.setProperty('display', 'flex', 'important'); return 1")
    z.wait(300)
    z.zoom(str(out_dir / "folder-unload-shown.png"), r[0], r[1] - 4, r[2], r[3] + 8, 4)
    res["reset"] = z.js("return zth.style('zen-folder .tab-reset-button', ['order']).rect")
    res["after2"] = z.js("return zth.style('zen-folder .tab-group-label-container', ['width'], '::after')")
print(json.dumps(res, indent=1))
