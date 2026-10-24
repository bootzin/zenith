"""0.16.1, inside Zen: a light palette (Rose Pine Dawn from Dracula) with the
sidebar out, readable at once; pages on automatic forced too (real sites),
a site left alone, no flipping; the bar's tabs (every tab the sidebar has,
the window scrolled and kept, the tab's own menu, previews, container
looks, the clock centred, a wide side bar); Ctrl+L in a Peek with the page
focused; Ctrl+Alt+J scrolling; a loading bar per split tile; the scroller
keeping its columns in the split; fetch at once; switching spaces; the
sidebar's default. Screenshots go to argv[1]."""
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
const wu = (window.wu = window.windowUtils), P = (window.P = Services.prefs);
window.zset = async o => { for (const [k, v] of Object.entries(o)) { if (v === null) P.clearUserPref(k); else if (typeof v === 'boolean') P.setBoolPref(k, v); else if (typeof v === 'number') P.setIntPref(k, v); else P.setStringPref(k, v); }
  await zth.sleep(500); await window.ZenithBar?.ready; await zth.sleep(450); };
window.zbox = el => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
window.zesc = async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(250); };
window.zmove = async (x, y) => { const dpr = devicePixelRatio; await new Promise(r => { const t = setTimeout(r, 400);
  wu.sendNativeMouseEvent(Math.round((mozInnerScreenX + x) * dpr), Math.round((mozInnerScreenY + y) * dpr), wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, null, { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(600); };
window.zkey = async (vk, ch, mods) => { await new Promise(r => { const t = setTimeout(r, 400); wu.sendNativeKeyEvent(0x409, vk, mods, ch, ch, { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(300); };
window.zlum = async (tab = gBrowser.selectedTab) => { const b = tab.linkedBrowser; const w = b.clientWidth, h = b.clientHeight; if (!w) return null;
  const bmp = await b.drawSnapshot(0, 0, w, h, 48 / w, 'magenta'); const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return Math.round(s / n); };
window.zratio = (fg, bg) => { const L = s => { const m = s.match(/[\d.]+/g).map(Number); const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const a = L(fg), b = L(bg); return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2); };
window.zclear = () => { for (const k of P.getChildList('zenith.bar.')) P.clearUserPref(k); for (const k of ['zenith.sidebar', 'zenith.palette', 'zenith.plus.appearance-force', 'zenith.plus.appearance-skip',
  'zenith.internal.appearance.global', 'zenith.internal.appearance.spaces', 'layout.css.prefers-color-scheme.content-override', 'zenith.internal.layout.spaces']) P.clearUserPref(k); };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); P.clearUserPref('zenith.internal.float.kept'); zclear(); return 1")
    z.js(r"""window.zBase = arguments[0]; window.zT = []; for (let i = 0; i < 30; i++) zT.push(gBrowser.addTab(arguments[0] + '/page?n=p' + i, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true, skipAnimation: true }));
      await zth.sleep(3000); gBrowser.selectedTab = zT[5]; for (const t of zT.slice(12, 20)) gBrowser.discardBrowser(t); await zth.sleep(800); return 1""", z.base)

    say("the sidebar as it comes", z.js(r"""return { pref: P.getStringPref('zenith.sidebar', '(as it comes)'), compact: gZenCompactModeManager.preference };"""))

    say("Rose Pine Dawn from Dracula, sidebar out", z.js(r"""await zset({ 'zenith.palette': 'dracula', 'zenith.bar.bottom': 'on', 'zenith.bar.bottom.modules': '|tabs|', 'zenith.sidebar': 'hover' }); await zth.sleep(1500);
      document.getElementById('cmd_zenCompactModeShowSidebar')?.doCommand(); await zth.sleep(900);
      const label = () => getComputedStyle(gBrowser.selectedTab.querySelector('.tab-label')).color, bg = () => getComputedStyle(gNavToolbox.querySelector('.zen-toolbar-background')).backgroundColor;
      P.setStringPref('zenith.palette', 'rose-pine-dawn'); await zth.sleep(150); const at150 = { label: label(), sidebar: bg(), ink: document.documentElement.getAttribute('zenith-ink'), dark: matchMedia('(prefers-color-scheme: dark)').matches };
      await zth.sleep(1500); const sleepy = zT[14].querySelector('.tab-label');
      return { at150, at1650: { label: label(), sidebar: bg(), ink: document.documentElement.getAttribute('zenith-ink'), 'chrome dark?': matchMedia('(prefers-color-scheme: dark)').matches,
        'a sleeping tab': [getComputedStyle(sleepy).color, getComputedStyle(zT[14].querySelector('.tab-content')).opacity] } };"""))
    z.screenshot(str(OUT / "rose-pine-dawn.png"))
    say("the bar's tab you're on, on Rose Pine Dawn", z.js(r"""const cur = document.querySelector('#zenith-bar-bottom .zb-task[current]'), other = document.querySelector('#zenith-bar-bottom .zb-task:not([current]):not(.zb-task-more)');
      const strip = getComputedStyle(document.querySelector('#zenith-bar-bottom [mod="tasks"]')).backgroundColor;
      return { 'current tile': getComputedStyle(cur).backgroundColor, 'current text': zratio(getComputedStyle(cur).color, strip), 'other text': zratio(getComputedStyle(other).color, strip), marker: getComputedStyle(cur, '::before').height };"""))
    say("the floating sidebar's glass", z.js(r"""const bg = getComputedStyle(gNavToolbox.querySelector('.zen-toolbar-background') ?? gNavToolbox).backgroundColor; const a = bg.match(/[\d.]+/g); return { background: bg, alpha: a.length > 3 ? +a[3] : 1 };"""))
    z.js("document.getElementById('cmd_zenCompactModeShowSidebar')?.doCommand(); await zth.sleep(500); return 1")

    say("the bar's strip: every tab the sidebar has", z.js(r"""try { gBrowser.pinTab(zT[1]); } catch {} try { window.gZenPinnedTabManager?.addToEssentials?.(zT[2]); } catch {}
      await zth.sleep(1200); const m = document.querySelector('#zenith-bar-bottom [mod="tasks"]'), chip = document.querySelector('#zenith-bar-bottom [mod="tasks-more"]');
      const tabs = [...m.querySelectorAll('.zb-task:not(.zb-task-more)')].map(b => b.zbTab);
      return { 'essential first?': tabs[0] === zT[2] || [...m.querySelectorAll('.zb-task-more')].length > 0, essential: zT[2].hasAttribute('zen-essential'), pinned: zT[1].pinned,
        'pinned in strip or window': tabs.includes(zT[1]) || !!m.querySelector('.zb-task-more'), count: chip.hidden ? '(chip hidden)' : chip.textContent };"""))
    say("the window of tabs: scrolled, it stays", z.js(r"""await zset({ 'zenith.bar.tab-crowd': 'window' }); gBrowser.selectedTab = zT[15]; await zth.sleep(600); const chips = () => [...document.querySelectorAll('#zenith-bar-bottom .zb-task-more')].map(b => b.textContent).join(' ');
      const m = document.querySelector('#zenith-bar-bottom [mod="tasks"]'), out = [chips()];
      for (let i = 0; i < 12; i++) { m.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true })); await zth.sleep(60); } out.push('after 12 up: ' + chips());
      gBrowser.tabContainer.dispatchEvent(new CustomEvent('TabAttrModified', { detail: { changed: ['label'] } })); zT[15].setAttribute('label', zT[15].label); await zth.sleep(400); out.push('after a redraw: ' + chips());
      gBrowser.selectedTab = zT[16]; await zth.sleep(500); out.push('after another tab: ' + chips()); return out;"""))
    say("a right-click on a tab: its own menu", z.js(r"""const b = document.querySelector('#zenith-bar-bottom .zb-task:not([current]):not(.zb-task-more)'), r = b.getBoundingClientRect();
      const menu = document.getElementById('tabContextMenu'); const shown = new Promise(res => { menu.addEventListener('popupshown', () => res(true), { once: true }); setTimeout(() => res(false), 2000); });
      b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 5, clientY: r.top + 5, screenX: mozInnerScreenX + r.left + 5, screenY: mozInnerScreenY + r.top + 5 }));
      const open = await shown; const out = { 'tab menu': open, 'for that tab': window.TabContextMenu?.contextTab === b.zbTab, 'bar menu too': !!document.querySelector('.zs-pop[kind="bar-menu"]') };
      menu.hidePopup(); await zth.sleep(300); return out;"""))
    say("a tab's preview on hover", z.js(r"""const b = [...document.querySelectorAll('#zenith-bar-bottom .zb-task:not([current]):not(.zb-task-more)')].find(x => !x.hasAttribute('asleep')); const r = b.getBoundingClientRect();
      await zmove(r.left + r.width / 2, r.top + r.height / 2); await zth.sleep(1200); const pop = document.querySelector('.zs-pop[kind="preview"]');
      const out = { shown: !!pop, title: pop?.querySelector('.zs-title')?.textContent, picture: !!pop?.querySelector('.zs-preview-pic')?.style.backgroundImage, box: zbox(pop) }; window.zPreviewShot = 1; return out;"""))
    z.screenshot(str(OUT / "preview.png"))
    z.js("await zmove(600, 300); await zth.sleep(600); return 1")

    say("container looks", z.js(r"""const t = gBrowser.addTab(zBase + '/page?n=boxed', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), userContextId: 1, inBackground: true }); zT.push(t);
      await zset({ 'zenith.bar.tab-crowd': 'shrink' }); await zth.sleep(800); const out = {}; const box = () => [...document.querySelectorAll('#zenith-bar-bottom .zb-task')].find(b => b.zbTab === t);
      out.top = getComputedStyle(box(), '::after').height + ' ' + getComputedStyle(box(), '::after').backgroundColor;
      await zset({ 'zenith.bar.container-hint': 'ring' }); out.ring = getComputedStyle(box().querySelector('img')).outlineColor;
      await zset({ 'zenith.bar.container-hint': 'tint' }); out.tint = getComputedStyle(box()).backgroundColor; await zset({ 'zenith.bar.container-hint': null }); return out;"""))

    say("the side clock, hours and minutes centred", z.js(r"""await zset({ 'zenith.bar.left': 'on', 'zenith.bar.left.modules': 'spaces||clock', 'zenith.bar.side-clock': 'hm' }); const c = document.querySelector('#zenith-bar-left [mod="clock"]'), s = c.querySelector('span');
      const a = c.getBoundingClientRect(), b = s.getBoundingClientRect(); return { 'off centre (px)': Math.round((b.top + b.height / 2) - (a.top + a.height / 2)), date: getComputedStyle(c.querySelector('.zb-clock-date')).display };"""))
    z.js("await zset({ 'zenith.bar.left.modules': 'launcher,spaces,mode|tabs|downloads,appearance,clock,power', 'zenith.bar.side-width': 'wide', 'zenith.bar.side-clock': null, 'zenith.bar.downloads-always': true, 'zenith.bar.tab-crowd': 'window' }); await zth.sleep(1200); return 1")
    say("a wide side bar", z.js(r"""const bar = document.getElementById('zenith-bar-left'), chip = bar.querySelector('.zb-task-more:not([hidden])'), clock = bar.querySelector('[mod="clock"]');
      const w = bar.getBoundingClientRect().width; return { bar: Math.round(w), chip: chip ? [chip.textContent, Math.round(chip.getBoundingClientRect().width), getComputedStyle(chip).justifyContent] : '(none)',
        clock: [clock.textContent, Math.round(clock.getBoundingClientRect().height)] };"""))
    z.screenshot(str(OUT / "wide-left.png"))
    z.js("await zset({ 'zenith.bar.left': null, 'zenith.bar.left.modules': null, 'zenith.bar.side-width': null, 'zenith.bar.downloads-always': null }); return 1")

    say("pages on automatic (Dracula: dark), real sites", z.js(r"""await zset({ 'zenith.palette': 'dracula' }); await zth.sleep(1200); const A = window.ZenithAppearance, out = { says: A.describe('') };
      for (const u of ['https://www.google.com/search?q=zen+browser', 'https://github.com/zen-browser/desktop', 'https://www.youtube.com/']) {
        const t = gBrowser.addTab(u, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); gBrowser.selectedTab = t; const seq = [];
        for (let i = 0; i < 8; i++) { await zth.sleep(1000); seq.push(await zlum(t)); } out[new URL(u).host] = seq.join(' '); if (!u.includes('github')) gBrowser.removeTab(t); else window.zGH = t; }
      gBrowser.selectedTab = zGH; await zth.sleep(500); A.leaveAlone('github.com', true); await zth.sleep(1500); out['github left alone'] = await zlum(zGH);
      A.leaveAlone('github.com', false); await zth.sleep(1500); out['github as the rest'] = await zlum(zGH); out['says, on github'] = A.describe('github.com'); gBrowser.removeTab(zGH);
      return out;"""))

    say("Ctrl+L in a Peek, the page beneath focused", z.js(r"""await window.ZenithPeek.open(zBase + '/page?n=peeked'); await zth.sleep(2000); gBrowser.selectedBrowser.focus(); await zth.sleep(300);
      await zkey(0x4C, 'l', 0x0400); await zth.sleep(500); const out = { prompt: document.getElementById('zenith-peek-input')?.value ?? null, urlbar: gURLBar.focused };
      await zesc(); await zesc(); try { gZenGlanceManager.closeDetachedGlance(); } catch {} await zth.sleep(600); return out;"""))
    say("Ctrl+Alt+J scrolls the page", z.js(r"""const t = gBrowser.addTab(zBase + '/links', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); gBrowser.selectedTab = t; await zth.sleep(1500); t.linkedBrowser.focus();
      const before = await zlum(t); await zkey(0x4A, 'j', 0x0400 | 0x1000); await zth.sleep(250); await zkey(0x4A, 'j', 0x0400 | 0x1000); await zth.sleep(700);
      const y = await new Promise(res => { const a = t.linkedBrowser.browsingContext?.currentWindowGlobal; res(a ? 'n/a' : 'n/a'); });
      const snap = await t.linkedBrowser.drawSnapshot(0, 0, 200, 120, 1, 'white'); window.zScrollT = t; return { scrolled: 'see screenshot', before };"""))
    z.screenshot(str(OUT / "scrolled.png"))
    z.js("gBrowser.removeTab(zScrollT); return 1")

    say("a loading bar per split tile", z.js(r"""const a = zth.open(zBase + '/page?n=la'), b = gBrowser.addTab(zBase + '/page?n=lb', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true });
      await zth.sleep(1500); gZenViewSplitter.splitTabs([a, b], 'vsep', 0); await zth.sleep(1000); gBrowser.selectedTab = a; await zth.sleep(400);
      a.linkedBrowser.loadURI(Services.io.newURI(zBase + '/slow?ms=2500'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      b.linkedBrowser.loadURI(Services.io.newURI(zBase + '/slow?ms=2500'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await zth.sleep(700);
      const edges = [...document.querySelectorAll('.zenith-load-edge')].map(e => [e.getAttribute('state'), zbox(e)]); window.zSplit = [a, b]; return { edges };"""))
    z.screenshot(str(OUT / "split-loading.png"))
    z.js("await zth.sleep(3000); for (const t of zSplit) gBrowser.removeTab(t); await zth.sleep(500); return 1")

    say("the scroller keeps its columns in the split", z.js(r"""const L = window.ZenithLayouts, T = window.ZenithShell.tiler; const a = zth.open(zBase + '/page?n=sa'); gBrowser.selectedTab = a; await zth.sleep(1200); L.set('scroller'); await zth.sleep(300);
      for (const n of ['sb', 'sc', 'sd']) { T.link(zBase + '/page?n=' + n, null, gBrowser.selectedTab.linkedBrowser); await zth.sleep(1200); }
      const data = () => gZenViewSplitter._data.find(d => d.tabs.includes(gBrowser.selectedTab)), view = () => { const d = data(); return d ? { inSplit: d.tabs.length, off: d.tabs.filter(t => t.linkedBrowser.closest('.browserSidebarContainer').hasAttribute('zenith-off-strip')).map(t => t.label.replace('Test page ', '')), on: gBrowser.selectedTab.label.replace('Test page ', ''), offset: Math.round(d.zenithOffset ?? 0) } : 'no split'; };
      const out = { 'four columns': view() }; T.focus('left'); await zth.sleep(500); out['Alt+H'] = view(); T.focus('left'); await zth.sleep(500); out['Alt+H again'] = view(); T.focus('left'); await zth.sleep(500); out['and again'] = view();
      L.action(); await zth.sleep(500); out['width: two thirds'] = view(); window.zScrollerShot = 1; return out;"""))
    z.screenshot(str(OUT / "scroller.png"))
    z.js("window.ZenithLayouts.set('dwindle'); await zth.sleep(400); for (const t of [...gBrowser.tabs]) if (/Test page s[a-d]$/.test(t.label)) gBrowser.removeTab(t); return 1")

    say("fetch at once", z.js(r"""const a = performance.now(); window.ZenithFetch.open(); let d = null; for (let i = 0; i < 200; i++) { await zth.sleep(10); const b = gBrowser.selectedBrowser; d = b.contentWindow?.document ?? b.browsingContext?.window?.document; if (d?.querySelectorAll('#lines dt').length) break; }
      const t = Math.round(performance.now() - a); await zth.sleep(1200); const out = { 'card up (ms)': t, version: d?.querySelectorAll('#lines dd')[1]?.textContent, memory: [...(d?.querySelectorAll('#lines dt') ?? [])].findIndex(x => x.textContent === 'Memory') };
      out.memory = d?.querySelectorAll('#lines dd')[out.memory]?.textContent; gBrowser.removeTab(gBrowser.selectedTab); return out;"""))
    say("switching spaces", z.js(r"""return { 'Zen\'s slide (ms)': P.getIntPref('zen.workspaces.switch-animation-duration', -1), 'Dash ready ahead': !!window.ZenithDash.mod, 'settings ready ahead': !!window.ZenithLive?.host };"""))
    z.js("zclear(); await zth.sleep(800); for (const t of zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
