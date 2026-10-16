"""Dense results: does a switch-to-tab row show its address when selected?"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
from harness import REAL_SETTINGS
out_dir = Path(sys.argv[1]); out_dir.mkdir(parents=True, exist_ok=True)
with Scene() as z:
    for mod, prop, val in REAL_SETTINGS:
        z.js("zth.set(arguments[0], arguments[1], arguments[2]); return 1", mod, prop, val)
    res = z.js("""
      zth.open(arguments[0] + '/page?n=switchme', {background: true}); await zth.sleep(1200);
      zth.open(arguments[0] + '/page?n=other'); await zth.sleep(800);
      gURLBar.focus(); gURLBar.select();
      gURLBar.search('switchme'); await zth.sleep(1500);
      const rows = [...document.querySelectorAll('.urlbarView-row')].filter(r => r.getAttribute('type') === 'switchtab');
      if (!rows.length) return { rows: [...document.querySelectorAll('.urlbarView-row')].map(r => r.getAttribute('type')) };
      const row = rows[0];
      gURLBar.view.selectedRowIndex = [...document.querySelectorAll('.urlbarView-row:not([hidden])')].indexOf(row);
      await zth.sleep(300);
      const url = row.querySelector('.urlbarView-url');
      return { selected: row.hasAttribute('selected'), urlText: url.textContent, urlVisibility: getComputedStyle(url).visibility,
               urlDisplay: getComputedStyle(url).display, action: row.querySelector('.urlbarView-action').textContent,
               rowRect: zth.style(row, []).rect,
               parts: [...row.querySelectorAll('.urlbarView-row-inner *')].filter(e => e.className && typeof e.className === 'string').map(e => [e.className, zth.style(e, ['display','visibility','width','max-width','flex','order','position']), e.parentNode.className]) };
    """, z.base)
    if "rowRect" in res:
        r = res["rowRect"]
        z.zoom(str(out_dir / "switchtab.png"), r[0], r[1], r[2], r[3], 2)
print(json.dumps(res, indent=1))
