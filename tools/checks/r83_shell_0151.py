"""0.15.1, inside Zen: bars on any edge (layouts, the old settings moved
over), a rail and a wide side bar, a bar that hides, more tabs than fit,
the power menu, the downloads popup's rows, the Dash in one place and its
tabs row, palettes from a file, and about:zenith-help (:help).
Screenshots go to argv[1]."""
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
const wu = window.windowUtils;
const VK = { N: 0x4E, Esc: 0x1B };
window.zk = async (k, mods = 'alt') => {
  const m = (mods.includes('alt') ? 0x1000 : 0) | (mods.includes('shift') ? 0x0100 : 0) | (mods.includes('ctrl') ? 0x0400 : 0);
  const ch = k.length === 1 ? k.toLowerCase() : '';
  await new Promise(r => { const t = setTimeout(r, 300); wu.sendNativeKeyEvent(0x409, VK[k], m, ch, ch, { observe() { clearTimeout(t); r(); } }); });
  await zth.sleep(350);
};
window.zset = async o => { const P = Services.prefs; for (const [k, v] of Object.entries(o)) { if (v === null) P.clearUserPref(k); else if (typeof v === 'boolean') P.setBoolPref(k, v); else P.setStringPref(k, v); }
  await zth.sleep(500); await window.ZenithBar?.ready; await zth.sleep(400); };
window.zbox = el => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
window.zbars = () => Object.fromEntries([...document.querySelectorAll('.zenith-bar')].map(b => [b.getAttribute('edge'), { box: zbox(b), vertical: b.hasAttribute('vertical'), hides: b.hasAttribute('collapsible'),
  mods: [...b.querySelectorAll('.zb-mod')].filter(m => !m.hidden).map(m => m.getAttribute('mod')) }]));
window.zesc = async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(250); };
window.zclear = () => { for (const k of ['zenith.bar.layout', 'zenith.bar.top', 'zenith.bar.bottom', 'zenith.bar.left', 'zenith.bar.right', 'zenith.bar.hide-top', 'zenith.bar.hide-bottom',
  'zenith.bar.hide-left', 'zenith.bar.hide-right', 'zenith.sidebar', 'zenith.bar.side-width', 'zenith.bar.buttons', 'zenith.bar.position', 'zenith.bar.tabs', 'zenith.palette', 'zenith.internal.palette.home',
  'zenith.internal.palette.computed', 'zenith.bar.weather', 'zenith.bar.resources']) Services.prefs.clearUserPref(k); };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); Services.prefs.clearUserPref('zenith.internal.float.kept'); zclear(); return 1")
    z.js(r"""window.zT = [zth.open(arguments[0] + '/page?n=one')]; gBrowser.selectedTab = zT[0]; await zth.sleep(1500); return 1""", z.base)

    say("old settings move over (top bar, tabs in it)", z.js(r"""Services.prefs.setStringPref('zenith.bar.position', 'top'); Services.prefs.setStringPref('zenith.bar.tabs', 'bar');
      window.ZenithBar.migrate(); const P = Services.prefs, g = k => P.getStringPref(k, '');
      return { top: g('zenith.bar.top'), bottom: g('zenith.bar.bottom'), sidebar: g('zenith.sidebar'), 'old ones gone': !P.prefHasUserValue('zenith.bar.position') && !P.prefHasUserValue('zenith.bar.tabs') };"""))
    z.js("zclear(); await zth.sleep(800); return 1")

    say("a rail on the left, status at the top, no sidebar", z.js(r"""await zset({ 'zenith.bar.top': 'status', 'zenith.bar.left': 'tabs', 'zenith.sidebar': 'hidden' }); await zth.sleep(800);
      return { bars: zbars(), sidebar: zbox(gNavToolbox), 'sidebar shown': gNavToolbox.getBoundingClientRect().width > 20 && !gZenCompactModeManager.preference };"""))
    z.screenshot(str(OUT / "rail-left.png"))
    say("the side bar, wide", z.js(r"""await zset({ 'zenith.bar.side-width': 'wide' }); await zth.sleep(500);
      const b = document.getElementById('zenith-bar-left'), t = b?.querySelector('.zb-task[current] .zb-task-label');
      return { box: zbox(b), look: b?.querySelector('[mod="tasks"]')?.getAttribute('look'), 'title shown': t ? getComputedStyle(t).display !== 'none' : null };"""))
    z.screenshot(str(OUT / "wide-left.png"))

    say("a bar that hides (right)", z.js(r"""await zset({ 'zenith.bar.left': null, 'zenith.bar.side-width': null, 'zenith.bar.right': 'status', 'zenith.bar.hide-right': true }); await zth.sleep(900);
      const b = document.getElementById('zenith-bar-right'), cs = getComputedStyle(b), out = { box: zbox(b), translate: cs.translate, position: cs.position, opacity: cs.opacity };
      b.setAttribute('holding', ''); await zth.sleep(700); out.held = { box: zbox(b), translate: getComputedStyle(b).translate, opacity: getComputedStyle(b).opacity };
      b.removeAttribute('holding'); return out;"""))
    z.screenshot(str(OUT / "hiding-right.png"))

    say("more tabs than fit (bottom)", z.js(r"""await zset({ 'zenith.bar.right': null, 'zenith.bar.hide-right': null, 'zenith.bar.bottom': 'tabs' });
      for (let i = 0; i < 40; i++) zT.push(gBrowser.addTab(arguments[0] + '/page?n=t' + i, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true, skipAnimation: true }));
      await zth.sleep(2500); gBrowser.selectedTab = zT.at(-1); await zth.sleep(800);
      const b = document.getElementById('zenith-bar-bottom'), more = b.querySelector('[mod="tasks-more"]'), cur = b.querySelector('.zb-task[current]');
      const strip = b.querySelector('[mod="tasks"]').getBoundingClientRect(), c = cur?.getBoundingClientRect();
      const out = { chip: more && !more.hidden ? more.textContent : null, 'current in view': c ? c.left >= strip.left - 1 && c.right <= strip.right + 1 : null };
      more?.click(); await zth.sleep(500); const pop = document.querySelector('.zs-pop[kind="tabs"]');
      out.rows = pop?.querySelectorAll('.zs-row').length ?? null; const f = pop?.querySelector('.zs-field');
      if (f) { f.value = 't3'; f.dispatchEvent(new Event('input', { bubbles: true })); await zth.sleep(300); out['rows for "t3"'] = [...pop.querySelectorAll('.zs-row:not([hidden])')].map(r => r.textContent.trim()); }
      window.zsTabsPop = zbox(pop); return out;""", z.base))
    z.screenshot(str(OUT / "tabs-overflow.png"))
    z.js("await zesc(); for (const t of zT.splice(1)) gBrowser.removeTab(t); await zth.sleep(600); return 1")

    say("the power menu instead of window buttons", z.js(r"""await zset({ 'zenith.bar.bottom': null, 'zenith.bar.buttons': 'power' });
      const bar = document.getElementById('zenith-bar'), p = bar?.querySelector('[mod="power"]'), out = { power: !!p, 'window buttons': !!bar?.querySelector('[mod="buttons"]') };
      p?.click(); await zth.sleep(400); const pop = document.querySelector('.zs-pop[kind="power"]');
      out.rows = pop ? [...pop.querySelectorAll('.zs-row')].map(r => r.textContent.trim()) : null; out.box = zbox(pop); return out;"""))
    z.screenshot(str(OUT / "power.png"))
    say("no window buttons at all", z.js(r"""await zesc(); await zset({ 'zenith.bar.buttons': 'nothing' }); const bar = document.getElementById('zenith-bar');
      return { power: !!bar.querySelector('[mod="power"]'), 'window buttons': !!bar.querySelector('[mod="buttons"]') };"""))

    say("downloads: a finished one opens on a click; Folder and Delete", z.js(r"""await zset({ 'zenith.bar.buttons': null });
      const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs'), target = PathUtils.join(PathUtils.tempDir, 'zenith-pop-0151.html');
      const d = await Downloads.createDownload({ source: arguments[0] + '/page?n=dl', target }); const list = await Downloads.getList(Downloads.ALL); await list.add(d); await d.start(); await zth.sleep(800);
      document.querySelector('#zenith-bar [mod="downloads"]').click(); await zth.sleep(600);
      const pop = document.querySelector('.zs-pop[kind="downloads"]'), row = pop?.querySelector('.zs-row');
      const out = { row: row?.textContent.trim().slice(0, 60), 'opens on a click': row?.hasAttribute('action'), buttons: row ? [...row.querySelectorAll('button')].map(b => b.title || b.textContent) : null };
      window.zsDl = { d, list }; return out;""", z.base))
    z.screenshot(str(OUT / "downloads.png"))
    z.js("await zesc(); await zsDl.list.remove(zsDl.d); await zsDl.d.finalize(true); try { await IOUtils.remove(zsDl.d.target.path); } catch {} return 1")

    say("the Dash opens in one place, whatever opens it", z.js(r"""const bar = document.getElementById('zenith-bar'), clock = bar.querySelector('[mod="clock"]');
      window.ZenithDash.toggle(); await zth.sleep(900); const a = zbox(document.querySelector('.zs-pop[kind="dash"]')); await zesc();
      clock.click(); await zth.sleep(900); const b = zbox(document.querySelector('.zs-pop[kind="dash"]')); await zesc();
      await zk('N'); await zth.sleep(900); const c = zbox(document.querySelector('.zs-pop[kind="dash"]'));
      return { 'from :dash': a, 'from the clock': b, 'from Alt+N': c };"""))
    z.screenshot(str(OUT / "dash.png"))
    say("the Dash's Browser card: tabs here and everywhere; a click opens the tab manager", z.js(r"""const pop = document.querySelector('.zs-pop[kind="dash"]');
      const card = [...pop.querySelectorAll('.zd-sys, [class*="zd-sys"]')][0], title = card?.querySelector('h3, .zs-title, .zd-title')?.textContent ?? card?.firstChild?.textContent;
      const row = [...card.querySelectorAll('.zs-row')].find(r => r.textContent.includes('Tabs')); await zth.sleep(2200);
      const out = { title, tabs: row?.textContent.trim(), tooltip: row?.title }; row?.click(); await zth.sleep(1500);
      out['tab manager'] = gBrowser.selectedBrowser.currentURI.spec; if (out['tab manager'].startsWith('about:zenith-tabs')) gBrowser.removeTab(gBrowser.selectedTab); return out;"""))
    z.js("await zesc(); gBrowser.selectedTab = zT[0]; return 1")

    say("a palette from pywal's file", z.js(r"""const home = PathUtils.join(PathUtils.tempDir, 'zenith-home-0151'), file = PathUtils.join(home, '.cache', 'wal', 'colors.json');
      await IOUtils.makeDirectory(PathUtils.parent(file), { createAncestors: true });
      const colors = { color0: '#101418', color1: '#d0505a', color2: '#60b070', color3: '#e0c060', color4: '#5080d0', color5: '#b070d0', color6: '#50b0c0', color7: '#e8e8ee', color8: '#505860' };
      for (let i = 9; i < 16; i++) colors['color' + i] = colors['color' + (i - 8)];
      await IOUtils.writeUTF8(file, JSON.stringify({ special: { background: '#101418', foreground: '#e8e8ee', cursor: '#e8e8ee' }, colors }));
      Services.prefs.setStringPref('zenith.internal.palette.home', home); await zset({ 'zenith.palette': 'pywal' }); await zth.sleep(1500);
      const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue('--zth-pal-' + n).trim();
      return { palette: document.documentElement.getAttribute('zenith-palette'), base: v('base'), text: v('text'), accent: v('accent'), red: v('red') };"""))
    z.screenshot(str(OUT / "palette-pywal.png"))
    say("a named palette, and back to none", z.js(r"""await zset({ 'zenith.palette': 'catppuccin-latte', 'zenith.internal.palette.home': null }); await zth.sleep(800);
      const cs = getComputedStyle(document.documentElement), out = { latte: [document.documentElement.getAttribute('zenith-palette'), cs.getPropertyValue('--zth-pal-base').trim()] };
      await zset({ 'zenith.palette': null }); await zth.sleep(800); out.none = [document.documentElement.getAttribute('zenith-palette'), getComputedStyle(document.documentElement).getPropertyValue('--zth-pal-base').trim()];
      await IOUtils.remove(PathUtils.join(PathUtils.tempDir, 'zenith-home-0151'), { recursive: true }); return out;"""))

    say(":help opens the help page, at a topic", z.js(r"""const S = window.ZenithSwitcher; S.show(':help tiles'); await zth.sleep(400); await S.choose(); await zth.sleep(2500);
      const b = gBrowser.selectedBrowser, w = b.contentWindow ?? b.browsingContext?.window, d = w?.document;
      const r = d?.getElementById('tiles')?.getBoundingClientRect();
      return { url: b.currentURI.spec, title: d?.title, sections: d?.querySelectorAll('main > section').length, 'key groups': d?.querySelectorAll('#key-groups .group').length,
               'link rows': d?.querySelectorAll('#link-combos dt').length, 'tiles at the top': r ? Math.round(r.top) : null };"""))
    z.screenshot(str(OUT / "help.png"))
    say("help: finding, Try it, Beside", z.js(r"""const b = gBrowser.selectedBrowser, w = b.contentWindow ?? b.browsingContext.window, d = w.document, s = d.getElementById('search');
      s.value = 'wallust'; s.dispatchEvent(new w.Event('input', { bubbles: true })); await zth.sleep(200);
      const out = { 'wallust finds': [...d.querySelectorAll('main > section:not([hidden])')].map(x => x.id) };
      s.value = ''; s.dispatchEvent(new w.Event('input', { bubbles: true }));
      d.querySelector('[data-try="keys"]').click(); await zth.sleep(500); out['keys sheet'] = !!document.getElementById('zenith-keysheet'); window.ZenithShell.sheet.close();
      const tab = gBrowser.selectedTab; d.getElementById('beside').click(); await zth.sleep(1500);
      out.beside = { split: !!tab.splitView, with: tab.splitView ? window.ZenithShell.tiler.data(tab)?.tabs.map(t => t.linkedBrowser.currentURI.spec) : null, 'button hidden': d.getElementById('beside').hidden };
      return out;"""))
    z.screenshot(str(OUT / "help-beside.png"))
    z.js("const t = gBrowser.tabs.find(t => t.linkedBrowser.currentURI.spec.startsWith('about:zenith-help')); if (t) { gZenViewSplitter.removeTabFromGroup?.(t); gBrowser.removeTab(t); } await zth.sleep(500); zclear(); await zth.sleep(800); for (const t of window.zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
