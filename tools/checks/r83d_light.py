"""0.15.1, inside Zen: light palettes after the window follows the palette's
scheme: the bar in each look, the Dash, the tabs and downloads popups.
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
    for pal, style in [("gruvbox-light", "strip"), ("rose-pine-dawn", "powerline"), ("catppuccin-latte", "islands")]:
        say(f"light: {pal}, {style}", z.js(r"""await zset({ 'zenith.palette': arguments[0], 'zenith.bar.style': arguments[1], 'zenith.bar.top': 'status', 'zenith.bar.bottom': 'tabs', 'zenith.bar.weather': true, 'zenith.bar.resources': true });
          await zth.sleep(1500); const bar = document.getElementById('zenith-bar'), label = gBrowser.selectedTab.querySelector('.tab-label');
          return { bar: getComputedStyle(bar).backgroundColor, 'tab text': getComputedStyle(label).color, 'zen dark?': document.documentElement.getAttribute('zen-should-be-dark-mode') };""", pal, style))
        z.screenshot(str(OUT / f"light-{pal}-{style}.png"))
    z.js("window.ZenithDash.toggle(); await zth.sleep(1200); return 1")
    say("the Dash's timer field", z.js(r"""const f = document.querySelector('.zs-pop[kind="dash"] .zs-field'), cs = f && getComputedStyle(f);
      return f ? { background: cs.backgroundColor, color: cs.color, scheme: cs.colorScheme } : null;"""))
    z.screenshot(str(OUT / "light-dash.png"))
    z.js("await zesc(); return 1")
    say("downloads popup, Delete in red", z.js(r"""const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs'), target = PathUtils.join(PathUtils.tempDir, 'zenith-pop-0151b.html');
      const d = await Downloads.createDownload({ source: arguments[0] + '/page?n=dl', target }); const list = await Downloads.getList(Downloads.ALL); await list.add(d); await d.start(); await zth.sleep(800);
      document.querySelector('#zenith-bar [mod="downloads"]').click(); await zth.sleep(600); const del = document.querySelector('.zs-pop[kind="downloads"] .zs-danger');
      window.zsDl = { d, list }; return { color: del && getComputedStyle(del).color };""", z.base))
    z.screenshot(str(OUT / "light-downloads.png"))
    z.js("await zesc(); await zsDl.list.remove(zsDl.d); await zsDl.d.finalize(true); try { await IOUtils.remove(zsDl.d.target.path); } catch {} return 1")
    z.js("await zset({ 'zenith.palette': null, 'zenith.bar.style': null, 'zenith.bar.top': null, 'zenith.bar.bottom': null, 'zenith.bar.weather': null, 'zenith.bar.resources': null }); for (const t of zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
