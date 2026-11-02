"""0.18.1, inside Zen: every look setting reaching everything and showing a
value. Settings read through looks.mjs (a blank or broken value is the
default, lit in the picker); Window transparency, Frost, Glass edge and
Corners on every surface (the bars, popups, the Dash, the picker); each bar
its own look; the picker's Cancel and Save, size and controls; the settings
page's slider, default note and Which bar; Motion's easings and speed; new
tiles beside the one you're on; Glance's buttons without reload; the
0.18.0 settings brought over. Screenshots in argv[1]."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT.mkdir(parents=True, exist_ok=True)
ONLY = set(sys.argv[2:])
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


def part(name):
    return not ONLY or name in ONLY


SETUP = r"""window.P = Services.prefs; window.zB = arguments[0]; window.sys = Services.scriptSecurityManager.getSystemPrincipal();
  window.zopen = (u, o = {}) => gBrowser.addTab(u, { triggeringPrincipal: sys, inBackground: true, ...o });
  window.L = window.ZenithSettings;
  // A surface's look: its background's opacity, its blur, whether its shadow has the rim, its corner.
  window.zlook = el => { if (!el) return null; const c = getComputedStyle(el), a = c.backgroundColor.match(/[\d.]+/g);
    return { alpha: a ? +(a[3] ?? 1) : null, filter: c.backdropFilter, rim: /inset/.test(c.boxShadow), radius: c.borderTopLeftRadius }; };
  window.zrow = () => { const S = gZenViewSplitter, d = S._data.find(x => x.tabs.includes(gBrowser.selectedTab)); if (!d) return [gBrowser.selectedTab.label];
    return d.tabs.map(t => [t.linkedBrowser.closest('.browserSidebarContainer').getBoundingClientRect().left, t.linkedBrowser.currentURI.spec.split('n=')[1] ?? t.label])
      .sort((a, b) => a[0] - b[0]).map(x => x[1]); };
  window.zfresh = async (layout, n = 2) => { window.ZenithLayouts.set('dwindle'); await zth.sleep(300); while (gZenViewSplitter._data.length) gZenViewSplitter.removeGroup(0);
    const keep = zopen('about:blank'); gBrowser.selectedTab = keep; await zth.sleep(300);
    for (const t of [...gBrowser.tabs]) if (!t.pinned && !t.hasAttribute('zen-essential') && t !== keep) gBrowser.removeTab(t, { animate: false });
    await zth.sleep(600); window.zT = []; for (let i = 0; i < n; i++) zT.push(zopen(zB + '/page?n=t' + i)); await zth.sleep(1500);
    gBrowser.selectedTab = zT[0]; await zth.sleep(300); window.ZenithLayouts.set(layout); await zth.sleep(1000); };
  return !!window.L"""

with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); return 1")
    say("setup", z.js(SETUP, z.base))
    if part("migrate"):
        # (The 0.18.0 settings, then brought over.)
        z.js(r"""P.setStringPref('zenith.bar.margin', 'auto'); P.setStringPref('zenith.bar.opacity', '90');
          P.setStringPref('zenith.bar.side-px', '52'); P.setStringPref('zenith.core.density', 'tighttct'); P.setStringPref('zenith.bar.size', '28 24 20');
          P.setStringPref('zenith.motion.space-switch', 'preset'); P.setStringPref('zenith.bar.style', 'floating'); P.setStringPref('zenith.core.corners', ''); return 1""")
        say("0.18.0 settings brought over", z.js(r"""L.migrate(); return { margin: P.getStringPref('zenith.bar.margin'), opacity: P.getStringPref('zenith.bar.opacity'),
          'rail px': P.getStringPref('zenith.bar.rail-px', ''), 'side-px gone': !P.prefHasUserValue('zenith.bar.side-px'),
          density: L.value('zenith.core.density'), 'density cleared': !P.prefHasUserValue('zenith.core.density'), size: P.getStringPref('zenith.bar.size'),
          'space switch': L.value('zenith.motion.space-switch'), 'blank corners is': L.value('zenith.core.corners') };"""))
        z.js("P.setStringPref('zenith.bar.style', 'islands'); L.Bars.chooseLook('all', 'islands'); return 1")

    if part("glass"):
        z.js("P.setStringPref('zenith.bar.top', 'on'); await zth.sleep(1500); await window.ZenithDash?.toggle?.(); await zth.sleep(1200); return 1")
        say("glass: every step differs everywhere", z.js(r"""const out = {};
          for (const step of ['balanced', 'airy', 'sheer', 'glass']) {
            L.setLook('zenith.core.window-transparency', step); await zth.sleep(500);
            const pop = document.querySelector('.zs-pop'), bar = document.querySelector('.zenith-bar[edge="top"]');
            out[step] = { panel: getComputedStyle(document.documentElement).getPropertyValue('--zth-panel-alpha').trim(), dash: zlook(pop)?.alpha, bar: zlook(bar)?.alpha, 'bar setting': P.getStringPref('zenith.bar.opacity') };
          }
          return out;"""))
        say("frost: every step differs", z.js(r"""const out = {};
          for (const f of ['off', 'subtle', 'strong']) { P.setStringPref('zenith.core.glass', f); await zth.sleep(400);
            out[f] = { dash: zlook(document.querySelector('.zs-pop'))?.filter, bar: zlook(document.querySelector('.zenith-bar[edge="top"]'))?.filter }; }
          P.setStringPref('zenith.core.glass', 'strong'); return out;"""))
        say("glass edge: on every surface", z.js(r"""P.setStringPref('zenith.core.glass-edge', 'liquid'); await zth.sleep(400);
          const out = { dash: zlook(document.querySelector('.zs-pop'))?.rim, bar: zlook(document.querySelector('.zenith-bar[edge="top"]'))?.rim };
          P.setStringPref('zenith.core.glass-edge', 'off'); await zth.sleep(300); out['off: dash'] = zlook(document.querySelector('.zs-pop'))?.rim;
          P.setStringPref('zenith.core.glass-edge', 'liquid'); return out;"""))
        L_ = z.js("L.setLook('zenith.core.window-transparency', 'sheer'); await zth.sleep(500); return 1")
        z.screenshot(str(OUT / "a-dash-sheer-strong-liquid.png"))
        z.js("await window.ZenithDash?.toggle?.(); await zth.sleep(500); return 1")

    if part("shape"):
        z.js("await window.ZenithDash?.toggle?.(); await zth.sleep(1000); return 1")
        say("shape: corners everywhere", z.js(r"""const out = {};
          for (const c of ['square', 'soft', 'round']) { L.setLook('zenith.core.corners', c); await zth.sleep(500);
            out[c] = { dash: zlook(document.querySelector('.zs-pop'))?.radius, token: getComputedStyle(document.documentElement).getPropertyValue('--zth-radius-l').trim(),
                       'bar modules': P.getStringPref('zenith.bar.module-corners'), pills: P.getStringPref('zenith.core.pills') }; }
          return out;"""))
        z.js("await window.ZenithDash?.toggle?.(); await zth.sleep(500); return 1")

    if part("bars"):
        say("each bar its own", z.js(r"""L.Bars.chooseLook('all', 'islands'); P.setStringPref('zenith.bar.top', 'on'); P.setStringPref('zenith.bar.bottom', 'on'); await zth.sleep(1500);
          L.Bars.chooseLook('top', 'floating'); await zth.sleep(600);
          const top = document.querySelector('.zenith-bar[edge="top"]'), bottom = document.querySelector('.zenith-bar[edge="bottom"]');
          const out = { top: top?.getAttribute('look'), bottom: bottom?.getAttribute('look'), 'top margin': top && getComputedStyle(top).marginTop,
            'bottom margin': bottom && getComputedStyle(bottom).marginBottom, 'top corners': top && getComputedStyle(top).borderTopLeftRadius, others: L.Bars.others('style') };
          L.Bars.set('bottom', 'size', '40'); await zth.sleep(400); out['bottom height'] = bottom?.getBoundingClientRect().height; out['top height'] = top?.getBoundingClientRect().height;
          return out;"""))
        z.screenshot(str(OUT / "b-bars-own.png"))
        say("bar menu: this bar's look", z.js(r"""const top = document.querySelector('.zenith-bar[edge="top"]'); const r = top.getBoundingClientRect();
          top.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 400, clientY: r.top + 5 })); await zth.sleep(500);
          const menu = document.querySelector('.zs-pop[kind="bar-menu"]'); const looks = [...(menu?.querySelectorAll('.zs-seg .zs-btn') ?? [])].map(b => b.textContent);
          const rows = [...(menu?.querySelectorAll('.zs-row') ?? [])].map(r => r.textContent); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await zth.sleep(300);
          return { looks, rows };"""))

    if part("picker"):
        z.js("P.clearUserPref('zenith.core.accent'); P.setStringPref('zenith.core.density', ''); await window.ZenithLooks.open('shape'); await zth.sleep(1500); return 1")
        say("picker: a blank setting shows its default", z.js(r"""const h = document.getElementById('zenith-rice');
          return { density: h.querySelector('[field="zenith.core.density"] [current]')?.getAttribute('value') ?? null, corners: h.querySelector('[field="zenith.core.corners"] [current]')?.getAttribute('value') ?? null };"""))
        z.screenshot(str(OUT / "c-picker-shape.png"))
        say("picker: cancel puts back, save keeps", z.js(r"""const was = L.value('zenith.core.corners'); const h = () => document.getElementById('zenith-rice');
          h().querySelector('[field="zenith.core.corners"] [value="square"]').click(); await zth.sleep(300); const during = L.value('zenith.core.corners');
          const note = h().querySelector('.zr-was[field="zenith.core.corners"]')?.textContent;
          [...h().querySelectorAll('.zr-foot button')].find(b => b.textContent === 'Cancel').click(); await zth.sleep(300);
          const after = L.value('zenith.core.corners');
          await window.ZenithLooks.open('shape'); await zth.sleep(800); h().querySelector('[field="zenith.core.corners"] [value="round"]').click(); await zth.sleep(300);
          [...h().querySelectorAll('.zr-foot button')].find(b => b.textContent === 'Save').click(); await zth.sleep(300);
          return { was, during, note, 'after cancel': after, 'after save': L.value('zenith.core.corners'), open: !!h() };"""))
        z.js("await window.ZenithLooks.open('glass'); await zth.sleep(1500); return 1")
        z.screenshot(str(OUT / "d-picker-glass.png"))
        say("picker: glass pictures differ", z.js(r"""const h = document.getElementById('zenith-rice');
          const of = (f, v) => { const g = h.querySelector(`[field="${f}"] [value="${v}"] .zr-glass`); return g ? zlook(g) : null; };
          return { balanced: of('zenith.core.window-transparency', 'balanced')?.alpha, glass: of('zenith.core.window-transparency', 'glass')?.alpha,
                   'frost off': of('zenith.core.glass', 'off')?.filter, 'frost strong': of('zenith.core.glass', 'strong')?.filter,
                   'edge off rim': of('zenith.core.glass-edge', 'off')?.rim, 'edge liquid rim': of('zenith.core.glass-edge', 'liquid')?.rim };"""))
        z.js("window.ZenithLooks.toggle(); await zth.sleep(300); await window.ZenithLooks.open('bars', 'top'); await zth.sleep(1500); return 1")
        say("picker: one bar's settings", z.js(r"""const h = document.getElementById('zenith-rice');
          return { scope: h.querySelector('.zr-scope [current]')?.textContent, look: h.querySelector('[field="bar:style"] [current]')?.getAttribute('value'),
                   sliders: h.querySelectorAll('.zr-slider').length, 'no step buttons': !h.querySelector('.zr-slider button'),
                   'joined note': h.querySelector('.zr-why[field="bar:spacing"]')?.textContent ?? '' };"""))
        z.screenshot(str(OUT / "e-picker-bars-top.png"))
        z.js("window.ZenithLooks.toggle(); await zth.sleep(300); await window.ZenithLooks.open('motion'); await zth.sleep(1500); return 1")
        z.screenshot(str(OUT / "f-picker-motion.png"))
        z.js("window.ZenithLooks.toggle(); window.resizeTo(2560, 1400); await zth.sleep(1200); await window.ZenithLooks.open('themes'); await zth.sleep(1500); return 1")
        say("picker: bigger on a big window", z.js(r"""const p = document.querySelector('#zenith-rice .zr-panel').getBoundingClientRect(); return { width: Math.round(p.width), height: Math.round(p.height) };"""))
        z.screenshot(str(OUT / "g-picker-big.png"))
        z.js("window.ZenithLooks.toggle(); window.resizeTo(1366, 740); await zth.sleep(800); return 1")

    if part("motion"):
        say("motion: easing and speed", z.js(r"""const root = document.documentElement, get = v => getComputedStyle(root).getPropertyValue(v).trim(); const out = {};
          L.choosePreset('zenith.motion.preset', 'quick'); await zth.sleep(300); out.quick = { ease: get('--zth-ease').slice(0, 30), dur: get('--zth-dur') };
          P.setStringPref('zenith.motion.easing', 'bouncy'); P.setStringPref('zenith.motion.speed', '200'); await zth.sleep(300);
          out['bouncy, half speed'] = { ease: get('--zth-ease').slice(0, 30), speed: get('--zth-speed') };
          const probe = document.createElement('div'); probe.style.transitionDuration = 'var(--zth-dur)'; document.documentElement.append(probe); out['bouncy, half speed'].dur = getComputedStyle(probe).transitionDuration;
          L.choosePreset('zenith.motion.preset', 'off'); await zth.sleep(300); out.off = getComputedStyle(probe).transitionDuration; probe.remove();
          L.choosePreset('zenith.motion.preset', 'quick'); return out;"""))

    if part("settings"):
        z.js("P.setStringPref('zenith.bar.size', '36'); gBrowser.selectedTab = gBrowser.addTab('about:preferences', { triggeringPrincipal: sys }); await zth.sleep(2500); " +
             "gBrowser.selectedBrowser.contentWindow.gotoPref?.('paneZenith'); await zth.sleep(1800); const d = gBrowser.selectedBrowser.contentDocument; d.querySelector('[data-prop=\"zenith.bar.size\"]')?.scrollIntoView({ block: 'center' }); await zth.sleep(600); return 1")
        say("settings page: slider, default, which bar", z.js(r"""const d = gBrowser.selectedBrowser.contentDocument, row = d.querySelector('[data-prop="zenith.bar.size"]');
          const which = d.querySelector('.zp-which'); const buttons = which ? [...which.querySelectorAll('button')].filter(b => !b.hidden).map(b => b.textContent) : null;
          const out = { slider: !!row?.querySelector('.zp-slider input'), 'no step buttons': !d.querySelector('.zp-step'), note: row?.querySelector('.zp-changed')?.textContent ?? null, 'which bar': buttons };
          which?.querySelector('[data-value="top"]')?.click(); await zth.sleep(400); out['top look shown'] = d.querySelector('[data-prop="zenith.bar.style"] .zp-select')?.textContent ?? d.querySelector('[data-prop="zenith.bar.style"] [selected]')?.dataset.value ?? null;
          which?.querySelector('[data-value="all"]')?.click(); await zth.sleep(300);
          out['old words gone'] = !/as it comes|look has it/i.test(d.getElementById('zenithPage')?.textContent ?? d.body.textContent); return out;"""))
        z.screenshot(str(OUT / "h-settings-bars.png"))
        z.js("gBrowser.removeTab(gBrowser.selectedTab); P.clearUserPref('zenith.bar.size'); return 1")

    if part("split"):
        LINK = r"""window.gContextMenu = { linkURL: zB + '/page?n=NEW', principal: sys, contentData: {}, target: { ownerDocument: { location: {} } } };
          gZenViewSplitter.splitLinkInNewTab(); delete window.gContextMenu; await zth.sleep(1500); return zrow();"""
        say("split link beside the tile (dwindle)", z.js(r"""await zfresh('dwindle', 2); gZenViewSplitter.splitTabs([zT[0], zT[1]], 'vsep', 0); await zth.sleep(1000);
          gBrowser.selectedTab = zT[0]; await zth.sleep(300);""" + LINK))
        say("split link beside the column (scroller)", z.js(r"""await zfresh('scroller', 3); gBrowser.selectedTab = zT[1]; await zth.sleep(800);
          const before = zrow(); const after = await (async () => {""" + LINK + r"""})(); return { before, after };"""))
        say("glance split beside the tile (dwindle)", z.js(r"""await zfresh('dwindle', 2); gZenViewSplitter.splitTabs([zT[0], zT[1]], 'vsep', 0); await zth.sleep(1000);
          gBrowser.selectedTab = zT[0]; await zth.sleep(300);
          await Promise.race([zth.sleep(5000), gZenGlanceManager.openGlance({ url: zB + '/page?n=NEW', triggeringPrincipal: sys, x: 300, y: 300, width: 10, height: 10 })]); await zth.sleep(1500);
          const buttons = [...(document.querySelector('.zen-glance-sidebar-container')?.querySelectorAll('toolbarbutton') ?? [])].map(b => b.className.split(' ')[0]);
          await Promise.race([zth.sleep(6000), gZenGlanceManager.splitGlance()]); await zth.sleep(1500); return { row: zrow(), 'glance buttons': buttons };"""))
        say("a column pinned or made an essential leaves the strip", z.js(r"""await zfresh('scroller', 5); gBrowser.selectedTab = zT[2]; await zth.sleep(800);
          const S = gZenViewSplitter, strip = () => S._data.find(d => d.zenithStrip)?.tabs.length ?? 0, before = strip();
          gBrowser.pinTab(zT[0]); await zth.sleep(800); gZenPinnedTabManager.addToEssentials(zT[1]); await zth.sleep(800);
          return { before, after: strip(), 'other tabs pinned': zT.slice(2).filter(t => t.pinned).length, 'essential in a split': !!S._data.find(d => d.tabs.includes(zT[1])) };"""))
        z.js("window.ZenithLayouts.set('dwindle'); return 1")

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
