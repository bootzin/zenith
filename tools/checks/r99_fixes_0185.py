"""0.18.5, from the walkthrough of 0.16.3 to 0.18.4: the scroller as niri's
(new columns right of yours, closing back to where you came from, the view
niri's, stacked tiles, widths, centre), the start page's box with the
address bar's results, the media hub on a floating bar, the picker's glass
edge, new split tiles on one side, the full sidebar beside a split, Glance
and Peek marked on their bar tab, a bar tab dropped into a group, bars added
and removed in the picker. Screenshots in argv[1]; part names after it run
only those parts."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT.mkdir(parents=True, exist_ok=True)
ONLY = set(sys.argv[2:])


def say(name, value):
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


def part(name):
    return not ONLY or name in ONLY


SETUP = r"""window.P = Services.prefs; window.sys = Services.scriptSecurityManager.getSystemPrincipal();
  window.zopen = (u, o = {}) => gBrowser.addTab(u, { triggeringPrincipal: sys, inBackground: true, ...o });
  window.zpage = n => `data:text/html,<title>${n}</title><body style="background:%23345;color:white;font:40px sans-serif">page ${n}`;
  window.zr = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  window.L = window.ZenithLayouts; window.zbox = t => t.linkedBrowser.closest('.browserSidebarContainer');
  window.zcols = () => { const d = gZenViewSplitter._data.find(x => x.tabs.includes(gBrowser.selectedTab)); return d ? L.cols(d).map(c => c.map(t => t.label).join('/')) : []; };
  window.zview = () => { const d = gZenViewSplitter._data.find(x => x.tabs.includes(gBrowser.selectedTab)); const W = gBrowser.tabpanels.getBoundingClientRect();
    return { on: gBrowser.selectedTab.label, cols: zcols(), x: d ? L.cols(d).map(c => { const r = zbox(c[0]).getBoundingClientRect(); return [Math.round(r.left - W.left), Math.round(r.width)]; }) : [] }; };
  return !!window.ZenithLayouts"""

with Scene(headless=True) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); await SessionStore.promiseAllWindowsRestored; await zth.sleep(3500); return 1")
    say("setup", z.js(SETUP))

    if part("scroller"):
        z.js(r"""for (const t of gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-essential') && t !== gBrowser.selectedTab)) gBrowser.removeTab(t);
          const a = gBrowser.selectedTab; a.linkedBrowser.loadURI(Services.io.newURI(zpage('A')), { triggeringPrincipal: sys }); await zth.sleep(600);
          P.setStringPref('zenith.shell.scroller-focus', 'view'); P.setStringPref('zenith.shell.scroller-width', 'half'); L.set('scroller'); await zth.sleep(800); return 1""")
        say("new columns right of yours (B, C in the background from A: in that order)", z.js(r"""const b = zopen(zpage('B')); await zth.sleep(300); const dbg = { burst: L.burst && `${L.burst.from.label}>${L.burst.tab.label}`, sel: gBrowser.selectedTab.label, cols: zcols() }; const c = zopen(zpage('C')); dbg.fresh = JSON.stringify(Object.fromEntries([['after', L.fresh.get(c)?.after?.label], ['from', L.fresh.get(c)?.from?.label]])); await zth.sleep(1500);
          return { ...zview(), dbg }"""))
        say("a new tab from A, then closed at once: back to A", z.js(r"""gBrowser.selectedTab = gBrowser.addTab(zpage('N'), { triggeringPrincipal: sys }); await zth.sleep(1500);
          const out = { opened: zview() }; gBrowser.removeTab(gBrowser.selectedTab); await zth.sleep(1200); out.closed = zview(); return out"""))
        say("closing a column you went to: the one on its right", z.js(r"""const t = gBrowser.visibleTabs.find(t => t.label === 'B'); gBrowser.selectedTab = t; await zth.sleep(700);
          const D = zopen(zpage('D')); await zth.sleep(1200); gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'C'); await zth.sleep(700); gBrowser.selectedTab = t; await zth.sleep(700);
          gBrowser.removeTab(t); await zth.sleep(1200); return zview()"""))
        z.screenshot(str(OUT / "a-strip.png"))
        say("stacked: Alt+[ then Alt+.", z.js(r"""gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'C'); await zth.sleep(700); L.consumeOrExpel('left'); await zth.sleep(900);
          const out = { joined: zview(), tops: L.cols(gZenViewSplitter._data.find(x => x.tabs.includes(gBrowser.selectedTab))).map(c => c.map(t => zr(zbox(t))[1])) };
          L.expel(); await zth.sleep(900); out.expelled = zview(); return out"""))
        z.js("gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'A'); await zth.sleep(500); L.consumeOrExpel('right'); await zth.sleep(900); return 1")
        z.screenshot(str(OUT / "b-stacked.png"))
        say("widths: Alt+Shift+Y, Alt+F, Alt+C, resize", z.js(r"""const out = {}; L.expel(); await zth.sleep(600); gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'A'); await zth.sleep(600);
          L.action(); await zth.sleep(600); out['two thirds'] = zview().x; L.maximize(); await zth.sleep(600); out.full = zview().x; L.maximize(); await zth.sleep(600);
          L.centre(); await zth.sleep(600); out.centred = zview().x; L.resize('left'); await zth.sleep(600); out['a tenth less'] = zview().x; L.even(); await zth.sleep(600); out.even = zview().x;
          out.cols = zcols(); return out"""))
        say("focus and move", z.js(r"""const out = {}; L.focus('right'); await zth.sleep(600); out.right = zview(); L.move('left'); await zth.sleep(700); out['moved left'] = zview();
          P.setStringPref('zenith.shell.scroller-focus', 'centre'); L.focus('right'); await zth.sleep(700); out['centre mode'] = zview(); P.setStringPref('zenith.shell.scroller-focus', 'view'); return out"""))

    if part("start"):
        z.js("P.setBoolPref('zenith.plus.startpage', true); gBrowser.selectedTab = gBrowser.addTab('about:zenith-start', { triggeringPrincipal: sys }); await zth.sleep(2500); return 1")
        say("start page: typing shows the address bar's results under its box", z.js((r"""const d = gBrowser.selectedBrowser.contentDocument; if (!d) return 'no document';
          zopen('' + z_base + '/music'); await zth.sleep(1500); const q = d.getElementById('q'); q.focus(); q.value = 'Music'; q.dispatchEvent(new d.defaultView.Event('input')); await zth.sleep(1500);
          const R = d.defaultView.ZenithStartResults; const dbg = { exposed: !!R, rows: R?.rows?.length, seq: R?.seq }; if (R) { await R.query('page'); dbg.after = R.rows.length; dbg.hidden = d.getElementById('results').hidden; dbg.error = R.error; dbg.T = R.Q ? JSON.stringify(R.Q.T).slice(0, 120) : 'no Q'; }
          const rows = [...d.querySelectorAll('#results li')].map(li => [li.querySelector('.title').textContent, li.querySelector('.what').textContent, li.getAttribute('aria-selected')]);
          const out = { dbg, 'urlbar opened?': gURLBar.view.isOpen, rows, 'box still has it': q.value, list: zr(d.getElementById('results')) ? 'shown' : 'none' };
          q.dispatchEvent(new d.defaultView.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await zth.sleep(200);
          out['after ArrowDown'] = [...d.querySelectorAll('#results li')].findIndex(li => li.getAttribute('aria-selected') === 'true');
          out.errors = Services.console.getMessageArray().map(m => m.message ?? String(m)).filter(m => /start page|UrlbarQueryContext|ProvidersManager/.test(m)).slice(-3).map(m => m.slice(0, 300)); return out""").replace("' + z_base + '", z.base)))
        z.screenshot(str(OUT / "c-start.png"))
        say("start page: the query inside the page", z.js(r"""const w = gBrowser.selectedBrowser.contentWindow; const out = {};
          try { const { UrlbarQueryContext } = w.ChromeUtils.importESModule('chrome://browser/content/urlbar/UrlbarQueryContext.mjs'); out.ctx = typeof UrlbarQueryContext;
            const { ProvidersManager } = w.ChromeUtils.importESModule('moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs'); out.pm = typeof ProvidersManager;
            const c = new UrlbarQueryContext({ searchString: 'page', trimmedSearchString: 'page', allowAutofill: false, maxResults: 8, isPrivate: false, userContextId: 0, sapName: 'urlbar', currentPage: 'about:zenith-start', formHistoryName: 'searchbar-history', prohibitRemoteResults: false });
            await ProvidersManager.getInstanceForSap('urlbar').startQuery(c, { receiveResults() {}, notify() {}, input: null }); out.n = c.results?.length; out.first = c.results?.[0]?.type;
          } catch (e) { out.err = String(e); } out.embedder = !!w.browsingContext.embedderElement; return out"""))
        say("start page: Enter on a tab's row switches to it", z.js(r"""const d = gBrowser.selectedBrowser.contentDocument, q = d.getElementById('q'), here = gBrowser.selectedTab;
          const i = [...d.querySelectorAll('#results li')].findIndex(li => li.querySelector('.what').textContent === 'Switch to tab'); if (i < 0) return 'no tab row';
          const items = d.querySelectorAll('#results li'); items[i].dispatchEvent(new d.defaultView.MouseEvent('mousemove', { bubbles: true }));
          q.dispatchEvent(new d.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await zth.sleep(1200);
          const out = { now: gBrowser.selectedTab.label, left: gBrowser.selectedTab !== here }; gBrowser.removeTab(here); return out"""))

    if part("media"):
        z.js(r"""P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.style', 'floating'); P.setStringPref('zenith.bar.top.modules', 'spaces|title|media,clock'); await zth.sleep(1500); return 1""")
        say("floating bar: music in another space", z.js(r"""const W = gZenWorkspaces, here = W.activeWorkspace; const music = zopen(zB + '/music'); await zth.sleep(2500);
          const other = await W.createAndSaveWorkspace('Other', undefined, true); await zth.sleep(600); await W.moveTabToWorkspace(music, other.uuid); await zth.sleep(600);
          if (W.activeWorkspace !== here) { await W.changeWorkspace(W.getWorkspaces().find(w => w.uuid === here)); await zth.sleep(900); }
          const noise = zopen(zB + '/audio'); await zth.sleep(2500);
          const m = document.querySelector('.zenith-bar[edge="top"] [mod="media"]'); const r = m && m.getBoundingClientRect();
          const out = { 'music playing': music.hasAttribute('soundplaying'), hub: window.ZenithMedia.list().map(s => `${s.tab.label}:${s.state}`), bar: m && !m.hidden ? m.textContent.trim() : '(hidden)',
            more: m?.getAttribute('more'), shown: !!r && r.width > 0 && getComputedStyle(m).visibility !== 'hidden', box: zr(m) };
          window.zMedia = [music, noise]; return out""".replace("zB", "'" + z.base + "'")))
        say("floating bar: Shift+wheel, middle click", z.js(r"""const m = document.querySelector('.zenith-bar[edge="top"] [mod="media"]'); if (!m) return 'no module'; const before = m.textContent.trim();
          const r = m.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
          m.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, shiftKey: true, bubbles: true, cancelable: true, clientX: x, clientY: y })); await zth.sleep(700);
          const out = { 'under the pointer': hit?.closest?.('[mod]')?.getAttribute('mod') ?? hit?.id ?? hit?.localName, before, 'after Shift+wheel': m.textContent.trim() };
          const s = window.ZenithMedia.list()[0]; m.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true, clientX: x, clientY: y })); await zth.sleep(700);
          out['middle click muted'] = s?.tab.hasAttribute('muted'); s?.tab.hasAttribute('muted') && s.tab.toggleMuteAudio(); return out"""))
        z.screenshot(str(OUT / "d-media.png"))
        say("your top bar (hiding, islands, its modules): music shown when it comes", z.js(r"""P.setStringPref('zenith.bar.style', 'bare'); P.setStringPref('zenith.bar.top.style', 'islands'); P.setStringPref('zenith.bar.media-hover', 'player');
          P.setStringPref('zenith.bar.top.modules', 'launcher,spaces,mode,title|clock,weather|media,downloads,timers,trackers,extensions,appearance,memory,power'); P.setStringPref('zenith.bar.display-top', 'hide'); await zth.sleep(1800);
          const b = document.getElementById('zenith-bar'); b?.setAttribute('holding', 'true'); await zth.sleep(900);
         const m = b?.querySelector('[mod="media"]');
          return { bar: zr(b), 'bar shown': b && getComputedStyle(b).visibility !== 'hidden' && zr(b)[3] > 4, media: m ? { text: m.textContent.trim(), hidden: m.hidden, box: zr(m), vis: getComputedStyle(m).visibility, display: getComputedStyle(m).display, more: m.getAttribute('more') } : '(no module)',
                   hub: window.ZenithMedia.list().map(s => `${s.tab.label}:${s.state}`) }"""))
        z.screenshot(str(OUT / "e-media-hiding.png"))
        z.js("document.getElementById('zenith-bar')?.removeAttribute('holding'); P.clearUserPref('zenith.bar.display-top'); return 1")

    if part("edge"):
        say("the picker's glass edge", z.js(r"""const out = {}; for (const v of ['off', 'shine', 'liquid']) { P.setStringPref('zenith.core.glass-edge', v); await zth.sleep(400);
            if (!document.getElementById('zenith-rice')) { window.ZenithShell?.keys?.run?.('rice'); await zth.sleep(1500); }
            const panel = document.querySelector('#zenith-rice .zr-panel'), pop = document.querySelector('#zenith-routing-box, .zs-pop, #urlbar .urlbar-background');
            out[v] = { picker: panel ? getComputedStyle(panel).boxShadow.slice(0, 160) : 'no picker', root: getComputedStyle(document.documentElement).getPropertyValue('--zth-glass-shine').trim().slice(0, 80) }; }
          return out"""))
        z.screenshot(str(OUT / "f-picker-liquid.png"))
        z.js("P.clearUserPref('zenith.core.glass-edge'); window.ZenithShell?.keys?.run?.('rice'); await zth.sleep(600); return 1")

    if part("sidebar"):
        say("a split, then the full sidebar opened", z.js(r"""const L0 = L.of(); L.set('dwindle'); await zth.sleep(600);
          const a = zopen(zpage('S1')), b = zopen(zpage('S2')); gBrowser.selectedTab = a; await zth.sleep(500); gZenViewSplitter.splitTabs([a, b], 'vsep', 0); await zth.sleep(1200);
          const look = () => ({ panels: zr(gBrowser.tabpanels), S1: zr(zbox(a)), S2: zr(zbox(b)), toolbox: zr(document.getElementById('navigator-toolbox')), browser: zr(document.getElementById('browser')) });
          const M = window.gZenCompactModeManager, out = { compact: M?.preference }; if (M) { M.preference = true; await zth.sleep(1200); out.compactOn = look(); M.preference = false; await zth.sleep(1500); out.compactOff = look(); }
          L.set('scroller'); await zth.sleep(1200); M.preference = true; await zth.sleep(1200); out['scroller, compact'] = zview(); M.preference = false; await zth.sleep(1500); out['scroller, full sidebar'] = { ...zview(), panels: zr(gBrowser.tabpanels) }; M.preference = true; await zth.sleep(800); L.set('dwindle'); await zth.sleep(800);
          window.zSplit = [a, b]; return out"""))
        z.screenshot(str(OUT / "g-sidebar-split.png"))

    if part("splitside"):
        say("new tiles: one side whatever the way in", z.js(r"""const out = {}; L.set('dwindle'); await zth.sleep(400); for (const d of [...gZenViewSplitter._data]) gZenViewSplitter.removeGroup(gZenViewSplitter._data.indexOf(d)); await zth.sleep(500); for (const t of gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-essential') && t !== gBrowser.selectedTab)) gBrowser.removeTab(t); await zth.sleep(600); const side = t => { const d = gZenViewSplitter._data.find(x => x.tabs.includes(t)); if (!d) return 'no split';
            const o = L.order(d); return o.map(x => x.label).join(' | '); };
          let a = zopen(zpage('G1')); gBrowser.selectedTab = a; await zth.sleep(600); let t = zopen(zpage('G2')); window.ZenithShell.tiler.insert(t, a); await zth.sleep(900); out['Alt+Shift+click from a lone tab'] = side(a);
          for (const d of [...gZenViewSplitter._data]) gZenViewSplitter.removeGroup(gZenViewSplitter._data.indexOf(d)); await zth.sleep(500); let a2 = zopen(zpage('H1')); gBrowser.selectedTab = a2; await zth.sleep(600); const g = zopen(zpage('H2')); window.ZenithShell.tiler.glanceSplit = g; gZenViewSplitter.splitTabs([g, a2], 'vsep', 0); await zth.sleep(900); out["Glance's split from a lone tab (Zen asked for it on the left)"] = side(a2);
          return out"""))

    if part("marks"):
        z.js(r"""P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.style', 'islands'); P.setStringPref('zenith.bar.top.modules', 'launcher,layout,tabs|clock|downloads,power'); P.setStringPref('zenith.bar.tab-look', 'titles'); P.setStringPref('zenith.bar.tab-crowd', 'shrink'); L.set('dwindle');
          for (const d of [...gZenViewSplitter._data]) gZenViewSplitter.removeGroup(gZenViewSplitter._data.indexOf(d)); await zth.sleep(500); 
          for (const t of gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-essential') && t !== gBrowser.selectedTab)) gBrowser.removeTab(t); await zth.sleep(1500); return 1""")
        say("Glance marked on its tab, also after leaving it", z.js(r"""const A = gBrowser.selectedTab, B = zopen(zpage('Other')); await zth.sleep(800);
          gZenGlanceManager.openGlance({ url: zpage('Glanced'), triggeringPrincipal: sys, x: 100, y: 100, width: 10, height: 10 }); await zth.sleep(2500);
          const task = t => [...document.querySelectorAll('#zenith-bar .zb-task')].find(b => b.zbTab === t);
          const out = { 'on it': task(A)?.getAttribute('over') ?? 'no mark', title: task(A)?.title };
          gBrowser.selectedTab = B; await zth.sleep(1200); out['after leaving'] = task(A)?.getAttribute('over') ?? 'no mark';
          gBrowser.selectedTab = A; await zth.sleep(1500); for (const g of gBrowser.tabs.filter(t => t.hasAttribute('zen-glance-tab'))) gBrowser.removeTab(g); await zth.sleep(1500); out.glances = gBrowser.tabs.filter(t => t.hasAttribute('zen-glance-tab')).length; out['closed'] = task(A)?.getAttribute('over') ?? 'no mark'; window.zB2 = B; return out"""))
        z.screenshot(str(OUT / "h-glance-mark.png"))
        say("Peek marked on its tab", z.js(r"""const A = gBrowser.selectedTab; window.ZenithPeek.open(zpage('Peeked')); await zth.sleep(2500);
          const task = t => [...document.querySelectorAll('#zenith-bar .zb-task')].find(b => b.zbTab === t); const out = { 'on it': task(A)?.getAttribute('over') ?? 'no mark' };
          gBrowser.selectedTab = window.zB2; await zth.sleep(1000); out['after leaving'] = task(A)?.getAttribute('over') ?? 'no mark'; gBrowser.selectedTab = A; await zth.sleep(800);
          gZenGlanceManager.closeDetachedGlance(); await zth.sleep(1200); out.closed = task(A)?.getAttribute('over') ?? 'no mark'; return out"""))
        say("a bar tab dropped into a folder", z.js(r"""const f1 = zopen(zpage('F1')), f2 = zopen(zpage('F2')), c = zopen(zpage('Cx')); await zth.sleep(800);
          const folder = gZenFolders.createFolder([f1, f2], { label: 'Folder', renameFolder: false }); await zth.sleep(1500);
          const items = [...document.querySelectorAll('#zenith-bar .zb-task:not(.zb-task-more)')], from = items.find(b => b.zbTab === c), to = items.find(b => b.zbTab === f2);
          if (!from || !to) return { bar: items.map(b => b.title), tabs: gBrowser.visibleTabs.map(t => t.label), look: P.getStringPref('zenith.bar.tab-crowd', ''), sel: gBrowser.selectedTab.label };
          const dt = new DataTransfer(); dt.mozSetDataAt('application/x-moz-tabbrowser-tab', c, 0); const r = to.getBoundingClientRect(), at = { bubbles: true, cancelable: true, clientX: r.right - 3, clientY: r.top + r.height / 2, dataTransfer: dt };
          to.dispatchEvent(new DragEvent('dragover', at)); const marked = to.getAttribute('drop'); to.dispatchEvent(new DragEvent('drop', at)); await zth.sleep(900);
          return { marked, 'in the folder': c.group === folder, 'folder holds': [...(folder.tabs ?? [])].map(t => t.label) }"""))

    if part("picker"):
        say("bars added and taken away in the picker", z.js(r"""P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.bottom', 'off'); await zth.sleep(600);
          window.ZenithShell.keys.run('rice'); await zth.sleep(1500); const nav = [...document.querySelectorAll('#zenith-rice .zr-nav button, #zenith-rice nav button')].find(b => /Bars/.test(b.textContent)); nav?.click(); await zth.sleep(700);
          const edges = () => [...document.querySelectorAll('#zenith-rice .zr-edge')].map(b => `${b.value}:${b.getAttribute('aria-pressed')}`);
          const out = { before: edges() }; document.querySelector('#zenith-rice .zr-edge[value="bottom"]')?.click(); await zth.sleep(900);
          out['bottom added'] = { edges: edges(), pref: P.getStringPref('zenith.bar.bottom', ''), bar: !!document.querySelector('.zenith-bar[edge="bottom"]'), which: [...document.querySelectorAll('#zenith-rice .zr-scope:not(:has(.zr-edge)) .zr-opt[current]')].map(b => b.textContent) };
          z_cancel: { const c = [...document.querySelectorAll('#zenith-rice button')].find(b => b.textContent.trim() === 'Cancel'); c?.click(); await zth.sleep(900); }
          out['after Cancel'] = P.getStringPref('zenith.bar.bottom', ''); return out"""))
