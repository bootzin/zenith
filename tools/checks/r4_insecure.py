"""Not-secure mark on an HTTP page, with HTTPS-First at Zen's default and the
real profile's settings."""
import json, sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
from scenarios import Scene
from harness import REAL_SETTINGS

with Scene() as z:
    for mod, prop, val in REAL_SETTINGS:
        z.js("zth.set(arguments[0], arguments[1], arguments[2]); return 1", mod, prop, val)
    z.js("zth.open('http://neverssl.com/'); await zth.sleep(9000); return 1")
    out = z.js("""
      const ib = document.getElementById('identity-box');
      return { url: gBrowser.currentURI.spec, identity: ib.className,
               https_first: Services.prefs.getBoolPref('dom.security.https_first'),
               mark: zth.style('#tabbrowser-tabbox', ['content', 'width', 'height', 'opacity', 'background-image'], '::after') };""")
    z.screenshot(sys.argv[1] if len(sys.argv) > 1 else "insecure.png")
print(json.dumps(out, indent=1))
