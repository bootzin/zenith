"""The tab manager as a page (about:zenith-tabs), checked inside Zen:
- Alt+Shift+T's command opens the page in a tab (and goes back to it the
  second time); "a card" opens the card instead;
- a column per space with its tabs (pinned and folders first), essentials
  on top, the page itself left out; search narrows them;
- picking (click, Ctrl, Shift) and the bar: move to a space, into a new
  folder, sleep, wake, close with Undo;
- tidying up picks duplicates for you;
- rules: a grouping rule puts a matching tab into a folder when it loads;
  auto-sleep and auto-close act only once set, and auto-close lists what
  it closed to bring back."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

PAGE = "const P = gBrowser.visibleTabs.find(t => t.linkedBrowser.currentURI.spec === 'about:zenith-tabs'); const doc = P?.linkedBrowser.contentDocument, pw = P?.linkedBrowser.contentWindow;"

res = {}
with Scene() as z:
    res["setup"] = z.js("""const b = arguments[0], W = gZenWorkspaces;
      for (const n of ['a', 'b', 'a', 'c']) { zth.open(b + '/page?n=' + n); await zth.sleep(400); }
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      window.zthHome = W.activeWorkspace; window.zthWork = W.getWorkspaces().find(w => w.uuid !== zthHome).uuid;
      gBrowser.pinTab(gBrowser.visibleTabs.find(t => t.label === 'Test page c')); await zth.sleep(300);
      document.getElementById('zenith-tabs-command').doCommand(); await zth.sleep(1500);
      """ + PAGE + """
      return { page: !!P, url: P?.linkedBrowser.currentURI.spec, remote: P?.linkedBrowser.isRemoteBrowser, title: doc?.title,
               system: P?.linkedBrowser.contentPrincipal?.isSystemPrincipal, errors: doc ? null : 'no document' };""", z.base)

    res["columns"] = z.js(PAGE + """
      return [...doc.querySelectorAll('.space')].map(s => [s.querySelector('header .name').textContent,
        [...s.querySelectorAll('.part, .tab .title, .folder .head .name')].map(n => n.textContent)]);""")
    res["again: goes back to it"] = z.js("""const n = gBrowser.tabs.length;
      gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'Test page b'); await zth.sleep(200);
      document.getElementById('zenith-tabs-command').doCommand(); await zth.sleep(600);
      return [gBrowser.tabs.length === n, gBrowser.selectedTab.linkedBrowser.currentURI.spec];""")

    res["search"] = z.js(PAGE + """
      const s = doc.getElementById('search'); s.value = 'page a'; s.dispatchEvent(new pw.Event('input')); await zth.sleep(300);
      const out = [...doc.querySelectorAll('.tab .title')].map(n => n.textContent);
      s.value = ''; s.dispatchEvent(new pw.Event('input')); await zth.sleep(300); return out;""")

    res["pick and move"] = z.js(PAGE + """
      const row = title => [...doc.querySelectorAll('.space .tab')].find(r => r.querySelector('.title').textContent === title);
      row('Test page b').dispatchEvent(new pw.MouseEvent('click', { bubbles: true }));
      row('Test page a').dispatchEvent(new pw.MouseEvent('click', { bubbles: true, ctrlKey: true })); await zth.sleep(200);
      const bar = doc.getElementById('bar');
      const out = { picked: doc.querySelectorAll('.tab[picked]').length, bar: bar.hidden ? 'hidden' : bar.querySelector('.count').textContent };
      // Move to… › Work
      [...bar.querySelectorAll('button')].find(b => b.textContent === 'Move to…').click(); await zth.sleep(100);
      const items = [...doc.querySelectorAll('#menu .item')].map(i => i.textContent);
      [...doc.querySelectorAll('#menu .item')].find(i => i.textContent.startsWith('Work')).click(); await zth.sleep(700);
      out['menu'] = items;
      out['now in Work'] = gZenWorkspaces.allStoredTabs.filter(t => t.getAttribute('zen-workspace-id') === zthWork).map(t => t.label);
      out['Work column'] = [...doc.querySelectorAll('.space')][1]?.querySelectorAll('.tab').length;
      return out;""")

    res["into a new folder"] = z.js(PAGE + """
      const row = [...doc.querySelectorAll('.space .tab')].find(r => r.querySelector('.title').textContent === 'Test page b');
      row.dispatchEvent(new pw.MouseEvent('click', { bubbles: true })); await zth.sleep(150);
      const bar = doc.getElementById('bar');
      [...bar.querySelectorAll('button')].find(b => b.textContent === 'Into a folder…').click(); await zth.sleep(100);
      [...doc.querySelectorAll('#menu .item')].find(i => i.textContent.startsWith('New folder')).click(); await zth.sleep(100);
      const input = bar.querySelector('input'); input.value = 'Later';
      input.dispatchEvent(new pw.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await zth.sleep(900);
      const tab = gZenWorkspaces.allStoredTabs.find(t => t.label === 'Test page b');
      return { 'in folder': tab?.group?.label, pinned: tab?.pinned, 'shown as folder': [...doc.querySelectorAll('.folder .head .name')].map(n => n.textContent) };""")

    res["sleep, wake"] = z.js(PAGE + """
      const tab = gZenWorkspaces.allStoredTabs.find(t => t.label === 'Test page a' && t.getAttribute('zen-workspace-id') === zthHome) ??
                  gBrowser.visibleTabs.find(t => t.label === 'Test page c');
      window.ZenithTabs.Act.sleep([tab]); await zth.sleep(500);
      const asleep = tab.hasAttribute('pending') || !window.ZenithTabs.Look.awake(tab);
      window.ZenithTabs.Act.wake([tab]); await zth.sleep(1500);
      return { tab: tab.label, asleep, 'awake again': window.ZenithTabs.Look.awake(tab) && !tab.hasAttribute('pending') };""")

    res["close and undo"] = z.js(PAGE + """
      const n = gZenWorkspaces.allStoredTabs.length;
      const row = [...doc.querySelectorAll('.space .tab')].find(r => !r.hasAttribute('current') && r.querySelector('.title').textContent.startsWith('Test page'));
      const title = row.querySelector('.title').textContent;
      row.dispatchEvent(new pw.MouseEvent('click', { bubbles: true })); await zth.sleep(150);
      [...doc.getElementById('bar').querySelectorAll('button')].find(b => b.textContent === 'Close').click(); await zth.sleep(600);
      const after = gZenWorkspaces.allStoredTabs.length;
      const note = doc.getElementById('note');
      note.querySelector('button')?.click(); await zth.sleep(1200);
      return { closed: title, 'tabs': [n, after, gZenWorkspaces.allStoredTabs.length], note: note.textContent };""")

    res["tidy: duplicates"] = z.js(PAGE + """
      zth.open(arguments[0] + '/page?n=c'); await zth.sleep(600);
      gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.linkedBrowser.currentURI.spec === 'about:zenith-tabs'); await zth.sleep(500);
      const card = [...doc.querySelectorAll('#tidy .card')].find(c => c.querySelector('h3').textContent === 'Duplicates');
      const n = card.querySelector('.n').textContent;
      [...card.querySelectorAll('button')].find(b => b.textContent === 'Pick them').click(); await zth.sleep(200);
      return { duplicates: n, picked: [...doc.querySelectorAll('.tab[picked] .title')].map(t => t.textContent) };""", z.base)

    res["rules page"] = z.js(PAGE + """
      doc.querySelector('#views [data-view="rules"]').click(); await zth.sleep(200);
      doc.querySelector('#rules button.primary').click(); await zth.sleep(200);
      const out = { rules: window.ZenithTabs.Rules.list.length, editor: [...doc.querySelectorAll('.rule select')].map(s => s.value) };
      const rule = window.ZenithTabs.Rules.list[0];
      rule.value = '127.0.0.1'; rule.name = 'Local'; rule.match = 'site';
      window.ZenithTabs.Rules.save([rule]); await zth.sleep(200);
      zth.open(arguments[0] + '/page?n=grouped'); await zth.sleep(1800);
      const tab = gZenWorkspaces.allStoredTabs.find(t => t.label === 'Test page grouped');
      out['opened tab went to'] = [tab?.group?.label, tab?.pinned];
      window.ZenithTabs.Rules.save([]);
      return out;""", z.base)

    res["on their own"] = z.js("""
      const A = window.ZenithTabs.Auto, L = window.ZenithTabs.Look;
      const out = { 'never: sleeps': A.sleep(), 'never: closes': A.close() };
      // Make two loose tabs look unused for a week.
      const loose = L.tabs().filter(t => !t.pinned && !t.group && !t.selected && !t.hasAttribute('zen-essential')).slice(0, 2);
      for (const t of loose) t.updateLastAccessed(Date.now() - 8 * 86400000);
      Services.prefs.setStringPref('zenith.plus.tabs-auto-sleep', '30');
      out['30 min: slept'] = A.sleep(); await zth.sleep(300);
      Services.prefs.setStringPref('zenith.plus.tabs-auto-close', '7');
      const titles = loose.map(t => t.label);
      out['7 days: closed'] = A.close(); await zth.sleep(300);
      out['listed'] = A.closedList.map(i => i.title).filter(t => titles.includes(t));
      const back = A.reopen(A.closedList[0]); await zth.sleep(800);
      out['reopened'] = !!back?.isConnected;
      for (const p of ['zenith.plus.tabs-auto-sleep', 'zenith.plus.tabs-auto-close', 'zenith.internal.tabs.auto-closed']) Services.prefs.clearUserPref(p);
      return out;""")

    res["card instead"] = z.js("""
      Services.prefs.setStringPref('zenith.plus.tab-manager-view', 'card');
      document.getElementById('zenith-tabs-command').doCommand(); await zth.sleep(400);
      const out = !document.getElementById('zenith-tabs')?.hidden;
      window.ZenithTabs.hide(); Services.prefs.clearUserPref('zenith.plus.tab-manager-view');
      return out;""")
    res["page errors"] = z.js("""return Services.console.getMessageArray().filter(m => /tab-manager|zenith-tabs/.test(m.message ?? m.errorMessage ?? '') && /rror/.test(m.message ?? m.errorMessage ?? ''))
      .map(m => (m.message ?? m.errorMessage).slice(0, 200)).slice(-5);""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
