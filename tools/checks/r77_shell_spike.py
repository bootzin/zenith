"""0.13.0's first step, inside Zen: what the window can catch before a
web page (Alt+key, Alt+wheel, Alt+right-drag, Alt+left-drag) when the input
is native, as from a real keyboard and mouse; whether Zen's split view
takes six tiles; what reading Firefox's processes costs. A screenshot of
the six tiles goes to argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


NATIVE = r"""
const wu = window.windowUtils, dpr = window.devicePixelRatio;
const at = (x, y) => [Math.round((mozInnerScreenX + x) * dpr), Math.round((mozInnerScreenY + y) * dpr)];
const wait = fn => new Promise(r => { const t = setTimeout(r, 300); fn({ observe() { clearTimeout(t); r(); } }); });
const ALT = 0x1000;
window.zn = {
  key: (vk, ch, mods = ALT) => wait(o => wu.sendNativeKeyEvent(0x409, vk, mods, ch, ch, o)),
  wheel: (x, y, dy, mods) => wait(o => wu.sendNativeMouseScrollEvent(...at(x, y), 0x020A, 0, dy, 0, mods, 0, null, o)),
  mouse: (x, y, msg, button, mods) => wait(o => wu.sendNativeMouseEvent(...at(x, y), msg, button, mods, null, o)),
  page: () => { try { return JSON.parse(gBrowser.selectedBrowser.contentTitle); } catch { return gBrowser.selectedBrowser.contentTitle; } },
  point: () => { const r = gBrowser.selectedBrowser.getBoundingClientRect(); return [r.x + r.width / 2, r.y + 220]; },
  seen: null,
  listen(block) {
    const s = this.seen = { keys: [], wheel: 0, down: [], up: [], move: 0, ctx: 0 };
    const f = e => {
      if (e.type === 'contextmenu') s.ctx++;
      else if (!e.altKey) return;
      else if (e.type === 'keydown' && e.code !== 'AltLeft') s.keys.push(e.code);
      else if (e.type === 'wheel') s.wheel++;
      else if (e.type === 'mousedown') s.down.push(e.button);
      else if (e.type === 'mouseup') s.up.push(e.button);
      else if (e.type === 'mousemove') s.move++;
      else return;
      if (block && e.type !== 'mousemove') { e.preventDefault(); e.stopPropagation(); }
    };
    for (const t of ['keydown', 'wheel', 'mousedown', 'mouseup', 'mousemove', 'contextmenu']) window.addEventListener(t, f, true);
    this.stop = () => { for (const t of ['keydown', 'wheel', 'mousedown', 'mouseup', 'mousemove', 'contextmenu']) window.removeEventListener(t, f, true); };
  },
  async fresh(base) {
    const t = zth.open(base + '/page?n=back'); await zth.sleep(1200);
    openTrustedLinkIn(base + '/events', 'current'); await zth.sleep(1500);
    return t;
  },
};
return 1;
"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(NATIVE)
    say("keys: Alt+K (window only watches), Alt+H (window takes it)", z.js(r"""const t = await zn.fresh(arguments[0]);
      zn.listen(false); await zn.key(0x4B, 'k'); await zth.sleep(400); const a = { window: zn.seen.keys, page: zn.page().keys }; zn.stop();
      zn.listen(true); await zn.key(0x48, 'h'); await zth.sleep(400);
      const b = { window: zn.seen.keys, page: zn.page().keys, 'help menu open': document.getElementById('helpMenu')?.open ?? null }; zn.stop();
      gBrowser.removeTab(t); return { watch: a, take: b };""", z.base))
    say("wheel: plain, then Alt (window only watches), then Alt (window takes it)", z.js(r"""const t = await zn.fresh(arguments[0]);
      const [x, y] = zn.point(), url = () => gBrowser.currentURI.spec.replace(arguments[0], '');
      zn.listen(false); await zn.wheel(x, y, -120, 0); await zth.sleep(700);
      const plain = { window: zn.seen.wheel, page: zn.page(), url: url() };
      await zn.wheel(x, y, -120, 0x1000); await zth.sleep(1500);
      const watch = { window: zn.seen.wheel, page: zn.page(), url: url() }; zn.stop();
      if (!url().startsWith('/events')) { gBrowser.goForward(); await zth.sleep(1500); }
      zn.listen(true); await zn.wheel(x, y, -120, 0x1000); await zth.sleep(1500);
      const take = { window: zn.seen.wheel, page: zn.page(), url: url() }; zn.stop();
      gBrowser.removeTab(t); return { plain, watch, take };""", z.base))
    DRAG = r"""const t = await zn.fresh(arguments[0]), button = arguments[1], block = arguments[2];
      const [x, y] = zn.point(), menu = document.getElementById('contentAreaContextMenu');
      zn.listen(block);
      await zn.mouse(x, y, 3, 0, 0x1000); await zn.mouse(x, y, 1, button, 0x1000);
      for (let i = 1; i <= 5; i++) await zn.mouse(x + i * 30, y + i * 10, 3, button, 0x1000);
      await zn.mouse(x + 150, y + 50, 2, button, 0x1000); await zth.sleep(700);
      const out = { window: { ...zn.seen }, page: zn.page(), 'context menu': menu.state }; zn.stop(); if (menu.state !== 'closed') menu.hidePopup();
      gBrowser.removeTab(t); return out;"""
    say("Alt+right-drag, window only watches", z.js(DRAG, z.base, 2, False))
    say("Alt+right-drag, window takes it", z.js(DRAG, z.base, 2, True))
    say("Alt+left-drag, window only watches", z.js(DRAG, z.base, 0, False))
    say("Alt+left-drag, window takes it", z.js(DRAG, z.base, 0, True))
    say("six tiles in one split", z.js(r"""const tabs = []; for (let i = 0; i < 6; i++) tabs.push(zth.open(arguments[0] + '/page?n=tile' + i));
      await zth.sleep(2500); const S = gZenViewSplitter, cap = S.MAX_TABS; S.MAX_TABS = 6;
      const g = S.splitTabs(tabs, 'grid'); await zth.sleep(1500);
      const rects = tabs.map(t => { const r = t.linkedBrowser.closest('.browserSidebarContainer').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; });
      window.zenithTiles = { tabs, cap }; return { split: !!g, 'tabs in it': g?.tabs?.length, rects };""", z.base))
    z.screenshot(str(OUT / "six-tiles.png"))
    z.js("""const { tabs, cap } = window.zenithTiles; gZenViewSplitter.unsplitCurrentView(); await zth.sleep(800);
      gZenViewSplitter.MAX_TABS = cap; for (const t of tabs) gBrowser.removeTab(t); return 1""")
    say("reading Firefox's processes (5 times)", z.js(r"""const parent = i => i.cpuTime;
      const first = await ChromeUtils.requestProcInfo(), times = [];
      for (let i = 0; i < 5; i++) { const t0 = performance.now(); await ChromeUtils.requestProcInfo(); times.push(Math.round((performance.now() - t0) * 10) / 10); }
      const last = await ChromeUtils.requestProcInfo();
      const mem = i => i.memory + i.children.reduce((a, c) => a + c.memory, 0);
      return { 'ms each': times, 'parent cpu ms over the 6 reads': Math.round((last.cpuTime - first.cpuTime) / 1e6),
               processes: last.children.length + 1, 'memory MB': Math.round(mem(last) / 1048576) };"""))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
