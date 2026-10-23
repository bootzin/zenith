"""0.16.0, inside Zen: layouts per space (dwindle, master both ways, the
scroller's strip, monocle; Alt+Y; the bar's module), the overview (its
three looks, pictures, finding, going, dragging to a space, the hot
corner), the rice file (read, variables, binds, written back, locked,
exported), the launcher's dmenu and grid, about:zenith-fetch, Ctrl+L in a
Peek. Screenshots go to argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


KEYS = r"""
const wu = window.windowUtils, P = (window.P = Services.prefs);
window.zset = async o => { for (const [k, v] of Object.entries(o)) { if (v === null) P.clearUserPref(k); else if (typeof v === 'boolean') P.setBoolPref(k, v); else if (typeof v === 'number') P.setIntPref(k, v); else P.setStringPref(k, v); }
  await zth.sleep(500); await window.ZenithBar?.ready; await zth.sleep(450); };
window.zbox = el => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
window.zesc = async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(250); };
window.zmove = async (x, y) => { const dpr = devicePixelRatio; await new Promise(r => { const t = setTimeout(r, 400);
  wu.sendNativeMouseEvent(Math.round((mozInnerScreenX + x) * dpr), Math.round((mozInnerScreenY + y) * dpr), wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, null, { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(650); };
// A split's tree, short: (row 55 [a] (column 45 [b] [c])).
window.ztree = tab => { const d = gZenViewSplitter._data.find(x => x.tabs.includes(tab)); if (!d) return 'no split';
  const f = n => n.tab ? `[${n.tab.label.replace('Test page ', '')} ${Math.round(n.sizeInParent)}]` : `(${n.direction} ${Math.round(n.sizeInParent ?? 100)} ${n.children.map(f).join(' ')})`; return f(d.layoutTree); };
window.zopen = n => zth.open(window.zBase + '/page?n=' + n);
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1300, 700); window.moveTo(30, 20); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("window.zBase = arguments[0]; for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); P.clearUserPref('zenith.internal.float.kept'); P.clearUserPref('zenith.internal.layout.spaces'); return 1", z.base)

    say("master and stack", z.js(r"""const L = window.ZenithLayouts, T = window.ZenithShell.tiler, a = zopen('a'); gBrowser.selectedTab = a; await zth.sleep(1200);
      L.set('master'); await zth.sleep(300); const out = { layout: L.of() };
      T.link(zBase + '/page?n=b', null, a.linkedBrowser); await zth.sleep(1200); T.link(zBase + '/page?n=c', null, gBrowser.selectedTab.linkedBrowser); await zth.sleep(1200);
      T.link(zBase + '/page?n=d', null, gBrowser.selectedTab.linkedBrowser); await zth.sleep(1500); out['four tiles'] = ztree(a);
      L.action(); await zth.sleep(800); out['the tile you\'re on made master'] = ztree(a);
      await zset({ 'zenith.shell.master': 'centred' }); await zth.sleep(800); out.centred = ztree(a);
      await zset({ 'zenith.shell.master': null, 'zenith.shell.master-ratio': '65' }); await zth.sleep(800); out['65%'] = ztree(a);
      await zset({ 'zenith.shell.master-ratio': null }); window.zA = a; return out;"""))
    z.screenshot(str(OUT / "master.png"))

    say("the scroller", z.js(r"""const L = window.ZenithLayouts, T = window.ZenithShell.tiler, shown = () => { const d = gZenViewSplitter._data.find(x => x.tabs.includes(gBrowser.selectedTab));
        return d ? d.tabs.map(t => t.label.replace('Test page ', '')).join(' ') + ' · on ' + gBrowser.selectedTab.label.replace('Test page ', '') : 'alone: ' + gBrowser.selectedTab.label.replace('Test page ', ''); };
      L.set('scroller'); await zth.sleep(1200); const out = { start: shown(), strip: L.strip(L.space()).cols.map(c => c.tab.label.replace('Test page ', '') + ' ' + Math.round(c.w)).join(', ') };
      T.link(zBase + '/page?n=e', null, gBrowser.selectedTab.linkedBrowser); await zth.sleep(1500); out['a new column'] = shown();
      T.focus('left'); await zth.sleep(900); out['Alt+H'] = shown(); T.focus('left'); await zth.sleep(900); out['Alt+H again'] = shown();
      T.focus('left'); await zth.sleep(900); out['and again'] = shown();
      L.action(); await zth.sleep(900); out['width: two thirds'] = shown(); L.action(); await zth.sleep(900); out['width: all'] = shown();
      T.move('right'); await zth.sleep(900); out['Alt+Shift+L'] = L.strip(L.space()).cols.map(c => c.tab.label.replace('Test page ', '')).join(' ');
      return out;"""))
    z.screenshot(str(OUT / "scroller.png"))

    say("monocle, Alt+Y and the bar's module", z.js(r"""const L = window.ZenithLayouts, T = window.ZenithShell.tiler; await zset({ 'zenith.bar.top': 'on', 'zenith.bar.top.modules': 'spaces,layout|title|clock' });
      L.set('dwindle'); await zth.sleep(600); const d = gZenViewSplitter._data.find(x => x.tabs.includes(gBrowser.selectedTab)); const out = {};
      if (!d) { gZenViewSplitter.splitTabs([zA, gBrowser.tabs.find(t => t.label.endsWith(' b'))], 'vsep', 0); await zth.sleep(900); }
      L.set('monocle'); await zth.sleep(600); out.monocle = { solo: gBrowser.tabpanels.hasAttribute('zenith-solo'), on: gBrowser.selectedTab.label };
      T.focus('right'); await zth.sleep(600); out['Alt+L'] = { on: gBrowser.selectedTab.label, solo: gBrowser.tabpanels.hasAttribute('zenith-solo') };
      window.ZenithShell.keys.run('layout'); await zth.sleep(500); out['Alt+Y'] = L.of(); out.module = document.querySelector('#zenith-bar [mod="layout"]')?.textContent;
      out['monocle off'] = !gBrowser.tabpanels.hasAttribute('zenith-solo'); window.ZenithShell.keys.run('layout'); window.ZenithShell.keys.run('layout'); await zth.sleep(500); out['back to'] = L.of();
      return out;"""))

    say("the overview", z.js(r"""const O = window.ZenithOverview; await O.toggle(); await zth.sleep(1500); const host = document.getElementById('zenith-overview'), out = {};
      out.open = !!host; out.look = host?.getAttribute('look'); out.cards = host?.querySelectorAll('.zo-card').length; out.spaces = host?.querySelectorAll('.zo-space').length;
      out.pictures = [...host.querySelectorAll('.zo-pic')].filter(p => p.style.backgroundImage).length;
      const f = host.querySelector('.zo-find'); f.value = 'page b'; f.dispatchEvent(new Event('input')); await zth.sleep(300); out['find "page b"'] = host.querySelectorAll('.zo-card').length;
      f.value = ''; f.dispatchEvent(new Event('input')); await zth.sleep(300); window.zOverShot = 1; return out;"""))
    z.screenshot(str(OUT / "overview-space.png"))
    say("the overview goes to a tab", z.js(r"""const host = document.getElementById('zenith-overview'); const card = [...host.querySelectorAll('.zo-card')].find(c => !c.hasAttribute('current'));
      const tab = card.zoTab; card.click(); await zth.sleep(700); return { gone: !document.getElementById('zenith-overview'), selected: gBrowser.selectedTab === tab };"""))
    say("the overview's other looks", z.js(r"""const O = window.ZenithOverview, out = {};
      await zset({ 'zenith.overview.look': 'all' }); await O.toggle(); await zth.sleep(1200); out.all = { rows: document.querySelectorAll('#zenith-overview .zo-row').length, cards: document.querySelectorAll('#zenith-overview .zo-card').length };
      window.zShotAll = 1; return out;"""))
    z.screenshot(str(OUT / "overview-all.png"))
    say("the overview: tiles", z.js(r"""const O = window.ZenithOverview; await O.toggle(); await zth.sleep(400); await zset({ 'zenith.overview.look': 'tiles' }); await O.toggle(); await zth.sleep(1500);
      const host = document.getElementById('zenith-overview'); const split = host.querySelector('.zo-split'); return { 'split cards': host.querySelectorAll('.zo-split').length, tiles: split?.querySelectorAll('.zo-tile').length,
        'pictures in tiles': split ? [...split.querySelectorAll('.zo-tile')].filter(t => t.style.backgroundImage).length : 0 };"""))
    z.screenshot(str(OUT / "overview-tiles.png"))
    say("the overview: drag a tab to another space", z.js(r"""const O = window.ZenithOverview; await O.toggle(); await zth.sleep(300); await zset({ 'zenith.overview.look': null });
      const W = gZenWorkspaces, first = W.activeWorkspace; let made = null; try { made = await W.createAndSaveWorkspace('Zenith overview'); } catch (e) { return 'no space: ' + e; } await zth.sleep(800);
      if (W.activeWorkspace !== first) await W.changeWorkspaceWithID(first); await zth.sleep(800);
      await O.toggle(); await zth.sleep(1000); const host = document.getElementById('zenith-overview'); const card = [...host.querySelectorAll('.zo-card')].find(c => !c.hasAttribute('current'));
      const tab = card.zoTab, chip = [...host.querySelectorAll('.zo-space')].find(c => c.textContent.includes('Zenith overview')), dt = new DataTransfer();
      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); chip.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      chip.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); await zth.sleep(900);
      const out = { moved: tab.getAttribute('zen-workspace-id') === made.uuid, 'its count': chip.isConnected ? null : host.querySelector('.zo-space:last-child .zo-count')?.textContent };
      await O.toggle(); await zth.sleep(300); try { await W.removeWorkspace(made.uuid); } catch {} return out;"""))
    say("the hot corner", z.js(r"""const spot = document.getElementById('zenith-hot-corner'); const out = { there: zbox(spot), corner: spot?.getAttribute('corner') };
      window.maximize(); await zth.sleep(1500); await zmove(1, 1); await zth.sleep(700); out['pushed into'] = !!document.getElementById('zenith-overview');
      await zmove(600, 400); if (document.getElementById('zenith-overview')) await window.ZenithOverview.toggle(); await zth.sleep(300);
      window.restore(); await zth.sleep(1200); window.resizeTo(1300, 700); window.moveTo(30, 20); await zth.sleep(800); return out;"""))

    say("the rice file", z.js(r"""const home = P.getStringPref('zenith.internal.rice.home', ''), path = PathUtils.join(home, '.config', 'zenith', 'zenith.conf');
      await IOUtils.makeDirectory(PathUtils.parent(path), { createAncestors: true });
      await IOUtils.writeUTF8(path, ['# a test rice', '$mod = ALT', '$pal = catppuccin-latte', 'palette = $pal', 'sidebar = hover',
        'bar {', '    style = strip   # flat', '    tab_look = fit', '    bottom {', '        modules = spaces | tabs | clock', '        hide = true', '    }', '}',
        'shell:layout = scroller', 'bind = $mod SHIFT, U, focus-left', 'unbind = hints', 'dash { place = top-right }', 'this is not a line'].join('\n'));
      await window.ZenithRice.reload(true); await zth.sleep(1200); const g = k => P.getPrefType(k) === P.PREF_BOOL ? P.getBoolPref(k) : P.getStringPref(k, '');
      const out = { read: ['zenith.palette', 'zenith.sidebar', 'zenith.bar.style', 'zenith.bar.tab-look', 'zenith.bar.bottom', 'zenith.bar.bottom.modules', 'zenith.bar.hide-bottom', 'zenith.shell.layout', 'zenith.dash.place', 'zenith.shell.bindings'].map(k => `${k.slice(7)}=${g(k)}`),
        errors: window.ZenithRice.m?.Rice.errors };
      P.setStringPref('zenith.bar.style', 'minimal'); await zth.sleep(1200); out['written back'] = (await IOUtils.readUTF8(path)).split('\n').find(l => l.includes('style ='));
      P.setStringPref('zenith.palette', 'nord'); await zth.sleep(1200); out['a $variable left alone'] = (await IOUtils.readUTF8(path)).split('\n').find(l => l.startsWith('palette'));
      await zset({ 'zenith.rice.mode': 'locked' }); window.ZenithLive.open({ s: { property: 'zenith.bar.style' } }); await zth.sleep(1500);
      const row = document.querySelector('.zp-row[data-prop="zenith.bar.style"]'); out.locked = { off: row?.hasAttribute('off'), why: row?.querySelector('.zp-why')?.textContent };
      window.ZenithLive.close(); await zset({ 'zenith.rice.mode': null });
      await IOUtils.remove(path); await window.ZenithRice.reload(false); await zth.sleep(800);
      out['file gone: settings back'] = { palette: P.getStringPref('zenith.palette', ''), held: P.getStringPref('zenith.internal.rice.held', '') };
      P.setStringPref('zenith.bar.size', '24'); await window.ZenithRice.export(); await zth.sleep(1200); const text = await IOUtils.readUTF8(path);
      out.exported = { lines: text.split('\n').length, 'has the bar': /bar \{[\s\S]*size = 24/.test(text), start: text.split('\n').slice(0, 3) };
      await IOUtils.remove(PathUtils.parent(PathUtils.parent(path)), { recursive: true }); await window.ZenithRice.reload(false);
      for (const k of P.getChildList('zenith.bar.')) P.clearUserPref(k); for (const k of ['zenith.palette', 'zenith.sidebar', 'zenith.shell.layout', 'zenith.dash.place', 'zenith.shell.bindings']) P.clearUserPref(k);
      await zth.sleep(800); return out;"""))

    say("the launcher's looks", z.js(r"""const S = window.ZenithSwitcher, out = {};
      for (const look of ['dmenu', 'grid']) { await zset({ 'zenith.launcher.look': look }); S.show('', 'tabs'); await zth.sleep(500); const box = document.getElementById('zenith-switcher-box'), list = document.getElementById('zenith-switcher-list');
        out[look] = { box: zbox(box), list: getComputedStyle(list).display, rows: list.children.length, 'first row': zbox(list.children[0]) }; window['zShot_' + look] = 1; if (look === 'dmenu') break; }
      return out;"""))
    z.screenshot(str(OUT / "launcher-dmenu.png"))
    z.js("window.ZenithSwitcher.hide(); return 1")
    say("the launcher: grid", z.js(r"""await zset({ 'zenith.launcher.look': 'grid' }); const S = window.ZenithSwitcher; S.show('', 'tabs'); await zth.sleep(500); const list = document.getElementById('zenith-switcher-list');
      const across = S.across(); S.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await zth.sleep(150);
      return { list: getComputedStyle(list).display, across, 'down moves a row': S.selected === across, 'tile': zbox(list.children[0]) };"""))
    z.screenshot(str(OUT / "launcher-grid.png"))
    z.js("window.ZenithSwitcher.hide(); await zset({ 'zenith.launcher.look': null }); return 1")

    say("about:zenith-fetch", z.js(r"""window.ZenithFetch.open(); await zth.sleep(3000); const b = gBrowser.selectedBrowser, d = b.contentWindow?.document ?? b.browsingContext?.window?.document;
      return { url: b.currentURI.spec, logo: d?.getElementById('logo')?.textContent.split('\n').length, lines: [...(d?.querySelectorAll('#lines dt') ?? [])].map((x, i) => `${x.textContent}: ${d.querySelectorAll('#lines dd')[i].textContent}`),
        swatches: d?.querySelectorAll('#swatches span').length };"""))
    z.screenshot(str(OUT / "fetch.png"))
    z.js("gBrowser.removeTab(gBrowser.selectedTab); return 1")

    say("Ctrl+L in a Peek", z.js(r"""await window.ZenithPeek.open(zBase + '/page?n=peeked'); await zth.sleep(2000); const b = gZenGlanceManager.detachedBrowser; if (!b) return 'no Peek';
      b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', code: 'KeyL', ctrlKey: true, bubbles: true, cancelable: true })); await zth.sleep(600);
      const out = { prompt: document.getElementById('zenith-peek-input')?.value ?? null, urlbar: gURLBar.focused }; await zesc(); await zesc(); try { gZenGlanceManager.closeDetachedGlance(); } catch {} await zth.sleep(600); return out;"""))
    z.js("P.clearUserPref('zenith.internal.layout.spaces'); for (const t of [...gBrowser.tabs]) if (t.label.startsWith('Test page')) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
