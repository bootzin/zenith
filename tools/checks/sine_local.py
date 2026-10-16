"""Rehearse Sine's GitHub installs and updates before pushing: serve this
working folder (and the zip GitHub would build from it) on localhost, and
return the JS that points Sine's downloads there instead of GitHub."""
import functools, http.server, subprocess, threading, zipfile
from harness import ROOT


def serve_local():
    files = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout.split("\n")
    archive = ROOT / "dist" / "zenith-master.zip"
    archive.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in filter(None, files):
            if (ROOT / f).is_file():
                zf.write(ROOT / f, f"zenith-master/{f}")
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    local = f"http://127.0.0.1:{server.server_address[1]}"
    return f"""
      const {{ default: ucAPI }} = ChromeUtils.importESModule('chrome://userscripts/content/utils/uc_api.sys.mjs');
      if (!ucAPI.zenithLocal) {{
        ucAPI.zenithLocal = true;
        const map = url => url
          .replace('https://raw.githubusercontent.com/bootzin/zenith/master/', '{local}/')
          .replace('https://codeload.github.com/bootzin/zenith/zip/refs/heads/master', '{local}/dist/zenith-master.zip');
        const {{ fetch: f, unpackRemoteArchive: u }} = ucAPI;
        ucAPI.fetch = url => f.call(ucAPI, map(url));
        ucAPI.unpackRemoteArchive = o => u.call(ucAPI, {{ ...o, url: map(o.url) }});
      }}
    """
