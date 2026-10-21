"""0.12.6 (the 0.12.5 walkthrough's fixes), inside Zen:
- split views (real pointer): the whole split dragged from its left edge
  goes after a loose tab, whole; the pointer while dragging; between a
  split's tabs counts as the split;
- Ctrl+Tab: every tab comes round, from an essential too;
- cookies: deleting a site's data and the notice comes again;
- the sites list's popup is opaque;
- YouTube (dark): Show suggestions, typed too; only Home and Subscriptions
  of the side menu with subscriptions kept; the video fills theatre; the
  page keeps its scroll with the description open; a Short's buttons and
  the next one hidden. Pictures go to the scratch folder.
Arguments: only the parts whose names contain them."""
import base64, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
ONLY = [a.lower() for a in sys.argv[1:]]
SHOTS = Path(os.environ["TEMP"]) / "claude" / "r60"
SHOTS.mkdir(parents=True, exist_ok=True)


def check(z, name, body, *args):
    if ONLY and not any(o in name.lower() for o in ONLY):
        return
    try:
        res[name] = z.js(body, *args)
    except Exception as e:
        res[name] = f"FAILED: {e}"
    print(json.dumps({name: res[name]}, ensure_ascii=False), flush=True)


def shot(z, name):
    data = z.cmd("WebDriver:TakeScreenshot", {"full": False, "hash": False})
    png = data.get("value", data) if isinstance(data, dict) else data
    (SHOTS / f"{name}.png").write_bytes(base64.b64decode(png))


def page(z, script):
    """Run a script in the selected tab's page."""
    z.js("gBrowser.selectedTab = window.zenithYT; return 1")
    z.cmd("Marionette:SetContext", {"value": "content"})
    global HANDLE
    if not globals().get("HANDLE"):
        hs = z.cmd("WebDriver:GetWindowHandles", {})
        for h in (hs.get("value", hs) if isinstance(hs, dict) else hs):
            z.cmd("WebDriver:SwitchToWindow", {"handle": h})
            u = z.cmd("WebDriver:GetCurrentURL", {})
            if "youtube" in str(u):
                HANDLE = h
                break
    else:
        z.cmd("WebDriver:SwitchToWindow", {"handle": HANDLE})
    try:
        r = z.cmd("WebDriver:ExecuteAsyncScript", {"script": "const done = arguments[arguments.length - 1]; (async () => { " + script + " })().then(done, e => done('ERR ' + e));", "args": []})
        return r.get("value", r) if isinstance(r, dict) else r
    finally:
        z.cmd("Marionette:SetContext", {"value": "chrome"})


def want(name):
    return not ONLY or any(o in name.lower() for o in ONLY)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); return 1")

    check(z, "split whole, real pointer", r"""
      const base = arguments[0], out = {};
      const was = gZenCompactModeManager.preference; gZenCompactModeManager.preference = false; await zth.sleep(800);
      const t = ['a', 'b', 'c'].map(n => zth.open(base + '/page?n=w' + n)); await zth.sleep(1200);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500);
      const loose = zth.open(base + '/page?n=wloose'); await zth.sleep(1000);
      gBrowser.selectedTab = t[0]; await zth.sleep(500);
      const group = t[0].group, S = window.ZenithSplitReorder;
      out['between tabs counts as the split'] = S.targetOf(group) === group.tabs[0];
      const k = devicePixelRatio, wu = windowUtils;
      const scr = (x, y) => [Math.round((mozInnerScreenX + x) * k), Math.round((mozInnerScreenY + y) * k)];
      const ev = (p, m) => wu.sendNativeMouseEvent(p[0], p[1], m, 0, 0, document.documentElement, null);
      const g = group.getBoundingClientRect(), l = loose.getBoundingClientRect();
      const from = scr(g.left + 4, g.top + g.height / 2), to = scr(l.left + l.width / 2, l.top + l.height * 0.8);
      ev(from, wu.NATIVE_MOUSE_MESSAGE_MOVE); await zth.sleep(150); ev(from, wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN); await zth.sleep(120);
      for (let i = 1; i <= 10; i++) { ev([from[0], Math.round(from[1] + (to[1] - from[1]) * i / 10)], wu.NATIVE_MOUSE_MESSAGE_MOVE); await zth.sleep(50); }
      await zth.sleep(250);
      out['marked after the loose tab'] = loose.hasAttribute('zenith-split-after');
      out['pointer while dragging'] = getComputedStyle(loose).cursor;
      ev(to, wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP); await zth.sleep(1200);
      const all = gBrowser.tabs;
      out['moved after it, whole'] = [all.indexOf(t[0]) > all.indexOf(loose), t[0].group === group && group.tabs.length === 3, String(document.documentElement.getAttribute('zenith-split-dragging'))];
      gZenViewSplitter.removeTabFromGroup?.(t[0]); await zth.sleep(300);
      for (const x of [...t, loose]) gBrowser.removeTab(x);
      gZenCompactModeManager.preference = was;
      return out;""", z.base)

    check(z, "Ctrl+Tab every tab", r"""
      Services.prefs.setStringPref(window.ZenithCtrlTab.PREF, 'pictures'); await zth.sleep(300);
      const tabs = []; for (let i = 0; i < 12; i++) tabs.push(zth.open(arguments[0] + '/page?n=ct' + i, { background: true }));
      await zth.sleep(1500);
      const e = zth.open(arguments[0] + '/page?n=ctess', { background: true }); await zth.sleep(800); gZenPinnedTabManager.addToEssentials(e); await zth.sleep(1000);
      const round = async from => {
        gBrowser.selectedTab = from; await zth.sleep(300);
        const all = window.ZenithCtrlTab.inOrder();
        ctrlTab.open(); await zth.sleep(50);
        const seen = [ctrlTab.selected?._tab];
        for (let i = 1; i < all.length; i++) { ctrlTab.advanceFocus(true); seen.push(ctrlTab.selected?._tab); }
        const first = seen[0] === all[(all.indexOf(from) + 1) % all.length];
        ctrlTab.close(); await zth.sleep(300);
        return { 'starts after yours': first, 'every tab once': new Set(seen).size === all.length && seen.every(Boolean), 'row size': ctrlTab.previews.filter(p => !p.hidden).length, tabs: all.length };
      };
      const out = { 'from a tab': await round(tabs[5]), 'from an essential': await round(e) };
      for (const t of [...tabs, e]) gBrowser.removeTab(t);
      Services.prefs.clearUserPref(window.ZenithCtrlTab.PREF);
      return out;""", z.base)

    check(z, "cookie notice after delete", r"""
      const C = window.ZenithCookies, site = 'zenith-test.example';
      const a = await C.firstTime(site, 'hid'), b = await C.firstTime(site, 'hid');
      await C.remove(site);
      return { 'told once': [a, b], 'again after delete': await C.firstTime(site, 'hid') };""")

    check(z, "sites popup", r"""
      window.ZenithLive.toggle(); await zth.sleep(1500);
      const d = document.querySelector('dialog.zp-sites');
      if (!d) { window.ZenithLive.toggle(); return 'no list in the pane'; }
      d.showModal(); await zth.sleep(300);
      const cs = getComputedStyle(d), out = { background: cs.backgroundColor, color: cs.color };
      window.zenithDialog = d;
      return out;""")
    if want("sites popup") and isinstance(res.get("sites popup"), dict):
        shot(z, "sites-popup")
        z.js("window.zenithDialog.close(); window.ZenithLive.toggle(); return 1")

    if want("youtube"):
        z.js(r"""
          Services.prefs.setBoolPref('zenith.plus.focus-video-subscriptions', true);
          window.zenithYT = zth.open('https://www.youtube.com/'); await zth.sleep(8000); return 1""")
        page(z, "document.cookie = 'PREF=f6=400&hl=en; path=/; domain=.youtube.com; max-age=86400'; setTimeout(() => location.reload(), 200); return 1")
        z.js("await zth.sleep(8000); window.ZenithFocus.toggle(true); await zth.sleep(5000); return 1")

    check(z, "youtube guide with subscriptions", r"""
      return await window.zenithYT.linkedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus').sendQuery('watched');""")
    if want("youtube"):
        res["youtube guide with subscriptions (page)"] = page(z, r"""
          const vis = n => n && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0;
          return { dark: document.documentElement.hasAttribute('dark'),
                   sections: [...document.querySelectorAll('#guide ytd-guide-section-renderer')].filter(vis).map(s => [...s.querySelectorAll('ytd-guide-entry-renderer')].filter(vis).map(e => e.innerText.trim().split(String.fromCharCode(10))[0]).slice(0, 6)) };""")
        print(json.dumps({"guide": res["youtube guide with subscriptions (page)"]}, ensure_ascii=False), flush=True)
        res["youtube suggestions, dark"] = page(z, r"""
          document.documentElement.setAttribute('dark', '');
          const box = document.querySelector("input[name='search_query']");
          box.focus(); box.value = 'cats'; box.dispatchEvent(new InputEvent('input', { bubbles: true, data: 's', inputType: 'insertText' }));
          await new Promise(r => setTimeout(r, 2500));
          const vis = n => n && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0;
          const rows = () => [...document.querySelectorAll('.ytSuggestionComponentSuggestion, .sbsb_c')].filter(vis).length;
          const row = document.querySelector('[zenith-yt-suggest-row]'), list = row?.closest('.ytSearchboxComponentSuggestionsContainer, .sbdd_a');
          const out = { row: vis(row), 'rows before': rows(), rowColor: row && getComputedStyle(row).color,
                        listBg: list && getComputedStyle(list).backgroundColor, rowBg: row && getComputedStyle(row).backgroundColor };
          window.zenithRow = row;
          return out;""")
        shot(z, "suggest-dark")
        res["youtube suggestions, after click"] = page(z, r"""
          window.zenithRow?.click(); await new Promise(r => setTimeout(r, 500));
          return [...document.querySelectorAll('.ytSuggestionComponentSuggestion, .sbsb_c')].filter(n => getComputedStyle(n).display !== 'none' && n.getClientRects().length).length;""")
        print(json.dumps({"suggestions": [res["youtube suggestions, dark"], res["youtube suggestions, after click"]]}, ensure_ascii=False), flush=True)

        z.js(r"""
          const y = window.zenithYT;
          y.linkedBrowser.loadURI(Services.io.newURI('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
          await zth.sleep(13000); return 1""")
        res["youtube video fills"] = page(z, r"""
          const v = document.querySelector('video.html5-main-video'), c = document.querySelector('ytd-watch-flexy #full-bleed-container');
          const r = n => n ? (({ width, height }) => [Math.round(width), Math.round(height)])(n.getBoundingClientRect()) : null;
          return { theatre: !!document.querySelector('ytd-watch-flexy[theater]'), video: r(v), box: r(c), window: [innerWidth, innerHeight] };""")
        shot(z, "watch-fill")
        res["youtube guide on a video"] = page(z, r"""
          document.querySelector('#guide-button button, #guide-button')?.click(); await new Promise(r => setTimeout(r, 1500));
          const vis = n => n && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0;
          const out = [...document.querySelectorAll('#guide ytd-guide-section-renderer')].filter(vis).map(s => [...s.querySelectorAll('ytd-guide-entry-renderer')].filter(vis).map(e => e.innerText.trim().split(String.fromCharCode(10))[0]).slice(0, 6));
          document.querySelector('#guide-button button, #guide-button')?.click(); await new Promise(r => setTimeout(r, 500));
          return out;""")
        res["youtube scroll kept"] = page(z, r"""
          const more = document.querySelector('#description-inline-expander #expand, ytd-text-inline-expander #expand, #description #expand');
          more?.click(); await new Promise(r => setTimeout(r, 800));
          scrollTo(0, 700); const at = [];
          for (const ms of [500, 1500, 2500, 4000]) { await new Promise(r => setTimeout(r, ms - (at.length ? [500, 1500, 2500, 4000][at.length - 1] : 0))); at.push(Math.round(scrollY)); }
          return { expanded: !!more, scrollY: at };""")
        print(json.dumps({"fill": res["youtube video fills"], "guide": res["youtube guide on a video"], "scroll": res["youtube scroll kept"]}, ensure_ascii=False), flush=True)

        z.js(r"""
          window.ZenithFocus.toggle(false); await zth.sleep(1500);
          const y = window.zenithYT;
          y.linkedBrowser.loadURI(Services.io.newURI('https://www.youtube.com/shorts/'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
          await zth.sleep(10000); window.zenithShort = y.linkedBrowser.currentURI.spec;
          window.ZenithFocus.toggle(true); await zth.sleep(5000); return 1""")
        res["youtube short"] = page(z, r"""
          const vis = n => n && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0;
          return { url: location.pathname,
                   buttons: [...document.querySelectorAll('ytd-shorts like-button-view-model, ytd-shorts #like-button, ytd-shorts #comments-button, ytd-shorts reel-action-bar-view-model')].filter(vis).length,
                   reelsShown: [...document.querySelectorAll('ytd-shorts ytd-reel-video-renderer')].filter(vis).length,
                   dom: [...document.querySelectorAll('ytd-shorts .reel-video-in-sequence-new, ytd-shorts ytd-reel-video-renderer, ytd-shorts #shorts-player')].slice(0, 6).map(n =>
                     [n.localName, n.id, n.className.slice(0, 50), [...n.attributes].map(a => a.name).filter(a => !/^(class|id|style)$/.test(a)).join(' '), getComputedStyle(n).display, Math.round(n.getBoundingClientRect().height)].join('|')),
                   hiddenBy: (() => { const v = document.querySelector('ytd-shorts video'); const chain = []; for (let n = v; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).display === 'none') chain.push(n.localName + '#' + n.id + '.' + String(n.className).slice(0, 40)); return chain; })() };""")
        res["youtube short, before focus"] = z.js("return window.zenithShort")
        shot(z, "short")
        print(json.dumps({"short": res["youtube short"]}, ensure_ascii=False), flush=True)
        z.js("""window.ZenithFocus.toggle(false); await zth.sleep(800); gBrowser.removeTab(window.zenithYT);
                Services.prefs.clearUserPref('zenith.plus.focus-video-subscriptions'); return 1""")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
