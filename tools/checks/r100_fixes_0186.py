"""0.18.6, from the walkthrough of 0.18.5: the scroller's breakages
(unloading in a strip, sleeping columns, what loads on entering it, no tab
ever lost), its look beside the full sidebar, the start page's Enter and
switching to a tab, a bar tab into a folder from a strip, the media hub's
Shift+wheel, module names repaired, themes and forced dark pages.
Headless. Screenshots in argv[1]; part names after it run only those."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT.mkdir(parents=True, exist_ok=True)
ONLY = set(sys.argv[2:])


def say(name, value):
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


def part(name):
    return not ONLY or name in ONLY


import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LIGHT = b"""<!doctype html><title>Light page</title>
<style>:root { --card-bg: #f2f2f2; --text-color: #222; }
body { margin: 0; background: #ffffff; color: #111; font: 16px sans-serif; }
.box { position: absolute; left: 20px; top: 100px; width: 300px; height: 80px; background: var(--card-bg); color: var(--text-color); border: 2px solid #ddd; }
@media (min-width: 10px) { .wide { position: absolute; left: 400px; top: 100px; width: 200px; height: 80px; background: #e8f0ff; } }
</style>
<div class="box">A light card</div><div class="wide">media rule</div>
<div style="position:absolute;left:20px;top:220px;width:300px;height:60px;background:#fafafa;color:#333">inline style</div>
<img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23ff0000'/%3E%3C/svg%3E" style="position:absolute;left:700px;top:100px">
"""


class Pages(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(LIGHT)


server = ThreadingHTTPServer(("127.0.0.1", 0), Pages)
threading.Thread(target=server.serve_forever, daemon=True).start()
LIGHT_URL = f"http://127.0.0.1:{server.server_address[1]}/light"

SETUP = r"""window.P = Services.prefs; window.sys = Services.scriptSecurityManager.getSystemPrincipal();
  window.zopen = (u, o = {}) => gBrowser.addTab(u, { triggeringPrincipal: sys, inBackground: true, ...o });
  window.zpage = n => `data:text/html,<title>${n}</title><body style="background:%23345;color:white;font:40px sans-serif">page ${n}`;
  window.zr = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  window.L = window.ZenithLayouts; window.zbox = t => t.linkedBrowser.closest('.browserSidebarContainer');
  window.zdata = () => gZenViewSplitter._data.find(x => x.tabs.includes(gBrowser.selectedTab));
  window.zcols = () => { const d = zdata(); return d ? L.cols(d).map(c => c.map(t => t.label).join('/')) : []; };
  window.zclean = async () => { L.set('dwindle'); await zth.sleep(300); while (gZenViewSplitter._data.length) gZenViewSplitter.removeGroup(0);
    for (const t of gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-essential') && t !== gBrowser.selectedTab)) gBrowser.removeTab(t); await zth.sleep(500); };
  window.zawake = () => gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-essential')).map(t => `${t.label}${t.hasAttribute('pending') || !t.linkedPanel ? ':zz' : ''}`);
  return !!window.ZenithLayouts"""

with Scene(headless=True) as z:
    z.js("window.resizeTo(1366, 740); await SessionStore.promiseAllWindowsRestored; await zth.sleep(3500); return 1")
    say("setup", z.js(SETUP))

    if part("stripbugs"):
        z.js(r"""await zclean(); gBrowser.selectedTab.linkedBrowser.loadURI(Services.io.newURI(zpage('T0')), { triggeringPrincipal: sys });
          window.zT = [gBrowser.selectedTab]; for (let i = 1; i < 8; i++) zT.push(zopen(zpage('T' + i))); await zth.sleep(2500);
          for (const t of zT.slice(1)) gBrowser.discardBrowser(t, true); await zth.sleep(800); return 1""")
        say("before the scroller", z.js("return { tabs: gBrowser.tabs.length, awake: zawake() }"))
        say("entering the scroller: what loads", z.js(r"""L.set('scroller'); await zth.sleep(4000); return { tabs: gBrowser.tabs.length, cols: zcols(), awake: zawake(), view: L.cols(zdata()).map(c => zr(zbox(c[0]))?.[0]) }"""))
        say("focus left onto sleeping columns", z.js(r"""const out = []; for (let i = 0; i < 3; i++) { L.focus('left'); await zth.sleep(1500); out.push(`${gBrowser.selectedTab.label}${gBrowser.selectedTab.hasAttribute('pending') ? ':zz' : ''}`); }
          return { on: out, awake: zawake() }"""))
        say("unloading the column you're on", z.js(r"""let n = 0; const count = () => n++; gBrowser.tabContainer.addEventListener('TabSelect', count); const before = gBrowser.selectedTab.label;
          try { gBrowser.explicitUnloadTabs([gBrowser.selectedTab]); } catch (e) { return 'error: ' + e; }
          await zth.sleep(3000); gBrowser.tabContainer.removeEventListener('TabSelect', count);
          return { before, now: gBrowser.selectedTab.label, selects: n, tabs: gBrowser.tabs.length, cols: zcols(), awake: zawake(),
                   cards: [...document.querySelectorAll('#tabbrowser-tabpanels > .zenith-asleep')].map(c => c.children[1].textContent + ' ' + zr(c)) }"""))
        say("Alt+U on a column", z.js(r"""let n = 0; const count = () => n++; gBrowser.tabContainer.addEventListener('TabSelect', count); const before = gBrowser.selectedTab.label;
          window.ZenithShell.keys.run('sleep'); await zth.sleep(3000); gBrowser.tabContainer.removeEventListener('TabSelect', count);
          return { before, now: gBrowser.selectedTab.label, selects: n, tabs: gBrowser.tabs.length, awake: zawake() }"""))
        say("leaving the scroller: no tab lost", z.js(r"""const n = gBrowser.tabs.length; L.set('dwindle'); await zth.sleep(2000); const out = { before: n, after: gBrowser.tabs.length, splits: gZenViewSplitter._data.length };
          L.set('scroller'); await zth.sleep(2500); out['back in'] = gBrowser.tabs.length; out.cols = zcols(); return out"""))
        z.screenshot(str(OUT / "a-strip.png"))

    if part("peek"):
        say("Peek over a strip's column: follows it, kept as a tab goes right of it", z.js(r"""await zclean(); L.set('scroller'); await zth.sleep(600);
          const a = gBrowser.selectedTab; zopen(zpage('P1')); zopen(zpage('P2')); await zth.sleep(1500); L.focus('right'); await zth.sleep(900); const owner = gBrowser.selectedTab;
          window.ZenithPeek.open(arguments[0]); await zth.sleep(2500); const host = document.getElementById('zen-glance-detached');
          const out = { owner: owner.label, open: !!gZenGlanceManager.detachedBrowser, over: [zr(host), zr(zbox(owner))] };
          L.focus('left'); await zth.sleep(1200); out['after going left'] = { away: host?.hasAttribute('zenith-away') }; gBrowser.selectedTab = owner; L.arrange(owner); await zth.sleep(1200);
          out['back'] = [zr(host), zr(zbox(owner))]; await window.ZenithPeek.keep(); await zth.sleep(2000); out.kept = { on: gBrowser.selectedTab.label, cols: zcols() }; return out""", LIGHT_URL))

    if part("drag"):
        say("Alt+drag and Alt+right-drag in the scroller", z.js(r"""await zclean(); L.set('scroller'); await zth.sleep(600); const a = gBrowser.selectedTab;
          const b = zopen(zpage('D1')), c = zopen(zpage('D2')); await zth.sleep(1500); const out = { start: zcols() };
          L.place(c, a, 'bottom'); await zth.sleep(700); out['D2 onto the bottom of the first column'] = zcols();
          L.place(c, b, 'right'); await zth.sleep(700); out['D2 onto the right edge of D1'] = zcols();
          L.place(c, a, 'swap'); await zth.sleep(700); out['D2 swapped with the first'] = zcols();
          const g = L.geometry(zdata()); const from = { share: L.share(c), heights: [[c, undefined]], W: g.W - g.G }; L.drag(c, from, 200, 0); await zth.sleep(600);
          out['right-drag 200px wider'] = L.geometry(zdata()).ws.map(Math.round); return out"""))

    if part("newtiles"):
        say("new tiles in a strip: right of yours, whatever the way in", z.js(r"""await zclean(); L.set('scroller'); await zth.sleep(600); const a = gBrowser.selectedTab; const b = zopen(zpage('N1')); await zth.sleep(1200);
          gBrowser.selectedTab = a; L.arrange(a); await zth.sleep(600); const out = {};
          window.ZenithShell.tiler.link(zpage('Linked'), sys, a.linkedBrowser); await zth.sleep(1500); out['Alt+Shift+click'] = zcols();
          L.arrange(a); await zth.sleep(500); const g = zopen(zpage('Glanced')); window.ZenithShell.tiler.glanceSplit = g; gZenViewSplitter.splitTabs([g, a], 'vsep', 0); await zth.sleep(1500); out["Glance's split"] = zcols();
          return out"""))

    if part("rightside"):
        say("right-side full sidebar beside a strip", z.js(r"""await zclean(); P.setBoolPref('zen.tabs.vertical.right-side', true); await zth.sleep(800);
          for (let i = 0; i < 4; i++) zopen(zpage('W' + i)); await zth.sleep(1000); L.set('scroller'); await zth.sleep(1500);
          const M = window.gZenCompactModeManager; M.preference = false; await zth.sleep(2000);
          const d = zdata(), panels = zr(gBrowser.tabpanels); const cols = d ? L.cols(d).map(c => zr(zbox(c[0]))) : [];
          return { panels, toolbox: zr(document.getElementById('navigator-toolbox')), browser: zr(document.getElementById('browser')), tabbox: zr(document.getElementById('tabbrowser-tabbox')), cols, W: gBrowser.tabpanels.clientWidth, view: d?.zenithView }"""))
        z.screenshot(str(OUT / "b-rightside.png"))
        z.js("window.gZenCompactModeManager.preference = true; P.clearUserPref('zen.tabs.vertical.right-side'); await zth.sleep(800); return 1")

    if part("group"):
        say("the strip's group in the sidebar", z.js(r"""await zclean(); for (let i = 0; i < 3; i++) zopen(zpage('G' + i)); await zth.sleep(800); L.set('scroller'); await zth.sleep(1500);
          const g = gBrowser.selectedTab.group; if (!g) return 'no group';
          const kids = [...g.children].map(c => `${c.localName}.${[...c.classList].join('.')}${c.id ? '#' + c.id : ''} ${zr(c)}`);
          const lone = zopen(zpage('Lone')); await zth.sleep(10); return { lone: zr(lone), tag: g.localName, attrs: [...g.attributes].map(a => `${a.name}=${a.value.slice(0, 30)}`), rect: zr(g), kids: kids.slice(0, 8), firstTab: zr(gBrowser.selectedTab) }"""))
        z.screenshot(str(OUT / "c-group.png"))

    if part("dark"):
        PIX = r"""window.zpix = async (pts) => { const wg = gBrowser.selectedBrowser.browsingContext.currentWindowGlobal; const out = {};
            for (const [name, x, y] of pts) { const bmp = await wg.drawSnapshot(new DOMRect(x, y, 1, 1), 1, 'white'); const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
              c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, 1, 1).data; out[name] = `rgb(${d[0]},${d[1]},${d[2]})`; } return out; };
          window.zpts = [['page', 900, 600], ['card', 60, 160], ['card border', 21, 140], ['media rule', 450, 160], ['inline', 60, 260], ['picture', 720, 120]]; return 1"""
        z.js(PIX)
        z.js(r"""await zclean(); P.setIntPref('layout.css.prefers-color-scheme.content-override', 0); P.clearUserPref('zenith.plus.appearance-force'); await zth.sleep(500); return 1""")
        say("forced dark, Recolour (the default)", z.js(r"""gBrowser.selectedTab = gBrowser.addTab(arguments[0], { triggeringPrincipal: sys }); await zth.sleep(4000); return await zpix(zpts)""", LIGHT_URL))
        z.screenshot(str(OUT / "d-recolour.png"))
        say("forced dark, Invert", z.js(r"""P.setStringPref('zenith.plus.appearance-force', 'invert'); await zth.sleep(300); gBrowser.selectedBrowser.reload(); await zth.sleep(4000); return await zpix(zpts)"""))
        z.screenshot(str(OUT / "e-invert.png"))
        z.js("P.clearUserPref('zenith.plus.appearance-force'); P.clearUserPref('layout.css.prefers-color-scheme.content-override'); gBrowser.removeTab(gBrowser.selectedTab); return 1")

    if part("themes"):
        z.js(r"""await zclean(); P.setStringPref('zenith.bar.top', 'on'); const a = gBrowser.selectedTab; const b = zopen(zpage('Right tile')); await zth.sleep(600);
          gZenViewSplitter.splitTabs([a, b], 'vsep', 0); await zth.sleep(1200); window.ZenithShell.keys.run('rice'); await zth.sleep(1800); return 1""")
        for name in ["Catppuccin waybar", "Tokyo Night powerline", "i3", "Polybar"]:
            say(f"theme {name}", z.js(r"""const card = [...document.querySelectorAll('#zenith-rice .zr-card')].find(c => c.getAttribute('theme') === arguments[0]); if (!card) return 'no card';
              card.click(); await zth.sleep(1800); const bar = document.querySelector('.zenith-bar[edge="top"]');
              const errs = Services.console.getMessageArray().map(m => m.message ?? String(m)).filter(m => /Zenith|bar\.mjs/.test(m)).slice(-3).map(m => m.slice(0, 200));
              return { look: bar?.getAttribute('look'), colors: bar?.getAttribute('colors'), spaces: bar?.getAttribute('spaces-look'), modules: P.getStringPref('zenith.bar.top.modules', ''),
                       focus: P.getStringPref('zenith.panels.tile-focus', ''), font: P.getStringPref('zenith.core.font', ''), palette: P.getStringPref('zenith.palette', ''), bars: document.querySelectorAll('.zenith-bar').length, top: P.getStringPref('zenith.bar.top', ''), errs }""", name))
            z.js("document.getElementById('zenith-rice').style.visibility = 'hidden'; await zth.sleep(400); return 1")
            z.screenshot(str(OUT / f"f-theme-{name.split()[0].lower()}.png"))
            z.js("document.getElementById('zenith-rice').style.visibility = ''; return 1")
        z.screenshot(str(OUT / "f-theme-cards.png"))
        z.js(r"""const c = [...document.querySelectorAll('#zenith-rice button')].find(b => b.textContent.trim() === 'Cancel'); c?.click(); await zth.sleep(800); return 1""")

    if part("start2"):
        say("start page: a tab's row closes the start page (Enter on search checked once, by hand: it reaches the web)", z.js(r"""await zclean(); P.setStringPref('zenith.plus.startpage', 'on'); zopen(zpage('Openone')); await zth.sleep(500);
          const t = gBrowser.addTab('about:zenith-start', { triggeringPrincipal: sys }); gBrowser.selectedTab = t; let d = null;
          for (let i = 0; i < 30 && !(d = t.linkedBrowser.contentDocument)?.getElementById('q'); i++) await zth.sleep(200);
          if (!d) return { remote: t.linkedBrowser.isRemoteBrowser, uri: t.linkedBrowser.currentURI.spec };
          const q = d.getElementById('q'); q.focus(); q.value = 'Openone'; q.dispatchEvent(new d.defaultView.Event('input')); await zth.sleep(1500);
          const rows = [...d.querySelectorAll('#results li')]; const i = rows.findIndex(li => li.querySelector('.what').textContent === 'Switch to tab'); const out = { rows: rows.map(r => r.textContent.slice(0, 40)) };
          if (i >= 0) { rows[i].dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true })); await zth.sleep(1500); }
          out['switched to'] = gBrowser.selectedTab.label; out['start page closed'] = !t.isConnected; return out"""))

    if part("media2"):
        say("Shift+wheel on the media module (Which source: the default)", z.js(r"""await zclean(); P.clearUserPref('zenith.bar.media-pick'); P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.top.modules', 'spaces|title|media,clock');
          const m1 = zopen(arguments[0] + '/music'); await zth.sleep(2000); const m2 = zopen(arguments[0] + '/audio'); await zth.sleep(4000);
          const m = document.querySelector('.zenith-bar[edge="top"] [mod="media"]'); const before = window.ZenithMedia.current?.tab.label; const r = m.getBoundingClientRect();
          m.dispatchEvent(new WheelEvent('wheel', { deltaX: 100, deltaY: 0, shiftKey: true, bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 })); await zth.sleep(900);
          const after = window.ZenithMedia.current?.tab.label; await zth.sleep(2000); return { hub: window.ZenithMedia.list().map(x => `${x.tab.label}:${x.state}`), before, after, 'a moment later': window.ZenithMedia.current?.tab.label }""".replace("arguments[0]", "'" + z.base + "'")))

    if part("folder2"):
        say("a strip's tab dropped into a folder in the bar", z.js(r"""await zclean(); P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.top.modules', 'launcher,layout,tabs|clock|downloads,power'); P.setStringPref('zenith.bar.tab-crowd', 'shrink'); P.setStringPref('zenith.bar.tab-look', 'titles');
          const f1 = zopen(zpage('F1')), f2 = zopen(zpage('F2')); await zth.sleep(600); const folder = gZenFolders.createFolder([f1, f2], { label: 'Folder', renameFolder: false }); await zth.sleep(1200);
          const c = zopen(zpage('Cx')); zopen(zpage('Dx')); await zth.sleep(800); L.set('scroller'); await zth.sleep(2000); const inStrip = !!gZenViewSplitter._data.find(d => d.tabs.includes(c));
          const items = [...document.querySelectorAll('.zenith-bar[edge="top"] .zb-task:not(.zb-task-more)')], from = items.find(b => b.zbTab === c), to = items.find(b => b.zbTab === f2);
          if (!from || !to) return { inStrip, bar: items.map(b => b.title) };
          const dt = new DataTransfer(); dt.mozSetDataAt('application/x-moz-tabbrowser-tab', c, 0); const r = to.getBoundingClientRect(), at = { bubbles: true, cancelable: true, clientX: r.right - 3, clientY: r.top + r.height / 2, dataTransfer: dt };
          to.dispatchEvent(new DragEvent('dragover', at)); const marked = to.getAttribute('drop'); to.dispatchEvent(new DragEvent('drop', at)); await zth.sleep(1200);
          return { inStrip, marked, 'in the folder': c.group === folder, pinned: c.pinned }"""))

    if part("restart") or part("restartplain") or part("rescue"):
        if part("rescue"):
            z.js("Services.prefs.setBoolPref('zenith.internal.strip-save-raw', true); Services.prefs.clearUserPref('zenith.internal.strip-rescued'); return 1")
        say("a strip of 8, then Zen quits" if not part("restartplain") else "8 plain tabs, then Zen quits", z.js(r"""await zclean(); P.setIntPref('browser.startup.page', 3); gBrowser.selectedTab.linkedBrowser.loadURI(Services.io.newURI(zpage('R0')), { triggeringPrincipal: sys });
          for (let i = 1; i < 8; i++) zopen(zpage('R' + i)); await zth.sleep(1500); if (arguments[0]) L.set('scroller'); await zth.sleep(2500);
          const out = { cols: zcols(), tabs: gBrowser.tabs.length };
          try { await SessionStore.flushAllWindowsAsync?.(); } catch (e) { out.flush = String(e); }
          await zth.sleep(1500); return out""", not part("restartplain")))
        try:
            z.js("setTimeout(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit), 50); return 1")
        except Exception:
            pass
        import time; time.sleep(8)
    # (The test profile starts blank; this once, the session comes back.)
    import re
    from harness import TEST_PROFILE
    uj = TEST_PROFILE / "user.js"
    if uj.exists():
        uj.write_text(re.sub(r'user_pref\("browser\.startup\.page", *\d+\);', 'user_pref("browser.startup.page", 3);', uj.read_text(encoding="utf-8")), encoding="utf-8")

if part("restart") or part("restartplain") or part("rescue"):
    with Scene(headless=True, sync=False) as z:
        z.js("await SessionStore.promiseAllWindowsRestored; await zth.sleep(6000); return 1")
        say("after the restart", z.js(r"""const R = gBrowser.tabs.filter(t => /^R\d$/.test(t.label)); const d = gZenViewSplitter._data.find(x => x.tabs.includes(R[0]));
          const out = { 'cleaned as saved': Services.prefs.getIntPref('zenith.internal.strip-saved', 0), 'R tabs': R.length, labels: R.map(t => t.label), 'in one split': d ? d.tabs.length : 0, layout: window.ZenithLayouts.of(), all: gBrowser.tabs.map(t => t.label) };
          for (const f of ['sessionstore-backups/previous.jsonlz4', 'sessionstore-backups/recovery.jsonlz4', 'zen-sessions.jsonlz4', 'sessionstore.jsonlz4']) {
            try { const j = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, ...f.split('/')), { decompress: true }); const t = JSON.stringify(j);
              out[f] = { R: (t.match(/"R\d"/g) ?? []).length, split: (t.match(/split[A-Za-z]*"/g) ?? []).slice(0, 6), size: t.length, groups: (t.match(/"splitViewData"[^\]]{0,300}/g) ?? []).map(x => x.slice(0, 300)) }; } catch (e) { out[f] = String(e).slice(0, 80); } }
          out['rescue offered'] = window.ZenithLayouts.rescueOffered ?? 0;
          if (out['rescue offered']) { const n = gBrowser.tabs.length; const b = [...document.querySelectorAll('button, .zenith-notice-action, [data-action]')].find(x => /^Reopen/.test(x.textContent?.trim() ?? ''));
            if (b) { b.click(); await zth.sleep(2500); out['after Reopen'] = { tabs: gBrowser.tabs.length - n, labels: gBrowser.tabs.slice(n).map(t => t.label) }; } else out['after Reopen'] = 'no button'; }
          Services.prefs.clearUserPref('zenith.internal.strip-save-raw');
          return out"""))

