"""Shared helpers for checks on a real screen (a visible Zen window, screen
captures and real clicks; see r32 for the first of them).

    from screen_kit import Screen
    with Screen(mine=True) as s:      # mine: your own Zenith settings
        s.z.js(...)                   # the Scene
        s.stats(s.capture("name"), x, y, w, h)

Captures and clicks only happen while the test Zen is in front."""
import json, os, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

HERE = Path(__file__).resolve().parent / "screen"


def my_prefs():
    """Your Zenith settings (and Zen's acrylic ones), read from your profile."""
    root = Path(os.environ["APPDATA"]) / "zen"
    ini = (root / "profiles.ini").read_text(encoding="utf-8")
    path = re.search(r"^\[Install[^\]]*\]\s*\nDefault=(.+)$", ini, re.M).group(1).strip()
    prefs = {}
    for name, raw in re.findall(r'^user_pref\("([^"]+)",\s*(.+)\);$', (root / path / "prefs.js").read_text(encoding="utf-8"), re.M):
        if (name.startswith("zenith.") and not name.startswith("zenith.internal")) or name.startswith("zen.theme.acrylic"):
            prefs[name] = json.loads(raw)
    return prefs


def ps(script, *args, check=True):
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HERE / script), *args],
                       capture_output=True, text=True)
    if check and r.returncode:
        raise SystemExit(f"{script}: {r.stderr.strip()[:300]}")
    return r.stdout.strip()


class Screen:
    def __init__(self, name, mine=False, extra=None):
        self.shots = Path(os.environ["TEMP"]) / "claude" / name
        self.shots.mkdir(parents=True, exist_ok=True)
        prefs = {**json.loads(os.environ.get("ZENITH_EXTRA_PREFS", "{}")), **(my_prefs() if mine else {}), **(extra or {})}
        os.environ["ZENITH_EXTRA_PREFS"] = json.dumps(prefs)

    def __enter__(self):
        from scenarios import Scene
        self.scene = Scene(headless=False)
        self.z = self.scene.__enter__()
        self.pid = self.z.proc.pid
        self.z.js("""window.moveTo(0, 0); window.resizeTo(1366, 720);
                     if (document.documentElement.getAttribute('zen-compact-mode') === 'true') gZenCompactModeManager.preference = false;
                     await zth.sleep(800); window.focus(); return 1""")
        return self

    def __exit__(self, *exc):
        self.scene.__exit__(*exc)

    def front(self):
        who = ps("front.ps1", "-ZenPid", str(self.pid))
        if who != "zen":
            raise SystemExit(f"Zen isn't in front ({who} is); not capturing or clicking")

    def capture(self, name, x=0, y=0, w=1366, h=720):
        self.front()
        out = self.shots / f"{name}.png"
        ps("capture.ps1", "-Out", str(out), "-X", str(x), "-Y", str(y), "-W", str(w), "-H", str(h))
        return out

    def stats(self, png, x, y, w, h):
        return json.loads(ps("stats.ps1", "-In", str(png), "-X", str(x), "-Y", str(y), "-W", str(w), "-H", str(h)))

    def keys(self, keys):
        """Real key presses (SendKeys notation: "%w" is Alt+W), only into the
        test Zen."""
        self.front()
        ps("keys.ps1", "-ZenPid", str(self.pid), "-Keys", keys)

    def click(self, x, y, name="click", hover=False, after=200, box=(0, 0, 40, 40), right=False):
        """A real click (or hover) at a screen point; returns the capture
        `after` ms later of the box (x, y, w, h)."""
        self.front()
        ps("click_capture.ps1", "-X", str(x), "-Y", str(y), "-Out", str(self.shots / name), "-After", str(after),
           "-CX", str(box[0]), "-CY", str(box[1]), "-CW", str(box[2]), "-CH", str(box[3]), *(["-HoverOnly"] if hover else []),
           *(["-Right"] if right else []))
        return self.shots / f"{name}-{after}.png"
