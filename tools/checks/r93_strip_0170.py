"""0.17.0, inside Zen: the scroller's strip as niri's (every tab of the
space a column, past the tile limit; the columns out of sight hidden and
asleep; Alt+L walks it, kept in view or centred; a new tab right of the one
you're on; closing slides; another layout gives the tabs back), and
screenshots of the bars, the rice picker and the settings page for review.
Screenshots in argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT.mkdir(parents=True, exist_ok=True)
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


KEY = r"""const [vk, ch, mods] = arguments; const wu = window.windowUtils; await new Promise(r => { const t = setTimeout(r, 400);
  wu.sendNativeKeyEvent(0x409, vk, mods, ch, ch, { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(700); return 1"""
STATE = r"""const S = gZenViewSplitter, d = window.ZenithLayouts && S._data.find(x => x.tabs.includes(gBrowser.selectedTab));
  const L = window.ZenithLayouts, order = d ? L.order(d) : [];
  return { columns: d?.tabs.length ?? 0, members: L.members().length, on: order.indexOf(gBrowser.selectedTab), offset: Math.round(d?.zenithOffset ?? 0),
    shown: order.filter(t => !t.linkedBrowser.closest('.browserSidebarContainer').hasAttribute('zenith-off-strip')).map(t => order.indexOf(t)),
    'asleep out of sight': order.filter(t => t.linkedBrowser.closest('.browserSidebarContainer').hasAttribute('zenith-off-strip')).every(t => !t.linkedBrowser.docShellIsActive),
    'sidebar = strip': JSON.stringify(order.map(t => t._tPos)) === JSON.stringify([...order.map(t => t._tPos)].sort((a, b) => a - b)) };"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); return 1")
    z.js(r"""window.P = Services.prefs; const sys = Services.scriptSecurityManager.getSystemPrincipal();
      for (let i = 0; i < 9; i++) gBrowser.addTab(arguments[0] + '/page?n=column-' + i, { triggeringPrincipal: sys, inBackground: true });
      await zth.sleep(2500); gBrowser.selectedTab = gBrowser.visibleTabs.filter(t => !t.pinned).at(-1); P.setStringPref('zenith.shell.tiles', '4');
      window.ZenithLayouts.set('scroller'); await zth.sleep(1500); return 1""", z.base)
    say("every tab a column, past 4 tiles", z.js(STATE))
    z.screenshot(str(OUT / "a-strip.png"))
    for _ in range(3):
        z.js(KEY, 0x48, "h", 0x1000)
    say("Alt+H ×3", z.js(STATE))
    z.js("P.setStringPref('zenith.shell.scroller-focus', 'centre'); window.ZenithLayouts.arrange(gBrowser.selectedTab); await zth.sleep(600); return 1")
    say("centred", z.js(STATE))
    z.screenshot(str(OUT / "b-centred.png"))
    say("a new tab right of the one you're on", z.js(r"""const before = gBrowser.selectedTab; openTrustedLinkIn(arguments[0] + '/page?n=new', 'tab'); await zth.sleep(1500);
      const L = window.ZenithLayouts, d = gZenViewSplitter._data.find(x => x.tabs.includes(gBrowser.selectedTab)), o = d ? L.order(d) : [];
      return { 'right of it': o.indexOf(gBrowser.selectedTab) === o.indexOf(before) + 1, columns: o.length };""", z.base))
    say("closing goes to the next column", {**z.js(r"""const L = window.ZenithLayouts, o = L.order(gZenViewSplitter._data.find(x => x.tabs.includes(gBrowser.selectedTab))), next = o[o.indexOf(gBrowser.selectedTab) + 1];
      gBrowser.removeTab(gBrowser.selectedTab); await zth.sleep(1200); return { next: gBrowser.selectedTab === next };"""), **z.js(STATE)})
    z.js("P.setStringPref('zenith.shell.scroller-focus', 'view'); return 1")
    say("dwindle gives the tabs back", z.js(r"""window.ZenithLayouts.set('dwindle'); await zth.sleep(1200);
      return { splits: gZenViewSplitter._data.length, scroller: gBrowser.tabpanels.hasAttribute('zenith-scroller') };"""))
    z.js("window.ZenithLayouts.set('scroller'); await zth.sleep(1500); return 1")
    say("back to the scroller", z.js(STATE))
    z.js("window.ZenithLayouts.set('dwindle'); await zth.sleep(1000); return 1")

    # For review: the bars, the picker, the settings page.
    z.js("P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.left', 'on'); await zth.sleep(1500); return 1")
    for look in ["islands", "floating", "bare", "powerline"]:
        z.js("P.setStringPref('zenith.bar.style', arguments[0]); await zth.sleep(1000); return 1", look)
        z.screenshot(str(OUT / f"c-bar-{look}.png"))
    z.js("P.clearUserPref('zenith.bar.style'); P.setStringPref('zenith.bar.left', 'off'); await window.ZenithLooks.toggle(); await zth.sleep(1500); return 1")
    z.screenshot(str(OUT / "d-picker-themes.png"))
    z.js("document.querySelector('#zenith-rice .zr-nav [cat=\"bars\"]').click(); await zth.sleep(600); return 1")
    z.screenshot(str(OUT / "e-picker-bars.png"))
    say("picker: choices per category", z.js(r"""const h = document.getElementById('zenith-rice'), out = {};
      for (const c of ['colours', 'glass', 'bars', 'shape']) { h.querySelector('.zr-nav [cat="' + c + '"]').click(); await zth.sleep(300);
        out[c] = h.querySelectorAll('.zr-card[value], .zr-opt').length; } return out;"""))
    z.js("document.querySelector('#zenith-rice .zr-nav [cat=\"glass\"]').click(); await zth.sleep(400); return 1")
    z.screenshot(str(OUT / "e2-picker-glass.png"))
    z.js("window.ZenithLooks.toggle(); await zth.sleep(500); gBrowser.selectedTab = gBrowser.addTab('about:preferences#zenith', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await zth.sleep(3000); " +
         "gBrowser.selectedBrowser.contentWindow.gotoPref?.('paneZenith'); await zth.sleep(1500); return 1")
    say("settings: sections", z.js(r"""const d = gBrowser.selectedBrowser.contentDocument; return [...d.querySelectorAll('.zp-section')].map(s =>
      s.querySelector('h2').textContent + ': ' + s.querySelectorAll('.zp-group:not(details)').length + ' groups + ' + s.querySelectorAll('details.zp-group').length + ' closed');"""))
    z.screenshot(str(OUT / "f-settings.png"))
    z.js("const d = gBrowser.selectedBrowser.contentDocument; d.getElementById('zp-bar')?.scrollIntoView(); await zth.sleep(600); return 1")
    z.screenshot(str(OUT / "g-settings-bars.png"))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
