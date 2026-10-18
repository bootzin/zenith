"""Zenith's bookmarks (Ctrl+B), checked inside Zen:
- Ctrl+B's command opens Zenith's panel (not Firefox's sidebar), over the
  right of the page; toolbar bookmarks first, then the Menu and Other
  folders; a folder opens in place; search finds across folders;
- this space's section: dropping a tab there makes the space's folder and
  bookmarks the tab; dropping a link on a folder puts it in that folder;
  dragging a bookmark onto a folder moves it;
- tiles: folders are stepped into, with a way back;
- "the page makes room" docks it beside the page (narrower page), "left"
  puts it before the page;
- "Firefox's tree": Ctrl+B opens Firefox's own sidebar again, restyled;
- the same view as a section of Zen's Library;
- the bookmarks bar stays in Zen's place by default; Import is hidden."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

SETUP = """
  const P = PlacesUtils, B = P.bookmarks;
  await B.eraseEverything(); // (the test profile's, left by earlier runs)
  for (const p of ['zenith.internal.bookmarks.space-folders', 'zenith.internal.bookmarks.space-folders.root', 'zenith.internal.bookmarks.open-folders'])
    Services.prefs.clearUserPref(p);
  for (const [title, url] of [['GitHub', 'https://github.com/'], ['Zen', 'https://zen-browser.app/'], ['Mail', 'https://mail.google.com/']])
    await B.insert({ parentGuid: B.toolbarGuid, title, url });
  const reading = await B.insert({ parentGuid: B.toolbarGuid, title: 'Reading', type: B.TYPE_FOLDER });
  for (const [title, url] of [['MDN', 'https://developer.mozilla.org/'], ['Wikipedia', 'https://wikipedia.org/']])
    await B.insert({ parentGuid: reading.guid, title, url });
  await B.insert({ parentGuid: B.menuGuid, title: 'Menu thing', url: 'https://example.org/menu' });
  await B.insert({ parentGuid: B.unfiledGuid, title: 'Other thing', url: 'https://example.org/other' });
  window.zthReading = reading.guid;
  return 1;"""

# Rows the view shows, as text.
ROWS = """const host = arguments[0] ? document.querySelector(arguments[0]) : document.querySelector('#zenith-bm-panel zenith-bookmarks-host');
  const root = host?.shadowRoot; if (!root) return 'no view';
  return [...root.querySelectorAll('.label, .row, .tile, .drop-here, .empty')].map(n => (n.classList.contains('row') ? '  '.repeat(Math.round((parseFloat(n.style.paddingInlineStart) - 8) / 14)) : '') +
    (n.classList.contains('label') ? '# ' : n.classList.contains('tile') ? '[] ' : '') + n.textContent.trim());"""


def rows(z, sel=""):
    return z.js(ROWS, sel)


res = {}
with Scene() as z:
    z.js(SETUP)
    res["bar: Zen's place, import hidden"] = z.js("""
      return { 'bar moved': document.documentElement.getAttribute('zenith-bookmarks'), 'import button': (() => { const b = document.getElementById('import-button'); return b ? getComputedStyle(b).display : 'none here'; })() };""")
    res["Ctrl+B"] = z.js("""
      SidebarController.toggle('viewBookmarksSidebar'); await zth.sleep(600);
      const p = document.getElementById('zenith-bm-panel'), r = p?.getBoundingClientRect(), page = document.getElementById('tabbrowser-tabbox').getBoundingClientRect();
      return { open: !!p && !p.hidden, place: p?.getAttribute('place'), 'Firefox sidebar': !document.getElementById('sidebar-box').hidden,
               'panel right edge vs page': [Math.round(r.right), Math.round(page.right)], width: Math.round(r.width), 'page width': Math.round(page.width) };""")
    res["rows"] = rows(z)
    z.js("""const root = document.querySelector('#zenith-bm-panel zenith-bookmarks-host').shadowRoot;
      [...root.querySelectorAll('.row')].find(r => r.textContent.includes('Reading')).click(); await zth.sleep(300); return 1""")
    res["Reading opened"] = rows(z)
    res["search 'wiki'"] = z.js("""const root = document.querySelector('#zenith-bm-panel zenith-bookmarks-host').shadowRoot, s = root.querySelector('.search');
      s.value = 'wiki'; s.dispatchEvent(new Event('input')); await zth.sleep(400);
      const out = [...root.querySelectorAll('.row')].map(r => r.textContent);
      s.value = ''; s.dispatchEvent(new Event('input')); await zth.sleep(300); return out;""")

    res["drops"] = z.js("""
      const root = document.querySelector('#zenith-bm-panel zenith-bookmarks-host').shadowRoot, P = PlacesUtils;
      zth.open(arguments[0] + '/page?n=kept'); await zth.sleep(800);
      const tab = gBrowser.selectedTab;
      const drop = (node, fill) => { const dt = new DataTransfer(); fill(dt); const r = node.getBoundingClientRect();
        node.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + r.height / 2 })); };
      drop(root.querySelector('.drop-here'), dt => dt.mozSetDataAt('application/x-moz-tabbrowser-tab', tab, 0));
      await zth.sleep(900);
      const folders = JSON.parse(Services.prefs.getStringPref('zenith.internal.bookmarks.space-folders', '{}'));
      const spaceFolder = folders[gZenWorkspaces.activeWorkspace];
      const inSpace = (await P.promiseBookmarksTree(spaceFolder))?.children?.map(c => c.title) ?? null;
      // A link dropped on the Reading folder.
      const reading = [...root.querySelectorAll('.row')].find(r => r.textContent.startsWith('Reading'));
      drop(reading, dt => dt.setData('text/x-moz-url', 'https://example.com/dropped\\nDropped link'));
      await zth.sleep(700);
      const readingNow = (await P.promiseBookmarksTree(zthReading)).children.map(c => c.title);
      // A bookmark (Mail) dragged onto Reading.
      const mail = (await P.bookmarks.search({ query: 'Mail' }))[0];
      drop([...root.querySelectorAll('.row')].find(r => r.textContent.startsWith('Reading')), dt => dt.setData('application/x-zenith-bookmark', mail.guid));
      await zth.sleep(700);
      return { 'space folder made': !!spaceFolder, 'in the space folder': inSpace, 'Reading now': (await P.promiseBookmarksTree(zthReading)).children.map(c => c.title),
               'after the link drop': readingNow };""", z.base)
    res["rows after drops"] = rows(z)

    res["tiles"] = z.js("""
      Services.prefs.setStringPref('zenith.plus.bookmarks-look', 'tiles'); await zth.sleep(500);
      const root = document.querySelector('#zenith-bm-panel zenith-bookmarks-host').shadowRoot;
      const out = { tiles: [...root.querySelectorAll('.tile')].map(t => t.textContent) };
      [...root.querySelectorAll('.tile')].find(t => t.textContent === 'Reading').click(); await zth.sleep(400);
      out['inside Reading'] = [[...root.querySelectorAll('.tile')].map(t => t.textContent), root.querySelector('.crumbs').hidden ? 'no way back' : root.querySelector('.crumbs').textContent];
      root.querySelector('.crumbs .back').click(); await zth.sleep(400);
      out['back'] = root.querySelectorAll('.tile').length;
      Services.prefs.clearUserPref('zenith.plus.bookmarks-look'); await zth.sleep(300);
      return out;""")

    res["docked"] = z.js("""
      const p = document.getElementById('zenith-bm-panel'), tabbox = () => document.getElementById('tabbrowser-tabbox').getBoundingClientRect();
      const before = Math.round(tabbox().width);
      Services.prefs.setStringPref('zenith.plus.bookmarks-place', 'right'); await zth.sleep(500);
      const out = { right: { 'page width': [before, Math.round(tabbox().width)], 'after the page': p.previousElementSibling?.id ?? p.parentNode.lastElementChild === p } };
      Services.prefs.setStringPref('zenith.plus.bookmarks-place', 'left'); await zth.sleep(500);
      out.left = { first: p.parentNode.firstElementChild === p, 'panel left of page': Math.round(p.getBoundingClientRect().right) <= Math.round(tabbox().left) };
      Services.prefs.clearUserPref('zenith.plus.bookmarks-place'); await zth.sleep(300);
      SidebarController.toggle('viewBookmarksSidebar'); await zth.sleep(300);
      out['closed again'] = p.hidden;
      return out;""")

    res["Firefox's tree"] = z.js("""
      Services.prefs.setStringPref('zenith.plus.bookmarks-look', 'firefox'); await zth.sleep(200);
      SidebarController.toggle('viewBookmarksSidebar'); await zth.sleep(1500);
      const box = document.getElementById('sidebar-box'), doc = document.getElementById('sidebar').contentDocument;
      const out = { 'Firefox sidebar': !box.hidden, 'Zenith panel': !document.getElementById('zenith-bm-panel').hidden,
                    'inner background': doc && getComputedStyle(doc.documentElement).backgroundColor, radius: getComputedStyle(box).borderTopLeftRadius,
                    'on the right': Math.round(box.getBoundingClientRect().right) > innerWidth - 40 };
      SidebarController.hide(); Services.prefs.clearUserPref('zenith.plus.bookmarks-look'); await zth.sleep(300);
      return out;""")

    res["Zen's Library"] = z.js("""
      const { ZenLibrary } = window;
      const lib = document.querySelector('zen-library');
      if (!customElements.get('zen-library')) return 'no Zen Library';
      const L = customElements.get('zen-library');
      L.toggle('zenith-bookmarks'); await zth.sleep(1500);
      const el = document.querySelector('zen-library');
      const tab = el?.querySelector('.zen-library-tab[data-section="zenith-bookmarks"]');
      const section = el?.querySelector('zenith-bookmarks-host[library]');
      const out = { tabs: [...(el?.querySelectorAll('.zen-library-tab') ?? [])].map(t => t.dataset.section + ':' + t.textContent.trim()),
                    'our tab': tab ? [tab.hasAttribute('active'), getComputedStyle(tab.querySelector('.zen-library-tab-icon-image')).maskImage.split('/').pop()] : 'missing',
                    rows: section?.shadowRoot ? [...section.shadowRoot.querySelectorAll('.label, .row')].slice(0, 6).map(n => n.textContent.trim()) : 'no section' };
      Services.prefs.setBoolPref('zenith.plus.bookmarks-library', false); await zth.sleep(200);
      out['setting off: tab'] = tab ? getComputedStyle(tab).display : null;
      Services.prefs.clearUserPref('zenith.plus.bookmarks-library');
      L.close?.(); await zth.sleep(800);
      return out;""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
