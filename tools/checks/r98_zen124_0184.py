"""0.18.4, inside Zen 1.24: Zenith's keys in about:keyboard (both ways);
"Ask me each time" in the Library's Space routing, and Zenith's popup;
When you zoom (Zen's toast held back or let through) and Zen's toasts as
Zenith's; Zenith in Zen's command palette; downloads with speed, pause and
go on; Zen's back-to-your-tab button; the open address bar's glass.
Screenshots in argv[1]."""
import json, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT.mkdir(parents=True, exist_ok=True)
ONLY = set(sys.argv[2:])
SIZE = 6 * 1024 * 1024


def say(name, value):
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


def part(name):
    return not ONLY or name in ONLY


class Slow(BaseHTTPRequestHandler):
    """A file that comes slowly (about 300 KB/s), and from where it stopped."""

    def log_message(self, *a):
        pass

    def do_GET(self):
        start = 0
        rng = self.headers.get("Range", "")
        if rng.startswith("bytes="):
            start = int(rng[6:].split("-")[0] or 0)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{SIZE - 1}/{SIZE}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("ETag", '"zenith-r98"')
        self.send_header("Last-Modified", "Wed, 25 Nov 2026 10:00:00 GMT")
        self.send_header("Content-Length", str(SIZE - start))
        self.send_header("Content-Disposition", 'attachment; filename="zenith-r98.bin"')
        self.end_headers()
        sent = start
        try:
            while sent < SIZE:
                n = min(16384, SIZE - sent)
                self.wfile.write(b"z" * n)
                sent += n
                time.sleep(0.05)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


server = ThreadingHTTPServer(("127.0.0.1", 0), Slow)
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{server.server_address[1]}/big"

SETUP = r"""window.P = Services.prefs; window.sys = Services.scriptSecurityManager.getSystemPrincipal();
  window.zopen = (u, o = {}) => gBrowser.addTab(u, { triggeringPrincipal: sys, inBackground: true, ...o });
  window.zpage = n => `data:text/html,<title>${n}</title><body style="background:%23345;color:white">page ${n}`;
  window.zr = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  // Into shadow roots too.
  window.zdeep = (sel, node = document) => { const hit = node.querySelector?.(sel); if (hit) return hit;
    for (const e of node.querySelectorAll?.('*') ?? []) if (e.shadowRoot) { const f = zdeep(sel, e.shadowRoot); if (f) return f; } return null; };
  window.zdeepAll = (sel, node = document, out = []) => { out.push(...(node.querySelectorAll?.(sel) ?? []));
    for (const e of node.querySelectorAll?.('*') ?? []) if (e.shadowRoot) zdeepAll(sel, e.shadowRoot, out); return out; };
  window.CK = ChromeUtils.importESModule('moz-src:///browser/components/customkeys/CustomKeys.sys.mjs').CustomKeys;
  return !!window.ZenithKeys && !!window.ZenithLinks"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); await SessionStore.promiseAllWindowsRestored; await zth.sleep(3500); return 1")
    say("setup", z.js(SETUP))
    z.js("P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.top.modules', 'launcher,layout,tabs|clock|downloads,power'); await zth.sleep(1500); return 1")

    if part("keys"):
        say("about:keyboard's Zenith groups", z.js(r"""const M = ChromeUtils.importESModule('resource:///modules/zen/kbs/ZenKeyboardShortcuts.sys.mjs').ZenKeyboardShortcuts;
          const { CustomKeysParent } = ChromeUtils.importESModule('moz-src:///browser/components/customkeys/CustomKeysParent.sys.mjs');
          const actor = { browsingContext: { topChromeWindow: window } }; actor.getKeyData = id => CustomKeysParent.prototype.getKeyData.call(actor, id);
          const keys = await M.addKeys(actor, {}); const out = {};
          for (const [g, list] of Object.entries(keys)) if (g.startsWith('Zenith')) out[g] = `${Object.keys(list).length}: ` + Object.values(list).slice(0, 3).map(k => `${k.title} = ${k.shortcut}`).join(' · ');
          out['zen groups too'] = Object.keys(keys).filter(g => !g.startsWith('Zenith')).length; return out"""))
        say("changed in about:keyboard → the Shell", z.js(r"""P.clearUserPref('zenith.shell.bindings'); await zth.sleep(300);
          CK.changeKey('zenith-shell-key-layout', { modifiers: 'alt', key: 'G' }); await zth.sleep(600);
          return { binding: P.getStringPref('zenith.shell.bindings', ''), 'Alt+G does': window.ZenithShell.keys.map.get('Alt+KeyG') ?? 'nothing', 'Alt+Y does': window.ZenithShell.keys.map.get('Alt+KeyY') ?? 'nothing' }"""))
        say("changed in Zenith (the rice file) → about:keyboard", z.js(r"""P.setStringPref('zenith.shell.bindings', 'layout=Alt+Shift+KeyB, hints=Alt+Char:Ö'); await zth.sleep(600);
          const k = document.getElementById('zenith-shell-key-layout'), h = document.getElementById('zenith-shell-key-hints');
          return { layout: ZenithKeys.shown('zenith-shell-key-layout'), 'changed there': !!CK.getDefaultKey('zenith-shell-key-layout'), hints: ZenithKeys.shown('zenith-shell-key-hints'),
                   'binding after': P.getStringPref('zenith.shell.bindings', '') }"""))
        say("reset in about:keyboard", z.js(r"""CK.resetKey('zenith-shell-key-layout'); CK.resetKey('zenith-shell-key-hints'); await zth.sleep(600);
          return { binding: P.getStringPref('zenith.shell.bindings', '') || '(none: as Zenith has them)', layout: ZenithKeys.shown('zenith-shell-key-layout') }"""))
        say("Zenith's own key changed", z.js(r"""CK.changeKey('zenith-switcher-key', { modifiers: 'alt,shift', key: 'W' }); await zth.sleep(600);
          const k = document.getElementById('zenith-switcher-key'); const sheet = window.ZenithShell.sheet.groups().get('Zenith').find(([, l]) => l === 'Switcher');
          const out = { key: `${k.getAttribute('modifiers')} ${k.getAttribute('key')}`, 'in the body': k.parentElement.parentElement === document.body, 'key sheet': sheet?.[0] };
          CK.resetKey('zenith-switcher-key'); await zth.sleep(300); out.reset = ZenithKeys.shown('zenith-switcher-key'); return out"""))
        z.js("gBrowser.selectedTab = gBrowser.addTab('about:keyboard', { triggeringPrincipal: sys }); await zth.sleep(2500); return 1")
        say("about:keyboard page", z.js(r"""const d = gBrowser.selectedBrowser.contentDocument; if (!d) return 'in a content process';
          const s = d.querySelector('input[type=search], moz-input-search, #search'); const text = d.body.innerText; const at = text.indexOf('Zenith');
          return { 'mentions Zenith': at >= 0, near: at >= 0 ? text.slice(at, at + 160).replace(/\s+/g, ' ') : '' }"""))
        z.js("const f = await gBrowser.getFindBar(); f.open(); f._findField.value = 'Zenith: tiles'; f.onFindAgainCommand(false); await zth.sleep(900); f.close(); return 1")
        z.screenshot(str(OUT / "a-about-keyboard.png"))
        z.js("gBrowser.removeTab(gBrowser.selectedTab); await zth.sleep(500); return 1")

    if part("routing"):
        z.js(r"""const R = gZenSpaceRoutingManager; window.zR = R; window.zBefore = R.getDefaultExternalRoute();
          const r = R.createNewRoute(); R.updateRoute({ ...r, reference: 'r98-ask.example', openIn: 'zenith-ask' }); window.zRule = r.id; R.saveRoutes();
          P.clearUserPref('zenith.plus.routing-in'); document.getElementById('cmd_zenOpenSpaceRoutingSettings').doCommand(); await zth.sleep(2000); return 1""")
        say("the Library's Space routing", z.js(r"""const rows = zdeepAll('.zen-library-routing-row').map(r => r.innerText.replace(/\s+/g, ' ').trim());
          const foot = zdeep('.zen-library-routing-footer .zen-library-routing-select'); foot?.click(); await zth.sleep(600);
          const menu = document.querySelector('menupopup.zen-library-routing-menu'); const items = [...(menu?.children ?? [])].map(i => i.localName === 'menuseparator' ? '—' : (i.label || i.getAttribute('data-l10n-id')) + (i.hasAttribute('checked') ? ' ✓' : ''));
          menu?.querySelector('.zenith-route-ask[data-value]')?.doCommand(); await zth.sleep(800);
          return { rows: rows.filter(r => /r98/.test(r)), menu: items.slice(0, 5), 'default now': zR.getDefaultExternalRoute(), 'Zenith setting': P.getStringPref('zenith.plus.external-links', ''),
                   'footer says': zdeep('.zen-library-routing-footer .zen-library-routing-select-name')?.textContent }"""))
        z.screenshot(str(OUT / "b-library-routing.png"))
        z.js("document.getElementById('cmd_zenOpenSpaceRoutingSettings').doCommand(); await zth.sleep(800); zR.setDefaultExternalRoute(zBefore); zR.saveRoutes(); return 1")
        say("the popup", z.js(r"""P.setStringPref('zenith.plus.routing-in', 'popup'); document.getElementById('cmd_zenOpenSpaceRoutingSettings').doCommand(); await zth.sleep(800);
          const card = document.getElementById('zenith-routing'); if (!card) return 'no popup';
          const rows = [...card.querySelectorAll('.zth-sr-row')].map(r => [...r.querySelectorAll('select, input')].map(x => x.localName === 'select' ? x.selectedOptions[0]?.textContent : x.value).join(' | '));
          card.querySelector('.zth-sr-add').click(); await zth.sleep(200); const row = [...card.querySelectorAll('.zth-sr-row')].at(-1), ref = row.querySelector('.zth-sr-ref');
          ref.value = ''; ref.dispatchEvent(new Event('change')); const emptyKept = zR.getAllRoutes().length;
          row.querySelector('select').value = 'regex'; row.querySelector('select').dispatchEvent(new Event('change')); ref.value = '(r98'; ref.dispatchEvent(new Event('input')); ref.dispatchEvent(new Event('change'));
          const bad = { invalid: ref.hasAttribute('invalid'), saved: zR.getAllRoutes().some(r => r.reference === '(r98') };
          ref.value = 'r98-popup\\.example'; ref.dispatchEvent(new Event('change')); const where = row.querySelectorAll('select')[1]; where.value = 'zenith-ask'; where.dispatchEvent(new Event('change'));
          const saved = zR.getAllRoutes().find(r => r.reference === 'r98-popup\\.example');
          return { 'rows shown': rows.filter(r => /r98/.test(r)), 'an empty rule kept': emptyKept, 'a broken regex': bad, 'the new rule': saved ? `${saved.matchType} ${saved.reference} → ${saved.openIn}` : 'not saved' }"""))
        z.screenshot(str(OUT / "c-routing-popup.png"))
        say("the popup closes on Esc", z.js(r"""const card = document.getElementById('zenith-routing'); card.querySelector('input,select').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await zth.sleep(300); const out = !document.getElementById('zenith-routing');
          for (const r of zR.getAllRoutes()) if (/r98/.test(r.reference)) zR.removeRoute(r.id); zR.saveRoutes(); P.clearUserPref('zenith.plus.routing-in'); return out"""))

    if part("zoom"):
        say("Zen's zoom toast", z.js(r"""const shown = async v => { P.setStringPref('zenith.plus.zoom-shows', v); for (const t of document.querySelectorAll('#zen-toast-container .zen-toast')) t.remove();
            gZenUIManager.showToast('zen-zoom-changed-toast', { l10nArgs: { percentage: 1.1 } }); await zth.sleep(500); return document.querySelectorAll('#zen-toast-container .zen-toast').length; };
          const out = { pill: await shown('pill'), toast: await shown('toast'), both: await shown('both'), neither: await shown('neither') }; return out"""))
        say("the pill", z.js(r"""gBrowser.selectedTab = zopen(zpage('zoom')); await zth.sleep(800); P.setStringPref('zenith.plus.zoom-shows', 'both'); FullZoom.enlarge(); await zth.sleep(800);
          const pill = document.querySelector('.zenith-zoom-pill'); const both = pill && getComputedStyle(pill).display;
          P.setStringPref('zenith.plus.zoom-shows', 'toast'); await zth.sleep(200); const toastOnly = pill && getComputedStyle(pill).display; P.setStringPref('zenith.plus.zoom-shows', 'both'); return { 'both: pill': both, 'note only: pill': toastOnly }"""))
        z.js(r"""gZenUIManager.showToast('zen-copy-urls-confirmation', { l10nArgs: { count: 3 } }); await zth.sleep(250);
          gZenUIManager.showToast('zen-sidebar-drag-collapsed-toast', { l10nArgs: { shortcut: 'Ctrl+Alt+S' } }); await zth.sleep(900); return 1""")
        z.screenshot(str(OUT / "d-toasts.png"))
        say("a toast's look", z.js(r"""const t = document.querySelector('#zen-toast-container .zen-toast'); if (!t) return 'none'; const c = getComputedStyle(t);
          return { box: zr(t), background: c.backgroundColor, radius: c.borderRadius, font: `${c.fontWeight} ${c.fontSize}`, 'height cap': c.maxHeight }"""))
        z.js("FullZoom.reset(); P.clearUserPref('zenith.plus.zoom-shows'); gBrowser.removeTab(gBrowser.selectedTab); await zth.sleep(400); return 1")

    if part("palette"):
        say("typing 'overview' in the address bar", z.js(r"""gURLBar.focus(); gURLBar.search('overview'); await zth.sleep(1800);
          return [...document.querySelectorAll('.urlbarView-row:not([hidden])')].map(r => r.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 5)"""))
        z.screenshot(str(OUT / "e-palette.png"))
        say("picking it", z.js(r"""const row = [...document.querySelectorAll('.urlbarView-row')].find(r => /Zenith: Overview/.test(r.innerText));
          if (!row) { gURLBar.view.close(); return 'no row'; } row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })); row.click(); await zth.sleep(900);
          const open = !!document.getElementById('zenith-overview')?.hasAttribute('open'); if (open) window.ZenithOverview.toggle(); await zth.sleep(400); gURLBar.view.close(); return { 'overview opened': open }"""))
        say("Zenith actions in Zen's list", z.js(r"""const { globalActions } = ChromeUtils.importESModule('resource:///modules/ZenUBGlobalActions.sys.mjs');
          const mine = globalActions.filter(a => a.commandId.startsWith('zenith:')); return { count: mine.length, available: mine.filter(a => a.isAvailable(window)).length, first: mine.slice(0, 4).map(a => a.label) }"""))

    if part("downloads"):
        z.js(r"""const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
          window.zList = await Downloads.getList(Downloads.ALL); const path = PathUtils.join(PathUtils.tempDir, 'zenith-r98.bin'); await IOUtils.remove(path, { ignoreAbsent: true });
          window.zD = await Downloads.createDownload({ source: arguments[0], target: { path, partFilePath: path + '.part' } }); zD.tryToKeepPartialData = true; await zList.add(zD); zD.start().catch(() => {}); await zth.sleep(3000); return 1""", URL)
        say("going", z.js(r"""const m = document.querySelector('#zenith-bar .zb-mod[mod="downloads"]'); const out = { module: m.textContent.trim(), title: m.title };
          m.click(); await zth.sleep(600); const row = document.querySelector('.zs-pop .zs-dl'); out.row = row?.innerText.replace(/\s+/g, ' ').trim();
          out.buttons = [...(row?.querySelectorAll('button') ?? [])].map(b => b.title || b.textContent); return out"""))
        z.screenshot(str(OUT / "f-download-going.png"))
        say("paused", z.js(r"""const row = document.querySelector('.zs-pop .zs-dl'); [...row.querySelectorAll('button')].find(b => b.title === 'Pause')?.click(); await zth.sleep(1500);
          const m = document.querySelector('#zenith-bar .zb-mod[mod="downloads"]'); const r = document.querySelector('.zs-pop .zs-dl');
          return { stopped: zD.stopped, partial: zD.hasPartialData, module: `${m.hidden ? 'hidden' : 'shown'} ${m.hasAttribute('paused') ? '[paused]' : ''} ${m.textContent.trim()}`, title: m.title,
                   row: r?.innerText.replace(/\s+/g, ' ').trim(), buttons: [...(r?.querySelectorAll('button') ?? [])].map(b => b.title || b.textContent) }"""))
        z.screenshot(str(OUT / "g-download-paused.png"))
        say("going on", z.js(r"""const r = document.querySelector('.zs-pop .zs-dl'); const at = zD.currentBytes; [...r.querySelectorAll('button')].find(b => b.title === 'Go on')?.click(); await zth.sleep(2500);
          const out = { going: !zD.stopped, 'from where it stopped': zD.currentBytes >= at, progress: zD.progress };
          await zD.cancel(); await zD.finalize(true); await zList.remove(zD); document.documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await zth.sleep(400); return out"""))

    if part("backtotab"):
        z.js(r"""const space = gZenWorkspaces.activeWorkspace; window.zMany = []; for (let i = 0; i < 45; i++) zMany.push(zopen(zpage('many ' + i))); await zth.sleep(2500);
          gBrowser.selectedTab = zMany[0]; await zth.sleep(900); const ws = document.querySelector('zen-workspace[active]'); const box = ws?.scrollbox?.scrollbox ?? ws?.scrollbox;
          const r = zMany[0].getBoundingClientRect(), b = box.getBoundingClientRect(); box.scrollTop = r.top - b.top > b.height / 2 ? 0 : 99999; await zth.sleep(1200); return 1""")
        say("back to your tab", z.js(r"""const b = [...document.querySelectorAll('.zen-workspace-scroll-to-tab')].find(x => !x.hidden && x.getBoundingClientRect().width);
          if (!b) return { shown: false, expanded: document.documentElement.getAttribute('zen-sidebar-expanded') }; const c = getComputedStyle(b);
          return { shown: true, box: zr(b), background: c.backgroundColor, radius: c.borderRadius, filter: c.backdropFilter.slice(0, 40) }"""))
        z.screenshot(str(OUT / "h-back-to-tab.png"))
        z.js("for (const t of zMany) gBrowser.removeTab(t, { animate: false }); await zth.sleep(500); return 1")

    if part("urlbar"):
        say("the open address bar", z.js(r"""gURLBar.focus(); gURLBar.search('zenith'); await zth.sleep(1200); const bg = document.querySelector('#urlbar .urlbar-background'), c = getComputedStyle(bg);
          const probe = document.createElement('div'); probe.style.background = 'var(--zth-panel-bg)'; document.documentElement.append(probe); const want = getComputedStyle(probe).backgroundColor; probe.remove();
          return { open: gURLBar.hasAttribute('breakout-extend'), background: c.backgroundColor, 'panel glass': want, filter: c.backdropFilter.slice(0, 60) }"""))
        z.screenshot(str(OUT / "i-urlbar.png"))
        z.js("gURLBar.view.close(); gURLBar.blur(); return 1")

server.shutdown()
