"""0.15.1, inside Zen: frame by frame, the other ways a new tab joins a
split (Firefox's "new tab beside", Zen's split "+", both with the start page
as new tabs and with Zen's address bar); a light palette makes the whole
window light. Screenshots go to argv[1]."""
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
window.zk = async (vk, ch, mods = 0, wait = 350) => {
  await new Promise(r => { const t = setTimeout(r, 300); wu.sendNativeKeyEvent(0x409, vk, mods, ch, ch, { observe() { clearTimeout(t); r(); } }); });
  await zth.sleep(wait);
};
window.zset = async o => { const P = Services.prefs; for (const [k, v] of Object.entries(o)) { if (v === null) P.clearUserPref(k); else if (typeof v === 'boolean') P.setBoolPref(k, v); else if (typeof v === 'number') P.setIntPref(k, v); else P.setStringPref(k, v); }
  await zth.sleep(500); await window.ZenithBar?.ready; await zth.sleep(400); };
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
  await zth.sleep(400); gZenViewSplitter.unsplitCurrentView?.(); for (const t of zT) if (t.splitView) gZenViewSplitter.removeTabFromGroup(t); await zth.sleep(700); };
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(KEYS)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.ZenithFloat?.back?.(); Services.prefs.clearUserPref('zenith.internal.float.kept'); return 1")
    z.js(r"""window.zT = [zth.open(arguments[0] + '/page?n=left'), zth.open(arguments[0] + '/page?n=right', { background: true })]; await zth.sleep(1800); return 1""", z.base)

    for start in ["newtab", None]:
        what = "the start page" if start else "Zen's address bar"
        say(f"Firefox's new tab beside, in a split ({what})", z.js(r"""await zset({ 'zenith.plus.startpage': arguments[0] }); await zsplit(); const rec = zrec(70);
          gBrowser.addAdjacentNewTab(zT[0]); await zth.sleep(300);
          if (!arguments[0]) { gURLBar.value = arguments[1] + '/page?n=typed'; await zk(0x0D, '\r', 0, 0); }
          const frames = await rec; await zth.sleep(500); const t = gBrowser.selectedTab;
          return { frames, url: t.linkedBrowser.currentURI.spec, 'in the split': !!t.splitView };""", start, z.base))
        z.js("await zunsplit(); return 1")
        say(f"Zen's split +, in a split ({what})", z.js(r"""await zsplit(); const rec = zrec(70);
          gZenViewSplitter.createEmptySplit(); await zth.sleep(300);
          if (!arguments[0]) { gURLBar.value = arguments[1] + '/page?n=typed'; await zk(0x0D, '\r', 0, 0); }
          const frames = await rec; await zth.sleep(500); const t = gBrowser.selectedTab;
          return { frames, url: t.linkedBrowser.currentURI.spec, 'in the split': !!t.splitView };""", start, z.base))
        z.js("await zunsplit(); return 1")
    z.js("await zset({ 'zenith.plus.startpage': null }); return 1")

    say("Zen's window scheme: what 0 and 1 are", z.js(r"""const dark = () => matchMedia('(prefers-color-scheme: dark)').matches, out = {};
      for (const v of [0, 1, 2]) { await zset({ 'zen.view.window.scheme': v }); await zth.sleep(500); out[v] = dark() ? 'dark' : 'light'; }
      Services.prefs.clearUserPref('zen.view.window.scheme'); return out;"""))
    say("a light palette makes the window light", z.js(r"""await zset({ 'zenith.palette': 'catppuccin-latte', 'zenith.bar.top': 'status' }); await zth.sleep(1500);
      const label = gBrowser.selectedTab.querySelector('.tab-label'), bar = document.getElementById('zenith-bar');
      return { scheme: Services.prefs.getIntPref('zen.view.window.scheme', -1), dark: matchMedia('(prefers-color-scheme: dark)').matches, 'zen dark text?': document.documentElement.getAttribute('zen-should-be-dark-mode'),
        'tab text': getComputedStyle(label).color, 'bar background': getComputedStyle(bar).backgroundColor };"""))
    z.screenshot(str(OUT / "latte-window.png"))
    say("no palette: Zen's scheme back as it was", z.js(r"""await zset({ 'zenith.palette': null, 'zenith.bar.top': null }); await zth.sleep(1200);
      return { 'has a value': Services.prefs.prefHasUserValue('zen.view.window.scheme'), dark: matchMedia('(prefers-color-scheme: dark)').matches };"""))
    z.js("for (const t of zT) if (t.isConnected) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
