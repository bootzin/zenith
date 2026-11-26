"""0.18.3, inside Zen: progress without Motion's easing; a bar's tabs
dragged; a hiding bar centred; the layout module's list; where a new tab
opens; Peek over its tab only, away on another tab, the keys back after;
the compact sidebar between the bars; a Glance's tab marked in the bar; no
mark for a changed title; the overview's close; the start page handing
over to the address bar; unloading to an awake tab; the scroller (new
column beside yours, nothing left over on another space, splits kept).
Screenshots in argv[1]."""
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
  window.zpage = n => `data:text/html,<title>${n}</title><body style="background:%23345;color:white">page ${n} <a id=a href="https://example.com/">a link</a>`;
  window.zr = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  // A clean space: its loose tabs closed, n new ones (the first selected).
  window.zfresh = async (n = 3, layout = 'dwindle') => { window.ZenithLayouts.set('dwindle'); await zth.sleep(300); while (gZenViewSplitter._data.length) gZenViewSplitter.removeGroup(0);
    const keep = zopen('about:blank'); gBrowser.selectedTab = keep; await zth.sleep(300);
    for (const t of [...gBrowser.tabs]) if (!t.pinned && !t.hasAttribute('zen-essential') && t !== keep && t.getAttribute('zen-workspace-id') === keep.getAttribute('zen-workspace-id')) gBrowser.removeTab(t, { animate: false });
    window.zT = []; for (let i = 0; i < n; i++) zT.push(zopen(zpage('t' + i))); await zth.sleep(1500);
    gBrowser.selectedTab = zT[0]; gBrowser.removeTab(keep, { animate: false }); await zth.sleep(400); window.ZenithLayouts.set(layout); await zth.sleep(800); };
  window.zorder = () => gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-essential') && !t.hasAttribute('zen-empty-tab')).map(t => t.label);
  return !!window.ZenithLayouts"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); await SessionStore.promiseAllWindowsRestored; await zth.sleep(2500); return 1")
    say("setup", z.js(SETUP))
    z.js("P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.top.modules', 'launcher,layout,tabs|clock|downloads,power'); await zth.sleep(1500); return 1")

    if part("progress"):
        say("progress ignores the easing (bouncy chosen)", z.js(r"""P.setStringPref('zenith.motion.easing', 'bouncy'); await zth.sleep(500);
          const bar = document.getElementById('zen-loading-progress-bar'); const c = bar && getComputedStyle(bar);
          const out = { 'progress token': getComputedStyle(document.documentElement).getPropertyValue('--zth-ease-progress').trim(), 'load bar curve': c?.transitionTimingFunction ?? 'no bar' };
          P.clearUserPref('zenith.motion.easing'); return out"""))

    if part("tabs"):
        z.js("P.setStringPref('zenith.bar.tab-crowd', 'shrink'); P.setStringPref('zenith.bar.tab-look', 'titles'); await zfresh(4); return 1")
        say("bar tabs before", z.js("return [...document.querySelectorAll('#zenith-bar .zb-task:not(.zb-task-more)')].map(b => b.title)"))
        say("a bar tab dropped after the last", z.js(r"""const items = [...document.querySelectorAll('#zenith-bar .zb-task:not(.zb-task-more)')];
          const from = items[0], to = items.at(-1), dt = new DataTransfer(); dt.mozSetDataAt('application/x-moz-tabbrowser-tab', from.zbTab, 0);
          const r = to.getBoundingClientRect(), at = { bubbles: true, cancelable: true, clientX: r.right - 3, clientY: r.top + r.height / 2, dataTransfer: dt };
          to.dispatchEvent(new DragEvent('dragover', at)); const marked = to.getAttribute('drop'); to.dispatchEvent(new DragEvent('drop', at)); await zth.sleep(500);
          return { marked, sidebar: zorder() }"""))
        say("a Glance's tab marked in the bar", z.js(r"""gBrowser.selectedTab = zT[1]; await zth.sleep(400);
          gZenGlanceManager.openGlance({ url: 'https://example.com/', triggeringPrincipal: sys, clientX: 300, clientY: 300, width: 10, height: 10 }); await zth.sleep(2500);
          const sel = gBrowser.selectedTab, cur = document.querySelector('#zenith-bar .zb-task[current]');
          const out = { 'glance selected': sel.hasAttribute('zen-glance-tab'), 'bar marks': cur?.title ?? 'nothing', parent: zT[1].label };
          await gZenGlanceManager.closeGlance?.({ onTabClose: false }); await zth.sleep(1200); return out"""))
        say("a changed title has no mark", z.js(r"""const t = zT[2]; t.setAttribute('titlechanged', 'true'); await zth.sleep(400);
          const b = [...document.querySelectorAll('#zenith-bar .zb-task')].find(x => x.zbTab === t);
          const icon = t.querySelector('.tab-icon-stack'), after = icon && getComputedStyle(icon, '::after');
          const out = { 'bar mark': b?.hasAttribute('attention'), 'sidebar dot': after ? after.content !== 'none' && after.display !== 'none' : null, 'firefox dot': getComputedStyle(t.querySelector('.tab-content')).backgroundImage };
          t.removeAttribute('titlechanged'); return out"""))

    if part("layout"):
        say("the layout module's list", z.js(r"""const m = document.querySelector('#zenith-bar .zb-mod[mod="layout"]'); m.click(); await zth.sleep(600);
          const rows = [...document.querySelectorAll('.zs-pop .zs-row')].map(r => r.textContent.trim()); const master = [...document.querySelectorAll('.zs-pop .zs-row')].find(r => /Master/.test(r.textContent));
          master?.click(); await zth.sleep(600); const now = window.ZenithLayouts.of(); window.ZenithLayouts.set('dwindle'); return { rows, 'picked': now }"""))

    if part("newtab"):
        z.js("await zfresh(3); gBrowser.selectedTab = zT[1]; await zth.sleep(400); return 1")
        res = {}
        for where in ["start", "end", "before", "after"]:
            res[where] = z.js(r"""P.setStringPref('zenith.tabs.new-tab', arguments[0]); await zth.sleep(200); const t = zopen(zpage('new-' + arguments[0])); await zth.sleep(800);
              const order = zorder(); gBrowser.removeTab(t, { animate: false }); await zth.sleep(300); return order.join(' ')""", where)
        res["zen's own"] = z.js("return { 'new tab button top': P.getBoolPref('zen.view.show-newtab-button-top'), 'after current': P.getBoolPref('browser.tabs.insertAfterCurrent') }")
        z.js("P.setStringPref('zenith.tabs.new-tab', 'start'); return 1")
        say("new tab (on t1)", res)

    if part("peek"):
        z.js("await zfresh(2); gBrowser.selectedTab = zT[0]; await zth.sleep(600); window.ZenithPeek.open('https://example.com/'); await zth.sleep(2500); return 1")
        say("Peek over its tab", z.js(r"""const h = document.getElementById('zen-glance-detached'), box = gBrowser.selectedBrowser.closest('.browserSidebarContainer');
          return { host: zr(h), page: zr(box), bar: zr(document.getElementById('zenith-bar')), z: h && getComputedStyle(h).zIndex }"""))
        z.screenshot(str(OUT / "a-peek.png"))
        say("Peek on another tab", z.js(r"""gBrowser.selectedTab = zT[1]; await zth.sleep(600); const h = document.getElementById('zen-glance-detached');
          const away = h?.hasAttribute('zenith-away') && getComputedStyle(h).visibility; gBrowser.selectedTab = zT[0]; await zth.sleep(600);
          return { away, back: h && getComputedStyle(h).visibility }"""))
        say("keys after Peek closes", z.js(r"""window.ZenithPeek.close?.() ?? gZenGlanceManager.closeDetachedGlance(); await zth.sleep(1500);
          const f = Services.focus.focusedElement; return { open: !!gZenGlanceManager.detachedBrowser, focused: f === gBrowser.selectedBrowser ? 'the page' : f?.localName ?? 'nothing' }"""))

    if part("bars"):
        say("a hiding bar 80% long, centred", z.js(r"""P.setStringPref('zenith.bar.display-top', 'hide'); P.setStringPref('zenith.bar.length', '80'); await zth.sleep(1500);
          const b = document.getElementById('zenith-bar'); const r = zr(b); const out = { bar: r, window: innerWidth, 'left gap': r[0], 'right gap': innerWidth - r[2] };
          P.clearUserPref('zenith.bar.display-top'); P.clearUserPref('zenith.bar.length'); await zth.sleep(1200); return out"""))
        say("compact sidebar between the bars", z.js(r"""P.setStringPref('zenith.bar.bottom', 'on'); await zth.sleep(1500); const root = document.documentElement, had = root.getAttribute('zen-compact-mode');
          root.setAttribute('zen-compact-mode', 'true'); await zth.sleep(300); const tb = document.getElementById('navigator-toolbox'), c = getComputedStyle(tb);
          const out = { room: root.hasAttribute('zenith-bar-room'), top: c.top, bottom: c.bottom, 'top bar': zr(document.getElementById('zenith-bar')), 'bottom bar': zr(document.getElementById('zenith-bar-bottom')) };
          if (had === null) root.removeAttribute('zen-compact-mode'); else root.setAttribute('zen-compact-mode', had); P.setStringPref('zenith.bar.bottom', 'off'); return out"""))

    if part("downloads"):
        say("a finished download stays until looked at", z.js(r"""const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
          const list = await Downloads.getList(Downloads.ALL), path = PathUtils.join(PathUtils.tempDir, 'zenith-r97.txt');
          const d = await Downloads.createDownload({ source: 'data:text/plain,zenith', target: path }); await list.add(d); await d.start(); await zth.sleep(6000);
          const m = document.querySelector('#zenith-bar .zb-mod[mod="downloads"]'); const after = { shown: !m.hidden, unseen: m.hasAttribute('unseen'), title: m.title };
          m.click(); await zth.sleep(600); const clicked = { 'list open': !!document.querySelector('.zs-pop'), shown: !m.hidden };
          document.documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await zth.sleep(600);
          clicked['after the list closed'] = { shown: !m.hidden, unseen: m.hasAttribute('unseen') }; await list.remove(d); await d.finalize(true); return { 'six seconds after': after, 'after a click': clicked }"""))

    if part("overview"):
        say("overview: close button, a click outside", z.js(r"""window.ZenithOverview.toggle(); await zth.sleep(900); const host = document.getElementById('zenith-overview');
          const button = !!host?.querySelector('.zo-close'); const body = host.querySelector('.zo-body'), r = body.getBoundingClientRect();
          body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + 5, clientY: r.bottom - 5 })); await zth.sleep(500);
          return { button, 'closed by the click': !document.getElementById('zenith-overview')?.hasAttribute('open') }"""))

    if part("start"):
        say("start page hands over to the address bar", z.js(r"""gBrowser.selectedTab = gBrowser.addTab('about:zenith-start', { triggeringPrincipal: sys }); await zth.sleep(2500);
          const d = gBrowser.selectedBrowser.contentDocument, q = d?.getElementById('q'); if (!q) return 'no start page';
          q.value = '42'; q.dispatchEvent(new d.defaultView.InputEvent('input', { bubbles: true })); await zth.sleep(800);
          const out = { 'box after': q.value, 'address bar': gURLBar.value, focused: gURLBar.focused, 'results open': gURLBar.view?.isOpen ?? null };
          gURLBar.handleRevert?.(); gBrowser.removeTab(gBrowser.selectedTab); return out"""))

    if part("unload"):
        say("unloading the tab you're on", z.js(r"""await zfresh(4); for (const t of zT) { gBrowser.selectedTab = t; await zth.sleep(500); }
          gBrowser.selectedTab = zT[0]; await zth.sleep(400); gBrowser.discardBrowser(zT[1]); await zth.sleep(400);
          await gBrowser.explicitUnloadTabs([zT[0]]); await zth.sleep(800); return { now: gBrowser.selectedTab.label, 't1 still asleep': zT[1].hasAttribute('pending') || !zT[1].linkedPanel }"""))

    if part("scroller"):
        z.js(r"""await zfresh(3); const S = gZenViewSplitter; S.splitTabs([zT[0], zT[1], zT[2]], 'vsep', 0); await zth.sleep(800);
          const d = S._data.find(x => x.tabs.includes(zT[0])); window.ZenithLayouts.build(d, ['row', [zT[0], ['column', [zT[1], zT[2]], [50, 50]]], [50, 50]]); await zth.sleep(800); return 1""")
        shape = r"""const d = gZenViewSplitter._data.find(x => x.tabs.includes(zT[0])); if (!d) return 'no split'; const s = n => n.tab ? n.tab.label : n.direction + '(' + n.children.map(s).join(',') + ')'; return s(d.layoutTree)"""
        say("a stacked split", z.js(shape))
        z.js("window.ZenithLayouts.set('scroller'); await zth.sleep(1500); return 1")
        say("new column from t0", z.js(r"""gBrowser.selectedTab = zT[0]; await zth.sleep(500); const t = gBrowser.addTab(zpage('new'), { triggeringPrincipal: sys }); gBrowser.selectedTab = t; await zth.sleep(1500);
          const d = gZenViewSplitter._data.find(x => x.tabs.includes(t)); window.zNew = t; return d ? window.ZenithLayouts.order(d).map(x => x.label) : 'not on the strip'"""))
        say("another space, nothing left over", z.js(r"""const W = gZenWorkspaces; if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Other', undefined, true); await zth.sleep(800); }
          const here = W.activeWorkspace, other = W.getWorkspaces().find(s => s.uuid !== here);
          // (A column sent there: the rest of the strip stays.)
          const sent = zT[2]; W.moveTabsToWorkspace([sent], other.uuid); await zth.sleep(1000);
          const stays = gZenViewSplitter._data.find(x => x.tabs.includes(zT[0]))?.tabs.map(t => t.label) ?? [];
          await W.changeWorkspaceWithID(other.uuid); await zth.sleep(1500); if (gBrowser.selectedTab !== sent) { gBrowser.selectedTab = sent; await zth.sleep(800); }
          const p = gBrowser.tabpanels; const out = { 'strip after sending t2 away': stays, on: gBrowser.selectedTab.label, 'strip mark': p.hasAttribute('zenith-scroller'), shift: p.style.getPropertyValue('--zth-strip-x') || 'none', page: zr(gBrowser.selectedBrowser.closest('.browserSidebarContainer')) };
          W.moveTabsToWorkspace([sent], here); await zth.sleep(800); await W.changeWorkspaceWithID(here); await zth.sleep(1500); gBrowser.selectedTab = zT[0]; await zth.sleep(1000);
          out['back: strip mark'] = p.hasAttribute('zenith-scroller'); out['back: strip'] = gZenViewSplitter._data.find(x => x.tabs.includes(zT[0]))?.tabs.map(t => t.label) ?? []; return out"""))
        z.js("gBrowser.removeTab(window.zNew, { animate: false }); await zth.sleep(500); window.ZenithLayouts.set('dwindle'); await zth.sleep(1500); return 1")
        say("back to dwindle: the stacked split", z.js(shape))
