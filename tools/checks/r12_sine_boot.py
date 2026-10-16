"""Start Zen with the test profile and Sine, log console output for a while."""
import subprocess, time, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import harness
harness.setup_profile()
userjs = harness.TEST_PROFILE / "user.js"
userjs.write_text(userjs.read_text(encoding="utf-8") + 'user_pref("devtools.console.stdout.chrome", true);\nuser_pref("browser.dom.window.dump.enabled", true);\n', encoding="utf-8")
log = Path(os.environ["TEMP"]) / "claude" / "zth-sine-boot.log"
with open(log, "w", encoding="utf-8") as fh:
    p = subprocess.Popen([harness.ZEN_EXE, "-no-remote", "-profile", str(harness.TEST_PROFILE), "--headless", "--marionette", "-remote-allow-system-access"], stdout=fh, stderr=subprocess.STDOUT)
    for i in range(40):
        time.sleep(1)
        if p.poll() is not None:
            print("exited after", i, "s with", p.returncode)
            break
    procs = subprocess.run(["powershell", "-NoProfile", "-Command", f"(Get-CimInstance Win32_Process -Filter \"Name='zen.exe'\" | Where-Object {{ $_.CommandLine -like '*{harness.TEST_PROFILE}*' }}).Count"], capture_output=True, text=True).stdout.strip()
    print("zen processes on test profile:", procs)
harness.Zen.close(type("x", (), {"sock": None, "proc": p})())
text = log.read_text(encoding="utf-8", errors="replace")
lines = [l for l in text.splitlines() if l.strip()]
print(len(lines), "log lines")
for l in lines:
    if any(k in l for k in ("Sine", "sine", "Error", "error", "Zenith", "restart", "Marionette")):
        print(l[:220])
