"""0.17 milestone 2, inside Zen, with the user's own prefs: powerline at
24/30/36 and on a side bar (screenshots), the new looks and shape knobs
(floating, bare, fit length, margins), marks on bar tabs (essential,
pinned, folder, playing, muted), and splitting an essential without a copy.
Screenshots go to argv[1]."""
import json, os, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
src = Path(os.environ["APPDATA"]) / "zen" / "Profiles"
prof = next((p for p in src.glob("*") if (p / "prefs.js").exists() and "zenith." in (p / "prefs.js").read_text(encoding="utf-8")), None)
prefs = {}
if prof:
    for m in re.finditer(r'user_pref\("((?:zenith|zen\.theme|zen\.view|browser\.theme)\.[^"]*)", (.*?)\);', (prof / "prefs.js").read_text(encoding="utf-8")):
        if not m.group(1).startswith("zenith.internal"):
            try:
                prefs[m.group(1)] = json.loads(m.group(2))
            except Exception:
                pass
os.environ["ZENITH_EXTRA_PREFS"] = json.dumps(prefs)
from scenarios import Scene

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
res = {}


def say(name, value):
    res[name] = value
    print(json.dumps({name: value}, ensure_ascii=False), flush=True)


with Scene(headless=False) as z:
    z.js("window.resizeTo(1366, 740); window.moveTo(0, 0); return 1")
    z.js(r"""window.P = Services.prefs; window.zB = arguments[0]; const sys = Services.scriptSecurityManager.getSystemPrincipal();
      window.zopen = (u, o = {}) => gBrowser.addTab(u, { triggeringPrincipal: sys, inBackground: true, ...o }); const T = window.zT = {};
      T.ess = zopen(zB + '/page?n=essential'); T.pin = zopen(zB + '/page?n=pinned'); T.f1 = zopen(zB + '/page?n=folder-1'); T.f2 = zopen(zB + '/page?n=folder-2');
      T.music = zopen(zB + '/music'); T.muted = zopen(zB + '/audio'); for (let i = 0; i < 4; i++) T['n' + i] = zopen(zB + '/page?n=plain-' + i);
      await zth.sleep(3000); gZenPinnedTabManager.addToEssentials(T.ess); gBrowser.pinTab(T.pin); try { gZenFolders.createFolder([T.f1, T.f2], { label: 'A folder', renameFolder: false }); } catch {}
      T.muted.toggleMuteAudio(); gBrowser.selectedTab = T.n1; await zth.sleep(2500); return 1""", z.base)

    say("bar tab marks", z.js(r"""const out = {}; for (const b of document.querySelectorAll('.zenith-bar .zb-task:not(.zb-task-more)')) { const t = b.zbTab; if (!t) continue;
      out[t.label.replace('Test page ', '')] = [b.getAttribute('kind'), b.getAttribute('sound'), b.hasAttribute('folder') ? 'folder' : '', getComputedStyle(b.querySelector('.zb-task-mark'), '::before').content].filter(Boolean).join(' '); } return out;"""))
    z.screenshot(str(OUT / "a-user.png"))
    for size in ["24", "36"]:
        z.js("P.setStringPref('zenith.bar.size', arguments[0]); await zth.sleep(1200); return 1", size)
        z.screenshot(str(OUT / f"b-powerline-{size}.png"))
    z.js("P.setStringPref('zenith.bar.size', '30'); P.setStringPref('zenith.bar.left', 'on'); P.setStringPref('zenith.bar.left.modules', 'launcher,spaces|tabs|clock,power'); await zth.sleep(1500); return 1")
    z.screenshot(str(OUT / "c-powerline-left.png"))
    z.js("P.setStringPref('zenith.bar.left', 'off'); P.setStringPref('zenith.bar.style', 'floating'); P.setStringPref('zenith.bar.length', 'fit'); await zth.sleep(1500); return 1")
    say("floating, fit", z.js(r"""const b = document.querySelector('.zenith-bar[edge="top"]'), r = b.getBoundingClientRect(); return { box: [r.left, r.top, r.width, r.height].map(Math.round), radius: getComputedStyle(b).borderTopLeftRadius };"""))
    z.screenshot(str(OUT / "d-floating-fit.png"))
    z.js("P.setStringPref('zenith.bar.style', 'bare'); P.setStringPref('zenith.bar.length', 'full'); P.setStringPref('zenith.bar.separators', 'dot'); await zth.sleep(1500); return 1")
    z.screenshot(str(OUT / "e-bare.png"))
    z.js("P.setStringPref('zenith.bar.style', 'islands'); P.setStringPref('zenith.bar.margin', '8'); P.setStringPref('zenith.bar.corners', '12'); P.setStringPref('zenith.bar.opacity', '50'); P.setStringPref('zenith.bar.border', 'accent'); await zth.sleep(1500); return 1")
    z.screenshot(str(OUT / "f-islands-knobs.png"))

    say("essential split, no copy", z.js(r"""const count = () => [...new Set(gZenWorkspaces.allStoredTabs)].filter(t => /essential/.test(t.label)).length; const out = { before: count() };
      gBrowser.selectedTab = zT.ess; await zth.sleep(600); gZenViewSplitter.splitTabs([zT.ess, zT.n2], 'vsep', 0); await zth.sleep(1500);
      out.after = count(); out['still essential'] = zT.ess.hasAttribute('zen-essential') && zT.ess.pinned; out.split = gZenViewSplitter._data.map(d => d.tabs.map(t => t.label));
      out['both shown'] = [...document.querySelectorAll('.browserSidebarContainer')].filter(b => b.getBoundingClientRect().width > 100 && getComputedStyle(b).visibility !== 'hidden').length; return out;"""))
    z.screenshot(str(OUT / "g-essential-split.png"))

print("\n=== summary ===")
print(json.dumps(res, indent=1, ensure_ascii=False))
