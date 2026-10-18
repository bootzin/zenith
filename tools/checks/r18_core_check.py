"""0.7.0: with Zenith Core switched off, Plus says so (and the notice is
readable without Core's styles); with Core on, it stays quiet."""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Zen, TEST_PROFILE, MOD_IDS, sine_loader
from scenarios import Scene

SHOT = Path(os.environ["TEMP"]) / "claude" / "r18-core-off.png"
assert sine_loader(), "this check switches a mod off in Sine's list"
NOTICES = "await new Promise(r => setTimeout(r, 7500)); return [...document.querySelectorAll('.zenith-toast')].map(t => t.textContent);"

res = {}
with Scene() as z:  # installs the current Zenith into the test profile
    res["core on"] = z.js(NOTICES)

mods_json = TEST_PROFILE / "chrome" / "sine-mods" / "mods.json"
data = json.loads(mods_json.read_text(encoding="utf-8"))
if MOD_IDS["core"][0] not in data:
    # Since 0.7.2 Zenith is one Sine mod: Core can't be switched off alone.
    print(json.dumps({**res, "core off": "skipped: Core is part of the one Sine mod"}, indent=1))
    sys.exit(0)
data[MOD_IDS["core"][0]]["enabled"] = False
mods_json.write_text(json.dumps(data), encoding="utf-8")
with Zen(sync=False) as z:
    res["core off"] = z.chrome(NOTICES)
    z.zoom(str(SHOT), 1000, 0, 366, 120, 2)
print(json.dumps(res, indent=1))
