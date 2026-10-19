"""How long Zen takes to start with Zenith, and where the time goes.

    python tools/bench_startup.py [runs] [--fast]

Sets up a session once (local test pages: a heavy one selected, pinned tabs,
essentials, a second space), quits Zen normally so the session is saved,
then starts Zen `runs` times (default 5) without wiping the session or the
startup cache, as a real start would, and reports for each:
  first paint        the window's first paint (Firefox's own timestamp)
  session restored   Firefox's own timestamp
  page start         the selected tab's page began loading (its timeOrigin)
  page shown         the selected tab's page finished loading (its load event)
  zenith             when each Zenith part started and how long it took
--fast turns on Zenith's Fast start for the runs.
--zenith=css runs Zenith's CSS without its scripts, --zenith=off runs Zen
(and Sine) without Zenith: what Zenith itself costs.
All times are milliseconds from the process starting. Uses the test
profile only."""
import json, os, socket, statistics, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness
from harness import Zen, ZEN_EXE, TEST_PROFILE, PORT

PAGES = Path(os.environ["TEMP"]) / "claude" / "bench-pages"


def make_pages():
    """Local pages, some heavy (a big document and a script that works for a
    while), each putting the moment it loaded into its title."""
    PAGES.mkdir(parents=True, exist_ok=True)
    stamp = ("<script>addEventListener('load', () => { document.title = document.title + ' | start ' + Math.round(performance.timeOrigin) + "
             "' | loaded ' + Date.now(); });</script>")
    for i in range(12):
        heavy = i % 3 == 0
        body = "".join(f"<div class=r><b>Row {n}</b> <span>{'lorem ipsum ' * 6}</span></div>" for n in range(4000 if heavy else 200))
        work = "<script>{const t = performance.now(); let x = 0; while (performance.now() - t < 60) x += Math.sqrt(x + 1);}</script>" if heavy else ""
        (PAGES / f"p{i}.html").write_text(f"<!doctype html><meta charset=utf-8><title>Bench {i}</title><style>.r{{padding:2px;border-bottom:1px solid #ddd}}</style>{body}{work}{stamp}", encoding="utf-8")
    return [(PAGES / f"p{i}.html").as_uri() for i in range(12)]


class KeptZen(Zen):
    """Zen started like a real start: session and startup cache kept."""

    def __enter__(self):
        args = [ZEN_EXE, "-wait-for-browser", "-no-remote", "-profile", str(TEST_PROFILE), "--marionette",
                "-remote-allow-system-access", f"--window-size={self.width},{self.height}"]
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                self.sock = socket.create_connection(("127.0.0.1", PORT), timeout=5)
                break
            except OSError:
                time.sleep(0.25)
        self.sock.settimeout(120)
        self._read()
        self.cmd("WebDriver:NewSession", {"capabilities": {"pageLoadStrategy": "none"}})
        self.cmd("Marionette:SetContext", {"value": "chrome"})
        return self

    def quit(self):
        try:
            self.cmd("Marionette:Quit", {"flags": ["eAttemptQuit"]})
        except Exception:
            pass
        try:
            self.proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            self.close()


def js(z, body, *args):
    return z.chrome(f"return (async () => {{ {body} }})()", *args)


def setup(urls, fast):
    with Zen(headless=False) as z:  # (syncs Zenith and starts from a fresh session)
        js(z, """const [urls, fast] = arguments, W = gZenWorkspaces;
          if (fast) Services.prefs.setBoolPref('zenith.plus.fast-start', true); else Services.prefs.clearUserPref('zenith.plus.fast-start');
          const tabs = [];
          for (const u of urls) { tabs.push(gBrowser.addTrustedTab(u, { inBackground: true })); await new Promise(r => setTimeout(r, 150)); }
          await new Promise(r => setTimeout(r, 2500));
          for (const t of tabs.slice(1, 5)) gBrowser.pinTab(t);
          for (const t of tabs.slice(5, 7)) gZenPinnedTabManager.addToEssentials(t);
          if (W.getWorkspaces().length < 2) { await W.createAndSaveWorkspace('Work', undefined, true); }
          const work = W.getWorkspaces().find(w => w.uuid !== W.activeWorkspace).uuid;
          W.moveTabsToWorkspace(tabs.slice(9, 12), work);
          gBrowser.selectedTab = tabs[0];
          await new Promise(r => setTimeout(r, 1500));
          return 1""", urls, fast)
        z.__class__ = KeptZen
        z.quit()


def measure():
    with KeptZen(headless=False) as z:
        data = js(z, """
          // Wait for the selected page to say it loaded (in this run: the
          // restored title still has the last run's stamp).
          const info = Services.startup.getStartupInfo(), p = +info.process;
          // (The page's own title: the tab's label can lag behind.)
          const title = () => gBrowser.selectedBrowser.browsingContext?.currentWindowGlobal?.documentTitle ?? '';
          const stamp = () => +(title().match(/loaded (\\d+)/)?.[1] ?? 0);
          for (let i = 0; i < 200 && stamp() < p; i++) await new Promise(r => setTimeout(r, 50));
          await new Promise(r => setTimeout(r, 1500));
          const rel = d => (d && +d ? +d - p : null);
          const loaded = stamp() >= p ? stamp() : 0;
          const began = +(title().match(/start (\\d+)/)?.[1] ?? 0);
          const origin = performance.timeOrigin;
          return { firstPaint: rel(info.firstPaint2 ?? info.firstPaint), sessionRestored: rel(info.sessionRestored), main: rel(info.main),
                   delayedStartup: rel(info.delayedStartupFinished), pageStart: loaded && began ? began - p : null, pageShown: loaded ? loaded - p : null, windowCreated: origin - p,
                   zenith: (window.zenithStartup ?? []).map(e => ({ ...e, at: Math.round(e.at + origin - p) })),
                   fast: Services.prefs.getBoolPref('zenith.plus.fast-start', false), selected: title().split(' | ')[0], labelKept: gBrowser.selectedTab.label === title() };""")
        z.quit()
        return data


def only(zenith):
    """"css": Zenith without its scripts; "off": without Zenith at all."""
    if zenith == "all":
        return
    mods = TEST_PROFILE / "chrome" / "sine-mods" / "mods.json"
    data = json.loads(mods.read_text(encoding="utf-8"))
    for entry in data.values():
        if zenith == "off":
            entry["enabled"] = False
        else:
            entry["scripts"] = {}
    mods.write_text(json.dumps(data), encoding="utf-8")


def main():
    runs = int(next((a for a in sys.argv[1:] if a.isdigit()), 5))
    fast = "--fast" in sys.argv
    # Your own Zenith settings (wallpaper and all), and the session restored
    # at start, as a real start has it.
    sys.path.insert(0, str(Path(__file__).resolve().parent / "checks"))
    from screen_kit import my_prefs
    os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({**my_prefs(), "browser.startup.page": 3, "zen.view.compact.enable-at-startup": False,
                                                   # as your profile has it: the last selected tab comes back selected
                                                   "zen.workspaces.continue-where-left-off": True})
    urls = make_pages()
    setup(urls, fast)
    zenith = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--zenith=")), "all")
    only(zenith)
    results = [measure() for _ in range(runs)]
    keys = ["main", "windowCreated", "firstPaint", "sessionRestored", "delayedStartup", "pageStart", "pageShown"]
    summary = {k: round(statistics.median([r[k] for r in results if r.get(k) is not None]), 0) if any(r.get(k) for r in results) else None
               for k in keys}
    parts = {}
    for r in results:
        for e in r["zenith"]:
            parts.setdefault(f"{e['script']}: {e['name']}", []).append(e["ms"] + e.get("drew", 0))
    slow = sorted(((statistics.median(v), k) for k, v in parts.items()), reverse=True)[:15]
    total = round(statistics.median([sum(e["ms"] for e in r["zenith"]) for r in results]), 1) if parts else 0
    print(json.dumps({"fast start": fast, "zenith": zenith, "runs": runs, "median ms from process start": summary,
                      "zenith start total (median, sync part)": total,
                      "slowest zenith parts (median ms)": [[round(m, 1), k] for m, k in slow],
                      "each run": [{**{k: r.get(k) for k in keys}, "selected": r.get("selected"), "label up to date": r.get("labelKept")} for r in results]}, indent=1))


if __name__ == "__main__":
    main()
