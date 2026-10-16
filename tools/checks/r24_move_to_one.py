"""Moving from the seven separate Sine mods (0.7.1 and earlier) to the one
mod "Zenith": remove the seven in Sine, install bootzin/zenith/tree/master,
restart. Settings must survive and Plus must run once.

    python r24_move_to_one.py   (the seven come from GitHub as pushed; the
                                 one mod is served from this folder)
"""
import json, os, re, shutil, sys, time, zipfile
from pathlib import Path
os.environ["ZENITH_TEST_PROFILE"] = str(Path(os.environ["TEMP"]) / "claude" / "zgh")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Zen, TEST_PROFILE, TEST_PREFS, ROOT
from sine_local import serve_local

SETTINGS = {"zenith.core.accent": "teal", "zenith.tabs.numbers": "ctrl", "zenith.panels.gap": "12",
            "zenith.peek.engine": "duckduckgo", "zenith.plus.minimap": False}
shutil.rmtree(TEST_PROFILE, ignore_errors=True)
chrome = TEST_PROFILE / "chrome"
chrome.mkdir(parents=True)
for archive in ("profile.zip", "engine.zip"):
    zipfile.ZipFile(ROOT / "vendor" / "sine" / archive).extractall(chrome)
prefs = {**TEST_PREFS, "sine.auto-updates": False}
(TEST_PROFILE / "user.js").write_text("\n".join(f'user_pref("{k}", {json.dumps(v)});' for k, v in prefs.items()) + "\n", encoding="utf-8")
(TEST_PROFILE / "prefs.js").write_text("\n".join(f'user_pref("{k}", {json.dumps(v)});' for k, v in SETTINGS.items()) + "\n", encoding="utf-8")
mods_json = chrome / "sine-mods" / "mods.json"
MANAGER = "const { default: sine } = ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs');"
STATE = """
  const r = document.documentElement;
  const probe = document.createElement('div'); probe.style.color = 'var(--zth-accent)'; document.body.append(probe);
  const accent = getComputedStyle(probe).color; probe.remove();
  return { accent, gap: getComputedStyle(r).getPropertyValue('--zth-split-gap').trim(),
           hosts: [...document.querySelectorAll('[id^="theme-Zenith"]')].map(e => e.id),
           peekKeys: document.querySelectorAll('#zenith-peek-key').length, timerEdges: document.querySelectorAll('#zenith-timer-edge').length,
           plus: r.hasAttribute('zenith-real-progress') };
"""


def names():
    return sorted(m["name"] for m in json.loads(mods_json.read_text(encoding="utf-8")).values())


def settings():
    text = (TEST_PROFILE / "prefs.js").read_text(encoding="utf-8")
    return {k: (m.group(1) if (m := re.search(r'user_pref\("' + re.escape(k) + r'", ([^)]*)\)', text)) else None) for k in SETTINGS}


res = {}
with Zen(sync=False) as z:  # the old seven, from GitHub
    res["install the seven"] = z.chrome(MANAGER + "try { await sine.installMod(arguments[0]); return 'ok'; } catch (e) { return 'ERROR ' + e; }",
                                        "bootzin/zenith/tree/master/plus")
    time.sleep(2)
    res["seven"] = names()

redirect = serve_local()
with Zen(sync=False) as z:  # remove them, install the one
    z.chrome(redirect + "return 1;")
    res["remove and install"] = z.chrome(MANAGER + """
      for (const [id, m] of Object.entries(await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, 'chrome', 'sine-mods', 'mods.json'))))
        if (m.name.startsWith('Zenith')) await sine.removeMod(id);
      try { await sine.installMod(arguments[0]); return 'ok'; } catch (e) { return 'ERROR ' + e; }""", "bootzin/zenith/tree/master")
    time.sleep(2)
    res["after"] = names()

with Zen(sync=False) as z:  # restart
    z.chrome("await new Promise(r => setTimeout(r, 2500)); return 1;")
    res["running"] = z.chrome(STATE)
    res["css errors"] = z.console_errors()
res["settings kept"] = settings()
print(json.dumps(res, indent=1))
