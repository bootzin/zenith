"""0.15.2, inside Zen: each bar's own modules (and 0.15.1's settings moved
over), the editor on the settings page, tabs in a bar (where they sit, the
wheel), what's playing in three looks, another clock, the rail's clock not
cut, downloads always there, the window's buttons in one place, hiding bars
reached by the real pointer, a side bar and the sidebar on hover, the Dash
in one place (and its downloads, no scrollbar), the downloads popup's icons,
memory as Windows counts it, tabs in every space, pages light or dark.
Screenshots go to argv[1]."""
import json, subprocess, sys
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
window.zmods = edge => { const b = document.getElementById(edge === 'top' ? 'zenith-bar' : 'zenith-bar-' + edge); if (!b) return null;
  return ['.zb-left', '.zb-centre', '.zb-right'].map(s => [...b.querySelectorAll(s + ' > .zb-mod')].map(m => m.getAttribute('mod')).join(',')).join(' | '); };
window.zesc = async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(250); };
window.zmove = async (x, y) => { const dpr = devicePixelRatio; await new Promise(r => { const t = setTimeout(r, 400);
  wu.sendNativeMouseEvent(Math.round((mozInnerScreenX + x) * dpr), Math.round((mozInnerScreenY + y) * dpr), wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, null, { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(650); };
window.zclear = () => { for (const k of P.getChildList('zenith.bar.')) P.clearUserPref(k); for (const k of ['zenith.sidebar', 'zenith.dash.place', 'zenith.dash.downloads', 'zenith.plus.appearance-auto',
  'zenith.internal.appearance.global', 'zenith.internal.appearance.spaces', 'layout.css.prefers-color-scheme.content-override', 'zen.view.window.scheme']) P.clearUserPref(k); };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1300, 700); window.moveTo(30, 20); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); P.clearUserPref('zenith.internal.float.kept'); zclear(); return 1")
    z.js(r"""window.zT = [zth.open(arguments[0] + '/page?n=one')]; gBrowser.selectedTab = zT[0]; await zth.sleep(1500); return 1""", z.base)

    say("0.15.1's settings move over", z.js(r"""P.setStringPref('zenith.bar.top', 'status'); P.setStringPref('zenith.bar.bottom', 'tabs'); P.setBoolPref('zenith.bar.weather', true);
      P.setBoolPref('zenith.bar.tray', false); P.setStringPref('zenith.bar.buttons', 'power'); window.ZenithBar.migrate(); const g = k => P.getStringPref(k, '');
      return { top: [g('zenith.bar.top'), g('zenith.bar.top.modules')], bottom: [g('zenith.bar.bottom'), g('zenith.bar.bottom.modules')],
               'old ones gone': !['zenith.bar.weather', 'zenith.bar.tray', 'zenith.bar.buttons'].some(k => P.prefHasUserValue(k)) };"""))
    z.js("zclear(); await zth.sleep(800); return 1")

    say("each bar its own modules", z.js(r"""await zset({ 'zenith.bar.top': 'on', 'zenith.bar.top.modules': 'spaces|tabs|clock,power', 'zenith.bar.bottom': 'on',
      'zenith.bar.bottom.modules': 'downloads|title|weather,memory,buttons' }); await zth.sleep(600);
      return { top: zmods('top'), bottom: zmods('bottom'), 'buttons in': document.querySelector('.titlebar-buttonbox-container')?.closest('.zenith-bar')?.getAttribute('edge') ?? 'not in a bar',
               root: document.documentElement.getAttribute('zenith-bar-buttons') };"""))
    z.screenshot(str(OUT / "own-modules.png"))
    say("no window buttons in a bar: Zen's own hidden", z.js(r"""await zset({ 'zenith.bar.bottom.modules': 'downloads|title|weather,memory' });
      const b = document.querySelector('.titlebar-buttonbox-container');
      return { root: document.documentElement.getAttribute('zenith-bar-buttons'), where: b?.parentNode?.id || b?.parentNode?.className, display: b && getComputedStyle(b).display };"""))

    say("the settings page's editor", z.js(r"""window.ZenithLive.open(); await zth.sleep(1200);
      const row = document.querySelector('.zp-row[data-prop="zenith.bar.top.modules"]'); if (!row) return 'no row';
      row.scrollIntoView({ block: 'center' }); await zth.sleep(200); const count = row.querySelector('.zp-list-count')?.textContent;
      row.querySelector('.zp-action').click(); await zth.sleep(400); const dlg = [...document.querySelectorAll('dialog.zp-mods')].find(d => d.open);
      const parts = () => [...dlg.querySelectorAll('.zp-mods-part')].map(p => [...p.querySelectorAll('.zp-mods-chip > span')].map(s => s.textContent).join(', '));
      const before = parts(); const add = dlg.querySelectorAll('.zp-mods-add')[2]; add.value = 'media'; add.dispatchEvent(new Event('change'));
      await zth.sleep(300); const added = [parts(), P.getStringPref('zenith.bar.top.modules', '')];
      dlg.querySelectorAll('.zp-mods-part')[2].querySelector('.zp-mods-x').click(); await zth.sleep(300);
      const removed = [parts(), P.getStringPref('zenith.bar.top.modules', '')]; await zth.sleep(900); const bar = zmods('top');
      return { count, before, added, removed, 'the bar now': bar };"""))
    z.screenshot(str(OUT / "editor.png"))
    z.js("document.querySelector('dialog.zp-mods[open]')?.close(); window.ZenithLive.close(); await zth.sleep(300); return 1")

    say("tabs in a bar: where they sit, the wheel", z.js(r"""await zset({ 'zenith.bar.top.modules': 'spaces|tabs|clock', 'zenith.bar.bottom': null, 'zenith.bar.bottom.modules': null, 'zenith.bar.tab-align': 'centre' });
      const strip = () => document.querySelector('#zenith-bar [mod="tasks"]'), out = {};
      const s = strip(), first = s.querySelector('.zb-task'); out.centre = { strip: zbox(s), first: zbox(first) };
      await zset({ 'zenith.bar.tab-align': 'end' }); out.end = zbox(strip().querySelector('.zb-task:last-child'));
      await zset({ 'zenith.bar.tab-align': null });
      for (let i = 0; i < 45; i++) zT.push(gBrowser.addTab(arguments[0] + '/page?n=w' + i, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true, skipAnimation: true }));
      await zth.sleep(2500); gBrowser.selectedTab = zT[0]; await zth.sleep(700); const m = strip(), sel = gBrowser.selectedTab, x0 = m.scrollLeft;
      m.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, deltaMode: 0, bubbles: true })); await zth.sleep(300);
      out.scroll = { 'moved by': m.scrollLeft - x0, 'same tab': gBrowser.selectedTab === sel };
      await zset({ 'zenith.bar.tab-wheel': 'switch' }); strip().dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true })); await zth.sleep(300);
      out.switch = { 'another tab': gBrowser.selectedTab !== sel }; await zset({ 'zenith.bar.tab-wheel': null }); gBrowser.selectedTab = zT[0];
      for (const t of zT.splice(1)) gBrowser.removeTab(t); await zth.sleep(600); return out;""", z.base))

    say("what's playing, three looks", z.js(r"""zT.push(zth.open(arguments[0] + '/music', { background: true })); await zset({ 'zenith.bar.top.modules': 'spaces|title|media,clock' }); await zth.sleep(2500);
      const out = {};
      for (const look of ['button', 'title', 'detailed']) { await zset({ 'zenith.bar.media-look': look }); const m = document.querySelector('#zenith-bar [mod="media"]');
        out[look] = { shown: !m.hidden, parts: [...m.children].filter(c => getComputedStyle(c).display !== 'none').map(c => c.className), box: zbox(m) }; }
      await zset({ 'zenith.bar.media-look': 'detailed' }); return out;""", z.base))
    z.screenshot(str(OUT / "media-detailed.png"))
    z.js("await zset({ 'zenith.bar.media-look': null }); gBrowser.removeTab(zT.pop()); return 1")

    say("clock 14:03 | 29.06, and the rail's not cut", z.js(r"""await zset({ 'zenith.bar.clock': 'hm-date' }); const out = { top: document.querySelector('#zenith-bar [mod="clock"]').textContent };
      await zset({ 'zenith.bar.left': 'on', 'zenith.bar.left.modules': 'spaces|tabs|clock' }); await zth.sleep(500);
      const c = document.querySelector('#zenith-bar-left [mod="clock"]'), spans = [...c.querySelectorAll('span')];
      out.rail = { text: spans.map(s => s.textContent), box: zbox(c), 'content fits': spans.every(s => s.getBoundingClientRect().bottom <= c.getBoundingClientRect().bottom + 0.5) };
      return out;"""))
    z.screenshot(str(OUT / "rail-clock.png"))

    say("a left bar and the sidebar on hover", z.js(r"""await zset({ 'zenith.sidebar': 'hover', 'zenith.bar.clock': null }); await zmove(700, 300); await zth.sleep(1200);
      const T = gNavToolbox; let bar = document.getElementById('zenith-bar-left');
      const out = { bar: zbox(bar), sidebar: zbox(T), margin: getComputedStyle(T).marginLeft };
      await zmove(3, 300); out['at the window edge'] = { bar: bar.matches(':hover'), sidebar: T.hasAttribute('zen-has-hover') };
      await zmove(bar.getBoundingClientRect().right + 2, 300); await zth.sleep(500); out['at the bar\'s inner edge'] = { sidebar: T.hasAttribute('zen-has-hover'), box: zbox(T) };
      await zmove(700, 300); await zth.sleep(900);
      await zset({ 'zenith.bar.hide-left': true }); await zmove(700, 300); await zth.sleep(900);
      out.hiding = { bar: zbox(bar = document.getElementById('zenith-bar-left')), 'sidebar answers': getComputedStyle(T).pointerEvents };
      await zmove(3, 300); await zth.sleep(400); out['hiding, reached'] = { bar: document.getElementById('zenith-bar-left').matches(':hover'), translate: getComputedStyle(document.getElementById('zenith-bar-left')).translate,
        reached: document.documentElement.getAttribute('zenith-reached'), 'sidebar answers': getComputedStyle(T).pointerEvents };
      await zmove(700, 300); return out;"""))
    z.screenshot(str(OUT / "left-and-sidebar.png"))
    z.js("await zset({ 'zenith.bar.left': null, 'zenith.bar.left.modules': null, 'zenith.bar.hide-left': null, 'zenith.sidebar': null }); return 1")

    say("hiding bars reached by the pointer", z.js(r"""await zset({ 'zenith.bar.hide-top': true, 'zenith.bar.bottom': 'on', 'zenith.bar.hide-bottom': true }); await zmove(600, 300); await zth.sleep(800);
      const top = document.getElementById('zenith-bar'), bot = document.getElementById('zenith-bar-bottom'), out = { top: {}, bottom: {} };
      for (const y of [2, 5, 7]) { await zmove(600, y); out.top[y] = top.matches(':hover'); await zmove(600, 300); }
      for (const d of [2, 4]) { await zmove(600, innerHeight - d); out.bottom[d] = bot.matches(':hover'); await zmove(600, 300); }
      await zmove(600, 3); await zth.sleep(400); out['top shown'] = zbox(top); await zmove(600, 300);
      return out;"""))
    z.js("await zset({ 'zenith.bar.hide-top': null, 'zenith.bar.bottom': null, 'zenith.bar.hide-bottom': null }); return 1")

    say("downloads always in the bar; the popup's icons; the Dash's downloads", z.js(r"""await zset({ 'zenith.bar.top.modules': 'spaces|title|downloads,clock', 'zenith.bar.downloads-always': true });
      const m = document.querySelector('#zenith-bar [mod="downloads"]'), out = { 'shown with none': !m.hidden };
      const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs'), target = PathUtils.join(PathUtils.tempDir, 'zenith-0152.html');
      const d = await Downloads.createDownload({ source: arguments[0] + '/page?n=dl', target }); const list = await Downloads.getList(Downloads.ALL); await list.add(d); await d.start(); await zth.sleep(900);
      m.click(); await zth.sleep(500); const row = document.querySelector('.zs-pop[kind="downloads"] .zs-row');
      out.buttons = [...row.querySelectorAll('button')].map(b => [b.title, b.querySelector('.zs-i')?.getAttribute('icon')]); window.zsDl = { d, list };
      await zesc(); await zset({ 'zenith.dash.downloads': true }); window.ZenithDash.toggle(); await zth.sleep(1200);
      out.dash = !!document.querySelector('.zs-pop[kind="dash"] .zd-downloads .zs-row'); await zesc(); return out;""", z.base))
    z.js("await zsDl.list.remove(zsDl.d); await zsDl.d.finalize(true); try { await IOUtils.remove(zsDl.d.target.path); } catch {} await zset({ 'zenith.dash.downloads': null, 'zenith.bar.downloads-always': null }); return 1")

    say("the Dash in one place, whatever opens it", z.js(r"""await zset({ 'zenith.bar.top.modules': 'spaces|title|weather,clock', 'zenith.bar.left': 'on', 'zenith.bar.left.modules': 'spaces||clock' }); await zth.sleep(500);
      const box = () => zbox(document.querySelector('.zs-pop[kind="dash"]')), out = {};
      window.ZenithDash.toggle(); await zth.sleep(1000); out['Alt+N'] = box(); const pop = document.querySelector('.zs-pop[kind="dash"]');
      out['scrollbar?'] = pop.scrollHeight > pop.clientHeight + 1; out.area = zbox(document.getElementById('tabbrowser-tabbox')); await zesc();
      document.querySelector('#zenith-bar [mod="clock"]').click(); await zth.sleep(900); out['top clock'] = box();
      document.querySelector('#zenith-bar [mod="clock"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.querySelector('#zenith-bar [mod="clock"]').click(); await zth.sleep(500);
      out['clicked again: closed'] = !document.querySelector('.zs-pop[kind="dash"]');
      document.querySelector('#zenith-bar-left [mod="clock"]').click(); await zth.sleep(900); out['left clock'] = box(); await zesc();
      await zset({ 'zenith.dash.place': 'top-right' }); window.ZenithDash.toggle(); await zth.sleep(900); out['top right'] = box(); await zesc();
      await zset({ 'zenith.dash.place': null, 'zenith.bar.left': null, 'zenith.bar.left.modules': null }); return out;"""))
    z.screenshot(str(OUT / "dash.png"))

    pids = z.js(r"""const info = await ChromeUtils.requestProcInfo(); window.zPids = [info, ...info.children].map(p => p.pid);
      const S = (await import(await window.ZenithBar.page('shell-ui.mjs'))).System; const s = await S.sample();
      window.zMem = { zenith: s.memory, "Firefox's own sum": [info, ...info.children].reduce((a, p) => a + (p.memory || 0), 0) }; return window.zPids;""")
    ws = subprocess.run(["powershell", "-NoProfile", "-Command",
                         f"$ids=@({','.join(map(str, pids))}); (Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object {{ $ids -contains [int]$_.IDProcess }} | Measure-Object WorkingSetPrivate -Sum).Sum"],
                        capture_output=True, text=True).stdout.strip()
    say("memory as Windows counts it", z.js(r"""const mb = n => Math.round(n / 1048576) + ' MB'; return { zenith: mb(zMem.zenith), "Firefox's own sum (before)": mb(zMem["Firefox's own sum"]), 'Windows (private working set)': mb(+arguments[0]) };""", ws or "0"))

    say("tabs in every space", z.js(r"""const W = gZenWorkspaces, out = {}; let made = null;
      try { made = await W.createAndSaveWorkspace('Zenith check'); } catch (e) { return 'no new space: ' + e; }
      await zth.sleep(800); await W.changeWorkspaceWithID(made.uuid); await zth.sleep(800);
      const extra = [zth.open(arguments[0] + '/page?n=s2a'), zth.open(arguments[0] + '/page?n=s2b')]; await zth.sleep(1500);
      const S = (await import(await window.ZenithBar.page('shell-ui.mjs'))).System, s = await S.sample();
      out.here = s.here; out.everywhere = { awake: s.awake, asleep: s.asleep }; out['gBrowser.tabs'] = gBrowser.tabs.length;
      for (const t of extra) gBrowser.removeTab(t); await W.changeWorkspaceWithID(W.getWorkspaces()[0].uuid); await zth.sleep(700);
      try { await W.removeWorkspace(made.uuid); } catch {} return out;""", z.base))

    say("pages light or dark", z.js(r"""const A = window.ZenithAppearance, out = {}, page = zth.open(arguments[0]); gBrowser.selectedTab = page; await zth.sleep(1500);
      const now = () => page.label;
      await zset({ 'zen.view.window.scheme': 1 }); await zth.sleep(500); out['auto, browser light'] = [A.describe(), now(), A.isDark()];
      A.toggle(); await zth.sleep(600); out['a click'] = [A.describe(), now()]; A.toggle(); await zth.sleep(600); out['again'] = [A.describe(), now()];
      await zset({ 'zenith.plus.appearance-auto': 'system' }); await zth.sleep(500); out['auto, Windows'] = [A.describe(), now(), P.getIntPref(A.PREF, -1)];
      await zset({ 'zenith.plus.appearance-auto': null, 'zen.view.window.scheme': null }); await zth.sleep(400);
      A.set('dark'); await zth.sleep(400); const W = gZenWorkspaces; let made = null; try { made = await W.createAndSaveWorkspace('Zenith light'); } catch {}
      if (made) { A.setSpace('light', made.uuid); await W.changeWorkspaceWithID(made.uuid); await zth.sleep(900); out['a space with its own (light)'] = A.describe();
        await W.changeWorkspaceWithID(W.getWorkspaces()[0].uuid); await zth.sleep(900); out['back: your choice (dark)'] = A.describe(); try { await W.removeWorkspace(made.uuid); } catch {} }
      A.set('auto'); gBrowser.removeTab(page); return out;""",
        "data:text/html,<title>x</title><script>const m=matchMedia('(prefers-color-scheme: dark)');const f=()=>document.title=m.matches?'DARK':'LIGHT';f();m.onchange=f;</script>"))
    z.js("zclear(); await zth.sleep(800); for (const t of zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
