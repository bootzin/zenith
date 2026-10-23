"""0.15.1, inside Zen: frame by frame, does a new tile show alone before it
joins the split (Ctrl+T in a split with the start page as new tabs, a link
as a tile, Alt+Shift+Enter)? The rail layout (clock in two lines, the wide
bar's tabs in a column). Light palettes on the bar, its popups and the
Dash, for contrast. Screenshots go to argv[1]."""
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
const VK = { T: 0x54, N: 0x4E, Enter: 0x0D, Esc: 0x1B };
window.zk = async (k, mods = 'alt', wait = 350) => {
  const m = (mods.includes('alt') ? 0x1000 : 0) | (mods.includes('shift') ? 0x0100 : 0) | (mods.includes('ctrl') ? 0x0400 : 0);
  const ch = k.length === 1 ? k.toLowerCase() : k === 'Enter' ? '\r' : '';
  await new Promise(r => { const t = setTimeout(r, 300); wu.sendNativeKeyEvent(0x409, VK[k], m, ch, ch, { observe() { clearTimeout(t); r(); } }); });
  await zth.sleep(wait);
};
window.zset = async o => { const P = Services.prefs; for (const [k, v] of Object.entries(o)) { if (v === null) P.clearUserPref(k); else if (typeof v === 'boolean') P.setBoolPref(k, v); else P.setStringPref(k, v); }
  await zth.sleep(500); await window.ZenithBar?.ready; await zth.sleep(400); };
window.zbox = el => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
window.zesc = async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(250); };
// Every frame for a while: the new tab (selected? in a split?) and how much
// of the page area its browser takes; runs of the same frame collapsed.
window.zrec = (frames = 50) => new Promise(res => {
  const out = [], panel = document.getElementById('tabbrowser-tabpanels'), before = new Set(gBrowser.tabs); let n = 0;
  const step = () => {
    const pw = panel.getBoundingClientRect().width, t = gBrowser.tabs.find(x => !before.has(x) && !x.hasAttribute('zen-empty-tab'));
    const c = t?.linkedBrowser?.closest('.browserSidebarContainer'), r = c?.getBoundingClientRect();
    const shown = c ? getComputedStyle(c).display !== 'none' && getComputedStyle(c).visibility !== 'hidden' && r.width > 0 : false;
    const f = t ? `${gBrowser.selectedTab === t ? 'sel' : 'bg'} ${t.splitView ? 'split' : 'alone'} ${shown ? Math.round(r.width / pw * 100) + '%' : 'hidden'}` : 'none';
    if (out.length && out.at(-1)[0] === f) out.at(-1)[1]++; else out.push([f, 1]);
    if (++n < frames) requestAnimationFrame(step); else res(out.map(([f, k]) => k > 1 ? `${f} ×${k}` : f));
  };
  requestAnimationFrame(step);
});
window.zsplit = async () => { gBrowser.selectedTab = zT[0]; await zth.sleep(300); gZenViewSplitter.splitTabs([zT[0], zT[1]], 'vsep', 0); await zth.sleep(900); gBrowser.selectedTab = zT[0]; await zth.sleep(400); };
window.zunsplit = async () => { for (const t of [...gBrowser.tabs]) if (!zT.includes(t) && !t.hasAttribute('zen-empty-tab') && !t.pinned) gBrowser.removeTab(t);
  await zth.sleep(400); for (const t of zT) if (t.splitView) gZenViewSplitter.removeTabFromGroup(t); await zth.sleep(700); };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); Services.prefs.clearUserPref('zenith.internal.float.kept'); return 1")
    z.js(r"""window.zT = [zth.open(arguments[0] + '/page?n=left'), zth.open(arguments[0] + '/page?n=right', { background: true })]; await zth.sleep(1800); return 1""", z.base)

    say("Ctrl+T in a split, the start page as new tabs", z.js(r"""await zset({ 'zenith.plus.startpage': 'newtab' }); await zsplit();
      const rec = zrec(); await zk('T', 'ctrl', 0); const frames = await rec; await zth.sleep(500);
      const t = gBrowser.selectedTab; return { frames, url: t.linkedBrowser.currentURI.spec, 'in the split': !!t.splitView };"""))
    z.screenshot(str(OUT / "flash-ctrl-t.png"))
    z.js("await zunsplit(); return 1")
    say("a link as a tile (in a split)", z.js(r"""await zsplit(); const rec = zrec();
      window.ZenithShell.tiler.link(arguments[0] + '/page?n=linked', null, zT[0].linkedBrowser); const frames = await rec; await zth.sleep(400);
      return { frames, 'in the split': !!gBrowser.selectedTab.splitView };""", z.base))
    z.js("await zunsplit(); return 1")
    say("a link as a tile (no split yet)", z.js(r"""gBrowser.selectedTab = zT[0]; await zth.sleep(300); const rec = zrec();
      window.ZenithShell.tiler.link(arguments[0] + '/page?n=linked2', null, zT[0].linkedBrowser); const frames = await rec; await zth.sleep(400);
      return { frames, 'in the split': !!gBrowser.selectedTab.splitView };""", z.base))
    z.js("await zunsplit(); return 1")
    say("Alt+Shift+Enter in a split (start page as new tabs)", z.js(r"""await zsplit(); const rec = zrec();
      await zk('Enter', 'alt shift', 0); const frames = await rec; await zth.sleep(400);
      return { frames, url: gBrowser.selectedBrowser.currentURI.spec, 'in the split': !!gBrowser.selectedTab.splitView };"""))
    z.js("await zunsplit(); await zset({ 'zenith.plus.startpage': null }); return 1")

    say("the rail layout", z.js(r"""await zset({ 'zenith.bar.left': 'both', 'zenith.sidebar': 'hidden' }); await zth.sleep(600);
      const b = document.getElementById('zenith-bar-left'), clock = b?.querySelector('[mod="clock"]');
      return { box: zbox(b), mods: [...b.querySelectorAll('.zb-mod')].filter(m => !m.hidden).map(m => m.getAttribute('mod')), clock: clock?.textContent, 'clock box': zbox(clock) };"""))
    z.screenshot(str(OUT / "rail.png"))
    say("the rail, wide", z.js(r"""await zset({ 'zenith.bar.side-width': 'wide' }); await zth.sleep(600); const b = document.getElementById('zenith-bar-left');
      const tasks = b.querySelector('[mod="tasks"]'); return { box: zbox(b), tasks: zbox(tasks), direction: getComputedStyle(tasks).flexDirection, clock: b.querySelector('[mod="clock"]')?.textContent,
        rows: [...tasks.querySelectorAll('.zb-task')].map(zbox) };"""))
    z.screenshot(str(OUT / "rail-wide.png"))
    z.js("await zset({ 'zenith.bar.left': null, 'zenith.sidebar': null, 'zenith.bar.side-width': null }); return 1")

    for pal, style in [("catppuccin-latte", "islands"), ("gruvbox-light", "strip"), ("rose-pine-dawn", "powerline"), ("catppuccin-latte", "minimal")]:
        say(f"light: {pal}, {style}", z.js(r"""await zset({ 'zenith.palette': arguments[0], 'zenith.bar.style': arguments[1], 'zenith.bar.top': 'status', 'zenith.bar.bottom': 'tabs', 'zenith.bar.weather': true, 'zenith.bar.resources': true });
          await zth.sleep(900); const bar = document.getElementById('zenith-bar');
          const mods = [...bar.querySelectorAll('.zb-mod')].filter(m => !m.hidden && m.getBoundingClientRect().width).map(m => { const cs = getComputedStyle(m); return [m.getAttribute('mod'), cs.color, cs.backgroundColor]; });
          return { bar: getComputedStyle(bar).backgroundColor, mods };""", pal, style))
        z.screenshot(str(OUT / f"light-{pal}-{style}.png"))
    z.js("window.ZenithDash.toggle(); await zth.sleep(1200); return 1")
    z.screenshot(str(OUT / "light-dash.png"))
    z.js("await zesc(); document.querySelector('#zenith-bar [mod=\"appearance\"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await zth.sleep(500); return 1")
    z.screenshot(str(OUT / "light-appearance.png"))
    z.js("await zesc(); await zset({ 'zenith.palette': null, 'zenith.bar.style': null, 'zenith.bar.top': null, 'zenith.bar.bottom': null, 'zenith.bar.weather': null, 'zenith.bar.resources': null }); for (const t of zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
