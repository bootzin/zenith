"""Where Zen's startup time goes, from Firefox's own profiler.

    python tools/profile_startup.py [--zenith=all|css|off] [--fast]

Sets up the same session as tools/bench_startup.py, starts Zen once with the
Gecko profiler running from the first moment (MOZ_PROFILER_STARTUP), and
once the selected page has loaded, saves the profile and prints, for the main thread up to the window's
first paint and up to the page being shown:
  - time by kind (JavaScript, style, layout, graphics, idle, ...)
  - the scripts that ran longest (by file), Zenith's and Sine's marked
  - the longest style and layout passes
--again summarises the last capture again. Uses the test profile only."""
import gzip, json, os, sys, time
from collections import Counter, defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench_startup as bench

OUT = Path(os.environ["TEMP"]) / "claude" / "startup-profile.json.gz"


def capture():
    os.environ.update({"MOZ_PROFILER_STARTUP": "1", "MOZ_PROFILER_STARTUP_INTERVAL": "0.5",
                       "MOZ_PROFILER_STARTUP_ENTRIES": "64000000",
                       "MOZ_PROFILER_STARTUP_FEATURES": "js,stackwalk,cpu,markersallthreads",
                       "MOZ_PROFILER_STARTUP_FILTERS": "GeckoMain,Renderer,StyleThread"})
    try:
        with bench.KeptZen(headless=False) as z:
            data = bench.js(z, """
              const info = Services.startup.getStartupInfo(), p = +info.process;
              const title = () => gBrowser.selectedBrowser.browsingContext?.currentWindowGlobal?.documentTitle ?? '';
              const stamp = () => +(title().match(/loaded (\\d+)/)?.[1] ?? 0);
              for (let i = 0; i < 200 && stamp() < p; i++) await new Promise(r => setTimeout(r, 50));
              await new Promise(r => setTimeout(r, 1000));
              const profile = await Services.profiler.getProfileDataAsync();
              Services.profiler.StopProfiler();
              // Times in the profile count from its own start; the process
              // start in the same clock.
              return { profile, process: p, start: profile.meta.startTime, firstPaint: +(info.firstPaint2 ?? info.firstPaint) - p,
                       pageShown: stamp() >= p ? stamp() - p : null };""")
            z.quit()
    finally:
        for k in [k for k in os.environ if k.startswith("MOZ_PROFILER_STARTUP")]:
            del os.environ[k]
    with gzip.open(OUT, "wt", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def table(thread, name):
    t = thread[name]
    return t["schema"], t["data"]


def summarise(data):
    profile = data["profile"]
    cats = [c["name"] for c in profile["meta"]["categories"]]
    # The profile's clock starts at meta.startTime (ms since the epoch);
    # the process started at data["process"].
    offset = profile["meta"]["startTime"] - data["process"]
    main = next(t for t in profile["threads"] if t["name"] == "GeckoMain" and t.get("processType", "default") == "default")
    strings = main["stringTable"]
    fs, frames = table(main, "frameTable")
    ss, stacks = table(main, "stackTable")
    sms, samples = table(main, "samples")

    def frame_info(i):
        f = frames[i]
        loc = strings[f[fs["location"]]]
        cat = f[fs["category"]] if len(f) > fs["category"] else None
        return loc, cat

    stack_cat = {}

    def category(s):
        if s is None:
            return "Idle"
        if s in stack_cat:
            return stack_cat[s]
        node, cat = s, None
        while node is not None and cat is None:
            st = stacks[node]
            cat = st[ss["category"]] if "category" in ss and len(st) > ss["category"] else None
            if cat is None:
                cat = frame_info(st[ss["frame"]])[1]
            node = st[ss["prefix"]]
        stack_cat[s] = cats[cat] if cat is not None else "Other"
        return stack_cat[s]

    def script_of(s):
        """The innermost JS frame's file (where the time is spent)."""
        node = s
        while node is not None:
            loc = frame_info(stacks[node][ss["frame"]])[0]
            m = __import__("re").search(r"\((\w+://[^:)]+|file:[^:)]+)", loc) or __import__("re").search(r"(\w+://[^ :)]+)", loc)
            if m:
                return m.group(1).split("?")[0]
            node = stacks[node][ss["prefix"]]
        return None

    times = [samples[i][sms["time"]] + offset for i in range(len(samples))]
    out = {}
    for label, until in (("to first paint", data["firstPaint"]), ("to page shown", data["pageShown"] or data["firstPaint"])):
        by_cat, by_script = Counter(), Counter()
        prev = None
        for i, row in enumerate(samples):
            t = times[i]
            if t > until:
                break
            dt = (t - prev) if prev is not None else 0
            prev = t
            s = row[sms["stack"]]
            by_cat[category(s)] += dt
            if category(s) == "JavaScript" or (s is not None and script_of(s)):
                sc = script_of(s)
                if sc:
                    by_script[sc] += dt
        out[label] = {"until ms": round(until), "by kind (ms)": {k: round(v) for k, v in by_cat.most_common()},
                      "scripts (ms)": [[round(v), k] for k, v in by_script.most_common(25)]}
    # Style and layout passes from the markers.
    ms_schema = main["markers"]["schema"]
    passes = defaultdict(list)
    for m in main["markers"]["data"]:
        name = strings[m[ms_schema["name"]]]
        if name in ("Styles", "Reflow (sync)", "Reflow (interruptible)", "Reflow", "CSS parsing", "Paint", "Rasterize"):
            start, end = m[ms_schema["startTime"]], m[ms_schema["endTime"]]
            if start is not None and end is not None:
                passes[name].append((round(end - start, 1), round(start + offset)))
    out["longest passes (ms, at)"] = {k: sorted(v, reverse=True)[:8] for k, v in passes.items()}
    out["total passes (count, ms) to page shown"] = {k: (len([x for x in v if x[1] <= (data["pageShown"] or 1e9)]),
                                                         round(sum(x[0] for x in v if x[1] <= (data["pageShown"] or 1e9))))
                                                     for k, v in passes.items()}
    return out


def main():
    fast = "--fast" in sys.argv
    zenith = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--zenith=")), "all")
    sys.path.insert(0, str(Path(__file__).resolve().parent / "checks"))
    from screen_kit import my_prefs
    os.environ["ZENITH_EXTRA_PREFS"] = json.dumps({**my_prefs(), "browser.startup.page": 3, "zen.view.compact.enable-at-startup": False,
                                                   "zen.workspaces.continue-where-left-off": True})
    if "--again" in sys.argv:  # summarise the last capture again
        with gzip.open(OUT, "rt", encoding="utf-8") as f:
            data = json.load(f)
    else:
        bench.setup(bench.make_pages(), fast)
        bench.only(zenith)
        # One start to warm the caches, then the profiled one.
        bench.measure()
        data = capture()
    print(json.dumps({"zenith": zenith, "fast start": fast, "first paint": data["firstPaint"], "page shown": data["pageShown"],
                      **summarise(data), "profile": str(OUT)}, indent=1))


if __name__ == "__main__":
    main()
