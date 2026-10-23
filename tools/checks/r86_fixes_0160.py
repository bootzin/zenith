"""0.16.0's fixes, inside Zen: pages dark or light at once and only when
asked to invert; a bar's tabs (spacing, markers, container hints) and the
crowded strip (a window, shrinking, past a count, awake only, centred); the
side bar's clock looks; the notice for a hiding bar beside the sidebar;
focus mode hiding the bars; Ctrl+L in a Peek; a light rail with real sites.
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
const wu = window.windowUtils, P = (window.P = Services.prefs);
window.zset = async o => { for (const [k, v] of Object.entries(o)) { if (v === null) P.clearUserPref(k); else if (typeof v === 'boolean') P.setBoolPref(k, v); else if (typeof v === 'number') P.setIntPref(k, v); else P.setStringPref(k, v); }
  await zth.sleep(500); await window.ZenithBar?.ready; await zth.sleep(450); };
window.zbox = el => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
window.zesc = async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(250); };
window.zclear = () => { for (const k of P.getChildList('zenith.bar.')) P.clearUserPref(k); for (const k of ['zenith.sidebar', 'zenith.palette', 'zenith.plus.appearance-force', 'zenith.plus.appearance-skip',
  'zenith.internal.appearance.global', 'zenith.internal.appearance.spaces', 'layout.css.prefers-color-scheme.content-override']) P.clearUserPref(k); };
window.zpixel = async (x = 30, y = 300) => { const wg = gBrowser.selectedBrowser.browsingContext.currentWindowGlobal; const bmp = await wg.drawSnapshot(new DOMRect(x, y, 4, 4), 1, 'magenta');
  const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = 4; c.height = 4; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(1, 1, 1, 1).data; return [d[0], d[1], d[2]].join(','); };
window.zstrip = (id = 'zenith-bar') => { const m = document.querySelector(`#${id} [mod="tasks"]`); return { look: m.getAttribute('look'), crowd: m.getAttribute('crowd'),
  tabs: [...m.children].filter(b => !b.classList.contains('zb-task-more')).length, chips: [...m.querySelectorAll('.zb-task-more')].map(b => b.textContent),
  current: !!m.querySelector('.zb-task[current]'), more: !document.querySelector(`#${id} [mod="tasks-more"]`).hidden }; };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1300, 700); window.moveTo(30, 20); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); P.clearUserPref('zenith.internal.float.kept'); zclear(); return 1")
    z.js(r"""window.zT = [zth.open(arguments[0] + '/page?n=one'), gBrowser.addTab(arguments[0] + '/page?n=boxed', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), userContextId: 1 })];
      gBrowser.selectedTab = zT[0]; await zth.sleep(1800); return 1""", z.base)

    say("pages dark or light, at once", z.js(r"""const A = window.ZenithAppearance, out = { start: await zpixel() };
      A.set('dark'); await zth.sleep(1000); out['dark (invert)'] = await zpixel(); A.set('auto'); await zth.sleep(1000); out.auto = await zpixel();
      await zset({ 'zenith.plus.appearance-force': 'off' }); A.set('dark'); await zth.sleep(1000); out['only ask, dark'] = await zpixel();
      await zset({ 'zenith.plus.appearance-force': null }); await zth.sleep(1000); out['invert again (no reload)'] = await zpixel();
      await zset({ 'zenith.plus.appearance-skip': '127.0.0.1' }); await zth.sleep(1000); out['site left alone'] = await zpixel(); await zset({ 'zenith.plus.appearance-skip': null });
      await zset({ 'zenith.plus.appearance-force': 'palette' }); await zth.sleep(1000); out['palette (no reload)'] = { pixel: await zpixel(), use: P.getIntPref('browser.display.document_color_use', -1) };
      A.set('auto'); await zth.sleep(1000); out['auto after palette'] = { pixel: await zpixel(), 'use back': !P.prefHasUserValue('browser.display.document_color_use') };
      await zset({ 'zenith.plus.appearance-force': null }); return out;"""))

    say("a bar's tabs: spacing, markers, container hints", z.js(r"""await zset({ 'zenith.bar.top': 'on', 'zenith.bar.top.modules': 'spaces|tabs|clock' }); gBrowser.selectedTab = zT[1]; await zth.sleep(400);
      const m = document.querySelector('#zenith-bar [mod="tasks"]'), b = [...m.children], out = { gap: getComputedStyle(m).columnGap };
      const mark = x => getComputedStyle(x, '::before').backgroundColor;
      out['container marker'] = mark(m.querySelector('.zb-task[current]'));
      await zset({ 'zenith.bar.marker': 'accent' }); out['accent marker'] = mark(document.querySelector('#zenith-bar .zb-task[current]'));
      gBrowser.selectedTab = zT[0]; await zset({ 'zenith.bar.marker': null, 'zenith.bar.container-hint': 'dot' }); const other = [...document.querySelectorAll('#zenith-bar .zb-task')].find(x => x.zbTab === zT[1]);
      out.dot = [getComputedStyle(other, '::after').width, getComputedStyle(other, '::after').backgroundColor];
      await zset({ 'zenith.bar.container-hint': 'line' }); const o2 = [...document.querySelectorAll('#zenith-bar .zb-task')].find(x => x.zbTab === zT[1]);
      out.line = [getComputedStyle(o2, '::after').width, getComputedStyle(o2, '::after').height];
      await zset({ 'zenith.bar.container-hint': null }); const o3 = [...document.querySelectorAll('#zenith-bar .zb-task')].find(x => x.zbTab === zT[1]); out.none = getComputedStyle(o3, '::after').content;
      return out;"""))

    say("a crowded strip", z.js(r"""for (let i = 0; i < 70; i++) zT.push(gBrowser.addTab(arguments[0] + '/page?n=c' + i, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true, skipAnimation: true }));
      await zth.sleep(3000); gBrowser.selectedTab = zT[40]; await zth.sleep(800); const out = { window: zstrip() };
      gBrowser.selectedTab = zT[2]; await zth.sleep(500); out['window, near the start'] = zstrip();
      await zset({ 'zenith.bar.tab-scroll': 'centre' }); gBrowser.selectedTab = zT[41]; await zth.sleep(500); out['window, centred'] = zstrip();
      const cur = document.querySelector('#zenith-bar .zb-task[current]'), strip = document.querySelector('#zenith-bar [mod="tasks"]').getBoundingClientRect(), c = cur.getBoundingClientRect();
      out['window, centred'].offset = Math.round((c.left + c.width / 2) - (strip.left + strip.width / 2));
      await zset({ 'zenith.bar.tab-crowd': 'shrink' }); out.shrink = zstrip(); out['shrink, a tab'] = zbox(document.querySelector('#zenith-bar .zb-task:not([current])'));
      await zset({ 'zenith.bar.tab-crowd': 'title', 'zenith.bar.tab-crowd-count': '10' }); out['past a count'] = zstrip();
      await zset({ 'zenith.bar.tab-crowd': null, 'zenith.bar.tab-crowd-count': null, 'zenith.bar.tab-scroll': null });
      for (const t of zT.slice(2, 60)) gBrowser.discardBrowser(t); await zth.sleep(800); await zset({ 'zenith.bar.tab-awake': true }); out['awake only'] = zstrip();
      await zset({ 'zenith.bar.tab-awake': null }); return out;""", z.base))
    z.screenshot(str(OUT / "crowded.png"))
    z.js("for (const t of zT.splice(2)) gBrowser.removeTab(t); await zth.sleep(800); return 1")

    say("the side bar's clock", z.js(r"""await zset({ 'zenith.bar.left': 'on', 'zenith.bar.left.modules': 'spaces||clock' }); const out = {};
      for (const look of ['auto', 'hm', 'weekday', 'seconds', 'date', 'stacked']) { await zset({ 'zenith.bar.side-clock': look }); const c = document.querySelector('#zenith-bar-left [mod="clock"]');
        const spans = [...c.querySelectorAll('span')]; out[look] = { text: spans.map(s => s.textContent).filter(Boolean).join(' / '), fits: spans.every(s => s.getBoundingClientRect().bottom <= c.getBoundingClientRect().bottom + 0.5) }; }
      await zset({ 'zenith.bar.side-clock': 'stacked' }); return out;"""))
    z.screenshot(str(OUT / "side-clock.png"))

    say("a hiding bar beside the sidebar: a notice", z.js(r"""await zset({ 'zenith.sidebar': 'hover', 'zenith.bar.side-clock': null }); document.querySelectorAll('#zenith-toasts .zenith-toast').forEach(t => t.remove());
      await zset({ 'zenith.bar.hide-left': true }); await zth.sleep(400); const card = [...document.querySelectorAll('#zenith-toasts .zenith-toast')].at(-1);
      const out = { notice: card?.querySelector('.zenith-toast-title')?.textContent, button: card?.querySelector('button')?.textContent,
        label: P.getStringPref('zenith.bar.hide-left', '') }; card?.querySelector('button')?.click(); await zth.sleep(900);
      out['button turned it off'] = !P.getBoolPref('zenith.bar.hide-left', false); await zset({ 'zenith.sidebar': null, 'zenith.bar.left': null, 'zenith.bar.left.modules': null }); return out;"""))

    say("focus mode hides the bars", z.js(r"""window.ZenithFocus.toggle(); await zth.sleep(900); const bar = document.getElementById('zenith-bar');
      const out = { in: getComputedStyle(bar).display }; window.ZenithFocus.toggle(); await zth.sleep(900); out.after = getComputedStyle(document.getElementById('zenith-bar')).display; return out;"""))

    say("Ctrl+L in a Peek", z.js(r"""await window.ZenithPeek.open(arguments[0] + '/page?n=peeked'); await zth.sleep(2000); const b = gZenGlanceManager.detachedBrowser;
      if (!b) return 'no Peek'; b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', code: 'KeyL', ctrlKey: true, bubbles: true, cancelable: true })); await zth.sleep(600);
      const input = document.querySelector('#zenith-peek-prompt input, .zenith-peek-prompt input, [id*="peek"] input[type="text"]');
      const out = { prompt: input?.value ?? null, urlbar: gURLBar.focused ? gURLBar.value : '(not focused)' };
      await zesc(); await zesc(); gZenGlanceManager.closeDetachedGlance?.(); await zth.sleep(600); return out;""", z.base))

    say("a light rail with real sites", z.js(r"""await zset({ 'zenith.palette': 'rose-pine-dawn', 'zenith.bar.top': null, 'zenith.bar.left': 'on', 'zenith.bar.left.modules': 'spaces|tabs|clock', 'zenith.sidebar': 'hidden' });
      for (const u of ['https://www.google.com', 'https://github.com', 'https://www.reddit.com', 'https://www.youtube.com', 'https://en.wikipedia.org']) zT.push(gBrowser.addTab(u, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true }));
      await zth.sleep(9000); gBrowser.selectedTab = zT.at(-2); await zth.sleep(1500);
      return [...document.querySelectorAll('#zenith-bar-left .zb-task')].map(b => ({ img: b.querySelector('img')?.getAttribute('src')?.slice(0, 40), bg: getComputedStyle(b).backgroundColor }));"""))
    z.screenshot(str(OUT / "light-rail.png"))
    z.zoom(str(OUT / "light-rail-zoom.png"), 0, 30, 60, 330, 3)
    z.js("zclear(); await zth.sleep(800); for (const t of zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
