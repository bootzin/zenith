"""0.12.7 (the 0.12.6 walkthrough's fixes), inside Zen: the chip under
the pointer while dragging a split's tab or the whole split; focus mode per
site; a link that started Zen routed; the sites popup's button; YouTube:
previews without picture-in-picture, the suggestions row on dark, the
scroll on a video page, the end screen, what's under a Short (pictures in
the scratch folder). Arguments: only the parts whose names contain them."""
import base64, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
ONLY = [a.lower() for a in sys.argv[1:]]
SHOTS = Path(os.environ["TEMP"]) / "claude" / "r61"
SHOTS.mkdir(parents=True, exist_ok=True)
HANDLE = None


def want(name):
    return not ONLY or any(o in name.lower() for o in ONLY)


def check(z, name, body, *args):
    if not want(name):
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
    """Run a script in the YouTube tab's page."""
    global HANDLE
    z.js("gBrowser.selectedTab = window.zenithYT; return 1")
    z.cmd("Marionette:SetContext", {"value": "content"})
    try:
        if not HANDLE:
            hs = z.cmd("WebDriver:GetWindowHandles", {})
            for h in (hs.get("value", hs) if isinstance(hs, dict) else hs):
                z.cmd("WebDriver:SwitchToWindow", {"handle": h})
                if "youtube" in str(z.cmd("WebDriver:GetCurrentURL", {})):
                    HANDLE = h
                    break
        else:
            z.cmd("WebDriver:SwitchToWindow", {"handle": HANDLE})
        r = z.cmd("WebDriver:ExecuteAsyncScript", {"script": "const done = arguments[arguments.length - 1]; (async () => { " + script + " })().then(done, e => done('ERR ' + e));", "args": []})
        return r.get("value", r) if isinstance(r, dict) else r
    except Exception as e:
        return f"FAILED: {e}"
    finally:
        z.cmd("Marionette:SetContext", {"value": "chrome"})


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 768); window.moveTo(0, 0); return 1")

    check(z, "split drag chip, real pointer", r"""
      const base = arguments[0], out = {};
      const was = gZenCompactModeManager.preference; gZenCompactModeManager.preference = false; await zth.sleep(800);
      const t = ['a', 'b', 'c'].map(n => zth.open(base + '/page?n=g' + n)); await zth.sleep(1200);
      gZenViewSplitter.splitTabs(t); await zth.sleep(1500);
      const loose = zth.open(base + '/page?n=gloose'); await zth.sleep(1000);
      gBrowser.selectedTab = t[0]; await zth.sleep(500);
      const k = devicePixelRatio, wu = windowUtils, group = t[0].group;
      const scr = (x, y) => [Math.round((mozInnerScreenX + x) * k), Math.round((mozInnerScreenY + y) * k)];
      const ev = (p, m) => wu.sendNativeMouseEvent(p[0], p[1], m, 0, 0, document.documentElement, null);
      const drag = async (fx, fy, tx, ty) => {
        const from = scr(fx, fy), to = scr(tx, ty);
        ev(from, wu.NATIVE_MOUSE_MESSAGE_MOVE); await zth.sleep(150); ev(from, wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN); await zth.sleep(120);
        for (let i = 1; i <= 8; i++) { ev([from[0], Math.round(from[1] + (to[1] - from[1]) * i / 8)], wu.NATIVE_MOUSE_MESSAGE_MOVE); await zth.sleep(50); }
        await zth.sleep(200);
        const g = document.getElementById('zenith-split-ghost');
        const seen = g ? [g.querySelectorAll('.chip').length, g.hasAttribute('whole'), g.querySelector('.label')?.textContent, g.getBoundingClientRect().width > 40] : null;
        ev(to, wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP); await zth.sleep(1000);
        return [seen, !document.getElementById('zenith-split-ghost')];
      };
      const r1 = t[1].getBoundingClientRect(), l = loose.getBoundingClientRect();
      out['one tab: chip, gone after'] = await drag(r1.left + r1.width / 2, r1.top + r1.height / 2, l.left + l.width / 2, l.top + l.height * 0.8);
      if (group.isConnected) {
        const g = group.getBoundingClientRect(), l2 = loose.getBoundingClientRect();
        out['whole split: chips, gone after'] = await drag(g.left + 4, g.top + g.height / 2, l2.left + l2.width / 2, l2.top + l2.height * 0.8);
      }
      for (const x of [...t, loose]) if (x.isConnected) gBrowser.removeTab(x);
      gZenCompactModeManager.preference = was;
      return out;""", z.base)

    check(z, "focus per site", r"""
      const F = window.ZenithFocus, base = arguments[0], other = base.replace('127.0.0.1', 'localhost');
      const a = zth.open(base + '/page?n=fa'), b = zth.open(other + '/page?n=fb'); await zth.sleep(1500);
      const on = () => document.documentElement.hasAttribute('zenith-focus'), out = {};
      gBrowser.selectedTab = a; await zth.sleep(300); F.toggle(); await zth.sleep(500);
      out['on here'] = on();
      gBrowser.selectedTab = b; await zth.sleep(500); out['not on another site'] = !on();
      gBrowser.selectedTab = a; await zth.sleep(500); out['back on the site'] = on();
      F.toggle(); await zth.sleep(400); out['off'] = !on() && !F.focused(a);
      Services.prefs.setStringPref('zenith.plus.focus-scope', 'all'); F.toggle(); await zth.sleep(300);
      gBrowser.selectedTab = b; await zth.sleep(500); out['every site'] = on();
      F.toggle(); await zth.sleep(300); out['every site off'] = !on();
      Services.prefs.clearUserPref('zenith.plus.focus-scope');
      gBrowser.removeTab(a); gBrowser.removeTab(b);
      return out;""", z.base)

    check(z, "link that started Zen, routed", r"""
      const L = window.ZenithLinks, R = gZenSpaceRoutingManager, W = gZenWorkspaces;
      let spaces = W.getWorkspaces(), made = null;
      if (spaces.length < 2) { made = await W.createAndSaveWorkspace('Zenith route test'); await zth.sleep(800); spaces = W.getWorkspaces(); }
      const here = W.activeWorkspace, there = spaces.find(s => s.uuid !== here);
      const route = R.createNewRoute(); route.reference = 'zenith-route-test'; route.openIn = there.uuid; R.updateRoute(route);
      const url = arguments[0] + '/page?n=zenith-route-test';
      const tab = gBrowser.addTrustedTab(url, { skipRoute: true }); gBrowser.selectedTab = tab; await zth.sleep(1500);
      if (tab.getAttribute('zen-workspace-id') !== here) { W.moveTabToWorkspace(tab, here); await W.changeWorkspaceWithID(here); gBrowser.selectedTab = tab; await zth.sleep(600); }
      const before = tab.getAttribute('zen-workspace-id') === here && W.activeWorkspace === here;
      await L.route(tab, url); await zth.sleep(800);
      const out = { 'was here': before, 'moved to its space': tab.getAttribute('zen-workspace-id') === there.uuid,
                    'that space shown': W.activeWorkspace === there.uuid, selected: tab.selected };
      R.removeRoute(route.id); gBrowser.removeTab(tab); await W.changeWorkspaceWithID(here); await zth.sleep(500);
      if (made) await W.removeWorkspace(made.uuid);
      return out;""", z.base)

    check(z, "sites popup text", r"""
      window.ZenithLive.toggle(); await zth.sleep(1500);
      const d = document.querySelector('dialog.zp-sites');
      const out = d ? { '[object …] gone': !d.textContent.includes('[object'), 'Done button': !!d.querySelector('.zp-sites-foot button') } : 'no list';
      window.ZenithLive.toggle(); return out;""")

    if want("youtube"):
        z.js("window.zenithYT = zth.open('https://www.youtube.com/results?search_query=cats'); await zth.sleep(9000); return 1")
        pref = z.js("const p = 'media.videocontrols.picture-in-picture.respect-disablePictureInPicture'; return Services.prefs.getPrefType(p) ? String(Services.prefs.getBoolPref(p)) : 'missing'")
        r = page(z, "const n = document.querySelector('ytd-video-renderer #thumbnail'); const b = n?.getBoundingClientRect(); return b ? [b.left + b.width / 2, b.top + b.height / 2] : null;")
        if isinstance(r, list):
            z.js(r"""const [x, y] = arguments[0], b = gBrowser.selectedBrowser.getBoundingClientRect(), k = devicePixelRatio, wu = windowUtils;
                     for (let i = 0; i < 6; i++) { wu.sendNativeMouseEvent(Math.round((mozInnerScreenX + b.left + x + i) * k), Math.round((mozInnerScreenY + b.top + y) * k), wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, document.documentElement, null); await zth.sleep(120); }
                     await zth.sleep(4000); return 1""", r)
        say("youtube preview", {"respect pref": pref, "thumb": r,
            "videos": page(z, "return [...document.querySelectorAll('video')].map(v => [v.closest('#movie_player, #shorts-player') ? 'player' : 'preview', v.hasAttribute('disablepictureinpicture'), !!(v.src || v.currentSrc)]);")})

        z.js("window.ZenithFocus.toggle(true); await zth.sleep(4000); return 1")
        say("youtube suggest row, dark", page(z, r"""
          document.documentElement.setAttribute('dark', '');
          const box = document.querySelector("input[name='search_query']");
          box.focus(); box.value = 'dogs'; box.dispatchEvent(new InputEvent('input', { bubbles: true, data: 's', inputType: 'insertText' }));
          await new Promise(r => setTimeout(r, 2500));
          const row = document.querySelector('[zenith-yt-suggest-row]'), list = row?.closest('.ytSearchboxComponentSuggestionsContainer, .sbdd_a');
          return { color: row && getComputedStyle(row).color, listBg: list && getComputedStyle(list).backgroundColor };"""))
        shot(z, "suggest-dark")

        z.js(r"""window.zenithYT.linkedBrowser.loadURI(Services.io.newURI('https://www.youtube.com/watch?v=jNQXAC9IVRw'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
                 await zth.sleep(13000); return 1""")
        say("youtube scroll, description folded", page(z, r"""
          const sleep = ms => new Promise(r => setTimeout(r, ms)), log = [], drops = [];
          const mo = new MutationObserver(rs => { for (const r of rs) log.push([Math.round(performance.now()), r.type[0], r.target.localName + (r.target.id ? '#' + r.target.id : ''), r.attributeName || '']); if (log.length > 600) log.splice(0, 300); });
          mo.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
          let last = scrollY; const iv = setInterval(() => { if (scrollY < last - 150) drops.push([Math.round(performance.now()), Math.round(last), Math.round(scrollY)]); last = scrollY; }, 40);
          scrollTo(0, 700); await sleep(1500); scrollTo(0, 950); await sleep(3000); scrollBy(0, 150); await sleep(3500);
          clearInterval(iv); mo.disconnect();
          const near = drops.length ? log.filter(l => l[0] <= drops[0][0] && l[0] > drops[0][0] - 400).slice(-14) : [];
          return { drops, final: Math.round(scrollY), near, active: document.activeElement?.localName + '#' + document.activeElement?.id };"""))
        say("youtube wheel", z.js(r"""
          const b = gBrowser.selectedBrowser.getBoundingClientRect(), k = devicePixelRatio, wu = windowUtils, ys = [];
          const x = Math.round((mozInnerScreenX + b.left + b.width * 0.3) * k), y = Math.round((mozInnerScreenY + b.top + b.height * 0.8) * k);
          const at = () => gBrowser.selectedBrowser.browsingContext.currentWindowGlobal.getActor('ZenithFocus').sendQuery('scrollY').catch(() => null);
          wu.sendNativeMouseEvent(x, y, wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, document.documentElement, null); await zth.sleep(200);
          for (let i = 0; i < 12; i++) { wu.sendNativeMouseScrollEvent(x, y, 0x020A, 0, -120, 0, 0, 0, document.documentElement, null); await zth.sleep(250); }
          for (let i = 0; i < 6; i++) { await zth.sleep(700); ys.push(await at()); }
          return ys;"""))
        say("youtube end screen", page(z, r"""
          scrollTo(0, 0); const v = document.querySelector('#movie_player video'); v.muted = true; v.currentTime = v.duration - 2; await v.play().catch(() => {});
          await new Promise(r => setTimeout(r, 7000));
          const vis = n => getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden' && n.getClientRects().length > 0 && n.getBoundingClientRect().width > 40;
          return [...document.querySelectorAll('#movie_player *')].filter(n => /endscreen|videowall|suggest|grid|still|upnext|autonav|related/i.test(String(n.className)) && vis(n)).map(n => String(n.className).slice(0, 70)).slice(0, 15);"""))
        shot(z, "end")

        z.js(r"""window.ZenithFocus.off(); await zth.sleep(1200);
                 window.zenithYT.linkedBrowser.loadURI(Services.io.newURI('https://www.youtube.com/shorts/'), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
                 await zth.sleep(10000); window.ZenithFocus.toggle(true); await zth.sleep(5000); return 1""")
        say("youtube short, under it", page(z, r"""
          const vis = n => getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0 && n.getBoundingClientRect().height > 4;
          const reel = document.querySelector('ytd-shorts .reel-video-in-sequence-new:has(#shorts-player)');
          const seen = new Set();
          return [...(reel?.querySelectorAll('*') ?? [])].filter(n => n.localName.includes('-') && vis(n) && !n.closest('#shorts-player'))
            .map(n => n.localName + '.' + String(n.className).split(' ')[0] + ' ' + (n.innerText || '').trim().slice(0, 24).replace(/\s+/g, ' '))
            .filter(x => !seen.has(x.split(' ')[0]) && seen.add(x.split(' ')[0])).slice(0, 30);"""))
        shot(z, "short")
        z.js("window.ZenithFocus.off(); await zth.sleep(800); gBrowser.removeTab(window.zenithYT); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
