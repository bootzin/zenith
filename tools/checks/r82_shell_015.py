"""0.15.0, inside Zen: the bar's parts never overlap and play/pause works;
popups for timers, downloads, trackers and how pages look; the extensions
panel drops from the bar; the Dash; the launcher's modes (Alt+D), :help,
calc and emoji; site appearance; readable sidebar text on a light colour;
the settings panel's lists in the top layer; a picture of your own as the
wallpaper. Screenshots go to argv[1]."""
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
const VK = { D: 0x44, N: 0x4E, Tab: 0x09, Esc: 0x1B };
window.zk = async (k, mods = 'alt') => {
  const m = (mods.includes('alt') ? 0x1000 : 0) | (mods.includes('shift') ? 0x0100 : 0) | (mods.includes('ctrl') ? 0x0400 : 0);
  const ch = k.length === 1 ? k.toLowerCase() : '';
  await new Promise(r => { const t = setTimeout(r, 300); wu.sendNativeKeyEvent(0x409, VK[k], m, ch, ch, { observe() { clearTimeout(t); r(); } }); });
  await zth.sleep(350);
};
window.zset = async o => { const P = Services.prefs; for (const [k, v] of Object.entries(o)) { if (v === null) P.clearUserPref(k); else if (typeof v === 'boolean') P.setBoolPref(k, v); else P.setStringPref(k, v); }
  await zth.sleep(500); await window.ZenithBar?.ready; await zth.sleep(300); };
window.zbox = el => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); Services.prefs.clearUserPref('zenith.internal.float.kept'); return 1")
    z.js(r"""window.zT = [zth.open(arguments[0] + '/page?n=' + 'a%20page%20with%20a%20rather%20long%20title%20that%20goes%20on'), zth.open(arguments[0] + '/music', { background: true })];
      gBrowser.selectedTab = zT[0]; await zth.sleep(2000);
      await zset({ 'zenith.bar.position': 'top', 'zenith.bar.weather': true, 'zenith.bar.resources': true }); await zth.sleep(2500); return 1""", z.base)
    say("the bar: nothing overlaps", z.js(r"""const bar = document.getElementById('zenith-bar');
      const parts = ['.zb-left', '.zb-centre', '.zb-right'].map(s => zbox(bar.querySelector(s)));
      const mods = [...bar.querySelectorAll('.zb-mod')].filter(m => !m.hidden).map(m => m.getAttribute('mod'));
      const overlap = parts[0][0] + parts[0][2] > parts[1][0] + 1 || parts[1][0] + parts[1][2] > parts[2][0] + 1;
      return { parts, overlap, mods, weather: bar.querySelector('[mod="weather"]').textContent, memory: bar.querySelector('[mod="resources"]').textContent };"""))
    z.screenshot(str(OUT / "bar.png"))
    say("play/pause from the bar", z.js(r"""const m = document.querySelector('#zenith-bar [mod="media"]'), btn = m.querySelector('.zb-media-play');
      const C = zT[1].linkedBrowser.browsingContext.mediaController, a = C.isPlaying;
      btn.click(); await zth.sleep(1200); const b = C.isPlaying; btn.click(); await zth.sleep(1200);
      return { before: a, 'after a click': b, 'after another': C.isPlaying };"""))
    say("timers: a click lists them, a field starts one", z.js(r"""Services.prefs.setStringPref('zenith.internal.timers', JSON.stringify([{ id: 'zt1', end: Date.now() + 300000, label: 'tea', start: Date.now() }]));
      await zth.sleep(500); const t = document.querySelector('#zenith-bar [mod="timers"]'); t.click(); await zth.sleep(400);
      const pop = document.querySelector('.zs-pop[kind="timers"]'), rows = [...pop.querySelectorAll('.zs-row')].map(r => r.textContent);
      const f = pop.querySelector('.zs-field'); f.value = '10m pasta'; f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await zth.sleep(500);
      const after = [...pop.querySelectorAll('.zs-row')].map(r => r.textContent), box = zbox(pop);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await zth.sleep(200); const gone = !document.querySelector('.zs-pop');
      Services.prefs.clearUserPref('zenith.internal.timers'); return { rows, after, box, 'Esc closes it': gone };"""))
    say("downloads: a click lists them in place", z.js(r"""const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
      const d = await Downloads.createDownload({ source: arguments[0] + '/download', target: PathUtils.join(PathUtils.tempDir, 'zenith-pop-test.bin') });
      const list = await Downloads.getList(Downloads.ALL); await list.add(d); d.start().catch(() => {}); await zth.sleep(2500);
      document.querySelector('#zenith-bar [mod="downloads"]').click(); await zth.sleep(600);
      const pop = document.querySelector('.zs-pop[kind="downloads"]'), rows = pop ? [...pop.querySelectorAll('.zs-row')].map(r => r.textContent.slice(0, 60)) : null;
      const bar = !!pop?.querySelector('.zs-progress'); window.zsPopDl = zbox(pop);
      await d.cancel(); await list.remove(d); await d.finalize(true); await zth.sleep(300);
      return { rows, 'progress bar': bar, box: window.zsPopDl };""", z.base))
    z.screenshot(str(OUT / "pop-downloads.png"))
    z.js("document.querySelector('.zs-pop') && window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(200); return 1")
    say("extensions: Firefox's panel drops from the bar", z.js(r"""const b = document.getElementById('zenith-bar-tray'); b.click(); await zth.sleep(1200);
      const panel = gUnifiedExtensions.panel, out = { state: panel.state, anchor: panel.anchorNode?.id ?? null, sidebarShown: gNavToolbox.getBoundingClientRect().right > 50 };
      PanelMultiView.hidePopup(panel); await zth.sleep(300); return out;"""))
    say("trackers and how pages look", z.js(r"""const A = window.ZenithAppearance, before = Services.prefs.prefHasUserValue(A.PREF);
      const ap = document.querySelector('#zenith-bar [mod="appearance"]'); ap.click(); await zth.sleep(300);
      const forced = [A.forced(), Services.prefs.getIntPref(A.PREF, 2), ap.hasAttribute('forced')];
      ap.click(); await zth.sleep(300); const back = A.forced();
      ap.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await zth.sleep(300);
      const pop = document.querySelector('.zs-pop[kind="appearance"]'), seg = pop ? [...pop.querySelectorAll('.zs-seg-row')].map(r => r.textContent) : null;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(200);
      return { 'set before': before, 'after a click': forced, 'after another': back, 'right-click': seg };"""))
    z.js("await zk('N'); await zth.sleep(2500); return 1")
    say("the Dash (Alt+N)", z.js(r"""const pop = document.querySelector('.zs-pop[kind="dash"]');
      if (!pop) return 'no Dash';
      return { box: zbox(pop), time: pop.querySelector('.zd-time')?.textContent, weather: pop.querySelector('.zd-sky')?.textContent.slice(0, 80),
               calendar: pop.querySelectorAll('.zd-d').length, today: pop.querySelector('.zd-d[today]')?.textContent,
               media: pop.querySelector('.zd-media')?.textContent.slice(0, 60), tiles: [...pop.querySelectorAll('.zd-tile')].map(t => t.textContent),
               system: [...pop.querySelectorAll('.zd-sys .zs-row')].map(r => r.textContent) };"""))
    z.screenshot(str(OUT / "dash.png"))
    say("the Dash again (Alt+N) closes it; the clock opens it", z.js(r"""await zk('N'); await zth.sleep(300); const closed = !document.querySelector('.zs-pop');
      document.querySelector('#zenith-bar [mod="clock"]').click(); await zth.sleep(1500); const opened = !!document.querySelector('.zs-pop[kind="dash"]');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(200); return { closed, 'opened by the clock': opened };"""))
    say("the launcher: Alt+D, open mode, Ctrl+Tab, :help, calc, emoji", z.js(r"""await zk('D'); await zth.sleep(300);
      const S = window.ZenithSwitcher, rows = () => [...document.querySelectorAll('#zenith-switcher-list .zenith-switch-row')].map(r => r.textContent.slice(0, 50));
      const out = { mode: S.mode, open: S.open };
      S.input.value = 'example.com'; S.update(); await zth.sleep(600); out['example.com'] = rows();
      S.input.value = ''; S.update(); await zk('Tab', 'ctrl'); out['Ctrl+Tab'] = S.mode;
      S.setMode('commands'); S.input.value = 'help'; S.update(); out[':help'] = rows().length;
      S.input.value = 'help tiles'; S.update(); out[':help tiles'] = rows();
      S.setMode('calc'); S.input.value = '2+2*3'; S.update(); out.calc = rows();
      S.setMode('emoji'); S.input.value = 'party'; S.update(); out.emoji = rows().slice(0, 2);
      S.setMode('tabs'); S.input.value = ''; S.hide(); return out;"""))
    say("readable sidebar text on a light space colour", z.js(r"""await zset({ 'zenith.bar.position': null, 'zenith.bar.weather': null, 'zenith.bar.resources': null }); await zth.sleep(600);
      const W = gZenWorkspaces, picker = gZenThemePicker, s = W.getActiveWorkspace(); window.zSaved = structuredClone(s.theme);
      const c = [249, 226, 175], dots = [{ c, isCustom: false, isPrimary: true, algorithm: 'floating', type: 'explicit-lightness', lightness: 83 }];
      s.theme = picker.constructor.getTheme?.(dots, s.theme?.opacity ?? 0.5, s.theme?.texture ?? 0) ?? { type: 'gradient', gradientColors: dots, opacity: 0.5, texture: 0 };
      W.saveWorkspace(s); picker.onWorkspaceChange(s); await zth.sleep(1500);
      const label = gBrowser.selectedTab.querySelector('.tab-label');
      return { "Zen's choice": document.documentElement.getAttribute('zen-should-be-dark-mode') === 'true' ? 'light text' : 'dark text',
               zenith: document.documentElement.getAttribute('zenith-ink'), 'tab text': getComputedStyle(label).color, measured: window.ZenithInk.measure(true) };"""))
    z.screenshot(str(OUT / "ink-light-yellow.png"))
    z.js("const s = gZenWorkspaces.getActiveWorkspace(); s.theme = window.zSaved; gZenWorkspaces.saveWorkspace(s); gZenThemePicker.onWorkspaceChange(s); await zth.sleep(800); return 1")
    say("the settings panel's lists open in the top layer", z.js(r"""window.ZenithLive?.toggle?.(); await zth.sleep(1500);
      const host = document.querySelector('#zenith-live, .zenith-live, [id^="zenith-live"]'), root = host?.shadowRoot ?? host ?? document;
      const btn = [...root.querySelectorAll('.zp-select')].at(-1); if (!btn) return 'no list found';
      btn.scrollIntoView({ block: 'end' }); await zth.sleep(300); btn.click(); await zth.sleep(300);
      const list = btn.parentNode.querySelector('.zp-options'), r = list.getBoundingClientRect();
      const out = { open: list.matches(':popover-open'), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inside: r.top >= 0 && r.bottom <= innerHeight };
      list.hidePopover(); window.ZenithLive?.toggle?.(); await zth.sleep(400); return out;"""))
    say("a picture of your own as the wallpaper", z.js(r"""const bytes = new Uint8Array(await (await fetch(arguments[0] + '/art.png')).arrayBuffer());
      await IOUtils.write(PathUtils.join(PathUtils.profileDir, 'zenith-wallpaper-own'), bytes);
      Services.prefs.setStringPref('zenith.plus.wallpaper-source', 'own'); await zth.sleep(1500);
      const cs = document.documentElement.style, out = { shown: document.documentElement.hasAttribute('zenith-wallpaper'),
        place: ['x', 'y', 'w', 'h'].map(n => cs.getPropertyValue('--zth-wall-' + n)), 'window': [innerWidth, innerHeight] };
      Services.prefs.clearUserPref('zenith.plus.wallpaper-source'); await zth.sleep(1500); out['back to Windows\' own'] = (cs.getPropertyValue('--zth-wall-w'));
      await IOUtils.remove(PathUtils.join(PathUtils.profileDir, 'zenith-wallpaper-own')); return out;""", z.base))
    z.js("for (const t of window.zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
