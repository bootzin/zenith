"""Install Zenith the way users will: Sine's "install from GitHub" box with
bootzin/zenith/tree/master/plus, in a fresh profile that has Sine and
nothing else. Then restart and check Zenith and Zenith Plus load.

Uses its own profile (%TEMP%/claude/zgh) so the usual test profile, which
gets Zenith copied in from this folder, stays separate.

    python r14_github_install.py           # from GitHub, as pushed
    python r14_github_install.py --local   # rehearsal: Sine's downloads are
                                           # served from this working folder
"""
import functools, http.server, json, os, shutil, subprocess, sys, threading, time, zipfile
from pathlib import Path
os.environ["ZENITH_TEST_PROFILE"] = str(Path(os.environ["TEMP"]) / "claude" / "zgh")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Zen, TEST_PROFILE, TEST_PREFS, ROOT, sine_loader

LOCAL = "--local" in sys.argv
SOURCE = "bootzin/zenith/tree/master/plus"
assert sine_loader(), "Zen's program folder doesn't boot Sine"

# --local: serve the working folder, and the zip GitHub would build from it.
REDIRECT = ""
if LOCAL:
    files = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout.split("\n")
    archive = ROOT / "dist" / "zenith-master.zip"
    archive.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in filter(None, files):
            if (ROOT / f).is_file():
                zf.write(ROOT / f, f"zenith-master/{f}")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a: None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    local = f"http://127.0.0.1:{server.server_address[1]}"
    REDIRECT = f"""
      const {{ default: ucAPI }} = ChromeUtils.importESModule('chrome://userscripts/content/utils/uc_api.sys.mjs');
      const map = url => url
        .replace('https://raw.githubusercontent.com/bootzin/zenith/master/', '{local}/')
        .replace('https://codeload.github.com/bootzin/zenith/zip/refs/heads/master', '{local}/dist/zenith-master.zip');
      const {{ fetch: f, unpackRemoteArchive: u }} = ucAPI;
      ucAPI.fetch = url => f.call(ucAPI, map(url));
      ucAPI.unpackRemoteArchive = o => u.call(ucAPI, {{ ...o, url: map(o.url) }});
    """
res = {"source": SOURCE + (" (served from this folder)" if LOCAL else "")}

# A fresh profile with Sine's files only.
shutil.rmtree(TEST_PROFILE, ignore_errors=True)
chrome = TEST_PROFILE / "chrome"
chrome.mkdir(parents=True)
for archive in ("profile.zip", "engine.zip"):
    zipfile.ZipFile(ROOT / "vendor" / "sine" / archive).extractall(chrome)
(TEST_PROFILE / "user.js").write_text("\n".join(f'user_pref("{k}", {json.dumps(v)});' for k, v in TEST_PREFS.items()) + "\n",
                                      encoding="utf-8")
mods_json = chrome / "sine-mods" / "mods.json"


def installed():
    try:
        return json.loads(mods_json.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


OPEN_SINE_PAGE = """
  gBrowser.selectedTab = gBrowser.addTrustedTab('about:preferences');
  await new Promise(r => setTimeout(r, 3000));
  gBrowser.selectedBrowser.contentWindow.gotoPref('paneSineMods');
  await new Promise(r => setTimeout(r, 1500));
  return 1;
"""

with Zen(sync=False) as z:
    if REDIRECT:
        z.chrome(REDIRECT + "return 1;")
    z.chrome(OPEN_SINE_PAGE)
    res["before"] = sorted(m.get("name") for m in installed().values())
    res["install box"] = z.chrome("""
      const doc = gBrowser.selectedBrowser.contentDocument;
      const input = doc.querySelector('#sineInstallationCustom input');
      const button = doc.querySelector('#sineInstallationCustom .sineMarketplaceItemButton');
      if (!input || !button) return 'install box not found';
      input.value = arguments[0];
      button.click();
      return 'clicked';
    """, SOURCE)
    deadline = time.time() + 120
    while time.time() < deadline:
        time.sleep(2)
        busy = z.chrome("return !!gBrowser.selectedBrowser.contentDocument.querySelector('#sineInstallationCustom .sineMarketplaceItemButton')?.disabled")
        if len(installed()) >= 7 and not busy:
            break
    res["install seconds"] = round(120 - (deadline - time.time()))
    data = installed()
    res["installed"] = {m["name"]: {"id": mid, "version": m.get("version"), "enabled": m.get("enabled"),
                                    "homepage": m.get("homepage"), "scripts": sorted(m.get("scripts", {}))}
                        for mid, m in data.items()}
    res["files"] = {data[mid]["name"]: sorted(str(p.relative_to(chrome / "sine-mods" / mid)).replace("\\", "/")
                                              for p in (chrome / "sine-mods" / mid).rglob("*") if p.is_file())
                    for mid in data if (chrome / "sine-mods" / mid).exists()}
    res["css live after install"] = z.chrome("""
      const cs = getComputedStyle(document.documentElement);
      return { accent: cs.getPropertyValue('--zth-accent').trim().slice(0, 40),
               themeEls: [...document.querySelectorAll('[id^="theme-Zenith"]')].map(e => e.id) };
    """)

# Scripts load when a window opens: restart and look again.
with Zen(sync=False) as z:
    res["after restart"] = z.chrome("""
      const r = document.documentElement, cs = getComputedStyle(r);
      return { accent: cs.getPropertyValue('--zth-accent').trim().slice(0, 40),
               themeEls: [...document.querySelectorAll('[id^="theme-Zenith"]')].map(e => e.id),
               plusRunning: r.hasAttribute('zenith-real-progress'),
               peekKey: !!document.getElementById('zenith-peek-key'),
               minimap: !!document.getElementById('zenith-minimap') };
    """)
    z.chrome(OPEN_SINE_PAGE)
    res["sine page"] = z.chrome("""
      const doc = gBrowser.selectedBrowser.contentDocument;
      const mine = doc.getElementById('sineInstalledGroup'), store = doc.getElementById('sineInstallationGroup');
      return { mineFirst: !!(mine.compareDocumentPosition(store) & Node.DOCUMENT_POSITION_FOLLOWING),
               folded: store.hasAttribute('zenith-folded'),
               listed: [...doc.querySelectorAll('#sineModsList .sineItemTitle, #sineModsList h3')].map(e => e.textContent.trim()) };
    """)
    z.zoom(str(Path(os.environ["TEMP"]) / "claude" / "r14_sine_page.png"), 0, 0, 1366, 768, 1)
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
