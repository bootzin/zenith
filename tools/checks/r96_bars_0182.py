"""0.18.2, inside Zen: a strip doesn't load its columns out of sight; the
bars' space even on every side, a floating bar over the page; the layout
module; colour previews; the picker and settings page without "null" or
"[object …]"; every settings section folds. Screenshots in argv[1]."""
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


SETUP = r"""window.P = Services.prefs; window.zB = arguments[0]; window.sys = Services.scriptSecurityManager.getSystemPrincipal();
  window.zopen = (u, o = {}) => gBrowser.addTab(u, { triggeringPrincipal: sys, inBackground: true, ...o });
  window.L = window.ZenithSettings;
  window.zr = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  window.zpage = () => zr(gBrowser.selectedBrowser.closest('.browserSidebarContainer') ?? gBrowser.selectedBrowser);
  // Words that mean a value went missing: null, undefined, [object …].
  window.zbad = el => [...(el?.textContent ?? '').matchAll(/.{0,30}(?:null|undefined|\[object [A-Za-z]+\]).{0,20}/g)].map(m => m[0]).slice(0, 6);
  window.zbars = () => Object.fromEntries([...document.querySelectorAll('.zenith-bar')].map(b => [b.getAttribute('edge'), zr(b)]));
  return !!window.L"""

USER = OUT / "user-prefs.json"
with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); return 1")
    z.js("await SessionStore.promiseAllWindowsRestored; await zth.sleep(2500); return 1")
    say("setup", z.js(SETUP, z.base))
    if part("bars"):
        z.js(r"""P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.bottom', 'on'); L.Bars.chooseLook('all', 'floating');
          gBrowser.selectedTab = zopen('data:text/html,<body style=background:%23446>page'); await zth.sleep(2000); return 1""")
        say("floating", z.js("return { window: [innerWidth, innerHeight], bars: zbars(), page: zpage() }"))
        z.screenshot(str(OUT / "a-floating.png"))
        z.js("P.setStringPref('zenith.bar.display-top', 'overlay'); P.setStringPref('zenith.bar.display-bottom', 'overlay'); await zth.sleep(1200); return 1")
        say("floating over the page", z.js("return { bars: zbars(), page: zpage() }"))
        z.screenshot(str(OUT / "b-floating-overlay.png"))
        z.js("P.clearUserPref('zenith.bar.display-top'); P.clearUserPref('zenith.bar.display-bottom'); return 1")
    if part("null") and USER.exists():
        # (Your profile's Zenith settings, then every category of the picker.)
        prefs = json.loads(USER.read_text())
        z.js(r"""for (const [k, v] of Object.entries(arguments[0])) { if (typeof v === 'boolean') P.setBoolPref(k, v); else if (typeof v === 'number') P.setIntPref(k, v); else P.setStringPref(k, v); }
          L.migrate(); await zth.sleep(1500); return 1""", prefs)
        found = {}
        for cat in ["themes", "colours", "glass", "shape", "bars", "font", "motion", "menus"]:
            hits = z.js("await window.ZenithLooks.open(arguments[0]); await zth.sleep(1500); return window.zbad(document.getElementById('zenith-rice'))", cat)
            if hits:
                found[cat] = hits
        say("picker: missing values shown", found or "none")
        z.js("window.ZenithLooks.open('font'); await zth.sleep(2500); return 1")
        say("font", z.js(r"""const h = document.getElementById('zenith-rice'); return { whose: [...h.querySelectorAll('.zr-scope .zr-opt')].map(b => b.textContent),
          fonts: h.querySelectorAll('.zr-font').length, current: h.querySelector('.zr-font[current]')?.textContent, 'bar font migrated': P.getStringPref('zenith.bar.font', '(unset)') }"""))
        z.screenshot(str(OUT / "e-picker-font.png"))
        z.js("window.ZenithLooks.open('colours'); await zth.sleep(2500); return 1")
        say("colours", z.js(r"""const h = document.getElementById('zenith-rice'); const card = v => h.querySelector(`[field="zenith.palette"] [value="${v}"] .zr-pic`);
          return { previews: Object.fromEntries(['own', 'wallpaper', 'pywal', 'wallust'].map(v => [v, card(v)?.style.getPropertyValue('--zr-accent') || card(v)?.getAttribute('title') || 'blank'])),
            'accent circles': [...h.querySelectorAll('[field="zenith.core.accent"] .zr-dot')].map(d => getComputedStyle(d).backgroundColor).slice(0, 4) }"""))
        z.screenshot(str(OUT / "f-picker-colours.png"))
        z.js("window.ZenithLooks.open('bars'); await zth.sleep(1500); return 1")
        say("bar sliders", z.js(r"""const h = document.getElementById('zenith-rice'); return Object.fromEntries([...h.querySelectorAll('[kind="slider"]')].map(b => [b.getAttribute('field'), [b.querySelector('input').min, b.querySelector('input').max, b.querySelector('output').textContent]]))"""))
        z.js(r"""const r = document.querySelector('#zenith-rice [field="bar:margin"] input'); r.value = '11'; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); await zth.sleep(1200); return 1""")
        say("margin 11 on the slider", z.js(r"""return { pref: P.getStringPref('zenith.bar.margin'), shown: document.querySelector('#zenith-rice [field="bar:margin"] output').textContent, bar: getComputedStyle(document.getElementById('zenith-bar')).marginTop }"""))
        z.screenshot(str(OUT / "g-picker-bars.png"))
        z.js("document.querySelector('#zenith-rice .zr-primary')?.click(); await zth.sleep(500); return 1")
    if part("settings"):
        z.js("gBrowser.selectedTab = gBrowser.addTab('about:preferences', { triggeringPrincipal: sys }); await zth.sleep(2500); gBrowser.selectedBrowser.contentWindow.gotoPref?.('paneZenith'); for (let i = 0; i < 30 && !gBrowser.selectedBrowser.contentDocument?.querySelector('.zp-section'); i++) await zth.sleep(500); return 1")
        say("settings page", z.js(r"""const d = gBrowser.selectedBrowser.contentDocument, groups = d.querySelectorAll('.zp-group');
          return { 'missing values': window.zbad(d.body), groups: groups.length, 'all fold': [...groups].every(g => g.localName === 'details'),
            'sections fold': d.querySelectorAll('button.zp-section-head').length, 'margin slider': (() => { const r = d.querySelector('[data-prop="zenith.bar.margin"] input[type=range]'); return r && [r.min, r.max]; })(),
            'font box': d.querySelector('.zp-font')?.textContent.slice(0, 30) ?? 'none' }"""))
        z.js(r"""const d = gBrowser.selectedBrowser.contentDocument; d.querySelector('button.zp-section-head').click(); await zth.sleep(300); return 1""")
        say("a section folded", z.js(r"""const d = gBrowser.selectedBrowser.contentDocument, s = d.querySelector('.zp-section'); return { folded: s.hasAttribute('zp-folded'), height: Math.round(s.getBoundingClientRect().height), kept: P.getStringPref('zenith.internal.settings-folds', '') }"""))
        z.screenshot(str(OUT / "h-settings.png"))
        z.js(r"""const d = gBrowser.selectedBrowser.contentDocument; d.querySelector('button.zp-section-head').click(); P.clearUserPref('zenith.internal.settings-folds'); gBrowser.removeTab(gBrowser.selectedTab); return 1""")
    if part("layout"):
        z.js("P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.top.modules', 'launcher,layout|clock|power'); await zth.sleep(1500); return 1")
        say("layout module", z.js(r"""const m = () => document.querySelector('#zenith-bar .zb-mod[mod="layout"]'); const a = m()?.textContent; window.ZenithLayouts.set('scroller'); await zth.sleep(800);
          const b = m()?.textContent; window.ZenithLayouts.set('monocle'); await zth.sleep(800); const c = m()?.textContent; window.ZenithLayouts.set('dwindle'); return [a, b, c]"""))
    if part("strip"):
        # (Six pages, all but the first unloaded, as after a restart; then the scroller's strip.)
        z.js(r"""window.ZenithLayouts.set('dwindle'); await zth.sleep(300); while (gZenViewSplitter._data.length) gZenViewSplitter.removeGroup(0);
          const keep = zopen('about:blank'); gBrowser.selectedTab = keep; await zth.sleep(300);
          for (const t of [...gBrowser.tabs]) if (!t.pinned && !t.hasAttribute('zen-essential') && t !== keep) gBrowser.removeTab(t, { animate: false });
          window.zT = []; for (let i = 0; i < 6; i++) zT.push(zopen(`data:text/html,<title>t${i}</title>page ${i}`)); await zth.sleep(2000);
          gBrowser.selectedTab = zT[0]; gBrowser.removeTab(keep); await zth.sleep(500); for (const t of zT.slice(1)) gBrowser.discardBrowser(t); await zth.sleep(800);
          P.setStringPref('zenith.shell.scroller-width', 'half'); window.ZenithLayouts.set('scroller'); await zth.sleep(3000); return 1""")
        loaded = r"""return zT.map(t => (t.linkedBrowser?.currentURI?.spec ?? '').startsWith('data:') && !t.hasAttribute('pending') ? 'loaded' : 'not')"""
        say("strip: columns loaded (2 in view)", z.js(loaded)); say("strip order", z.js("const d = gZenViewSplitter._data.find(x => x.tabs.includes(gBrowser.selectedTab)); if (!d) return 'no strip'; return { order: window.ZenithLayouts.order(d).map(t => t.label), on: gBrowser.selectedTab.label, off: d.tabs.filter(t => t.linkedBrowser.closest('.browserSidebarContainer').hasAttribute('zenith-off-strip')).map(t => t.label) }"))
        z.js("window.ZenithLayouts.focus('left'); await zth.sleep(1500); window.ZenithLayouts.focus('left'); await zth.sleep(2000); return 1")
        say("after two columns left", z.js(loaded))
        z.js("window.ZenithLayouts.set('dwindle'); P.clearUserPref('zenith.shell.scroller-width'); return 1")
    if part("islands"):
        z.js(r"""P.setStringPref('zenith.bar.top', 'on'); L.Bars.chooseLook('all', 'islands'); L.Bars.set('all', 'margin', '12'); await zth.sleep(1500); return 1""")
        say("islands with a 12px margin", z.js("return { spaced: document.documentElement.getAttribute('zenith-bar-spaced'), bars: zbars(), page: zpage() }"))
        z.screenshot(str(OUT / "i-islands-12.png"))
    if part("themes"):
        z.js("window.ZenithLooks.open('themes'); await zth.sleep(1500); return 1")
        z.screenshot(str(OUT / "c-picker-themes.png"))
        z.js("document.querySelector('#zenith-rice [data-cancel], #zenith-rice .zr-cancel')?.click(); window.ZenithLooks.close?.(); await zth.sleep(500); return 1")
        for name in ["Material", "Hypr floating"]:
            z.js(f"window.ZenithLooks.applyTheme ? 0 : 0; const t = window.ZenithLooks.THEMES?.find(t => t.name === '{name}'); if (t) L.applyTheme(t.sets); await zth.sleep(1500); return 1")
            say(name, z.js("return { bars: zbars(), page: zpage(), window: [innerWidth, innerHeight] }"))
            z.screenshot(str(OUT / f"d-{name.replace(' ', '-')}.png"))
