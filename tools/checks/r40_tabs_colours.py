"""After 0.10.0, inside Zen:
- the tab manager: duplicates, tabs not used for days, awake tabs and busy
  sites; closing with Undo, sleeping, making a folder;
- colours from an image: a picture mostly red with some blue gives the
  space red then blue, and undo puts the old colours back;
- extension buttons per space: one set to another space hides here."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

TMP = Path(os.environ["TEMP"]) / "claude" / "r40"
TMP.mkdir(parents=True, exist_ok=True)
res = {}
with Scene() as z:
    res["tab manager"] = z.js("""
      const b = arguments[0], M = window.ZenithTabs, out = {};
      const open = async u => { const t = zth.open(b + u); await zth.sleep(450); return t; };
      const a1 = await open('/page?n=a'), a2 = await open('/page?n=a');           // a duplicate
      const old1 = await open('/page?n=old1'), old2 = await open('/page?n=old2');  // unused for days
      await open('/page?n=c'); await open('/page?n=d');
      old1.updateLastAccessed(Date.now() - 10 * 86400000); old2.updateLastAccessed(Date.now() - 20 * 86400000);
      await zth.sleep(800);
      const r = M.Look.report(7);
      out.report = { tabs: r.tabs.length, duplicates: r.duplicates.map(t => t.label), stale: r.stale.map(t => t.label),
                     awake: r.awake.length, busy: r.busy.map(x => [x.site, x.tabs.length]) };
      // (The page's own actions are checked in r47.)
      const busyTabs = r.busy[0]?.tabs ?? [];
      M.Act.folder(r.busy[0]?.site ?? 'x', r.busy[0]?.space, busyTabs); await zth.sleep(1200);
      const folder = [...document.querySelectorAll('zen-folder')].find(f => f.label === '127.0.0.1');
      out['busy site became a folder'] = folder ? [folder.label, folder.tabs.filter(t => !t.hasAttribute('zen-empty-tab')).length] : 'no folder';
      out[':tabs in the switcher'] = (() => { const S = window.ZenithSwitcher; S.show(':tabs '); const it = S.items[0]; S.hide(); return it && it.title; })();
      return out;""", z.base)

    res["colours from an image"] = z.js("""
      const path = arguments[0], C = window.ZenithColours, W = gZenWorkspaces, out = {};
      const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = 200; c.height = 100;
      const x = c.getContext('2d');
      x.fillStyle = 'rgb(200, 40, 50)'; x.fillRect(0, 0, 120, 100);   // 60% red
      x.fillStyle = 'rgb(40, 90, 210)'; x.fillRect(120, 0, 50, 100);  // 25% blue
      x.fillStyle = 'rgb(128, 128, 128)'; x.fillRect(170, 0, 30, 100); // 15% grey
      await IOUtils.write(path, new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()));
      const before = JSON.stringify(W.getActiveWorkspace().theme);
      out.found = await C.fromFile(path); await zth.sleep(800);
      const ws = W.getActiveWorkspace();
      out.theme = ws.theme.gradientColors.map(g => [g.c, g.isPrimary]);
      out.painted = document.getElementById('zen-browser-background').style.getPropertyValue('--zen-main-browser-background').slice(0, 80);
      C.undo(); await zth.sleep(500);
      out['undo: as before'] = JSON.stringify(W.getActiveWorkspace().theme) === before;
      return out;""", str(TMP / "palette.png"))

    res["extension buttons per space"] = z.js("""
      const W = gZenWorkspaces, E = window.ZenithSpaceExtensions, out = {};
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      const here = W.activeWorkspace, other = W.getWorkspaces().find(w => w.uuid !== here).uuid;
      const bar = document.getElementById('nav-bar-customization-target') ?? document.getElementById('nav-bar');
      const item = document.createXULElement('toolbaritem'); item.id = 'zth_fake-browser-action'; item.className = 'unified-extensions-item';
      item.append(document.createXULElement('toolbarbutton')); bar.append(item);
      E.save({ [item.id]: [other] }); await zth.sleep(200);
      out['belongs to the other space, seen here'] = getComputedStyle(item).display;
      await W.changeWorkspaceWithID(other); await zth.sleep(900);
      out['in its own space'] = getComputedStyle(item).display;
      await W.changeWorkspaceWithID(here); await zth.sleep(900);
      out['back here'] = getComputedStyle(item).display;
      // The right-click item, on the toolbar menu.
      const menu = document.getElementById('toolbar-context-menu');
      const shown = new Promise(r => menu.addEventListener('popupshown', r, { once: true }));
      // (As a right-click on the button would: the menu knows what was clicked.)
      Object.defineProperty(menu, 'triggerNode', { value: item.firstChild, configurable: true });
      menu.openPopup(item.firstChild, 'after_start', 0, 0, true, false); await shown; await zth.sleep(150);
      delete menu.triggerNode;
      const sub = [...menu.children].find(n => n.getAttribute('label') === 'Pinned in spaces');
      const ticks = () => [...sub.menupopup.children].filter(n => n.localName === 'menuitem').map(n => [n.getAttribute('label'), n.hasAttribute('checked')]);
      out['Pinned in spaces'] = sub ? [sub.hidden, ticks()] : 'missing';
      // Tick this space too: pinned in both, so back to every space.
      [...sub.menupopup.children].find(n => n.getAttribute('label')?.endsWith(W.getWorkspaceFromId(here).name)).doCommand(); await zth.sleep(100);
      out['ticked here as well'] = [JSON.stringify(E.map), ticks()];
      menu.hidePopup(); E.save({}); item.remove();
      return out;""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
