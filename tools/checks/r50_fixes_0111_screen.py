"""Fixes from the 0.11.1 walkthrough, on a real screen with your own
settings (captures in %TEMP%/claude/r50):
- Ctrl+Shift+Tab, held, starts the row of pictures going back (in order,
  with pictures) and lands on the tab before;
- an extension button pinned only in another space is listed in Zen's
  extensions panel with "Pin here", which brings it back here;
- notices (Zenith's and Zen's own) show over Zenith's settings panel;
- focus mode hides the bookmarks bar;
- the Bookmarks section of Zen's Library has its icon;
- image colours show as the space's gradient.
Only the test Zen is clicked or typed into."""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from screen_kit import Screen, ps

ext = Path(os.environ["TEMP"]) / "claude" / "zth-test-ext"
ext.mkdir(parents=True, exist_ok=True)
(ext / "manifest.json").write_text(json.dumps({
    "manifest_version": 2, "name": "Zenith test button", "version": "1.0",
    "browser_specific_settings": {"gecko": {"id": "zenith-test@example.com"}},
    "browser_action": {"default_title": "Zenith test", "default_area": "navbar"},
}), encoding="utf-8")

res = {}
with Screen("r50", mine=True) as s:
    z = s.z
    z.js("""const b = arguments[0]; for (const n of [1, 2, 3, 4, 5]) { zth.open(b + '/page?n=' + n); await zth.sleep(300); }
      Services.prefs.setStringPref('zenith.plus.ctrl-tab', 'pictures');
      gBrowser.selectedTab = gBrowser.visibleTabs.find(t => t.label === 'Test page 3'); await zth.sleep(300); window.focus(); return 1""", z.base)
    s.front()
    ps("ctrltab.ps1", "-ZenPid", str(s.pid), "-Presses", "1", "-HoldMs", "900", "-Shift", "-Out", str(s.shots / "ctrl-shift-tab.png"))
    time.sleep(0.6)
    res["Ctrl+Shift+Tab from Test page 3"] = z.js("""const order = gBrowser.visibleTabs.filter(t => !t.hasAttribute('zen-empty-tab')).map(t => t.label);
      return { landed: gBrowser.selectedTab.label, sidebar: order };""")
    z.js("Services.prefs.clearUserPref('zenith.plus.ctrl-tab'); return 1")

    res["extensions panel"] = z.js("""
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      await AddonManager.installTemporaryAddon(new FileUtils.File(arguments[0])); await zth.sleep(1500);
      const W = gZenWorkspaces;
      if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); await zth.sleep(500); }
      const other = W.getWorkspaces().find(w => w.uuid !== W.activeWorkspace).uuid;
      const btn = document.querySelector('[data-extensionid="zenith-test@example.com"]');
      window.ZenithSpaceExtensions.save({ [btn.id]: [other] }); await zth.sleep(300);
      gUnifiedExtensions.togglePanel(); await zth.sleep(1200);
      const box = document.getElementById('zenith-other-space-extensions');
      const out = { listed: box && !box.hidden ? [...box.querySelectorAll('.zenith-ose-name')].map(n => n.getAttribute('value')) : 'not listed', hidden: getComputedStyle(btn).display };
      window.zthBtn = btn.id; window.focus(); return out;""", str(ext))
    s.capture("extensions-panel")
    res["Pin here"] = z.js("""document.querySelector('#zenith-other-space-extensions .zenith-ose-pin').doCommand(); await zth.sleep(400);
      const btn = document.getElementById(zthBtn);
      const out = { shown: getComputedStyle(btn).display, spaces: JSON.stringify(window.ZenithSpaceExtensions.map) };
      gUnifiedExtensions.togglePanel(); await zth.sleep(300);
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      (await AddonManager.getAddonByID('zenith-test@example.com'))?.uninstall(); window.ZenithSpaceExtensions.save({});
      return out;""")

    res["notices over the settings panel"] = z.js("""window.ZenithLive.toggle(); await zth.sleep(900);
      gZenUIManager.showToast('zen-copy-current-url-confirmation');
      window.ZenithFocus.toggle(); await zth.sleep(200); window.ZenithFocus.toggle(); await zth.sleep(150);
      const z = id => { const n = document.getElementById(id); return n ? [n.parentNode.id, getComputedStyle(n).zIndex] : null; };
      return { hint: z('zenith-hint'), zenToasts: z('zen-toast-container'), panel: z('zenith-live') };""")
    s.capture("notices")
    z.js("window.ZenithLive.toggle(); await zth.sleep(300); return 1")

    res["focus mode hides the bookmarks bar"] = z.js("""
      const bar = document.getElementById('PersonalToolbar'); setToolbarVisibility(bar, true); await zth.sleep(500);
      const before = getComputedStyle(bar).display;
      window.ZenithFocus.toggle(); await zth.sleep(300); const during = getComputedStyle(bar).display;
      window.ZenithFocus.toggle(); await zth.sleep(300); setToolbarVisibility(bar, false);
      return { before, during };""")

    z.js("customElements.get('zen-library').toggle('zenith-bookmarks'); await zth.sleep(1500); return 1")
    res["Library icon"] = z.js("""const i = document.querySelector('.zen-library-tab[data-section="zenith-bookmarks"] .zen-library-tab-icon-image');
      const cs = i && getComputedStyle(i); return i ? { size: [cs.width, cs.height], background: cs.backgroundColor, mask: cs.maskImage.split('/').pop(), animation: cs.animationName } : 'no icon';""")
    s.capture("library", 0, 0, 200, 720)
    z.js("customElements.get('zen-library').close?.(); await zth.sleep(800); return 1")

    z.js("await window.ZenithColours.fromFile(arguments[0]); await zth.sleep(1200); window.focus(); return 1", r"C:\Windows\Web\Wallpaper\ThemeB\img27.jpg")
    s.capture("image-colours")
    res["image colours"] = z.js("""const cs = getComputedStyle(document.documentElement);
      const out = { gradient: !!document.documentElement.style.getPropertyValue('--zth-desk-paint'), share: cs.getPropertyValue('--zth-paint-share') };
      window.ZenithColours.undo(); return out;""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
