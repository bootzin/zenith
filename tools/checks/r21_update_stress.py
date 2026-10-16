"""Run Sine's update of all seven mods several times in a row (each round
marks them all out of date first) and report any round that leaves a mod
without its stylesheet or settings. Sine 2.3.4 updates mods in parallel, so
problems show up only some of the time.

    python r21_update_stress.py [rounds] [source] [--local] [--keep]
      --keep: reuse the profile r20 left (skip the install)
"""
import json, os, shutil, sys, time, zipfile
from pathlib import Path
os.environ["ZENITH_TEST_PROFILE"] = str(Path(os.environ["TEMP"]) / "claude" / "zgh")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Zen, TEST_PROFILE, TEST_PREFS, ROOT

LOCAL = "--local" in sys.argv
ROUNDS = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8)
SOURCE = next((a for a in sys.argv[1:] if not a.startswith("--") and not a.isdigit()), "bootzin/zenith/tree/master")
REDIRECT = ""
if LOCAL:
    from sine_local import serve_local
    REDIRECT = serve_local()

if "--keep" not in sys.argv:
    shutil.rmtree(TEST_PROFILE, ignore_errors=True)
    chrome = TEST_PROFILE / "chrome"
    chrome.mkdir(parents=True)
    for archive in ("profile.zip", "engine.zip"):
        zipfile.ZipFile(ROOT / "vendor" / "sine" / archive).extractall(chrome)
    prefs = {**TEST_PREFS, "sine.auto-updates": False}
    (TEST_PROFILE / "user.js").write_text("\n".join(f'user_pref("{k}", {json.dumps(v)});' for k, v in prefs.items()) + "\n", encoding="utf-8")

ROUND = """
  const { default: sine } = ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs');
  const dir = PathUtils.join(PathUtils.profileDir, 'chrome', 'sine-mods'), file = PathUtils.join(dir, 'mods.json');
  if (arguments[0]) {
    const data = await IOUtils.readJSON(file);
    for (const m of Object.values(data)) { m.updatedAt = '2020-01-01T00:00:00+00:00'; m.version = '0.0.1'; }
    await IOUtils.writeJSON(file, data);
  }
  let result;
  try { result = await sine.updateMods('manual'); } catch (e) { result = 'ERROR ' + e; }
  const data = await IOUtils.readJSON(file), bad = {};
  for (const [id, m] of Object.entries(data)) {
    const css = typeof m.style === 'object' ? m.style.chrome : m.style;
    const ok = [css && await IOUtils.exists(PathUtils.join(dir, id, ...css.split('/'))),
                m.preferences && await IOUtils.exists(PathUtils.join(dir, id, ...m.preferences.split('/')))];
    if (!ok[0] || !ok[1] || m.version === '0.0.1') bad[m.name] = { version: m.version, css: ok[0], prefs: ok[1], paths: [css, m.preferences] };
  }
  const leftovers = (await IOUtils.getChildren(dir)).map(p => PathUtils.filename(p)).filter(n => /^(tmp-|temp)|\\.zip$/.test(n));
  return { result, bad, leftovers };
"""
res = {}
with Zen(sync=False) as z:
    if REDIRECT:
        z.chrome(REDIRECT + "return 1;")
    if "--keep" not in sys.argv:
        res["install"] = z.chrome("const { default: sine } = ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs');"
                                  "try { await sine.installMod(arguments[0]); return 'ok'; } catch (e) { return 'ERROR ' + e; }", SOURCE)
    for k in range(ROUNDS):
        res[f"round {k + 1}"] = z.chrome(ROUND, True)
        time.sleep(0.5)
print(json.dumps(res, indent=1))
failed = [k for k, v in res.items() if isinstance(v, dict) and (v.get("bad") or v.get("leftovers") or str(v.get("result")).startswith("ERROR"))]
print("FAILED ROUNDS:", failed or "none")
