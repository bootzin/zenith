"""0.16.2, inside Zen: each space's essentials only (Zen's separate
essentials: two spaces with containers), the switcher going to an essential
of the other space (awake and asleep); palette colours with a site left
alone; the Dash's three ways; containers' lines on four sides and the ring;
every module in a wide side bar (rows with names, icons side by side); Peek's
prompt over the Peek from Ctrl+L, F4 and Alt+Q (what's drawn there, not only
the field's value). Screenshots go to argv[1]."""
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
window.zkey = async (vk, ch, mods) => { await new Promise(r => { const t = setTimeout(r, 400); wu.sendNativeKeyEvent(0x409, vk, mods, ch, ch, { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(400); };
window.zlum = async (tab = gBrowser.selectedTab) => { const b = tab.linkedBrowser; const w = b.clientWidth, h = b.clientHeight; if (!w) return null;
  const bmp = await b.drawSnapshot(0, 0, w, h, 48 / w, 'magenta'); const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return Math.round(s / n); };
window.zopen = (u, o = {}) => gBrowser.addTab(u, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true, ...o });
// Is the prompt what's drawn at its own middle (not something over it)?
window.zpromptOnTop = () => { const box = document.getElementById('zenith-peek-box') ?? document.getElementById('zenith-peek'); if (!box || box.closest('[hidden]')) return 'not shown';
  const r = box.getBoundingClientRect(); if (!r.width) return 'no size'; const at = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(18, r.height / 2));
  return at && box.contains(at) ? true : `covered by ${at?.localName}#${at?.id}`; };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)

    say("essentials: each space its container's", z.js(r"""const W = gZenWorkspaces; const out = { separate: W.containerSpecificEssentials };
      const first = W.getActiveWorkspaceFromCache(); window.zFirst = first.uuid;
      // (This space in container 1, another in container 2.)
      first.containerTabId = 1; await W.saveWorkspace?.(first); await zth.sleep(300);
      const second = await W.createAndSaveWorkspace('Work', undefined, true, 2); window.zSecond = second.uuid; await zth.sleep(800);
      const mine = zopen(zBase() + '/page?n=mine', { userContextId: 1 }), theirs = zopen(zBase() + '/page?n=theirs', { userContextId: 2 }), theirsAsleep = zopen(zBase() + '/page?n=theirs-asleep', { userContextId: 2 });
      await zth.sleep(2500); for (const t of [mine, theirs, theirsAsleep]) gZenPinnedTabManager.addToEssentials(t, { replicating: true }); /* (Zen only lets you add your space's container's: as another window would) */ await zth.sleep(800);
      gBrowser.discardBrowser(theirsAsleep); await zth.sleep(500); window.zEss = { mine, theirs, theirsAsleep };
      await zset({ 'zenith.bar.bottom': 'on', 'zenith.bar.bottom.modules': '|tabs|' }); await zth.sleep(800);
      const strip = [...document.querySelectorAll('#zenith-bar-bottom .zb-task:not(.zb-task-more)')].map(b => b.zbTab?.label);
      out['in the bar'] = strip.filter(l => /mine|theirs/.test(l ?? '')); out['shows here'] = Object.fromEntries(Object.entries(zEss).map(([k, t]) => [k, ZenithSpaceTabs.shows(t)]));
      return out;""".replace("zBase()", "arguments[0]"), z.base))
    z.js("window.zBase = arguments[0]; return 1", z.base)

    say("the bar's list: this space's tabs", z.js(r"""const more = document.querySelector('#zenith-bar-bottom [mod="tasks-more"]'); more.hidden = false; more.click(); await zth.sleep(700);
      const rows = [...document.querySelectorAll('.zs-pop[kind="tabs"] .zs-row')].map(r => r.textContent); document.querySelector('.zs-pop[kind="tabs"]') && window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(300);
      return rows.filter(l => /mine|theirs/.test(l));"""))

    say("the switcher: another space's essential, awake and asleep", z.js(r"""const S = window.ZenithSwitcher, out = {}; const space = () => gZenWorkspaces.activeWorkspace === zSecond ? 'Work' : 'first';
      for (const k of ['theirs', 'theirsAsleep']) { gZenWorkspaces.changeWorkspaceWithID(zFirst); await zth.sleep(1200);
        const item = S.Items.all().find(i => i.kind === 'tab' && i.tab === zEss[k]);
        await S.go(item); await zth.sleep(1500);
        out[k] = { listed: !!item, 'its space shown': item?.space, 'tab you are on': gBrowser.selectedTab === zEss[k], space: space() }; }
      gZenWorkspaces.changeWorkspaceWithID(zFirst); await zth.sleep(1200); return out;"""))

    say("palette colours, a site left alone", z.js(r"""await zset({ 'zenith.palette': 'dracula', 'zenith.plus.appearance-force': 'palette' }); const t = zopen(zBase + '/links'); gBrowser.selectedTab = t; await zth.sleep(2000);
      const out = { 'palette (dark expected)': await zlum(t) }; window.ZenithAppearance.leaveAlone('127.0.0.1', true); await zth.sleep(1500); out['left alone (white expected)'] = await zlum(t);
      t.linkedBrowser.reload(); await zth.sleep(2000); out['left alone, reloaded'] = await zlum(t); const t2 = zopen(zBase + '/links?again'); gBrowser.selectedTab = t2; await zth.sleep(2000); out['left alone, a new tab'] = await zlum(t2);
      window.ZenithAppearance.leaveAlone('127.0.0.1', false); await zth.sleep(1500); out['as the rest again'] = await zlum(t2); window.zPalT = [t, t2]; return out;"""))
    z.screenshot(str(OUT / "palette.png"))
    z.js("for (const t of zPalT) gBrowser.removeTab(t); await zset({ 'zenith.plus.appearance-force': null }); return 1")

    say("the Dash: how pages are made dark or light", z.js(r"""window.ZenithDash.toggle(); await zth.sleep(1500); const seg = document.querySelector('.zs-pop[kind="dash"] .zd-seg'); if (!seg) return 'no row';
      const lit = () => [...seg.children].filter(b => b.hasAttribute('on')).map(b => b.textContent).join(); const out = { buttons: [...seg.children].map(b => b.textContent), lit: lit(), box: zbox(seg) };
      seg.children[1].click(); await zth.sleep(400); out['after Palette'] = [P.getStringPref('zenith.plus.appearance-force', ''), lit()]; seg.children[0].click(); await zth.sleep(400); out['after Invert'] = [P.getStringPref('zenith.plus.appearance-force', '(as it comes)'), lit()];
      return out;"""))
    z.screenshot(str(OUT / "dash.png"))
    z.js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(300); window.ZenithDash.toggle?.(); await zth.sleep(200); document.querySelector('.zs-pop[kind=\"dash\"]') && window.ZenithDash.toggle(); return 1")

    say("containers of other tabs: four sides and the ring", z.js(r"""const t = zopen(zBase + '/page?n=boxed', { userContextId: 1 }); window.zBoxed = t; await zth.sleep(1200); const out = {};
      await zset({ 'zenith.bar.bottom': 'on', 'zenith.bar.bottom.modules': '|tabs|' }); await zth.sleep(600);
      const box = () => [...document.querySelectorAll('#zenith-bar-bottom .zb-task')].find(b => b.zbTab === t);
      for (const side of ['top', 'bottom', 'left', 'right']) { await zset({ 'zenith.bar.container-hint': side }); const s = getComputedStyle(box(), '::after'); out[side] = `${s.top} ${s.right} ${s.bottom} ${s.left} ${s.width}x${s.height}`; }
      await zset({ 'zenith.bar.container-hint': 'ring' }); const img = getComputedStyle(box().querySelector('img')); out.ring = `${img.outlineWidth} at ${img.outlineOffset}`;
      await zset({ 'zenith.bar.container-hint': null }); return out;"""))

    for rows in ["labels", "icons"]:
        say(f"a wide side bar, {rows}", z.js(r"""await zset({ 'zenith.bar.bottom': null, 'zenith.bar.bottom.modules': null, 'zenith.bar.left': 'on', 'zenith.bar.right': 'on', 'zenith.bar.side-width': 'wide', 'zenith.bar.side-rows': arguments[0], 'zenith.bar.downloads-always': true,
          'zenith.bar.left.modules': 'launcher,spaces,mode,layout,overview|title,media|downloads,timers,weather', 'zenith.bar.right.modules': 'memory,appearance,extensions|tabs|clock,buttons,power' }); await zth.sleep(1500);
          const out = {}; for (const m of document.querySelectorAll('.zenith-bar[vertical] .zb-mod')) { if (m.hidden || m.getAttribute('mod') === 'tasks') continue; const b = m.closest('.zenith-bar').getBoundingClientRect(), r = m.getBoundingClientRect();
            out[m.getAttribute('mod')] = { at: [Math.round(r.left - b.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: m.textContent.trim().replace(/\s+/g, ' ').slice(0, 30),
              'inside the bar': r.left >= b.left - 0.5 && r.right <= b.right + 0.5, 'cut': m.scrollWidth > m.clientWidth + 1 }; }
          const bb = document.querySelector('.zenith-bar[edge="right"] .titlebar-buttonbox'); out['window buttons'] = bb ? getComputedStyle(bb).flexDirection : null; return out;""", rows))
        z.screenshot(str(OUT / f"wide-{rows}.png"))
    z.js("await zset({ 'zenith.bar.left': null, 'zenith.bar.right': null, 'zenith.bar.side-width': null, 'zenith.bar.side-rows': null, 'zenith.bar.downloads-always': null, 'zenith.bar.left.modules': null, 'zenith.bar.right.modules': null }); return 1")

    say("Peek: the prompt is drawn over it", z.js(r"""const out = {}; const peek = async () => { if (!gZenGlanceManager.detachedBrowser) { await window.ZenithPeek.open(zBase + '/page?n=peeked'); await zth.sleep(2500); } gZenGlanceManager.detachedBrowser.focus(); await zth.sleep(300); };
      const esc = async () => { const i = document.getElementById('zenith-peek-input'); i?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await zth.sleep(400); };
      await peek(); await zkey(0x4C, 'l', 0x0400); await zth.sleep(500); out['Ctrl+L'] = { value: document.getElementById('zenith-peek-input')?.value, 'on top': zpromptOnTop() }; window.zShotPeek = 1; return out;"""))
    z.screenshot(str(OUT / "peek-ctrl-l.png"))
    say("Peek: F4 and Alt+Q", z.js(r"""const out = {}; const esc = async () => { const i = document.getElementById('zenith-peek-input'); i?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await zth.sleep(400); };
      await esc(); if (!gZenGlanceManager.detachedBrowser) { await window.ZenithPeek.open(zBase + '/page?n=peeked'); await zth.sleep(2500); } gZenGlanceManager.detachedBrowser.focus(); await zth.sleep(300);
      await zkey(0x73, '', 0); await zth.sleep(500); out.F4 = { value: document.getElementById('zenith-peek-input')?.value, 'on top': zpromptOnTop() }; await esc();
      if (!gZenGlanceManager.detachedBrowser) { await window.ZenithPeek.open(zBase + '/page?n=peeked'); await zth.sleep(2500); } gZenGlanceManager.detachedBrowser.focus(); await zth.sleep(300);
      await zkey(0x51, 'q', 0x1000); await zth.sleep(600); out['Alt+Q'] = { 'on top': zpromptOnTop() }; await esc(); try { gZenGlanceManager.closeDetachedGlance(); } catch {} await zth.sleep(600); return out;"""))

    z.js(r"""for (const t of [...Object.values(window.zEss ?? {}), window.zBoxed]) if (t?.isConnected) gBrowser.removeTab(t); P.clearUserPref('zenith.palette');
      try { gZenWorkspaces.changeWorkspaceWithID(zFirst); await zth.sleep(800); await gZenWorkspaces.removeWorkspace(zSecond); } catch {} return 1""")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
