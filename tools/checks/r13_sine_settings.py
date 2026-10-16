"""0.6.3 under Sine: accent and page sheet, dropdown sizes, numbers on Ctrl,
and Sine's mods page with your mods first."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

STATE = """
  const cs = getComputedStyle(document.documentElement);
  const probe = document.createElement('div');
  probe.style.color = 'var(--zth-accent)';
  document.body.append(probe);
  const accent = getComputedStyle(probe).color;
  probe.style.color = 'var(--zen-accent-button-background, var(--zen-primary-color))';
  const workspace = getComputedStyle(probe).color;
  probe.remove();
  const sheet = decodeURIComponent(Services.prefs.getStringPref('zenith.internal.page-sheet', ''));
  const t = [...gBrowser.visibleTabs].find(t => !t.pinned && !t.hasAttribute('zen-essential'));
  return { accent, workspace,
           sheetAccent: (sheet.match(/in srgb, (.*?) 70%/) || ['', ''])[1],
           thinInSheet: sheet.includes('scrollbar-width: thin'),
           gap: cs.getPropertyValue('--zth-split-gap').trim(),
           statusDelay: cs.getPropertyValue('--zth-status-delay').trim(),
           revealDelay: cs.getPropertyValue('--zth-reveal-delay').trim(),
           sineVars: [...document.documentElement.style].filter(n => n.startsWith('--zenith-')),
           chip: t ? getComputedStyle(t.querySelector('.tab-stack'), '::after').content : 'no tab' };
"""
PAGE = """
  const doc = gBrowser.selectedBrowser.contentDocument;
  const mine = doc.getElementById('sineInstalledGroup'), store = doc.getElementById('sineInstallationGroup');
  const list = doc.getElementById('sineInstallationList');
  const btn = doc.querySelector('.zenith-browse');
  return { found: !!mine && !!store,
           mineFirst: !!mine && !!store && !!(mine.compareDocumentPosition(store) & Node.DOCUMENT_POSITION_FOLLOWING),
           folded: store?.hasAttribute('zenith-folded'),
           listShown: list ? list.getBoundingClientRect().height > 0 : 'no list',
           custom: !!doc.getElementById('sineInstallationCustom')?.getBoundingClientRect().height,
           button: btn?.getAttribute('label') ?? null,
           numbersRow: !!doc.getElementById('zenith-tabs-numbers') };
"""
CTRL = ""


def keys(z, seq):
    acts = [{"type": "pause", "duration": v} if k == "pause" else {"type": k, "value": v} for k, v in seq]
    z.cmd("Marionette:SetContext", {"value": "chrome"})
    z.cmd("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": acts}]})


SINE_APPLY = ("const { default: sine } = ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs');"
              " await sine.rebuildMods(false, false);")

res = {}
with Scene() as z:
    z.js("""Services.prefs.setBoolPref('zenith.page.thin-scrollbars', true);
            for (let i = 0; i < 3; i++) zth.open(arguments[0] + '/page?n=' + i); await zth.sleep(1500); return 1""", z.base)
    res["defaults"] = z.js(STATE)
    z.js("""Services.prefs.setStringPref('zenith.core.accent', 'teal'); Services.prefs.setStringPref('zenith.panels.gap', '12');
            Services.prefs.setStringPref('zenith.panels.status-delay', '0'); Services.prefs.setStringPref('zenith.tabs.reveal-delay', '200');
            """ + SINE_APPLY + """ await zth.sleep(1200); return 1""")
    res["teal, 12px, instant, 200ms"] = z.js(STATE)
    z.js("Services.prefs.setStringPref('zenith.core.accent', 'workspace'); Services.prefs.setStringPref('zenith.tabs.numbers', 'ctrl'); " + SINE_APPLY + " await zth.sleep(1200); return 1")
    res["numbers ctrl, idle"] = z.js(STATE)["chip"]
    try:
        keys(z, [("keyDown", CTRL), ("pause", 600)])
        res["numbers ctrl, holding"] = z.js(STATE)["chip"]
        keys(z, [("keyUp", CTRL), ("pause", 300)])
        res["numbers ctrl, released"] = z.js(STATE)["chip"]
        z.js("Services.prefs.setStringPref('zenith.tabs.numbers', 'off'); " + SINE_APPLY + " await zth.sleep(600); return 1")
        keys(z, [("keyDown", CTRL), ("pause", 600)])
        res["numbers off, holding"] = z.js(STATE)["chip"]
        keys(z, [("keyUp", CTRL), ("pause", 300)])
    except RuntimeError as e:
        res["keys failed"] = str(e)
    z.js("""zth.open('about:preferences'); await zth.sleep(3000);
            gBrowser.selectedBrowser.contentWindow.gotoPref('paneSineMods'); await zth.sleep(1500); return 1""")
    res["sine page"] = z.js(PAGE)
    z.zoom(str(Path(__file__).with_name("r13_sine_page.png")), 0, 0, 1366, 768, 1)
    z.js("gBrowser.selectedBrowser.contentDocument.getElementById('sineInstallationGroup').scrollIntoView({block: 'center'}); await zth.sleep(400); return 1")
    z.zoom(str(Path(__file__).with_name("r13_sine_store.png")), 0, 0, 1366, 768, 1)
    z.js("""const doc = gBrowser.selectedBrowser.contentDocument; doc.querySelector('.zenith-browse')?.doCommand();
            await zth.sleep(500); return 1""")
    res["sine page, browse clicked"] = z.js(PAGE)
print(json.dumps(res, indent=1))
