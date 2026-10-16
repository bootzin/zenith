"""A release updates every Zenith mod at once. Sine 2.3.4 updates them in
parallel; check that all seven come through whole (stylesheet and settings
where mods.json says they are).

    python r20_update_all.py [--local]   (--local: serve this folder, see sine_local.py)
"""
import json, os, shutil, sys, time, zipfile
from pathlib import Path
os.environ["ZENITH_TEST_PROFILE"] = str(Path(os.environ["TEMP"]) / "claude" / "zgh")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Zen, TEST_PROFILE, TEST_PREFS, ROOT

LOCAL = "--local" in sys.argv
SOURCE = next((a for a in sys.argv[1:] if not a.startswith("--")), "bootzin/zenith/tree/master")
REDIRECT = ""
if LOCAL:
    from sine_local import serve_local
    REDIRECT = serve_local()

shutil.rmtree(TEST_PROFILE, ignore_errors=True)
chrome = TEST_PROFILE / "chrome"
chrome.mkdir(parents=True)
for archive in ("profile.zip", "engine.zip"):
    zipfile.ZipFile(ROOT / "vendor" / "sine" / archive).extractall(chrome)
prefs = {**TEST_PREFS, "sine.auto-updates": False}
(TEST_PROFILE / "user.js").write_text("\n".join(f'user_pref("{k}", {json.dumps(v)});' for k, v in prefs.items()) + "\n", encoding="utf-8")
mods_dir = chrome / "sine-mods"
mods_json = mods_dir / "mods.json"


def installed():
    try:
        return json.loads(mods_json.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def health():
    """Each mod: version, and whether its stylesheet and settings exist where mods.json points."""
    out = {}
    for mid, m in installed().items():
        folder = mods_dir / mid
        style = (m.get("style") or {}).get("chrome") if isinstance(m.get("style"), dict) else m.get("style")
        prefs_path = m.get("preferences")
        out[m["name"]] = {"version": m.get("version"),
                          "css": bool(style) and (folder / style).is_file(),
                          "prefs": bool(prefs_path) and (folder / prefs_path).is_file(),
                          "paths": [style, prefs_path]}
    out["leftovers"] = sorted(p.name for p in mods_dir.iterdir() if p.name.startswith(("tmp-", "temp")) or p.suffix == ".zip")
    return out


MANAGER = "const { default: sine } = ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs');"
res = {"source": SOURCE + (" (served from this folder)" if LOCAL else "")}
with Zen(sync=False) as z:
    if REDIRECT:
        z.chrome(REDIRECT + "return 1;")
    res["install"] = z.chrome(MANAGER + "try { await sine.installMod(arguments[0]); return 'ok'; } catch (e) { return 'ERROR ' + e; }", SOURCE)
    time.sleep(2)
    res["after install"] = health()

# Every mod looks out of date, as after a release.
data = installed()
for m in data.values():
    m["updatedAt"] = "2020-01-01T00:00:00+00:00"
    m["version"] = "0.0.1"
mods_json.write_text(json.dumps(data), encoding="utf-8")

with Zen(sync=False) as z:
    if REDIRECT:
        z.chrome(REDIRECT + "return 1;")
    res["update"] = z.chrome(MANAGER + "try { return await sine.updateMods('manual'); } catch (e) { return 'ERROR ' + e; }")
    time.sleep(2)
    res["after update"] = health()
print(json.dumps(res, indent=1))
