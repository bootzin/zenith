"""Final pass with the real profile's settings: CSS errors, script errors,
and screenshots of the main states."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene
from harness import REAL_SETTINGS
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
with Scene() as z:
    for mod, prop, val in REAL_SETTINGS:
        z.js("zth.set(arguments[0], arguments[1], arguments[2]); return 1", mod, prop, val)
    z.js("zth.open(arguments[0] + '/audio', {container: 2}); await zth.sleep(1200); zth.open(arguments[0] + '/page?n=main'); await zth.sleep(1200); return 1", z.base)
    z.screenshot(str(out / "1-page.png"))
    z.js("zth.reveal(true); await zth.sleep(700); return 1")
    z.screenshot(str(out / "2-sidebar.png"))
    z.js("zth.reveal(false); gURLBar.focus(); gURLBar.search('test'); await zth.sleep(1200); return 1")
    z.screenshot(str(out / "3-urlbar.png"))
    z.js("gURLBar.view.close(); gURLBar.blur(); gFindBar.open(); await zth.sleep(600); return 1")
    z.screenshot(str(out / "4-findbar.png"))
    errs = z.console_errors()
    script = z.chrome("""return Services.console.getMessageArray().map(m => m.message || m.errorMessage || '').filter(m => /Zenith/.test(m)).slice(-20)""")
print(json.dumps({"css errors": errs, "zenith messages": script}, indent=1))
