"""0.12.0 speed work, inside Zen:
- settings in CSS: the bundle tests no #theme-Zenith attribute; a setting
  takes effect from its pref alone (no attribute), live; 85 settings
  written the way Sine does at start cost a few ms, not 170;
- the window state mirror: container colour, muted, sharing, not secure,
  sidebar out, on the root, following the window;
- palette sync from a pywal colors.json (in a test home folder), and
  :colours undo putting every space back;
- the wallpaper drawn by the worker (and the same picture as the fallback);
- link hints: labels on a page's links, as the actor reports them;
- Fast start (a second start): the look and keys start first, the rest
  only after the page, and every part does start.
Prints what it measured."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

HOME = Path(os.environ["TEMP"]) / "claude" / "r51-home"
(HOME / ".cache" / "wal").mkdir(parents=True, exist_ok=True)
PALETTE = {"special": {"background": "#141018", "foreground": "#e8e0f0", "cursor": "#e8e0f0"},
           "colors": {"color0": "#141018", "color1": "#c2416b", "color2": "#3f8f6b", "color3": "#c9a03c", "color4": "#3b6fb0",
                      "color5": "#8a4fb8", "color6": "#2f9fae", "color7": "#e8e0f0", **{f"color{i}": "#888888" for i in range(8, 16)}}}
(HOME / ".cache" / "wal" / "colors.json").unlink(missing_ok=True)

res = {}
os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({"zenith.internal.palette.home": str(HOME), "zenith.internal.palette.applied": ""})
with Scene() as z:
    res["css"] = z.js("""
      const dir = PathUtils.join(PathUtils.profileDir, 'chrome', 'sine-mods');
      const id = Object.keys(JSON.parse(await IOUtils.readUTF8(PathUtils.join(dir, 'mods.json'))))[0];
      const css = await IOUtils.readUTF8(PathUtils.join(dir, id, 'chrome.css'));
      const out = { 'setting tests by attribute': (css.match(/#theme-Zenith/g) ?? []).length,
                    'setting tests by pref': (css.match(/-moz-pref\\("zenith\\./g) ?? []).length,
                    ':has( left': (css.match(/:has\\(/g) ?? []).length };
      // A setting from its pref alone: no attribute on #theme-Zenith.
      const theme = document.getElementById('theme-Zenith');
      const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--zth-accent').trim().slice(0, 40);
      theme.removeAttribute('zenith-core-accent');
      Services.prefs.setStringPref('zenith.core.accent', 'teal'); await zth.sleep(100);
      const teal = accent();
      Services.prefs.setStringPref('zenith.core.accent', 'amber'); await zth.sleep(100);
      const amber = accent();
      Services.prefs.setStringPref('zenith.core.accent', ''); await zth.sleep(100);
      out['accent from the pref: teal, amber, default'] = [teal, amber, accent()];
      // Sine writing every setting at start (twice, as a change and back).
      const flush = () => { getComputedStyle(document.documentElement).color; document.documentElement.getBoundingClientRect(); };
      const attrs = [...theme.attributes].filter(a => a.name.startsWith('zenith-')).map(a => [a.name, a.value]);
      const t = [];
      for (let k = 0; k < 5; k++) {
        flush(); const a = performance.now();
        for (const [n, v] of attrs) theme.setAttribute(n, v + 'x');
        for (const [n, v] of attrs) theme.setAttribute(n, v);
        flush(); t.push(performance.now() - a); await zth.sleep(50);
      }
      out[`${attrs.length} settings written twice (ms, median)`] = +t.sort((a, b) => a - b)[2].toFixed(1);
      return out;""")

    res["window state"] = z.js("""
      const R = document.documentElement, has = n => R.hasAttribute(n) ? (R.getAttribute(n) || true) : false;
      const out = {};
      const tab = zth.open(arguments[0] + '/page?n=box', { container: 1 }); await zth.sleep(1200);
      const colour = [...tab.classList].find(c => c.startsWith('identity-color-'))?.slice(15);
      out['container tab: its colour, root'] = [colour, has('zenith-container'),
        getComputedStyle(R).getPropertyValue('--zth-container').trim()];
      const plain = zth.open(arguments[0] + '/page?n=plain'); await zth.sleep(800);
      out['plain tab: root'] = has('zenith-container');
      plain.toggleMuteAudio(); await zth.sleep(300);
      out['muted'] = has('zenith-tab-muted');
      plain.toggleMuteAudio(); await zth.sleep(300);
      out['unmuted'] = has('zenith-tab-muted');
      tab.setAttribute('sharing', 'camera'); gBrowser._tabAttrModified(tab, ['sharing']); await zth.sleep(200);
      out['a tab sharing (not selected)'] = has('zenith-sharing');
      tab.removeAttribute('sharing'); gBrowser._tabAttrModified(tab, ['sharing']); await zth.sleep(200);
      out['sharing stopped'] = has('zenith-sharing');
      const bar = document.getElementById('urlbar'), id = document.getElementById('identity-box');
      const was = [bar.getAttribute('pageproxystate'), id.className];
      bar.setAttribute('pageproxystate', 'valid'); id.classList.add('notSecure'); await zth.sleep(100);
      const insecure = has('zenith-insecure');
      bar.setAttribute('open', 'true'); await zth.sleep(100);
      const typing = has('zenith-insecure');
      bar.removeAttribute('open'); bar.setAttribute('pageproxystate', was[0] ?? 'invalid'); id.className = was[1]; await zth.sleep(100);
      out['not secure, then while typing, then back'] = [insecure, typing, has('zenith-insecure')];
      zth.reveal(true); await zth.sleep(100);
      const out1 = has('zenith-sidebar-out');
      zth.reveal(false); await zth.sleep(100);
      out['sidebar out, then back'] = [out1, has('zenith-sidebar-out')];
      return out;""", z.base)

    res["palette sync"] = z.js("""
      const W = gZenWorkspaces;
      if (W.getWorkspaces().length < 2) await W.createAndSaveWorkspace('Second', undefined, true);
      await zth.sleep(500);
      const before = W.getWorkspaces().map(s => JSON.stringify(s.theme?.gradientColors?.map(d => d.c) ?? []));
      Services.prefs.setStringPref('zenith.plus.palette-sync', 'pywal');
      await IOUtils.writeUTF8(arguments[0], arguments[1]);
      await window.ZenithPalette.check(); await zth.sleep(500);
      const after = W.getWorkspaces().map(s => s.theme?.gradientColors?.map(d => d.c) ?? []);
      // The same file again: nothing changes.
      W.getWorkspaces()[0].theme.gradientColors[0].c = [1, 2, 3];
      window.ZenithPalette.last = null; await window.ZenithPalette.check();
      const untouched = JSON.stringify(W.getWorkspaces()[0].theme.gradientColors[0].c) === '[1,2,3]';
      window.ZenithColours.undo(); await zth.sleep(300);
      const undone = W.getWorkspaces().map(s => JSON.stringify(s.theme?.gradientColors?.map(d => d.c) ?? []));
      Services.prefs.setStringPref('zenith.plus.palette-sync', '');
      return { 'spaces': after.length, 'colours per space': after.map(c => c.length), 'every space the same': after.every(c => JSON.stringify(c) === JSON.stringify(after[0])),
               'colours': after[0], 'same file again: left alone': untouched, 'undo: back as before': JSON.stringify(undone) === JSON.stringify(before) };""",
        str(HOME / ".cache" / "wal" / "colors.json"), json.dumps(PALETTE))

    res["wallpaper worker"] = z.js("""
      const Wp = window.ZenithWallpaper;
      // A desktop of two screens, one picture each (a generated PNG).
      const canvas = new OffscreenCanvas(400, 300), g = canvas.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 400, 300); grad.addColorStop(0, '#c2416b'); grad.addColorStop(1, '#2f9fae');
      g.fillStyle = grad; g.fillRect(0, 0, 400, 300);
      const file = PathUtils.join(PathUtils.tempDir, 'zth-r51-wall.png');
      await IOUtils.write(file, new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer()));
      const src = { area: [0, 0, 3840, 1080], colour: '10 10 10', fit: 'fill',
                    screens: [{ rect: [0, 0, 1920, 1080], file }, { rect: [1920, 0, 3840, 1080], file }] };
      Wp.worker?.terminate(); Wp.worker = null;
      let t = performance.now();
      const away = await Wp.render(src);
      const tAway = performance.now() - t;
      const viaWorker = !!Wp.worker;
      // The same drawing in the window (the fallback), to compare.
      t = performance.now();
      const { paint } = await import(await Wp.painter());
      const screens = await Promise.all(src.screens.map(async s => ({ rect: s.rect, bytes: await IOUtils.read(s.file) })));
      const here = await paint({ area: src.area, k: 1, colour: 'rgb(10 10 10)', fit: 'fill', screens });
      const tHere = performance.now() - t;
      const px = async blob => { const b = await createImageBitmap(blob); const c = new OffscreenCanvas(8, 2); const x = c.getContext('2d'); x.drawImage(b, 0, 0, 8, 2);
                                  return [...x.getImageData(0, 0, 8, 2).data].filter((_, i) => i % 4 !== 3); };
      const a = await px(away), b = await px(here);
      return { 'drawn by the worker': viaWorker, 'size (KB)': Math.round(away.size / 1024), 'worker ms': Math.round(tAway), 'in the window ms': Math.round(tHere),
               'same picture (max channel difference)': Math.max(...a.map((v, i) => Math.abs(v - b[i]))) };""")

    res["link hints"] = z.js("""
      const links = Array.from({ length: 5 }, (_, i) => `<p><a href="${arguments[0]}/page?n=link${i}">Link number ${i}</a></p>`).join('');
      const tab = zth.open('data:text/html,' + encodeURIComponent('<!doctype html><title>Links</title><body style="font:20px sans-serif">' + links + '<button>A button</button><input placeholder=field>'));
      await zth.sleep(1500);
      await window.ZenithHints.show(false); await zth.sleep(500);
      const actor = tab.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithHints');
      const state = await actor.sendQuery('state');
      actor.sendAsyncMessage('hide'); await zth.sleep(200);
      const after = await actor.sendQuery('state');
      return { labels: state?.labels, 'gone after hide': !after?.labels };""", z.base)

    res["startup parts (normal)"] = z.js("""return (window.zenithStartup ?? []).length""")
    res["css errors"] = z.console_errors()

# Fast start: a second start with it on.
os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({"zenith.plus.fast-start": True})
with Scene() as z:
    res["fast start"] = z.js("""
      for (let i = 0; i < 60 && (window.zenithStartup ?? []).length < arguments[0]; i++) await zth.sleep(250);
      const info = Services.startup.getStartupInfo(), origin = performance.timeOrigin, p = +info.process;
      const rel = ms => Math.round(ms + origin - p);
      const L = window.zenithLater, opened = rel(L.openedAt);
      const parts = (window.zenithStartup ?? []).map(e => ({ ...e, at: rel(e.at) }));
      // Parts asked for before the queue opened: the first-picture ones ran
      // at once, the rest waited for it.
      const deferred = ['minimap', 'zoom pills', 'rules', 'download names', 'palette sync', 'more menus'];
      const early = parts.filter(e => !deferred.includes(e.name) && e.at < opened);
      const waited = parts.filter(e => deferred.includes(e.name));
      return { on: L.fast, 'queue opened at': opened, 'page loaded at (first paint)': rel(0) && +info.firstPaint2 - p,
               'first-picture parts before it': early.length, 'deferred parts': waited.map(e => `${e.script}: ${e.name} @${e.at}`),
               'every deferred part after the queue opened': waited.every(e => e.at >= opened - 1),
               'all started (normal start had)': [parts.length, arguments[0]] };""", res["startup parts (normal)"])
print(json.dumps(res, indent=1, ensure_ascii=False))
