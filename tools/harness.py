"""Drive a hidden, throwaway Zen instance to see what Zenith actually renders.

Starts Zen with its own test profile (never your real one) and Firefox's
built-in Marionette automation, then lets scripts run JavaScript in the
browser chrome, read computed styles and take screenshots.

    from harness import Zen
    with Zen(headless=True) as z:
        z.chrome("return document.documentElement.getAttribute('zen-compact-mode')")
        z.screenshot("shot.png")

Command line:
    python harness.py setup            create/refresh the test profile with Zenith
    python harness.py shot out.png     start, screenshot the window, stop
"""
import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ZEN_EXE = r"C:\Program Files\Zen Browser\zen.exe"
ROOT = Path(__file__).resolve().parent.parent           # zenith/
# Keep this path short: Zen silently fails to start with very long profile paths.
TEST_PROFILE = Path(os.environ.get("ZENITH_TEST_PROFILE", Path(os.environ["TEMP"]) / "claude" / "zth"))
PORT = int(os.environ.get("ZENITH_MARIONETTE_PORT", "2829"))

MOD_IDS = {
    "core": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000001", "Zenith Core"),
    "edges": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000002", "Zenith Edges"),
    "tabs": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000003", "Zenith Tabs"),
    "urlbar": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000004", "Zenith URL bar"),
    "panels": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000005", "Zenith Panels"),
    "motion": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000006", "Zenith Motion"),
    "plus": ("5a0e7c11-2e1b-4c7d-9f3a-0c0de0000007", "Zenith Plus"),
}


def mod_dir(key):
    """Each mod has a top-level folder: core/, edges/, ... and plus/."""
    return ROOT / key

# Prefs for the throwaway profile: automation on, first-run screens off, and
# the same Zen layout as the real profile (compact mode, single toolbar).
TEST_PREFS = {
    "marionette.port": PORT,
    "browser.shell.checkDefaultBrowser": False,
    "browser.aboutwelcome.enabled": False,
    "zen.welcome-screen.seen": True,
    "browser.startup.homepage_override.mstone": "ignore",
    "startup.homepage_welcome_url": "about:blank",
    "browser.startup.page": 0,
    "datareporting.policy.dataSubmissionEnabled": False,
    "app.update.enabled": False,
    "zen.mods.auto-update": False,
    "zen.view.compact.enable-at-startup": True,
    "browser.tabs.allow_transparent_browser": False,
    "toolkit.legacyUserProfileCustomizations.stylesheets": True,
    "userChromeJS.persistent_domcontent_callback": True,  # Plus's settings helper (fx-autoconfig)
    # With Sine: run Zenith Plus's (local, not-from-the-store) scripts, and
    # keep Sine itself from updating during tests.
    "sine.allow-unsafe-js": True,
    "sine.engine.auto-update": False,
    "zen.theme.acrylic-sidebar": True,
    "zen.theme.acrylic-urlbar": True,
    # fake camera/mic so "sharing" can be triggered without hardware or prompts
    "media.navigator.streams.fake": True,
    "media.navigator.permission.disabled": True,
    # test pages may play sound and download without asking
    "media.autoplay.default": 0,
    "media.autoplay.blocking_policy": 0,
    "media.block-autoplay-until-in-foreground": False,
    "browser.download.useDownloadDir": True,
    "browser.download.folderList": 2,
    "browser.download.dir": str(Path(os.environ["TEMP"]) / "claude" / "zth-downloads"),
    "browser.download.always_ask_before_handling_new_types": False,
}

# Prefs earlier test runs left in the profile that must go back to default.
# ui.prefersReducedMotion: headless reports "reduce", like the real laptop
# (Windows animation effects off), so tests see what the user sees; the
# Zenith script's motion bridge decides from there.
CLEAR_PREFS = ["ui.prefersReducedMotion", "dom.security.https_first", "dom.security.https_first_schemeless",
               "ui.highlight", "ui.highlighttext", "zenith.internal.motion-override"]

# The real profile's Zenith settings (round 4), for checks that should match it.
REAL_SETTINGS = [
    ("Zenith Core", "zenith.core.page", "flush-round"),
    ("Zenith Edges", "zenith.edges.insecure", "on"),
    ("Zenith URL bar", "zenith.urlbar.preset", "top"),
    ("Zenith URL bar", "zenith.urlbar.results", "dense"),
    ("Zenith Motion", "zenith.motion.tab-switch", "fade"),
    ("Zenith Panels", "zenith.panels.notifications", "dunst"),
]


def setup_profile():
    """(Re)build the test profile: prefs + all six Zenith mods enabled."""
    TEST_PROFILE.mkdir(parents=True, exist_ok=True)
    prefs = dict(TEST_PREFS)
    # Start every run from Zenith's defaults: blank every Zenith text/dropdown
    # setting and reset its tick boxes, whatever earlier runs changed.
    for key in MOD_IDS:
        for entry in json.loads((mod_dir(key) / "preferences.json").read_text(encoding="utf-8")):
            if not entry["property"].startswith("zenith."):
                continue
            prefs[entry["property"]] = entry.get("defaultValue", False) if entry["type"] == "checkbox" else ""
    prefs_js = TEST_PROFILE / "prefs.js"
    if prefs_js.exists():
        kept = [l for l in prefs_js.read_text(encoding="utf-8").splitlines()
                if not any(f'user_pref("{name}",' in l for name in CLEAR_PREFS)]
        prefs_js.write_text("\n".join(kept) + "\n", encoding="utf-8")
    lines = [f'user_pref("{k}", {json.dumps(v)});' for k, v in prefs.items()]
    (TEST_PROFILE / "user.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
    sync_mods()


def sine_loader():
    """True when Zen's program folder boots Sine rather than fx-autoconfig
    (the program folder is shared by every profile, the test one included)."""
    config = Path(ZEN_EXE).parent / "config.js"
    return config.exists() and "sine" in config.read_text(encoding="utf-8", errors="replace").lower()


def sync_sine(chrome):
    """Install Zenith into the test profile the way install.ps1 does with
    Sine: Sine's profile files, then every mod in chrome/sine-mods."""
    import zipfile
    for archive in ("profile.zip", "engine.zip"):
        zipfile.ZipFile(ROOT / "vendor" / "sine" / archive).extractall(chrome)
    for leftover in ("boot.sys.mjs", "module_loader.mjs", ".installed-by-zenith"):
        (chrome / "utils" / leftover).unlink(missing_ok=True)
    for f in (chrome / "JS").glob("zenith*.uc.*"):
        f.unlink()
    mods_dir = chrome / "sine-mods"
    mods_dir.mkdir(exist_ok=True)
    plus_scripts = json.loads((ROOT / "plus" / "theme.json").read_text(encoding="utf-8"))["scripts"]
    data = {}
    for key, (mod_id, name) in MOD_IDS.items():
        src, dst = mod_dir(key), mods_dir / mod_id
        dst.mkdir(exist_ok=True)
        for f in ("chrome.css", "preferences.json", "readme.md"):
            if (src / f).exists():
                shutil.copy2(src / f, dst / f)
        entry = {"id": mod_id, "name": name, "description": "", "homepage": "", "author": "zenith-local",
                 "version": (ROOT / "VERSION").read_text().strip(), "style": {"chrome": "chrome.css"},
                 "preferences": "preferences.json", "enabled": True, "no-updates": True, "tags": []}
        if key == "plus":
            (dst / "scripts").mkdir(exist_ok=True)
            for f in (src / "scripts").glob("*.uc.mjs"):
                shutil.copy2(f, dst / "scripts" / f.name)
            entry["scripts"] = plus_scripts
        data[mod_id] = entry
    (mods_dir / "mods.json").write_text(json.dumps(data), encoding="utf-8")
    # Nothing left in Zen's own list for Sine to migrate.
    (TEST_PROFILE / "zen-themes.json").write_text("{}", encoding="utf-8")


def sync_mods():
    """Copy the current Zenith sources into the test profile: into Sine's
    mod list when Zen boots Sine, otherwise as Zen mods (rebuilding
    zen-themes.css the way Zen does) with fx-autoconfig."""
    chrome = TEST_PROFILE / "chrome"
    if sine_loader():
        chrome.mkdir(parents=True, exist_ok=True)
        sync_sine(chrome)
        return
    themes = chrome / "zen-themes"
    themes.mkdir(parents=True, exist_ok=True)
    data, css = {}, ["/* Zen Mods - Generated by ZenMods. (Zenith test harness) */\n"]
    for key, (mod_id, name) in MOD_IDS.items():
        src, dst = mod_dir(key), themes / mod_id
        dst.mkdir(exist_ok=True)
        for f in ("chrome.css", "preferences.json", "readme.md"):
            if (src / f).exists():
                shutil.copy2(src / f, dst / f)
        data[mod_id] = {"id": mod_id, "name": name, "description": "", "homepage": "", "style": "",
                        "readme": "", "preferences": "local", "image": "", "author": "zenith-local",
                        "version": (ROOT / "VERSION").read_text().strip(), "tags": [], "enabled": True}
        css.append(f"\n/* Name: {name} */\n" + (src / "chrome.css").read_text(encoding="utf-8"))
    css.append("\n/* End of Zen Mods */\n")
    (TEST_PROFILE / "zen-themes.json").write_text(json.dumps(data), encoding="utf-8")
    (chrome / "zen-themes.css").write_text("".join(css), encoding="utf-8")
    # Script loader (fx-autoconfig, profile half) and Zenith's scripts
    shutil.copytree(ROOT / "vendor" / "fx-autoconfig" / "utils", chrome / "utils", dirs_exist_ok=True)
    (chrome / "JS").mkdir(exist_ok=True)
    for f in (chrome / "JS").glob("*.uc.*"):
        f.unlink()
    for f in (ROOT / "plus" / "scripts").glob("*.uc.*"):
        shutil.copy2(f, chrome / "JS" / f.name)


class Zen:
    def __init__(self, headless=True, width=1366, height=768, sync=True):
        self.headless, self.width, self.height, self.sync = headless, width, height, sync
        self.proc = self.sock = None
        self._id = 0

    # --- lifecycle -------------------------------------------------------
    def __enter__(self):
        if self.sync:
            setup_profile()
        # -remote-allow-system-access lets Marionette script the browser chrome
        # (only this throwaway instance, listening on localhost).
        # -purgecaches makes the script loader pick up edited scripts.
        # (Under Sine, -purgecaches makes the startup restart itself and lose
        # Marionette; the startup cache is deleted by hand instead.)
        purge = [] if sine_loader() else ["-purgecaches"]
        if not purge:
            for cache in TEST_PROFILE.glob("startupCache"):
                shutil.rmtree(cache, ignore_errors=True)
        args = [ZEN_EXE, "-wait-for-browser", "-no-remote", *purge, "-profile", str(TEST_PROFILE), "--marionette",
                "-remote-allow-system-access",
                f"--window-size={self.width},{self.height}"]
        if self.headless:
            args.append("--headless")
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                self.sock = socket.create_connection(("127.0.0.1", PORT), timeout=5)
                break
            except OSError:
                time.sleep(0.5)
        else:
            self.close()
            raise RuntimeError("Marionette never came up")
        self.sock.settimeout(120)
        try:
            self._read()  # handshake
            # Don't wait for the first tab's page load: under Sine it never
            # reports as finished, which hangs session creation.
            self.cmd("WebDriver:NewSession", {"capabilities": {"pageLoadStrategy": "none"}})
            self.cmd("Marionette:SetContext", {"value": "chrome"})
            # Zen's mods and session restore finish a moment after the window opens.
            self.chrome("return new Promise(r => setTimeout(r, 2500))")
        except Exception:
            self.close()
            raise
        return self

    def __exit__(self, *exc):
        self.close()

    def close(self):
        try:
            if self.sock:
                self.cmd("Marionette:Quit", {"flags": ["eForceQuit"]})
        except Exception:
            pass
        if self.proc:
            try:
                self.proc.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        # Belt and braces: never leave a hidden test instance behind (it would
        # lock the profile). Only processes using the test profile are touched.
        subprocess.run(["powershell", "-NoProfile", "-Command",
                        "Get-CimInstance Win32_Process -Filter \"Name='zen.exe'\" | "
                        f"Where-Object {{ $_.CommandLine -like '*{TEST_PROFILE}*' }} | "
                        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"],
                       capture_output=True)

    # --- protocol --------------------------------------------------------
    def _read(self):
        buf = b""
        while b":" not in buf:
            buf += self.sock.recv(1)
        length, rest = buf.split(b":", 1)
        need = int(length) - len(rest)
        while need > 0:
            chunk = self.sock.recv(min(need, 1 << 20))
            rest += chunk
            need -= len(chunk)
        return json.loads(rest)

    def cmd(self, name, params=None):
        self._id += 1
        msg = json.dumps([0, self._id, name, params or {}]).encode()
        self.sock.sendall(str(len(msg)).encode() + b":" + msg)
        while True:
            reply = self._read()
            if reply[0] == 1 and reply[1] == self._id:
                if reply[2]:
                    raise RuntimeError(f"{name}: {reply[2].get('message', reply[2])}")
                return reply[3]

    # --- helpers ---------------------------------------------------------
    def chrome(self, script, *args):
        """Run JS in the browser window (chrome context); `return` a value."""
        self.cmd("Marionette:SetContext", {"value": "chrome"})
        return self.cmd("WebDriver:ExecuteAsyncScript" if "await " in script else "WebDriver:ExecuteScript",
                        {"script": script if "await " not in script else
                         f"const [resolve] = [arguments[arguments.length-1]]; (async () => {{ {script} }})().then(resolve, e => resolve('ERROR: ' + e));",
                         "args": list(args), "sandbox": None}).get("value")

    def wait(self, ms):
        self.chrome(f"return new Promise(r => setTimeout(r, {int(ms)}))")

    def screenshot(self, path, element_selector=None):
        self.cmd("Marionette:SetContext", {"value": "chrome"})
        params = {"hash": False, "full": True}
        if element_selector:
            el = self.cmd("WebDriver:FindElement", {"using": "css selector", "value": element_selector})
            params["id"] = el["value"][next(iter(el["value"]))] if isinstance(el.get("value"), dict) else el
        data = self.cmd("WebDriver:TakeScreenshot", params)["value"]
        Path(path).write_bytes(base64.b64decode(data))
        return path

    def zoom(self, path, x, y, w, h, scale=4):
        """Screenshot a window region (chrome and page together), magnified."""
        data = self.chrome("""
            const [x, y, w, h, s] = Array.from(arguments).slice(0, 5);
            const bmp = await window.browsingContext.currentWindowGlobal.drawSnapshot(new DOMRect(x, y, w, h), s, 'rgb(128,128,128)');
            const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
            c.width = bmp.width; c.height = bmp.height;
            const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(bmp, 0, 0);
            return c.toDataURL('image/png');""", x, y, w, h, scale)
        if not str(data).startswith("data:"):
            raise RuntimeError(f"zoom failed: {data}")
        Path(path).write_bytes(base64.b64decode(data.split(",", 1)[1]))
        return path

    def console_errors(self, needle="zen-themes"):
        """CSS parse errors and warnings that mention the mods stylesheet."""
        return self.chrome("""
            return Services.console.getMessageArray()
              .filter(m => m instanceof Ci.nsIScriptError)
              .filter(m => (m.sourceName || '').includes(arguments[0]) || (m.errorMessage || '').includes(arguments[0]))
              .map(m => `${m.sourceName.split('/').pop()}:${m.lineNumber} ${m.errorMessage}`)
              .slice(-80);""", needle)


if __name__ == "__main__":
    if sys.argv[1:2] == ["setup"]:
        setup_profile()
        print("test profile ready:", TEST_PROFILE)
    elif sys.argv[1:2] == ["shot"]:
        with Zen() as z:
            print(z.screenshot(sys.argv[2] if len(sys.argv) > 2 else "shot.png"))
