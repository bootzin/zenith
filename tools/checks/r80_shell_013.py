"""0.13.0, inside Zen: Zenith Shell's keys (native key presses), tiles,
modes, spaces, sleep, the scratchpad, the quit bar and the key sheet; the
mouse (Alt+drag, Alt+right-drag, Alt+click still Glance, Alt+Shift+click a
tile, Alt+wheel); the key editor on Zenith's page. Screenshots go to argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


HELP = r"""
const wu = window.windowUtils, dpr = window.devicePixelRatio;
const at = (x, y) => [Math.round((mozInnerScreenX + x) * dpr), Math.round((mozInnerScreenY + y) * dpr)];
const wait = fn => new Promise(r => { const t = setTimeout(r, 300); fn({ observe() { clearTimeout(t); r(); } }); });
const VK = { H: 0x48, J: 0x4A, K: 0x4B, L: 0x4C, E: 0x45, R: 0x52, P: 0x50, U: 0x55, Q: 0x51, Y: 0x59, Enter: 0x0D, Esc: 0x1B,
             1: 0x31, 2: 0x32, '`': 0xC0, '-': 0xBD, ';': 0xBA, '/': 0xBF };
window.zs = {
  async key(k, mods = 'alt') {
    const m = (mods.includes('alt') ? 0x1000 : 0) | (mods.includes('shift') ? 0x0100 : 0);
    const ch = typeof k === 'string' && k.length === 1 ? k.toLowerCase() : '';
    await wait(o => wu.sendNativeKeyEvent(0x409, VK[k], m, ch, ch, o)); await zth.sleep(350);
  },
  wheel: (x, y, dy) => wait(o => wu.sendNativeMouseScrollEvent(...at(x, y), 0x020A, 0, dy, 0, 0x1000, 0, null, o)),
  name: t => t?.linkedBrowser?.currentURI?.spec.split('n=')[1] ?? t?.label,
  sel: () => zs.name(gBrowser.selectedTab),
  box: t => { const r = ZenithShell.tiler.box(t); return r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; },
  boxes: () => Object.fromEntries((ZenithShell.tiler.data()?.tabs ?? []).map(t => [zs.name(t), zs.box(t)])),
  pill: () => document.getElementById('zenith-mode')?.hasAttribute('show') ? document.getElementById('zenith-mode').textContent : null,
};
return 1;
"""

ALT = ""
SHIFT = ""


def mouse(z, path, button=0, keys=(ALT,)):
    """A press at path[0], moves through path, let go at the last point."""
    n = len(keys)
    kb = [{"type": "keyDown", "value": k} for k in keys] + [{"type": "pause"}] * (len(path) + 2) + [{"type": "keyUp", "value": k} for k in keys]
    pt = [{"type": "pause"}] * n + [{"type": "pointerMove", "x": path[0][0], "y": path[0][1], "origin": "viewport"},
                                    {"type": "pointerDown", "button": button}]
    pt += [{"type": "pointerMove", "x": x, "y": y, "origin": "viewport", "duration": 60} for x, y in path[1:]]
    pt += [{"type": "pointerUp", "button": button}] + [{"type": "pause"}] * n
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": kb},
                                                   {"type": "pointer", "id": "m", "parameters": {"pointerType": "mouse"}, "actions": pt}]})
    z.cmd("WebDriver:ReleaseActions", {})


def centre(z, name, dx=0.5, dy=0.5):
    return z.js(r"""const t = gBrowser.tabs.find(t => zs.name(t) === arguments[0]); const r = ZenithShell.tiler.box(t);
      return [Math.round(r.left + r.width * arguments[1]), Math.round(r.top + r.height * arguments[2])];""", name, dx, dy)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); gZenCompactModeManager.preference = false; return 1")
    z.js(HELP)
    # (A float left by an earlier run comes back as Zen starts: closed.)
    z.js("for (const w of [...Services.wm.getEnumerator('navigator:browser')]) if (w.zenithFloatFrom) w.close(); await zth.sleep(800); return 1")
    say("tiles: A, then B to its right, then C (dwindle: below B)", z.js(r"""const b = arguments[0];
      const A = zth.open(b + '/events?n=A'), B = zth.open(b + '/page?n=B', { background: true }), C = zth.open(b + '/page?n=C', { background: true });
      const D = zth.open(b + '/page?n=D', { background: true }); window.zsT = { A, B, C, D };
      gBrowser.selectedTab = A; await zth.sleep(1500);
      ZenithShell.tiler.insert(B, A, 'right'); await zth.sleep(800);
      ZenithShell.tiler.insert(C, B); await zth.sleep(800);
      return { selected: zs.sel(), tiles: zs.boxes() };""", z.base))
    say("keys from C: Alt+K, Alt+H, Alt+L, Alt+J; then Alt+H past the left edge (the tab before the split)", z.js(r"""const out = [];
      gBrowser.selectedTab = zsT.C; await zth.sleep(300);
      for (const k of ['K', 'H', 'L', 'J']) { await zs.key(k); out.push(k + '→' + zs.sel()); }
      gBrowser.selectedTab = zsT.A; await zth.sleep(300); await zs.key('H'); out.push('H from A→' + zs.sel());
      out.push('tabs: ' + gBrowser.visibleTabs.map(zs.name).join(' '));
      gBrowser.selectedTab = zsT.A; await zth.sleep(300); return out;"""))
    say("Alt+Shift+L on A swaps it with B; Alt+E flips B and C's column into the row", z.js(r"""
      gBrowser.selectedTab = zsT.A; await zth.sleep(300); await zs.key('L', 'alt shift'); const swapped = zs.boxes();
      gBrowser.selectedTab = zsT.C; await zth.sleep(300); await zs.key('E'); const flipped = zs.boxes();
      return { swapped, flipped };"""))
    say("resize mode: Alt+R, l, l, Esc on the middle tile", z.js(r"""gBrowser.selectedTab = zsT.A; await zth.sleep(300);
      const before = zs.box(zsT.A); await zs.key('R'); const pill = zs.pill();
      await zs.key('L', ''); await zs.key('L', ''); await zs.key('Esc', '');
      return { before, after: zs.box(zsT.A), pill, 'pill after Esc': zs.pill() };"""))
    say("passthrough: Alt+P, then Alt+H reaches the page; a site on the list does the same", z.js(r"""gBrowser.selectedTab = zsT.A; await zth.sleep(300);
      const page = () => { try { return JSON.parse(zsT.A.linkedBrowser.contentTitle).keys; } catch { return null; } };
      await zs.key('P'); const pill = zs.pill(); await zs.key('H'); const on = { selected: zs.sel(), page: page() };
      await zs.key('P'); const ended = zs.pill();
      Services.prefs.setStringPref('zenith.shell.passthrough-sites', '127.0.0.1'); await zth.sleep(200);
      await zs.key('H'); const site = { selected: zs.sel(), page: page() };
      Services.prefs.clearUserPref('zenith.shell.passthrough-sites'); await zth.sleep(200);
      await zs.key('H'); const back = { selected: zs.sel(), page: page() };
      return { pill, 'during passthrough': on, 'pill after': ended, 'site on the list': site, 'list cleared': back };"""))
    z.js("zth.set('Zenith Panels', 'zenith.panels.tile-focus', 'accent'); zth.set('Zenith Panels', 'zenith.panels.tile-dim', 'dim'); gBrowser.selectedTab = zsT.B; await zth.sleep(600); return 1")
    z.screenshot(str(OUT / "three-tiles.png"))
    say("the tile you're on, the others (accent, dimmed)", z.js(r"""const s = t => { const c = getComputedStyle(t.linkedBrowser.closest('.browserSidebarContainer')); return [c.outlineStyle, c.outlineWidth, c.opacity]; };
      return { B: s(zsT.B), A: s(zsT.A) };"""))
    z.js("zth.set('Zenith Panels', 'zenith.panels.tile-focus', ''); zth.set('Zenith Panels', 'zenith.panels.tile-dim', ''); return 1")
    # The mouse.
    a, b = centre(z, "A"), centre(z, "B")
    mouse(z, [a, [a[0] + 40, a[1]], b])
    say("Alt+drag A onto B's middle: swapped", z.js("await zth.sleep(700); return { tiles: zs.boxes(), selected: zs.sel() }"))
    a, cb = centre(z, "A"), centre(z, "C", 0.5, 0.92)
    mouse(z, [a, [a[0] + 40, a[1] + 20], cb])
    say("Alt+drag A onto C's bottom edge: below C", z.js("await zth.sleep(700); return zs.boxes()"))
    c = centre(z, "C", 0.2, 0.3)
    before = z.js("return zs.box(zsT.C)")
    mouse(z, [c, [c[0] - 30, c[1]], [c[0] - 90, c[1]]], button=2)
    say("Alt+right-drag C's left edge 90px to the left", z.js(r"""await zth.sleep(700); const m = document.getElementById('contentAreaContextMenu');
      const out = { before: arguments[0], after: zs.box(zsT.C), 'context menu': m.state }; if (m.state !== 'closed') m.hidePopup(); return out;""", before))
    link = z.js("const box = zsT.A.linkedBrowser.getBoundingClientRect(); return [Math.round(box.left + 120), Math.round(box.top + 85)];")
    mouse(z, [link, link], keys=(ALT, SHIFT))
    say("Alt+Shift+click A's link: a new tile", z.js(r"""await zth.sleep(1500); const d = ZenithShell.tiler.data(zsT.A);
      return { tiles: d?.tabs.map(zs.name), selected: gBrowser.selectedTab.linkedBrowser.currentURI.spec.replace(arguments[0], '') };""", z.base))
    link = z.js("const box = zsT.A.linkedBrowser.getBoundingClientRect(); return [Math.round(box.left + 120), Math.round(box.top + 85)];")
    mouse(z, [link, link])
    say("Alt+click A's link: still Zen's Glance", z.js(r"""await zth.sleep(1500);
      const g = gBrowser.tabs.filter(t => t.hasAttribute('zen-glance-tab')).map(t => t.linkedBrowser.currentURI.spec.replace(arguments[0], ''));
      try { await gZenGlanceManager.closeGlance?.({ skipPermitUnload: true }); } catch {} await zth.sleep(600); return g;""", z.base))
    # Spaces, the wheel, sleep, the scratchpad.
    say("spaces: Alt+2, Alt+1, Alt+`, Alt+Shift+2 sends D", z.js(r"""const W = gZenWorkspaces, out = {};
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(800); }
      const names = W.getWorkspaces().map(s => s.uuid), at = () => names.indexOf(W.activeWorkspace) + 1;
      gBrowser.selectedTab = zsT.D; await zth.sleep(400);
      await zs.key(2); await zth.sleep(900); out['Alt+2'] = at();
      await zs.key(1); await zth.sleep(900); out['Alt+1'] = at();
      await zs.key('`'); await zth.sleep(900); out['Alt+`'] = at();
      await zs.key(1); await zth.sleep(900); gBrowser.selectedTab = zsT.D; await zth.sleep(300);
      await zs.key(2, 'alt shift'); await zth.sleep(700);
      out['D is in space'] = names.indexOf(zsT.D.getAttribute('zen-workspace-id')) + 1; out['still in space'] = at();
      W.moveTabToWorkspace(zsT.D, names[0]); return out;"""))
    say("Alt+wheel over the page: the next space, Firefox's own Alt+wheel off", z.js(r"""const W = gZenWorkspaces, names = W.getWorkspaces().map(s => s.uuid);
      const r = gBrowser.tabpanels.getBoundingClientRect(), before = names.indexOf(W.activeWorkspace) + 1;
      await zs.wheel(r.left + r.width / 2, r.top + 300, -120); await zth.sleep(1000);
      const after = names.indexOf(W.activeWorkspace) + 1; await W.changeWorkspaceWithID(names[before - 1]); await zth.sleep(800);
      return { before, after, 'mousewheel.with_alt.action': Services.prefs.getIntPref('mousewheel.with_alt.action') };"""))
    say("Alt+U puts D to sleep", z.js(r"""gBrowser.selectedTab = zsT.D; await zth.sleep(500); await zs.key('U'); await zth.sleep(800);
      return { 'D pending': zsT.D.hasAttribute('pending'), selected: zs.sel() };"""))
    say("scratchpad: Alt+Shift+- sends D, Alt+- shows it, Alt+- hides it", z.js(r"""gBrowser.selectedTab = zsT.D; await zth.sleep(1200);
      await zs.key('-', 'alt shift'); await zth.sleep(2500); const S = ZenithShell.scratchpad, list = () => S.list(window);
      const w = list()[0], sent = { floats: list().length, shown: w ? S.shown(w) : null };
      window.focus(); await zth.sleep(300); await zs.key('-'); await zth.sleep(700); const shown = w ? S.shown(w) : null;
      window.focus(); await zth.sleep(300); await zs.key('-'); await zth.sleep(700); const hidden = w ? S.shown(w) : null;
      // (Back into the window, not closed: a closed float floats again at the next start.)
      if (w) w.ZenithFloat?.back?.(); await zth.sleep(800); Services.prefs.clearUserPref('zenith.internal.float.kept');
      return { sent, 'after Alt+-': shown, 'after Alt+- again': hidden };"""))
    say("Alt+Shift+E: the quit bar, Esc away; Alt+Shift+/: the key sheet", z.js(r"""window.focus(); gBrowser.selectedTab = zsT.B; await zth.sleep(400);
      await zs.key('E', 'alt shift'); const bar = document.getElementById('zenith-nagbar')?.textContent ?? null;
      await zs.key('Esc', ''); const gone = !document.getElementById('zenith-nagbar');
      await zs.key('/', 'alt shift'); const sheet = document.getElementById('zenith-keysheet');
      return { bar, 'gone after Esc': gone, sheet: sheet ? [...sheet.querySelectorAll('h3')].map(h => h.textContent) : null,
               rows: sheet?.querySelectorAll('.zth-ks-row').length ?? 0 };"""))
    z.screenshot(str(OUT / "key-sheet.png"))
    say("link hints on Alt+;", z.js(r"""await zs.key('Esc', ''); const got = [], H = window.ZenithHints, show = H.show;
      H.show = nt => { got.push(nt); return Promise.resolve(); };
      await zs.key(';'); await zs.key(';', 'alt shift'); H.show = show; return { calls: got, 'sheet closed': !document.getElementById('zenith-keysheet') };"""))
    say("Zenith's page: the key editor, Alt+Y for focus-left, then all back", z.js(r"""zth.open('about:preferences'); await zth.sleep(3000);
      const doc = gBrowser.selectedBrowser.contentDocument;
      for (let i = 0; i < 50 && !doc.querySelector('[data-prop="zenith.shell.bindings"] .zp-action'); i++) await zth.sleep(100);
      const row = doc.querySelector('[data-prop="zenith.shell.bindings"]'); if (!row) return 'no row';
      row.querySelector('.zp-action').click(); await zth.sleep(400);
      const dialog = doc.querySelector('dialog.zp-keys'), first = dialog.querySelector('.zp-keys-key');
      const rows = dialog.querySelectorAll('.zp-keys-row').length, label = first.textContent;
      first.click(); await zth.sleep(200); const waiting = first.textContent;
      await zs.key('Y'); await zth.sleep(500);
      const pref = Services.prefs.getStringPref('zenith.shell.bindings', ''), now = dialog.querySelector('.zp-keys-key').textContent;
      [...dialog.querySelectorAll('.zp-sites-foot button')].find(b => /as they were/.test(b.textContent)).click(); await zth.sleep(400);
      const after = Services.prefs.getStringPref('zenith.shell.bindings', ''); dialog.close();
      gBrowser.removeTab(gBrowser.selectedTab);
      return { rows, 'focus-left was': label, waiting, pref, 'shown now': now, 'after All as they were': after, count: row.querySelector('.zp-list-count').textContent };"""))
    z.js("for (const t of Object.values(window.zsT)) if (t.isConnected) gBrowser.removeTab(t); for (const t of gBrowser.tabs.filter(t => /n=linked/.test(t.linkedBrowser?.currentURI?.spec))) gBrowser.removeTab(t); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
