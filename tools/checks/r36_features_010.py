"""0.10.0 features, checked inside Zen (no screen needed):
scroll feel (and window material through the same bridge), focus mode,
workspace dots and flash, the switcher and its commands, the
More menu on the tab menu, push, key-switch flash, background-tab pulse,
badge-only extension buttons, and the "Links from other apps" button."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

res = {}
with Scene() as z:
    z.js("""zth.open(arguments[0] + '/page?n=2'); await zth.sleep(700);
            zth.open(arguments[0] + '/page?n=3'); await zth.sleep(700);
            zth.open(arguments[0] + '/page?n=4'); await zth.sleep(1200);
            // Two spaces at least (a fresh profile has one).
            if (gZenWorkspaces.getWorkspaces().length < 2) { await gZenWorkspaces.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
            return 1""", z.base)

    res["scroll feel"] = z.js("""
      const P = Services.prefs, out = {};
      const read = () => ({ smooth: P.getBoolPref('general.smoothScroll'), physics: P.getBoolPref('general.smoothScroll.msdPhysics.enabled'),
                            max: P.getIntPref('general.smoothScroll.mouseWheel.durationMaxMS'), spring: P.getIntPref('general.smoothScroll.msdPhysics.regularSpringConstant'),
                            weight: P.getStringPref('general.smoothScroll.currentVelocityWeighting'), overscroll: P.getBoolPref('apz.overscroll.enabled', false) });
      out["Zen's own"] = read();
      P.setIntPref('general.smoothScroll.mouseWheel.durationMaxMS', 222);  // a value of your own
      for (const v of ['instant', 'smooth', 'glide']) { P.setStringPref('zenith.plus.scroll', v); await zth.sleep(100); out[v] = read(); }
      P.clearUserPref('zenith.plus.scroll'); await zth.sleep(100);
      out["back to Zen's own (your 222 kept)"] = read();
      out['nothing left behind'] = P.getChildList('zenith.internal.scroll').length;
      P.clearUserPref('general.smoothScroll.mouseWheel.durationMaxMS');
      P.setStringPref('zenith.plus.material-windows', 'acrylic'); await zth.sleep(100);
      out['window material still works: acrylic'] = P.getIntPref('widget.windows.mica.toplevel-backdrop', -1);
      P.clearUserPref('zenith.plus.material-windows'); await zth.sleep(100);
      out['and back'] = P.prefHasUserValue('widget.windows.mica.toplevel-backdrop');
      return out;""")

    res["focus mode"] = z.js("""
      const out = {}, root = document.documentElement;
      document.getElementById('zenith-focus-command').doCommand(); await zth.sleep(400);
      out.on = [root.getAttribute('zenith-focus'), root.getAttribute('zen-compact-mode'),
                getComputedStyle(root).getPropertyValue('--zth-edge-opacity').trim(),
                getComputedStyle(document.getElementById('statuspanel')).display,
                document.getElementById('zenith-hint')?.textContent];
      document.getElementById('zenith-focus-command').doCommand(); await zth.sleep(400);
      out.off = [root.getAttribute('zenith-focus'), root.getAttribute('zen-compact-mode'), getComputedStyle(root).getPropertyValue('--zth-edge-opacity').trim()];
      Services.prefs.setBoolPref('zenith.plus.focus-key', false); await zth.sleep(50);
      // (Zen's shortcut list has the key since 0.12.1: its command is disabled.)
      out['key off: disabled'] = document.getElementById('zenith-focus-command').hasAttribute('disabled');
      Services.prefs.clearUserPref('zenith.plus.focus-key');
      return out;""")

    res["workspace dots and flash"] = z.js("""
      const W = gZenWorkspaces, out = {}, dots = document.getElementById('zenith-dots'), flash = document.getElementById('zenith-space-flash');
      const spaces = W.getWorkspaces(), here = W.activeWorkspace, other = spaces.find(s => s.uuid !== here);
      await W.changeWorkspaceWithID(other.uuid); await zth.sleep(150);
      out['after a switch'] = { shown: dots.hasAttribute('show'), dots: dots.querySelectorAll('.zenith-dot').length,
        current: [...dots.querySelectorAll('.zenith-dot')].findIndex(d => d.hasAttribute('active')), name: dots.querySelector('.zenith-dot-name').textContent,
        expected: [spaces.findIndex(s => s.uuid === other.uuid), other.name], flash: flash.hasAttribute('go'), opacity: getComputedStyle(dots).opacity };
      await zth.sleep(1700);
      out['a moment later'] = [dots.hasAttribute('show'), getComputedStyle(dots).opacity];
      Services.prefs.setStringPref('zenith.plus.workspace-dots', 'always'); await zth.sleep(500);
      out['always'] = getComputedStyle(dots).opacity;
      Services.prefs.setStringPref('zenith.plus.workspace-dots', 'off'); await zth.sleep(100);
      out['off'] = dots.hidden;
      Services.prefs.clearUserPref('zenith.plus.workspace-dots');
      await W.changeWorkspaceWithID(here); await zth.sleep(600);
      return out;""")

    res["switcher"] = z.js("""
      const S = window.ZenithSwitcher, out = {};
      const key = k => S.onKey({ key: k, preventDefault() {}, shiftKey: false, ctrlKey: false, metaKey: false });
      S.show(''); await zth.sleep(100);
      out['nothing typed: recent first'] = S.items.slice(0, 3).map(i => i.title);
      S.input.value = 'tst pg 2'; S.update();
      out["'tst pg 2'"] = S.items.slice(0, 2).map(i => i.title);
      key('Enter'); await zth.sleep(400);
      out['Enter: selected tab'] = gBrowser.selectedTab.label;
      S.show(':'); out['commands'] = S.items.map(i => i.title);
      S.input.value = ':ti'; S.update(); key('Enter');
      out[':ti then Enter fills in'] = S.input.value;
      S.input.value = ':timer 10m tea'; S.update();
      out[':timer 10m tea'] = [S.items[0].sub, S.items[0].hint];
      key('Enter'); await zth.sleep(300);
      const T = window.ZenithTimers; out['timer started'] = T.list().map(t => T.describe(t));
      for (const t of T.list()) T.cancel(t.id);
      S.show(':focus '); key('Enter'); await zth.sleep(300);
      out[':focus'] = document.documentElement.getAttribute('zenith-focus');
      window.ZenithFocus.toggle(false); await zth.sleep(300);
      const other = gZenWorkspaces.getWorkspaces().find(s => s.uuid !== gZenWorkspaces.activeWorkspace);
      S.show(other.name); out['a space'] = S.items[0].kind + ' ' + S.items[0].title;
      key('Enter'); await zth.sleep(900);
      out['went there'] = gZenWorkspaces.activeWorkspace === other.uuid;
      S.hide();
      return out;""")

    res["tab menu: More"] = z.js("""
      const menu = document.getElementById('tabContextMenu'), tab = gBrowser.selectedTab;
      TabContextMenu.contextTab = tab;
      const shown = new Promise(r => menu.addEventListener('popupshown', r, { once: true }));
      menu.openPopup(tab, 'after_start', 0, 0, true, false); await shown; await zth.sleep(200);
      const more = menu.querySelector('.zenith-more');
      const out = { more: !!more && !more.hidden, inside: [...more.menupopup.children].filter(n => !n.hidden).map(n => n.id || n.localName),
                    'still in the menu': ['context_reloadTab', 'context_closeTab', 'context_duplicateTab'].map(id => document.getElementById(id).parentNode === menu),
                    'separators doubled or at an end': (() => { const seen = [...menu.children].filter(n => !n.hidden && getComputedStyle(n).display !== 'none' && n.localName !== 'box');
                       return seen.filter((n, i) => n.localName === 'menuseparator' && (i === 0 || i === seen.length - 1 || seen[i - 1].localName === 'menuseparator')).length; })() };
      const hidden = new Promise(r => menu.addEventListener('popuphidden', r, { once: true }));
      menu.hidePopup(); await hidden;
      Services.prefs.setBoolPref('zenith.plus.more-menu', false); await zth.sleep(50);
      out['setting off: all back'] = [!menu.querySelector('.zenith-more'), document.getElementById('context_selectAllTabs').parentNode === menu];
      Services.prefs.clearUserPref('zenith.plus.more-menu');
      return out;""")

    res["push"] = z.js("""
      zth.set('Zenith Tabs', 'zenith.tabs.reveal', 'push');
      gZenCompactModeManager.preference = true; await zth.sleep(900);
      zth.reveal(true); await zth.sleep(700);
      const wrap = document.getElementById('zen-tabbox-wrapper'), side = gNavToolbox.getBoundingClientRect();
      const out = { push: document.documentElement.style.getPropertyValue('--zth-sidebar-push'), 'sidebar right edge': Math.round(side.right),
                    'page moved by': getComputedStyle(wrap).translate };
      zth.reveal(false); await zth.sleep(700);
      out['hidden again'] = getComputedStyle(wrap).translate;
      zth.set('Zenith Tabs', 'zenith.tabs.reveal', '');
      return out;""")

    res["key switch flash"] = z.js("""
      Services.prefs.setBoolPref('zenith.plus.key-switch-flash', true);
      const tabs = gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-empty-tab'));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true }));
      gBrowser.selectedTab = tabs.find(t => !t.selected); await zth.sleep(120);
      const out = { 'by key': gNavToolbox.hasAttribute('flash-popup') };
      await zth.sleep(1200);
      window.dispatchEvent(new PointerEvent('pointerdown'));
      gBrowser.selectedTab = tabs.find(t => !t.selected); await zth.sleep(120);
      out['by mouse'] = gNavToolbox.hasAttribute('flash-popup');
      Services.prefs.clearUserPref('zenith.plus.key-switch-flash');
      gZenCompactModeManager.preference = false; await zth.sleep(500);
      return out;""")

    res["background tab ready"] = z.js("""
      Services.prefs.setBoolPref('zenith.plus.ready-pulse', true); window.ZenithReady.since = -1e9;
      const edge = document.getElementById('zenith-ready'); edge.removeAttribute('go');
      zth.open(arguments[0] + '/page?n=bg', { background: true }); await zth.sleep(1500);
      const out = { pulsed: edge.hasAttribute('go') };
      Services.prefs.clearUserPref('zenith.plus.ready-pulse'); edge.removeAttribute('go');
      zth.open(arguments[0] + '/page?n=bg2', { background: true }); await zth.sleep(1500);
      out['setting off'] = edge.hasAttribute('go');
      return out;""", z.base)

    res["badge-only extensions"] = z.js("""
      zth.set('Zenith Tabs', 'zenith.tabs.badge-only', 'on');
      const bar = document.getElementById('nav-bar-customization-target') ?? document.getElementById('nav-bar');
      const make = (id, badge) => { const item = document.createXULElement('toolbaritem'); item.id = id; item.className = 'unified-extensions-item';
        const b = document.createXULElement('toolbarbutton'); b.className = 'unified-extensions-item-action-button'; if (badge) b.setAttribute('badge', badge);
        item.append(b); bar.append(item); return item; };
      const quiet = make('zth-quiet-ext'), loud = make('zth-loud-ext', '3'); await zth.sleep(100);
      const out = { 'no badge': getComputedStyle(quiet).display, 'badge 3': getComputedStyle(loud).display };
      zth.set('Zenith Tabs', 'zenith.tabs.badge-only', ''); await zth.sleep(100);
      out['setting off: no badge'] = getComputedStyle(quiet).display;
      quiet.remove(); loud.remove();
      return out;""")

    res["links from other apps"] = z.js("""
      const out = {};
      const found = window.ZenithSettings.find('links other apps')[0];
      out['Peek set finds it'] = found && [found.label, window.ZenithSettings.value(found)];
      window.ZenithLive.toggle(); await zth.sleep(600);
      const button = document.querySelector('#zenith-live .zp-action');
      out['button'] = button?.textContent;
      button?.click(); await zth.sleep(1500);
      out['Space routing opened'] = gDialogBox.isOpen && gDialogBox._dialog?._frame?.contentDocument?.documentURI.includes('space-routing');
      gDialogBox._dialog?.close?.(); await zth.sleep(300); window.ZenithLive.toggle();
      out['keys section'] = !!document.querySelector('#zenith-live [data-section="keys"]');
      return out;""")
    res["css errors"] = z.console_errors()
    res["script errors"] = z.js("return 1")
print(json.dumps(res, indent=1, ensure_ascii=False))
