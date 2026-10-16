"""0.8.0: the Zenith page in Zen's Settings: it appears, looks right, and
every kind of control writes the right setting, which reaches the browser
window at once."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

SHOTS = Path(os.environ["TEMP"]) / "claude" / "r27"
SHOTS.mkdir(parents=True, exist_ok=True)
DOC = "const doc = gBrowser.selectedBrowser.contentDocument, win = gBrowser.selectedBrowser.contentWindow;"
CLICK = DOC + """
  const [sel, wait] = arguments; const node = doc.querySelector(sel);
  if (!node) return 'missing ' + sel;
  node.click(); await new Promise(r => win.setTimeout(r, wait ?? 400)); return 'ok';
"""
PREFS = """return Object.fromEntries(arguments[0].map(p => [p, Services.prefs.getPrefType(p) === Services.prefs.PREF_BOOL
  ? Services.prefs.getBoolPref(p) : Services.prefs.getStringPref(p, '')]));"""
res = {}
with Scene() as z:
    z.js("""for (const p of Services.prefs.getChildList('zenith.')) if (!p.startsWith('zenith.internal')) Services.prefs.clearUserPref(p);
            zth.open('about:preferences'); await zth.sleep(3000);
            gBrowser.selectedBrowser.contentWindow.gotoPref('paneZenith'); await zth.sleep(1500); return 1""")
    res["page"] = z.js(DOC + """
      const page = doc.getElementById('zenithPage');
      return { category: !!doc.getElementById('category-zenith'), categoryKind: doc.getElementById('category-zenith')?.localName,
               shown: page && !page.hidden, sections: [...doc.querySelectorAll('.zp-section h2')].map(h => h.textContent),
               rows: doc.querySelectorAll('.zp-row').length, offRows: [...doc.querySelectorAll('.zp-row[off]')].map(r => r.dataset.prop),
               macLinuxShown: !!doc.querySelector('[data-prop="zenith.plus.material-macos"], [data-prop="zenith.plus.material-linux"]') };""")
    z.zoom(str(SHOTS / "1-top.png"), 0, 0, 1366, 768, 1)
    for name, sel in (("look", "#zp-look"), ("glass", '[data-prop="zenith.core.window-transparency"]'),
                      ("material", '[data-prop="zenith.core.floating-sidebar"]'), ("edges", "#zp-edges"), ("tabs", "#zp-tabs"),
                      ("urlbar", "#zp-urlbar"), ("panels", "#zp-panels"), ("split", '[data-prop="zenith.panels.split"]'),
                      ("motion", "#zp-motion"), ("peek", "#zp-peek")):
        z.js(DOC + "doc.querySelector(arguments[0]).scrollIntoView({ block: 'start' }); await zth.sleep(400); return 1", sel)
        z.zoom(str(SHOTS / f"2-{name}.png"), 0, 0, 1366, 768, 1)

    edges = ["zenith.edges.preset", "zenith.edges.load", "zenith.edges.download", "zenith.edges.container", "zenith.edges.unfocused"]
    res["edges: Quiet"] = [z.js(CLICK, '#zp-edges .zp-preset[data-value="quiet"]'), z.js(PREFS, edges),
                           z.js(DOC + "return doc.querySelector('#zp-edges .zp-custom').textContent")]
    res["edges: downloads on (custom)"] = [z.js(CLICK, '[data-prop="zenith.edges.download"] .zp-switch'), z.js(PREFS, ["zenith.edges.download"]),
                                           z.js(DOC + "return doc.querySelector('#zp-edges .zp-custom').textContent"),
                                           z.js(DOC + "const pg = win.zenithSettingsPage; return [pg.changes, String(pg.timer), doc.hidden, doc.visibilityState]"),
                                           z.js(DOC + "await new Promise(r => win.setTimeout(r, 100)); return doc.querySelector('#zp-edges .zp-custom').textContent")]
    z.js(DOC + "doc.getElementById('zp-edges').scrollIntoView({ block: 'start' }); await zth.sleep(300); return 1")
    z.zoom(str(SHOTS / "3-edges-custom.png"), 0, 0, 1366, 768, 1)
    res["edges: reset"] = [z.js(CLICK, '#zp-edges .zp-custom .zp-link'), z.js(PREFS, edges),
                           z.js(DOC + "return doc.querySelector('#zp-edges .zp-custom').textContent")]
    res["accent teal, live in the window"] = [
        z.js(DOC + """const row = doc.querySelector('[data-prop="zenith.core.accent"]');
                      row.querySelector('.zp-select').click(); await new Promise(r => win.setTimeout(r, 150));
                      const open = row.querySelector('.zp-chooser').hasAttribute('open');
                      row.querySelector('.zp-option[data-value="teal"]').click(); await new Promise(r => win.setTimeout(r, 400));
                      return [open, row.querySelector('.zp-select').textContent, Services.prefs.getStringPref('zenith.core.accent', '')]"""),
        z.js("""const host = document.getElementById('theme-Zenith') ?? document.getElementById('theme-Zenith-Core');
                const probe = document.createElement('div'); probe.style.color = 'var(--zth-accent)'; document.body.append(probe);
                const c = getComputedStyle(probe).color; probe.remove(); return [host?.id, host?.getAttribute('zenith-core-accent'), c]""")]
    res["transparency picture card: Glass"] = [z.js(CLICK, '[data-prop="zenith.core.window-transparency"] .zp-card[data-value="glass"]'),
                                               z.js(PREFS, ["zenith.core.window-transparency"])]
    res["segments: density Cozy"] = [z.js(DOC + """const b = [...doc.querySelectorAll('[data-prop="zenith.core.density"] button')].find(b => /Cozy/.test(b.textContent));
                                                  b?.click(); await zth.sleep(300); return b?.dataset.value"""), z.js(PREFS, ["zenith.core.density"])]
    res["peek off greys its sub-settings (pref, has value, value, switch, greyed rows)"] = z.js(DOC + """
      const sw = doc.querySelector('[data-prop="zenith.peek.enabled"] .zp-switch'), out = [];
      const snap = tag => out.push([tag, Services.prefs.getPrefType('zenith.peek.enabled'), Services.prefs.prefHasUserValue('zenith.peek.enabled'),
        Services.prefs.getBoolPref('zenith.peek.enabled', null), sw.getAttribute('aria-checked'), doc.querySelectorAll('#zp-peek .zp-row[off]').length]);
      snap('before'); sw.click(); snap('right after click');
      await new Promise(r => win.setTimeout(r, 150)); snap('150ms'); await new Promise(r => win.setTimeout(r, 600)); snap('750ms');
      sw.click(); await new Promise(r => win.setTimeout(r, 300)); snap('clicked again');
      return out;""")
    res["search 'weather'"] = z.js(DOC + """const s = doc.querySelector('.zp-search'); s.value = 'weather'; s.dispatchEvent(new Event('input'));
      await zth.sleep(200); const shown = [...doc.querySelectorAll('.zp-row:not([zp-hidden])')].map(r => r.dataset.prop);
      s.value = ''; s.dispatchEvent(new Event('input')); return shown""")
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
