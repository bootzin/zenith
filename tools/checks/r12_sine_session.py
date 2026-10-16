import json, socket, subprocess, sys, time, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import harness
harness.setup_profile()
p = subprocess.Popen([harness.ZEN_EXE, "-no-remote", "-profile", str(harness.TEST_PROFILE), "--headless", "--marionette", "-remote-allow-system-access"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
t0 = time.time()
z = harness.Zen.__new__(harness.Zen); z.proc = p; z._id = 0
for _ in range(60):
    try:
        z.sock = socket.create_connection(("127.0.0.1", harness.PORT), timeout=5); break
    except OSError:
        time.sleep(0.5)
z.sock.settimeout(240)
print("handshake", z._read(), round(time.time() - t0, 1))
try:
    z.cmd("WebDriver:NewSession", {"capabilities": {"pageLoadStrategy": "none"}})
    print("session after", round(time.time() - t0, 1), "s")
    z.cmd("Marionette:SetContext", {"value": "chrome"})
    print(z.cmd("WebDriver:ExecuteScript", {"script": "return [document.readyState, location.href, !!window.gBrowser, document.documentElement.hasAttribute('zenith-script')]", "args": []}))
except Exception as e:
    print("failed after", round(time.time() - t0, 1), "s:", e)
z.close()
