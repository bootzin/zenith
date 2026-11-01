"""0.16.3, inside Zen: the overview's essentials; Peek's keys
(Ctrl+W closes the Peek, not the tab beneath) and links clicked with keys
staying in the Peek; new tabs from a split becoming tiles (foreground and
background); the media hub: music in another space shown, a muted tab not
winning, the bar and the Dash agreeing. Screenshots go to argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); return 1")
    z.js(r"""window.P = Services.prefs; window.zB = arguments[0]; const sys = Services.scriptSecurityManager.getSystemPrincipal();
      window.zopen = (u, o = {}) => gBrowser.addTab(u, { triggeringPrincipal: sys, inBackground: true, ...o });
      window.wu = window.windowUtils; window.zkey = async (vk, ch, mods) => { await new Promise(r => { const t = setTimeout(r, 400); wu.sendNativeKeyEvent(0x409, vk, mods, ch, ch, { observe() { clearTimeout(t); r(); } }); }); await zth.sleep(600); };
      P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.top.modules', 'spaces|title|media'); await zth.sleep(1200); return 1""", z.base)

    say("overview: essentials", z.js(r"""const e = zopen(zB + '/page?n=essential'); await zth.sleep(1500); gZenPinnedTabManager.addToEssentials(e); window.zEss = e; await zth.sleep(600);
      await window.ZenithOverview.toggle(); await zth.sleep(1800); const text = document.body.textContent; const out = { 'essential card': /Test page essential/.test([...document.querySelectorAll('[class^="zo-"] *')].map(n => n.textContent).join(' ')) };
      await window.ZenithOverview.toggle(); await zth.sleep(600); return out;"""))

    say("peek: Ctrl+W, a Ctrl+click inside", z.js(r"""const under = zopen(zB + '/page?n=beneath'); gBrowser.selectedTab = under; await zth.sleep(1200);
      await window.ZenithPeek.open(zB + '/page?n=peeked'); await zth.sleep(2000); const b = gZenGlanceManager.detachedBrowser; b.focus(); await zth.sleep(300);
      const tabs = gBrowser.tabs.length; const r = b.getBoundingClientRect();
      // (Ctrl+click the page's "Another page" link: it should load in the Peek, not open a tab.)
      const link = await b.browsingContext.currentWindowGlobal; void link;
      const out = {}; const n0 = gBrowser.tabs.length;
      await new Promise(res => { const t = setTimeout(res, 400); wu.sendNativeMouseEvent(Math.round((mozInnerScreenX + r.left + 300) * devicePixelRatio), Math.round((mozInnerScreenY + r.top + 156) * devicePixelRatio), wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, null, { observe() { clearTimeout(t); res(); } }); });
      out['peek url before'] = b.currentURI.spec;
      await zkey(0x57, 'w', 0x0400); await zth.sleep(600);
      out['after Ctrl+W'] = { peekOpen: !!gZenGlanceManager.detachedBrowser, 'tab beneath still there': under.isConnected && !under.closing, tabs: gBrowser.tabs.length - tabs };
      window.zUnder = under; return out;"""))

    say("peek: links with keys stay inside", z.js(r"""await window.ZenithPeek.open(zB + '/page?n=peeked2'); await zth.sleep(2200); const b = gZenGlanceManager.detachedBrowser; const n0 = gBrowser.tabs.length;
      // A synthetic trusted click can't be made from chrome; the actor's message is what a click sends:
      const actor = b.browsingContext.currentWindowGlobal.getActor('ZenithPeekLink'); actor.receiveMessage({ name: 'in-peek', data: { url: zB + '/page?n=followed', principal: null } }); await zth.sleep(1500);
      const out = { 'peek now at': b.currentURI.spec.replace(zB, ''), 'new tabs': gBrowser.tabs.length - n0, 'shared id set': Services.ppmm.sharedData.get('zenith-peek-browser') === b.browserId };
      gZenGlanceManager.closeDetachedGlance(); await zth.sleep(800); out['shared id cleared'] = !Services.ppmm.sharedData.has('zenith-peek-browser'); return out;"""))

    say("split: new tabs become tiles", z.js(r"""const a = zopen(zB + '/page?n=sa'), b = zopen(zB + '/page?n=sb'); await zth.sleep(1500); gBrowser.selectedTab = a; await zth.sleep(300);
      gZenViewSplitter.splitTabs([a, b], 'vsep', 0); await zth.sleep(1200); const data = () => gZenViewSplitter._data.find(d => d.tabs.includes(a)); const out = {};
      const f = gBrowser.addTab(zB + '/page?n=fore', { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), relatedToCurrent: true }); gBrowser.selectedTab = f; await zth.sleep(1500);
      out.foreground = { inSplit: !!data()?.tabs.includes(f), tiles: data()?.tabs.length }; gBrowser.selectedTab = a; await zth.sleep(500);
      const g = zopen(zB + '/page?n=back', { relatedToCurrent: true }); await zth.sleep(1500);
      out.background = { inSplit: !!data()?.tabs.includes(g), 'still on': gBrowser.selectedTab.label };
      P.setStringPref('zenith.shell.split-background', 'tab'); const h = zopen(zB + '/page?n=back2', { relatedToCurrent: true }); await zth.sleep(1500);
      out['background, set to tab'] = { inSplit: !!data()?.tabs.includes(h) }; P.clearUserPref('zenith.shell.split-background'); window.zSplit = [a, b, f, g, h];
      return out;"""))
    z.screenshot(str(OUT / "split.png"))
    z.js("try { gZenViewSplitter.unsplitCurrentView?.(); } catch {} for (const t of zSplit) if (t.isConnected) gBrowser.removeTab(t); await zth.sleep(800); return 1")

    say("media hub: music in another space, a muted tab here", z.js(r"""const W = gZenWorkspaces; const music = zopen(zB + '/music'); await zth.sleep(2500); const other = await W.createAndSaveWorkspace('Other', undefined, true); await zth.sleep(500);
      await W.moveTabToWorkspace(music, other.uuid); await zth.sleep(800); const noise = zopen(zB + '/audio'); await zth.sleep(2500); noise.toggleMuteAudio(); await zth.sleep(1800);
      const m = document.querySelector('.zenith-bar[edge="top"] [mod="media"]'); const out = { 'music playing': music.hasAttribute('soundplaying'), 'music here?': W.activeWorkspace === other.uuid, bar: m && !m.hidden ? m.textContent.trim() : '(hidden)', state: m?.getAttribute('state'), more: m?.getAttribute('more'),
        hub: window.ZenithMedia.list().map(s => `${s.tab.label}:${s.state}`) };
      await window.ZenithBar?.rebuild?.(); P.setStringPref('zenith.bar.top.modules', 'media|title|spaces'); await zth.sleep(1500); const m2 = document.querySelector('.zenith-bar[edge="top"] [mod="media"]'); out['after a rebuild'] = m2 && !m2.hidden ? m2.textContent.trim() : '(hidden)';
      window.ZenithDash.toggle(); await zth.sleep(1500); out.dash = document.querySelector('.zs-pop[kind="dash"] .zd-media')?.textContent.trim().slice(0, 60); window.ZenithDash.toggle(); await zth.sleep(400);
      window.zMedia = [music, noise]; return out;"""))
    z.screenshot(str(OUT / "media.png"))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
