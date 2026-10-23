"""0.14.0, inside Zen: link clicks by key combo (Ctrl+Alt peeks, Alt
glances, Alt+Shift tiles, Ctrl+Shift is Firefox's, each changeable, 0.13's
settings carried over); no limit on tiles; the bar (every module, where
tabs are, the window's buttons, off puts everything back); palettes (on,
then the spaces' own colours back); and the bar's cost: its start, the
layout a clock change causes, the main process's CPU idle with it on and
off. Screenshots go to argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


ALT, SHIFT, CTRL = "", "", ""


def click(z, pt, keys):
    n = len(keys)
    kb = [{"type": "keyDown", "value": k} for k in keys] + [{"type": "pause"}] * 3 + [{"type": "keyUp", "value": k} for k in keys]
    pt_ = [{"type": "pause"}] * n + [{"type": "pointerMove", "x": pt[0], "y": pt[1], "origin": "viewport"},
                                     {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}] + [{"type": "pause"}] * n
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": kb},
                                                   {"type": "pointer", "id": "m", "parameters": {"pointerType": "mouse"}, "actions": pt_}]})
    z.cmd("WebDriver:ReleaseActions", {})


SET = r"""const P = Services.prefs; for (const [k, v] of Object.entries(arguments[0])) { if (v === null) P.clearUserPref(k); else if (typeof v === 'boolean') P.setBoolPref(k, v); else P.setStringPref(k, v); }
  await zth.sleep(600); await window.ZenithBar?.ready; await zth.sleep(300); return 1;"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); Services.prefs.clearUserPref('zenith.internal.float.kept'); return 1")

    # --- Link clicks ---------------------------------------------------------------
    def link_try(label, keys, prefs=None):
        pt = z.js(r"""if (arguments[1]) for (const [k, v] of Object.entries(arguments[1])) { if (v === null) Services.prefs.clearUserPref(k); else Services.prefs.setStringPref(k, v); }
          await zth.sleep(300); window.zsT = zth.open(arguments[0] + '/events?n=L'); await zth.sleep(1500); window.zsN = gBrowser.tabs.length;
          const b = zsT.linkedBrowser.getBoundingClientRect(); return [Math.round(b.left + 120), Math.round(b.top + 85)];""", z.base, prefs)
        click(z, pt, keys)
        say(label, z.js(r"""await zth.sleep(1500);
          const out = { 'new tabs': gBrowser.tabs.slice(zsN).filter(t => !t.hasAttribute('zen-glance-tab')).map(t => t.linkedBrowser.currentURI.spec.replace(arguments[0], '')),
                        glance: gBrowser.tabs.some(t => t.hasAttribute('zen-glance-tab')), peek: document.documentElement.hasAttribute('zenith-peek-open'),
                        tile: !!ZenithShell.tiler.data(zsT), 'still on': zsT.linkedBrowser.currentURI.spec.replace(arguments[0], ''),
                        "Zen's own Glance key": Services.prefs.getStringPref('zen.glance.activation-method', '') };
          try { await gZenGlanceManager.closeDetachedGlance?.({ skipPermitUnload: true }); } catch {}
          try { await gZenGlanceManager.closeGlance?.({ skipPermitUnload: true }); } catch {} await zth.sleep(500);
          for (const t of [...gBrowser.tabs.slice(zsN), zsT]) if (t.isConnected) gBrowser.removeTab(t); await zth.sleep(400); return out;""", z.base))
    link_try("Ctrl+Alt+click (Peek)", (CTRL, ALT))
    link_try("Alt+click (Glance)", (ALT,))
    link_try("Alt+Shift+click (a tile)", (ALT, SHIFT))
    link_try("Ctrl+Shift+click (Firefox's own: a tab in front)", (CTRL, SHIFT))
    link_try("Ctrl+Alt set to Glance", (CTRL, ALT), {"zenith.links.ctrl-alt": "glance"})
    link_try("Ctrl+Shift set to Peek", (CTRL, SHIFT), {"zenith.links.ctrl-alt": None, "zenith.links.ctrl-shift": "peek"})
    say("0.13's settings carried over (Peek swapped, tiles on Ctrl+Alt)", z.js(r"""const P = Services.prefs, L = window.ZenithLinkClicks;
      for (const c of ['alt', 'alt-shift', 'ctrl-alt', 'ctrl-shift']) P.clearUserPref('zenith.links.' + c);
      P.setStringPref('zenith.plus.peek-click', 'alt-swap'); P.setStringPref('zenith.shell.tile-click', 'ctrl-alt');
      L.migrate(); L.update(); const out = { combos: L.read(), 'old settings left': ['zenith.plus.peek-click', 'zenith.shell.tile-click'].filter(k => P.prefHasUserValue(k)) };
      for (const c of ['alt', 'alt-shift', 'ctrl-alt', 'ctrl-shift']) P.clearUserPref('zenith.links.' + c); await zth.sleep(200); out['back to'] = L.read(); return out;"""))

    # --- No limit on tiles ------------------------------------------------------------
    say("tiles: no limit (experimental), seven in one split", z.js(r"""Services.prefs.setStringPref('zenith.shell.tiles', '0'); await zth.sleep(200);
      const tabs = []; for (let i = 0; i < 7; i++) tabs.push(zth.open(arguments[0] + '/page?n=t' + i, { background: i > 0 }));
      gBrowser.selectedTab = tabs[0]; await zth.sleep(2000);
      for (let i = 1; i < 7; i++) { ZenithShell.tiler.insert(tabs[i], tabs[i - 1]); await zth.sleep(500); }
      const d = ZenithShell.tiler.data(tabs[0]), out = { cap: String(gZenViewSplitter.MAX_TABS), tiles: d?.tabs.length };
      gZenViewSplitter.unsplitCurrentView(); await zth.sleep(600); for (const t of tabs) gBrowser.removeTab(t);
      Services.prefs.clearUserPref('zenith.shell.tiles'); await zth.sleep(200); out['cap after'] = gZenViewSplitter.MAX_TABS; return out;""", z.base))

    # --- The bar ----------------------------------------------------------------------
    z.js(r"""const W = gZenWorkspaces; if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(800); }
      await W.changeWorkspaceWithID(W.getWorkspaces()[0].uuid); await zth.sleep(600);
      window.zbT = [zth.open(arguments[0] + '/page?n=one'), zth.open(arguments[0] + '/page?n=two', { background: true })];
      gBrowser.selectedTab = zbT[0]; await zth.sleep(1500); return 1""", z.base)
    say("the bar's cost: CPU idle 20 s, off then on (ms of the main process)", z.js(r"""const cpu = async () => (await ChromeUtils.requestProcInfo()).cpuTime / 1e6;
      const idle = async () => { const a = await cpu(); await zth.sleep(20000); return Math.round(await cpu() - a); };
      const off = await idle();""" + SET.replace("arguments[0]", "{ 'zenith.bar.position': 'top' }").replace("return 1;", "") + r"""
      const on = await idle(); const start = (window.zenithStartup ?? []).filter(e => e.script === 'bar').map(e => e.ms);
      return { off, on, 'bar start (ms)': start };"""))
    say("a clock change: frames laid out again", z.js(r"""const wu = window.windowUtils, flush = () => document.documentElement.getBoundingClientRect();
      flush(); let a = wu.framesReflowed; flush(); const idle = wu.framesReflowed - a;
      Services.prefs.setStringPref('zenith.bar.clock', 'hms'); await zth.sleep(1500);
      const ticks = []; for (let i = 0; i < 3; i++) { flush(); a = wu.framesReflowed; await zth.sleep(1000); flush(); ticks.push(wu.framesReflowed - a); }
      Services.prefs.clearUserPref('zenith.bar.clock'); await zth.sleep(300);
      const clock = document.querySelector('#zenith-bar [mod="clock"]'); flush(); a = wu.framesReflowed; clock.click(); flush(); const change = wu.framesReflowed - a;
      clock.click(); flush();
      return { 'with nothing changed': idle, 'a second ticking (3 of them)': ticks, 'time to date (the width changes)': change, 'elements in the window': document.querySelectorAll('*').length };"""))
    z.js("zbT.push(zth.open(arguments[0] + '/music', { background: true })); await zth.sleep(1500); return 1", z.base)
    say("bar at the top: modules, buttons, title", z.js(r"""const bar = document.getElementById('zenith-bar'), r = bar.getBoundingClientRect();
      const mods = [...bar.querySelectorAll('.zb-mod')].filter(m => !m.hidden).map(m => m.getAttribute('mod'));
      const clock = bar.querySelector('[mod="clock"]').textContent, title = bar.querySelector('[mod="title"]').textContent;
      gBrowser.selectedTab = zbT[1]; await zth.sleep(300); const title2 = bar.querySelector('[mod="title"]').textContent;
      return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], mods, clock, title, 'title after switching': title2,
               'window buttons in the bar': !!bar.querySelector('.titlebar-buttonbox-container'),
               media: bar.querySelector('[mod="media"]').textContent };"""))
    z.screenshot(str(OUT / "bar-islands.png"))
    say("spaces: a click on 2, the wheel back to 1", z.js(r"""const W = gZenWorkspaces, ids = W.getWorkspaces().map(s => s.uuid), at = () => ids.indexOf(W.activeWorkspace) + 1;
      const sp = document.querySelectorAll('#zenith-bar .zb-space'); sp[1].click(); await zth.sleep(1200); const a = at();
      const cur = () => [...document.querySelectorAll('#zenith-bar .zb-space')].findIndex(b => b.hasAttribute('current')) + 1; const shown = cur();
      sp[0].dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true })); await zth.sleep(1200);
      return { 'after a click': a, 'bar shows': shown, 'after the wheel': at(), 'bar shows after': cur() };"""))
    say("the clock: a click shows the date; timers count down; downloads under way", z.js(r"""const bar = document.getElementById('zenith-bar');
      const clock = bar.querySelector('[mod="clock"]'); clock.click(); const date = clock.textContent; clock.click();
      Services.prefs.setStringPref('zenith.internal.timers', JSON.stringify([{ end: Date.now() + 95000, label: 'tea', start: Date.now() }]));
      await zth.sleep(400); const t = bar.querySelector('[mod="timers"]'), t1 = t.textContent; await zth.sleep(2100); const t2 = t.textContent;
      Services.prefs.clearUserPref('zenith.internal.timers'); await zth.sleep(300); const tHidden = t.hidden;
      const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
      const target = PathUtils.join(PathUtils.tempDir, 'zenith-bar-test.bin'), d = await Downloads.createDownload({ source: arguments[0] + '/download', target });
      const list = await Downloads.getList(Downloads.ALL); await list.add(d); d.start().catch(() => {}); await zth.sleep(2500);
      const dl = bar.querySelector('[mod="downloads"]'), going = [dl.hidden, dl.textContent];
      await d.cancel(); await list.remove(d); await d.finalize(true); await zth.sleep(600); const done = [dl.hidden, dl.querySelector('.zb-i')?.getAttribute('icon')];
      return { date, 'timer': [t1, t2], 'timer gone': tHidden, 'download going': going, 'download done': done };""", z.base))
    say("resize mode shows in the bar", z.js(r"""ZenithShell.tiler.insert(zbT[1], zbT[0], 'right'); await zth.sleep(800); gBrowser.selectedTab = zbT[0]; await zth.sleep(300);
      ZenithShell.modes.resize(); await zth.sleep(200); const m = document.querySelector('#zenith-bar [mod="mode"]');
      const on = [m.hidden, m.textContent, document.getElementById('zenith-mode')?.hasAttribute('show') ?? false];
      ZenithShell.modes.end(); await zth.sleep(200); const off = m.hidden;
      gZenViewSplitter.unsplitCurrentView(); await zth.sleep(500); return { 'in resize mode': on, 'after': off };"""))
    for name, prefs in [("strip", {"zenith.bar.style": "strip"}), ("minimal", {"zenith.bar.style": "minimal"}),
                        ("powerline", {"zenith.bar.style": "powerline"})]:
        z.js(SET, prefs)
        z.screenshot(str(OUT / f"bar-{name}.png"))
    say("tabs in the bar: no sidebar, the taskbar", z.js(SET.replace("return 1;", "") + r"""
      const C = gZenCompactModeManager, tasks = document.querySelector('#zenith-bar [mod="tasks"]');
      const out = { compact: C.preference, 'edge hover': Services.prefs.getBoolPref('zen.view.compact.show-sidebar-and-toolbar-on-hover', true),
                    tasks: [...tasks.querySelectorAll('.zb-task')].map(b => b.title + (b.hasAttribute('current') ? '*' : '')) };
      tasks.querySelectorAll('.zb-task')[1].click(); await zth.sleep(300); out['a click'] = gBrowser.selectedTab.label;
      const extra = zth.open(arguments[1] + '/page?n=extra', { background: true }); await zth.sleep(800);
      const b = [...tasks.querySelectorAll('.zb-task')].find(x => x.zbTab === extra); b.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));
      await zth.sleep(500); out['a middle click closed it'] = !extra.isConnected; return out;""", {"zenith.bar.style": None, "zenith.bar.tabs": "bar", "zenith.bar.tab-look": "current"}, z.base))
    z.screenshot(str(OUT / "bar-tabs.png"))
    say("the sidebar on hover, then back in the sidebar", z.js(SET.replace("return 1;", "") + r"""
      const C = gZenCompactModeManager, a = { compact: C.preference, 'edge hover': Services.prefs.getBoolPref('zen.view.compact.show-sidebar-and-toolbar-on-hover', true) };
      Services.prefs.clearUserPref('zenith.bar.tabs'); await zth.sleep(700); await window.ZenithBar.ready; await zth.sleep(300);
      return { hover: a, sidebar: { compact: C.preference, kept: Services.prefs.prefHasUserValue('zenith.internal.bar.compact-before') } };""", {"zenith.bar.tabs": "hover"}))
    say("palette: Catppuccin Mocha, then your own colours back", z.js(r"""const W = gZenWorkspaces, sig = () => JSON.stringify(W.getWorkspaces().map(s => s.theme?.gradientColors?.map(c => c.c)));
      const before = sig(); Services.prefs.setStringPref('zenith.palette', 'catppuccin-mocha'); await zth.sleep(1000);
      const root = document.documentElement, on = { accent: getComputedStyle(root).getPropertyValue('--zth-accent').trim(), attr: root.getAttribute('zenith-palette'),
        'spaces changed': sig() !== before, 'kept': Services.prefs.prefHasUserValue('zenith.internal.palette.own-spaces') };
      Services.prefs.clearUserPref('zenith.palette'); await zth.sleep(1000);
      return { on, 'back as before': sig() === before, attr: root.getAttribute('zenith-palette'), kept: Services.prefs.prefHasUserValue('zenith.internal.palette.own-spaces') };"""))
    say("the bar off: buttons, compact mode and Firefox's prefs back", z.js(SET.replace("return 1;", "") + r"""
      return { bar: !!document.getElementById('zenith-bar'), 'buttons home': document.querySelector('.titlebar-buttonbox-container')?.parentElement?.id,
               root: [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('zenith-bar')),
               'edge hover pref changed': Services.prefs.prefHasUserValue('zen.view.compact.show-sidebar-and-toolbar-on-hover') };""",
        {k: None for k in ["zenith.bar.position", "zenith.bar.style", "zenith.bar.tabs", "zenith.bar.tab-look"]}))
    z.js("for (const t of window.zbT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
