"""The tab manager (about:zenith-tabs), checked inside Zen (its Spaces
view; r54 checks All tabs, its insights and table):
- Alt+Shift+T's command opens the page in a tab (and goes back to it the
  second time);
- a column per space with its tabs: folders (pinned) and folders that don't
  pin, essentials in their spaces;
- picking with tick boxes (a click picks, Shift picks a range) and the bar:
  move to a space (a pinned tab stays pinned, a tab leaves its folder),
  into a new folder or group, take out, sleep, wake, close; Undo for each,
  and reopening keeps the page in front;
- a whole folder dragged to another space;
- tidying up lists its tabs ticked; unticking one leaves it out;
- memory per awake tab;
- rules: a grouping rule puts a matching tab into a folder or a group;
  auto-sleep and auto-close act only once set."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

PAGE = "const P = gBrowser.tabs.find(t => t.linkedBrowser.currentURI.spec === 'about:zenith-tabs'); const doc = P?.linkedBrowser.contentDocument, pw = P?.linkedBrowser.contentWindow;"
ROW = "const row = title => [...doc.querySelectorAll('.space .tab')].find(r => r.querySelector('.title').textContent === title);"
CLICK = "const click = (n, opts = {}) => n.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, ...opts }));"
BAR = "const bar = b => [...doc.getElementById('bar').querySelectorAll('button')].find(x => x.textContent.startsWith(b));"
MENU = "const pickMenu = l => [...doc.querySelectorAll('#menu .item')].find(i => i.textContent.startsWith(l)).click();"
H = PAGE + ROW + CLICK + BAR + MENU

res = {}
import atexit
atexit.register(lambda: print(json.dumps(res, indent=1, ensure_ascii=False)))
with Scene() as z:
    res["setup"] = z.js("""const b = arguments[0], W = gZenWorkspaces;
      Services.prefs.clearUserPref('zenith.plus.unpinned-groups');
      for (const n of ['a', 'b', 'a', 'c', 'd']) { zth.open(b + '/page?n=' + n); await zth.sleep(350); }
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      window.zthHome = W.activeWorkspace; window.zthWork = W.getWorkspaces().find(w => w.uuid !== zthHome).uuid;
      gBrowser.pinTab(gBrowser.visibleTabs.find(t => t.label === 'Test page c')); await zth.sleep(300);
      document.getElementById('zenith-tabs-command').doCommand(); await zth.sleep(1500);
      """ + PAGE + """
      pw.ZenithTabsPage.state.view = 'spaces'; pw.ZenithTabsPage.render(); await zth.sleep(200);
      return { page: !!P, url: P?.linkedBrowser.currentURI.spec, system: P?.linkedBrowser.contentPrincipal?.isSystemPrincipal, title: doc?.title,
               'tick boxes': doc.querySelectorAll('.tab input.pick').length };""", z.base)

    res["columns"] = z.js(H + """
      return [...doc.querySelectorAll('.space')].map(s => [s.querySelector('header .name').textContent,
        [...s.querySelectorAll('.part, .tab .title, .folder .head .name')].map(n => n.textContent)]);""")
    res["again: goes back to it"] = z.js("""const n = gBrowser.tabs.length;
      gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'Test page b'); await zth.sleep(200);
      document.getElementById('zenith-tabs-command').doCommand(); await zth.sleep(600);
      return [gBrowser.tabs.length === n, gBrowser.selectedTab.linkedBrowser.currentURI.spec];""")

    res["pick and move (pinned stays pinned)"] = z.js(H + """
      click(row('Test page b')); click(row('Test page c')); await zth.sleep(200);
      const out = { picked: doc.querySelectorAll('.tab[picked]').length, ticked: doc.querySelectorAll('.tab input.pick:checked').length };
      bar('Move to').click(); await zth.sleep(100); pickMenu('Work'); await zth.sleep(800);
      const c = gZenWorkspaces.allStoredTabs.find(t => t.label === 'Test page c');
      out['in Work'] = gZenWorkspaces.allStoredTabs.filter(t => t.getAttribute('zen-workspace-id') === zthWork).map(t => t.label + (t.pinned ? '^' : ''));
      out['undo offered'] = doc.getElementById('note').textContent;
      doc.getElementById('note').querySelector('button').click(); await zth.sleep(800);
      out['after Undo, in Work'] = gZenWorkspaces.allStoredTabs.filter(t => t.getAttribute('zen-workspace-id') === zthWork).map(t => t.label);
      out['c pinned again at home'] = [c.pinned, c.getAttribute('zen-workspace-id') === zthHome];
      return out;""")

    res["folder, take out, undo"] = z.js(H + """
      pw.ZenithTabsPage.state.picked.clear(); click(row('Test page d')); await zth.sleep(100);
      bar('Into').click(); await zth.sleep(100); pickMenu('New folder');
      const input = doc.getElementById('bar').querySelector('input'); input.value = 'Later';
      input.dispatchEvent(new pw.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await zth.sleep(900);
      const d = gZenWorkspaces.allStoredTabs.find(t => t.label === 'Test page d');
      const out = { 'in folder': [d.group?.label, d.pinned], 'folder shown': [...doc.querySelectorAll('.folder .head .name')].map(n => n.textContent) };
      pw.ZenithTabsPage.state.picked = new Set([d]); pw.ZenithTabsPage.render(); await zth.sleep(100);
      bar('Take out').click(); await zth.sleep(700);
      out['taken out'] = [d.group?.label ?? null, d.pinned];
      doc.getElementById('undo').click(); await zth.sleep(800);
      out['undo: back in the folder'] = [d.group?.label ?? null, d.pinned];
      return out;""")

    res["a folder that doesn't pin"] = z.js(H + """
      const a = gZenWorkspaces.allStoredTabs.find(t => t.label === 'Test page a' && !t.pinned);
      pw.ZenithTabsPage.state.picked = new Set([a]); pw.ZenithTabsPage.render(); await zth.sleep(100);
      bar('Into').click(); await zth.sleep(100);
      const items = [...doc.querySelectorAll('#menu .item')].map(i => i.textContent);
      pickMenu('New unpinned folder');
      const input = doc.getElementById('bar').querySelector('input'); input.value = 'Loose';
      input.dispatchEvent(new pw.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await zth.sleep(900);
      return { menu: items, group: [a.group?.label, a.group?.hasAttribute('zenith-unpinned')], shown: [...doc.querySelectorAll('.folder .head .kind')].map(n => n.textContent) };""")

    res["move a whole folder"] = z.js(H + """
      const folder = [...document.querySelectorAll('zen-folder')].find(f => f.label === 'Later');
      const ok = window.ZenithTabs.Act.moveFolder(folder, zthWork); await zth.sleep(900);
      const out = { moved: ok, 'its space': folder.getAttribute('zen-workspace-id') === zthWork, tabs: folder.tabs.map(t => t.getAttribute('zen-workspace-id') === zthWork) };
      window.ZenithTabs.Act.undoLast(); await zth.sleep(900);
      out['undo: home'] = folder.getAttribute('zen-workspace-id') === zthHome;
      return out;""")

    res["close keeps the page in front"] = z.js(H + """
      const b = gZenWorkspaces.allStoredTabs.find(t => t.label === 'Test page b');
      pw.ZenithTabsPage.state.picked = new Set([b]); pw.ZenithTabsPage.render(); await zth.sleep(100);
      const n = gZenWorkspaces.allStoredTabs.length;
      bar('Close').click(); await zth.sleep(600);
      const after = gZenWorkspaces.allStoredTabs.length;
      doc.getElementById('note').querySelector('button').click(); await zth.sleep(1200);
      return { tabs: [n, after, gZenWorkspaces.allStoredTabs.length], 'in front': gBrowser.selectedTab.linkedBrowser.currentURI.spec };""")

    res["tidy: ticked lists"] = z.js(H + """
      doc.querySelector('#views [data-view="tidy"]').click(); await zth.sleep(300);
      const card = [...doc.querySelectorAll('#tidy .card')].find(c => c.querySelector('h3').textContent === 'Awake');
      const ticks = card.querySelectorAll('.ticks input');
      const out = { awake: card.querySelector('.n').textContent, ticked: [...ticks].filter(i => i.checked).length };
      ticks[0].click(); await zth.sleep(300);
      const again = [...doc.querySelectorAll('#tidy .card')].find(c => c.querySelector('h3').textContent === 'Awake');
      out['after unticking one'] = [...again.querySelectorAll('.row button')].map(b => b.textContent);
      return out;""")

    res["memory"] = z.js(H + """
      doc.querySelector('#views [data-view="spaces"]').click(); await zth.sleep(200);
      pw.ZenithTabsPage.state.usage = new Map(); await pw.ZenithTabsPage.measure(); await zth.sleep(400);
      return { 'rows with memory': [...doc.querySelectorAll('.tab .use')].map(n => n.textContent).slice(0, 4), summary: doc.getElementById('summary').textContent };""")

    res["rules: folder and group"] = z.js(H + """
      doc.querySelector('#views [data-view="rules"]').click(); await zth.sleep(200);
      const kinds = () => [...doc.querySelectorAll('.rule select')].map(s => [...s.options].map(o => o.value).join('/')).slice(0, 4);
      window.ZenithTabs.Rules.save([{ id: 'r1', on: true, match: 'site', value: '127.0.0.1', space: '', kind: 'group', folder: '', name: 'Local' }]); await zth.sleep(300);
      const out = { editor: kinds() };
      zth.open(arguments[0] + '/page?n=grouped'); await zth.sleep(1800);
      const t = gZenWorkspaces.allStoredTabs.find(x => x.label === 'Test page grouped');
      out['went to'] = [t?.group?.label, t?.group?.hasAttribute('zenith-unpinned')];
      window.ZenithTabs.Rules.save([]);
      return out;""", z.base)

    res["on their own"] = z.js("""
      const A = window.ZenithTabs.Auto, L = window.ZenithTabs.Look;
      const out = { 'never: sleeps': A.sleep(), 'never: closes': A.close() };
      const loose = L.tabs().filter(t => !t.pinned && !L.ownGroup(t) && !t.selected && !t.hasAttribute('zen-essential')).slice(0, 2);
      for (const t of loose) t.updateLastAccessed(Date.now() - 8 * 86400000);
      Services.prefs.setStringPref('zenith.plus.tabs-auto-close', '7');
      out['7 days: closed'] = A.close(); await zth.sleep(300);
      for (const p of ['zenith.plus.tabs-auto-sleep', 'zenith.plus.tabs-auto-close', 'zenith.internal.tabs.auto-closed']) Services.prefs.clearUserPref(p);
      return out;""")
    res["page errors"] = z.js("""return Services.console.getMessageArray().filter(m => { try { m.QueryInterface(Ci.nsIScriptError); return /tab-manager|zenith-tabs/.test(m.sourceName + m.errorMessage) && !(m.flags & 1); } catch { return false; } })
      .map(m => `${m.sourceName.split('/').pop()}:${m.lineNumber} ${m.errorMessage}`.slice(0, 200)).slice(-5);""")
    res["css errors"] = z.console_errors()
