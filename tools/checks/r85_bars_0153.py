"""0.15.3, inside Zen: tabs in a bar with room, marked in the container's,
the space's or the accent's colour, readable on a light palette; the
sidebar beside side bars (off beside a hiding one, keys still work); All
downloads in Zen's Library; the mini player on hover; a bar's right-click
menu; pages forced dark (inverted, or in the palette's colours); the
module editor's drag feedback. Screenshots go to argv[1]."""
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
window.zclear = () => { for (const k of P.getChildList('zenith.bar.')) P.clearUserPref(k); for (const k of ['zenith.sidebar', 'zenith.palette', 'zenith.plus.appearance-force', 'zenith.plus.appearance-skip',
  'zenith.internal.appearance.global', 'zenith.internal.appearance.spaces', 'layout.css.prefers-color-scheme.content-override']) P.clearUserPref(k); };
// The page's pixel at (x, y), as drawn.
window.zpixel = async (x = 30, y = 300) => { const wg = gBrowser.selectedBrowser.browsingContext.currentWindowGlobal; const bmp = await wg.drawSnapshot(new DOMRect(x, y, 4, 4), 1, 'magenta');
  const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = 4; c.height = 4; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(1, 1, 1, 1).data; return [d[0], d[1], d[2]]; };
window.zratio = (fg, bg) => { const L = s => { const m = s.match(/[\d.]+/g).map(Number); const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const a = L(fg), b = L(bg); return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2); };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1300, 700); window.moveTo(30, 20); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); P.clearUserPref('zenith.internal.float.kept'); zclear(); return 1")
    z.js(r"""window.zT = [zth.open(arguments[0] + '/page?n=one'), gBrowser.addTab(arguments[0] + '/page?n=boxed', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), userContextId: 1 })];
      gBrowser.selectedTab = zT[0]; await zth.sleep(1800); return 1""", z.base)

    say("tabs in a bar: room and marker", z.js(r"""await zset({ 'zenith.bar.top': 'on', 'zenith.bar.top.modules': 'spaces|tabs|clock', 'zenith.bar.left': 'on', 'zenith.bar.left.modules': 'spaces|tabs|clock' }); await zth.sleep(600);
      const task = (edge, t) => [...document.querySelectorAll(`#${edge} .zb-task`)].find(b => b.zbTab === t);
      const shadow = b => getComputedStyle(b).boxShadow, out = {};
      out.heights = { top: zbox(task('zenith-bar', zT[0]))[3], 'rail row': zbox(task('zenith-bar-left', zT[0]))[3] };
      out['container (as it comes)'] = { 'plain tab': shadow(task('zenith-bar', zT[0])), 'space pill': getComputedStyle(document.querySelector('#zenith-bar .zb-space[current]')).backgroundColor };
      gBrowser.selectedTab = zT[1]; await zth.sleep(500); out['container (as it comes)']['a Personal tab'] = shadow(task('zenith-bar', zT[1]));
      out['container (as it comes)']['side bar'] = shadow(task('zenith-bar-left', zT[1]));
      await zset({ 'zenith.bar.marker': 'space' }); out.space = shadow(task('zenith-bar', zT[1]));
      await zset({ 'zenith.bar.marker': 'accent' }); out.accent = [shadow(task('zenith-bar', zT[1])), getComputedStyle(document.documentElement).getPropertyValue('--zth-accent').trim()];
      await zset({ 'zenith.bar.marker': null }); gBrowser.selectedTab = zT[0]; await zth.sleep(300); return out;"""))
    z.screenshot(str(OUT / "tabs-room.png"))

    say("tab contrast on a light palette", z.js(r"""await zset({ 'zenith.palette': 'catppuccin-latte' }); await zth.sleep(1200); gBrowser.discardBrowser?.(zT[1]); await zth.sleep(600);
      const strip = document.querySelector('#zenith-bar [mod="tasks"]'), bg = getComputedStyle(strip).backgroundColor;
      const b = [...strip.querySelectorAll('.zb-task')]; const cur = b.find(x => x.hasAttribute('current')), other = b.find(x => !x.hasAttribute('current') && !x.hasAttribute('asleep')), asleep = b.find(x => x.hasAttribute('asleep'));
      const ink = x => x && getComputedStyle(x).color;
      return { background: bg, current: zratio(ink(cur), getComputedStyle(cur).backgroundColor), other: other ? zratio(ink(other), bg) : null, asleep: asleep ? zratio(ink(asleep), bg) : 'none asleep' };"""))
    z.screenshot(str(OUT / "latte-tabs.png"))
    z.js("await zset({ 'zenith.palette': null }); return 1")

    say("sidebar beside side bars", z.js(r"""await zset({ 'zenith.sidebar': 'hover' }); await zmove(700, 300); await zth.sleep(1200); const T = gNavToolbox, out = {};
      out.shown = { margin: getComputedStyle(T).marginLeft, 'answers': getComputedStyle(T).pointerEvents };
      await zmove(3, 300); await zth.sleep(500); out.shown['at the edge'] = T.hasAttribute('zen-has-hover'); await zmove(700, 300); await zth.sleep(1300);
      await zset({ 'zenith.bar.hide-left': true }); await zmove(700, 300); await zth.sleep(1200);
      out.hiding = { answers: getComputedStyle(T).pointerEvents }; await zmove(3, 300); await zth.sleep(600);
      out.hiding['at the edge'] = { bar: document.getElementById('zenith-bar-left').matches(':hover'), sidebar: T.hasAttribute('zen-has-hover') }; await zmove(700, 300); await zth.sleep(900);
      const key = [...document.querySelectorAll('key')].find(k => /accel|control/.test(k.getAttribute('modifiers') ?? '') && /alt/.test(k.getAttribute('modifiers') ?? '') && (k.getAttribute('key') ?? '').toLowerCase() === 's');
      out.key = key ? (key.getAttribute('command') || key.id) : null;
      if (key) { const cmd = key.getAttribute('command'); cmd ? document.getElementById(cmd)?.doCommand() : key.doCommand?.(); await zth.sleep(900);
        out.hiding['Ctrl+Alt+S'] = { shown: T.hasAttribute('zen-user-show') || T.hasAttribute('zen-has-hover'), box: zbox(T) }; cmd ? document.getElementById(cmd)?.doCommand() : key.doCommand?.(); await zth.sleep(600); }
      await zset({ 'zenith.sidebar': null, 'zenith.bar.hide-left': null }); return out;"""))
    z.screenshot(str(OUT / "sidebar.png"))

    say("All downloads opens Zen's Library", z.js(r"""await zset({ 'zenith.bar.top.modules': 'spaces|title|downloads,clock', 'zenith.bar.downloads-always': true, 'zenith.bar.left': null });
      document.querySelector('#zenith-bar [mod="downloads"]').click(); await zth.sleep(500); const all = [...document.querySelectorAll('.zs-pop[kind="downloads"] button')].find(b => /All downloads/.test(b.textContent));
      const wins = () => Services.wm.getEnumerator('Places:Organizer').hasMoreElements(); all.click(); await zth.sleep(1200);
      const Lib = customElements.get('zen-library'), lib = Lib?.getInstance?.() ?? document.querySelector('zen-library');
      const out = { enabled: P.getBoolPref('zen.library.enabled', false), open: typeof Lib?.isLibraryOpen === 'function' ? Lib.isLibraryOpen() : Lib?.isLibraryOpen, section: lib?.activeTab, "Firefox's window": wins() };
      return out;"""))
    z.screenshot(str(OUT / "library.png"))
    z.js("const Lib = customElements.get('zen-library'); try { if (typeof Lib?.isLibraryOpen === 'function' ? Lib.isLibraryOpen() : Lib?.isLibraryOpen) Lib.toggle(); } catch {} for (const w of [...Services.wm.getEnumerator('Places:Organizer')]) w.close(); await zth.sleep(800); return 1")

    say("the mini player on hover", z.js(r"""zT.push(zth.open(arguments[0] + '/music', { background: true })); await zset({ 'zenith.bar.top.modules': 'spaces|title|media,clock', 'zenith.bar.media-hover': 'player', 'zenith.bar.downloads-always': null });
      await zth.sleep(2500); const m = document.querySelector('#zenith-bar [mod="media"]'), r = m.getBoundingClientRect();
      await zmove(r.left + r.width / 2, r.top + r.height / 2); await zth.sleep(900); const pop = document.querySelector('.zs-pop[kind="player"]');
      const out = { shown: !!pop, title: pop?.querySelector('.zs-title')?.textContent, buttons: pop?.querySelectorAll('.zd-keys button').length, box: zbox(pop) };
      window.zShot = 1; return out;""", z.base))
    z.screenshot(str(OUT / "player.png"))
    say("the mini player goes when the pointer leaves", z.js(r"""await zmove(600, 400); await zth.sleep(900); return { gone: !document.querySelector('.zs-pop[kind="player"]') };"""))
    z.js("gBrowser.removeTab(zT.pop()); await zset({ 'zenith.bar.media-hover': null }); return 1")

    say("a bar's right-click menu", z.js(r"""await zset({ 'zenith.bar.top.modules': 'spaces|title|weather,clock' }); const clock = document.querySelector('#zenith-bar [mod="clock"]');
      const r = clock.getBoundingClientRect(); clock.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 })); await zth.sleep(400);
      const pop = document.querySelector('.zs-pop[kind="bar-menu"]'), rows = pop ? [...pop.querySelectorAll('.zs-row')].map(x => x.textContent) : null, box = zbox(pop);
      window.zMenuShot = 1; return { rows, box, look: pop ? [...pop.querySelectorAll('.zs-seg .zs-btn')].map(b => b.textContent + (b.hasAttribute('on') ? '*' : '')).join(' ') : null };"""))
    z.screenshot(str(OUT / "bar-menu.png"))
    say("the menu's items work", z.js(r"""const pop = document.querySelector('.zs-pop[kind="bar-menu"]'); [...pop.querySelectorAll('.zs-row')].find(x => /Take Clock out/.test(x.textContent)).click(); await zth.sleep(900);
      const out = { 'list now': P.getStringPref('zenith.bar.top.modules', ''), 'clock in the bar': !!document.querySelector('#zenith-bar [mod="clock"]') };
      document.querySelector('#zenith-bar').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 10 })); await zth.sleep(400);
      [...document.querySelectorAll('.zs-pop[kind="bar-menu"] .zs-row')].find(x => /What the top bar shows/.test(x.textContent)).click(); await zth.sleep(1500);
      out['editor open'] = !!document.querySelector('dialog.zp-mods[open]'); out['its buttons'] = [...(document.querySelector('dialog.zp-mods[open]')?.querySelectorAll('.zp-sites-foot button') ?? [])].map(b => b.textContent);
      return out;"""))

    say("the editor's drag feedback", z.js(r"""const dlg = document.querySelector('dialog.zp-mods[open]'); const parts = [...dlg.querySelectorAll('.zp-mods-part')];
      const from = parts[0].querySelector('.zp-mods-chip'), to = parts[2].querySelector('.zp-mods-chip'), dt = new DataTransfer();
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); await zth.sleep(100);
      const r = to.getBoundingClientRect(); to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.right - 2, clientY: r.top + 5 })); await zth.sleep(150);
      const out = { dragging: from.hasAttribute('dragging'), 'row lit': to.closest('.zp-mods-row').hasAttribute('dropping'), line: to.getAttribute('drop'),
        'line drawn': getComputedStyle(to, '::before').content !== 'none' };
      window.zDrop = () => { to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.right - 2, clientY: r.top + 5 })); }; return out;"""))
    z.screenshot(str(OUT / "editor-drag.png"))
    say("the editor's drop", z.js(r"""zDrop(); await zth.sleep(400); const dlg = document.querySelector('dialog.zp-mods[open]');
      const out = { list: P.getStringPref('zenith.bar.top.modules', ''), marks: dlg.querySelectorAll('[dragging], [dropping], [drop]').length };
      dlg.close(); window.ZenithLive.close(); return out;"""))

    say("pages forced dark", z.js(r"""const A = window.ZenithAppearance; gBrowser.selectedTab = zT[0]; await zth.sleep(600); const out = { 'light page, automatic': await zpixel() };
      A.set('dark'); await zth.sleep(1500); out.invert = await zpixel();
      gBrowser.reload(); await zth.sleep(2500); out['invert, reloaded'] = await zpixel();
      await zset({ 'zenith.plus.appearance-skip': '127.0.0.1' }); await zth.sleep(800); out['a site left alone'] = await zpixel(); await zset({ 'zenith.plus.appearance-skip': null });
      await zset({ 'zenith.plus.appearance-force': 'palette', 'zenith.palette': 'catppuccin-mocha' }); await zth.sleep(1200); gBrowser.reload(); await zth.sleep(2500);
      out.palette = { pixel: await zpixel(), 'colour use': P.getIntPref('browser.display.document_color_use', -1), bg: P.getStringPref('browser.display.background_color.dark', '') };
      await zset({ 'zenith.plus.appearance-force': 'off' }); await zth.sleep(800); gBrowser.reload(); await zth.sleep(2500);
      out['only asked'] = { pixel: await zpixel(), 'colour use back': P.prefHasUserValue('browser.display.document_color_use') };
      A.set('auto'); await zset({ 'zenith.plus.appearance-force': null, 'zenith.palette': null }); await zth.sleep(800); gBrowser.reload(); await zth.sleep(2000); out['automatic again'] = await zpixel();
      return out;"""))
    z.js("zclear(); await zth.sleep(800); for (const t of zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
