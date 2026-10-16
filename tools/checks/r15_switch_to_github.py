"""Switching a local Zenith install (install.ps1 into Sine) over to Sine's
GitHub install, as the user's own Zen will: same mods, settings kept, and
afterwards Sine updates them from GitHub on its own.

  1. Fresh profile: Sine, Zenith copied in locally (no homepage, updates
     off), and some non-default Zenith settings in prefs.js.
  2. Paste bootzin/zenith/tree/master/plus into Sine's install box.
  3. Restart: still seven mods, settings kept, Plus running.
  4. Make two mods look old (an earlier updatedAt, a stale stylesheet),
     restart and run Sine's update check (the one it runs at start-up):
     it should bring them back, with nothing left half-done.

    python r15_switch_to_github.py [--local]   (--local: serve this folder
                                               in GitHub's place, see sine_local.py)
"""
import json, os, re, shutil, sys, time, zipfile
from pathlib import Path
os.environ["ZENITH_TEST_PROFILE"] = str(Path(os.environ["TEMP"]) / "claude" / "zgh")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Zen, TEST_PROFILE, TEST_PREFS, ROOT, MOD_IDS, sync_sine

SOURCE = "bootzin/zenith/tree/master/plus"
LOCAL = "--local" in sys.argv
REDIRECT = ""
if LOCAL:
    from sine_local import serve_local
    REDIRECT = serve_local()
# Sine also checks for updates at start-up; the test runs the same check
# itself (manager.updateMods) so it decides when.
PREFS = {**TEST_PREFS, "sine.auto-updates": False}
SETTINGS = {"zenith.core.accent": "teal", "zenith.tabs.numbers": "ctrl", "zenith.panels.gap": "12",
            "zenith.peek.engine": "duckduckgo", "zenith.plus.minimap": False}

shutil.rmtree(TEST_PROFILE, ignore_errors=True)
chrome = TEST_PROFILE / "chrome"
chrome.mkdir(parents=True)
sync_sine(chrome)  # Sine + the local Zenith install, like install.ps1
(TEST_PROFILE / "user.js").write_text("\n".join(f'user_pref("{k}", {json.dumps(v)});' for k, v in PREFS.items()) + "\n",
                                      encoding="utf-8")
(TEST_PROFILE / "prefs.js").write_text("\n".join(f'user_pref("{k}", {json.dumps(v)});' for k, v in SETTINGS.items()) + "\n",
                                       encoding="utf-8")
mods_dir = chrome / "sine-mods"
mods_json = mods_dir / "mods.json"


def installed():
    try:
        return json.loads(mods_json.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def summary():
    return {m["name"]: {"id": "..." + mid[-4:], "version": m.get("version"), "homepage": m.get("homepage", "")[-26:],
                        "no-updates": m.get("no-updates"), "updatedAt": m.get("updatedAt"),
                        "files": sorted(str(p.relative_to(mods_dir / mid)).replace("\\", "/")
                                        for p in (mods_dir / mid).rglob("*") if p.is_file())}
            for mid, m in installed().items()}


def settings():
    prefs = (TEST_PROFILE / "prefs.js").read_text(encoding="utf-8")
    return {k: (m.group(1) if (m := re.search(r'user_pref\("' + re.escape(k) + r'", ([^)]*)\)', prefs)) else None)
            for k in SETTINGS}


STATE = """
  const r = document.documentElement;
  const probe = document.createElement('div'); probe.style.color = 'var(--zth-accent)'; document.body.append(probe);
  const accent = getComputedStyle(probe).color; probe.remove();
  return { accent, plusRunning: r.hasAttribute('zenith-real-progress'), peekKey: !!document.getElementById('zenith-peek-key'),
           tabsNumbers: document.getElementById('theme-Zenith-Tabs')?.getAttribute('zenith-tabs-numbers') ?? null };
"""
OPEN_SINE_PAGE = """
  gBrowser.selectedTab = gBrowser.addTrustedTab('about:preferences');
  await new Promise(r => setTimeout(r, 3000));
  gBrowser.selectedBrowser.contentWindow.gotoPref('paneSineMods');
  await new Promise(r => setTimeout(r, 1500));
  return 1;
"""

res = {"1 local install": {}}
with Zen(sync=False) as z:
    res["1 local install"] = {"zen": z.chrome(STATE), "mods": {n: m["homepage"] or "(local)" for n, m in summary().items()}}
    if REDIRECT:
        z.chrome(REDIRECT + "return 1;")
    z.chrome(OPEN_SINE_PAGE)
    z.chrome("""
      const doc = gBrowser.selectedBrowser.contentDocument;
      doc.querySelector('#sineInstallationCustom input').value = arguments[0];
      doc.querySelector('#sineInstallationCustom .sineMarketplaceItemButton').click();
      return 1;
    """, SOURCE)
    start = time.time()
    while time.time() - start < 120:
        time.sleep(2)
        busy = z.chrome("return !!gBrowser.selectedBrowser.contentDocument.querySelector('#sineInstallationCustom .sineMarketplaceItemButton')?.disabled")
        if not busy and all(m.get("homepage") for m in installed().values()):
            break
    res["2 after GitHub install"] = {"seconds": round(time.time() - start), "count": len(installed()), "mods": summary()}

with Zen(sync=False) as z:
    z.chrome("await new Promise(r => setTimeout(r, 3000)); return 1;")
    res["3 after restart"] = {"zen": z.chrome(STATE), "settings": settings(), "count": len(installed()),
                              "css errors": z.console_errors()}

# Make Core and Plus look out of date.
data = installed()
for mid in (MOD_IDS["core"][0], MOD_IDS["plus"][0]):
    data[mid]["updatedAt"] = "2020-01-01T00:00:00+00:00"
    data[mid]["version"] = "0.6.0"
mods_json.write_text(json.dumps(data), encoding="utf-8")
(mods_dir / MOD_IDS["core"][0] / "chrome.css").write_text("/* stale */\n", encoding="utf-8")

with Zen(sync=False) as z:
    start = time.time()
    res["4 start-up update"] = {"updateMods": z.chrome(REDIRECT + """
      const { default: sine } = ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs');
      try { return await sine.updateMods('manual'); } catch (e) { return 'ERROR: ' + e; }""")}
    while time.time() - start < 90:
        time.sleep(2)
        d = installed()
        if all(d.get(MOD_IDS[k][0], {}).get("version") == "0.6.3" for k in ("core", "plus")):
            break
    core_file = mods_dir / MOD_IDS["core"][0] / "chrome.css"
    core_css = core_file.read_text(encoding="utf-8") if core_file.exists() else ""
    res["4 start-up update"] |= {"seconds": round(time.time() - start), "mods": summary(),
                                "versions": {n: m["version"] for n, m in summary().items()},
                                "core css restored": len(core_css) > 1000, "count": len(installed()),
                                 "leftovers": sorted(p.name for p in mods_dir.iterdir() if p.name.startswith(("tmp-", "temp")))}
    res["5 after update"] = z.chrome(STATE)
print(json.dumps(res, indent=1))
