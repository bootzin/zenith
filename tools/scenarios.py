"""Scenario helpers for the Zenith test harness.

A tiny local web server provides pages that trigger each state Zenith styles
(slow load, audio, download, camera), and Scene wraps the harness with
helpers to open tabs, set Zenith settings the way Zen does, reveal or hide
the compact sidebar, and read computed styles.
"""
import io
import json
import math
import struct
import threading
import time
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from harness import Zen

PAGE = """<!doctype html><meta charset=utf-8><title>{title}</title>
<style>body{{font:16px system-ui;margin:40px;max-width:60em}} a{{color:#36c}}</style>
<h1>{title}</h1><p>{body}</p>
<p><a id=l1 href="https://example.com/a/rather/long/path/to/show/in/the/status/pill?q=zenith">A link with a long URL</a>
 · <a href="/page?n=2">Another page</a></p>
<p>The quick brown fox jumps over the lazy dog. Find me: zenith zenith zenith.</p>"""


def tone_wav(seconds=30, freq=440, rate=8000):
    n = seconds * rate
    data = b"".join(struct.pack("<h", int(3000 * math.sin(2 * math.pi * freq * i / rate))) for i in range(n))
    head = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
    return head + b"data" + struct.pack("<I", len(data)) + data


WAV = tone_wav()


def art_png(size=256):
    """Cover art for the media checks: a warm orange-to-purple diagonal."""
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            row += bytes((int(250 - 120 * t), int(140 - 90 * t), int(60 + 150 * t)))
        rows.append(bytes(row))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    signature = bytes([0x89]) + b"PNG" + bytes([13, 10, 26, 10])
    return (signature + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b""))


ART = art_png()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _html(self, html, code=200):
        body = html.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/slow":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<!doctype html><title>Slow page</title><h1>Loading slowly...</h1>")
            self.wfile.flush()
            time.sleep(12)
            self.wfile.write(b"<p>done</p>")
        elif path == "/tone.wav":
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(WAV)))
            self.end_headers()
            self.wfile.write(WAV)
        elif path == "/audio":
            self._html("<!doctype html><title>Audio page</title><h1>Playing a tone</h1>"
                       "<audio id=a src=/tone.wav autoplay loop></audio>")
        elif path == "/art.png":
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(ART)))
            self.end_headers()
            self.wfile.write(ART)
        elif path == "/music":
            # A tone with a title, an artist and cover art, like a music site.
            self._html("<!doctype html><title>Music page</title><h1>Now playing</h1>"
                       "<audio id=a src=/tone.wav autoplay loop></audio><script>"
                       "navigator.mediaSession.metadata = new MediaMetadata({title: 'Zenith Test Song', artist: 'The Harness',"
                       " album: 'Checks', artwork: [{src: '/art.png', sizes: '256x256', type: 'image/png'}]});</script>")
        elif path == "/video":
            # A moving picture (a canvas stream), for picture-in-picture.
            self._html("<!doctype html><title>Video page</title><h1>Video</h1>"
                       "<canvas id=c width=640 height=360 hidden></canvas><video id=v autoplay muted width=640 height=360></video><script>"
                       "const g = c.getContext('2d'); let t = 0;"
                       "setInterval(() => { t++; g.fillStyle = `hsl(${t % 360} 60% 45%)`; g.fillRect(0, 0, 640, 360);"
                       " g.fillStyle = '#fff'; g.font = '48px sans-serif'; g.fillText('Zenith ' + t, 40, 200); }, 50);"
                       "v.srcObject = c.captureStream(20);</script>")
        elif path.startswith("/consent"):
            # Pages with consent banners (Zenith's cookie banners): each sets
            # a cookie saying which button was pressed.
            kind = path.split("-", 1)[1] if "-" in path else "generic"
            say = "<script>function said(w) { document.cookie = 'choice=' + w + '; path=/'; document.querySelectorAll('.banner').forEach(b => b.remove()); }</script>"
            text = "<p>We and our partners use cookies to personalise content and ads.</p>"
            if kind == "onetrust":
                banner = ("<div id=onetrust-consent-sdk><div id=onetrust-banner-sdk class=banner style='position:fixed;left:0;right:0;bottom:0;height:160px;background:#fff;border-top:1px solid #ccc'>"
                          + text + "<button id=onetrust-accept-btn-handler onclick=\"said('accept')\">Accept All Cookies</button>"
                          "<button id=onetrust-reject-all-handler onclick=\"said('reject')\">Reject All</button></div></div>")
            elif kind == "noreject":
                banner = ("<div class='banner cookie-wall' style='position:fixed;inset:0;background:rgb(0 0 0/.6)'><div style='background:#fff;margin:20vh auto;width:400px;padding:20px'>"
                          + text + "<button onclick=\"said('accept')\">Accept and continue</button></div></div>"
                          "<script>document.documentElement.style.overflow = 'hidden';</script>")
            elif kind == "frame":
                banner = "<iframe src='/consent-generic?inner=1' style='position:fixed;bottom:0;left:0;width:100%;height:200px;border:0'></iframe>"
            else:
                banner = ("<div class='banner cookie-notice' style='position:fixed;left:20px;bottom:20px;width:380px;background:#fff;border:1px solid #ccc;padding:12px'>"
                          + text + "<button onclick=\"said('accept')\">Accept all</button> <button onclick=\"said('settings')\">Settings</button> "
                          "<button onclick=\"said('reject')\">Reject all</button></div>")
            filler = "".join(f"<p>Article paragraph {i} with enough words to make the page long enough to scroll.</p>" for i in range(60))
            self._html(f"<!doctype html><title>Consent {kind}</title><body><h1>Consent {kind}</h1>{say}{filler}{banner}")
        elif path == "/watch":
            # A video site's watch page: a player (a box the video's size,
            # with the site's own controls), suggestions beside it, comments
            # below (focus mode's video).
            self._html("<!doctype html><title>Watch page</title><body style='margin:0;font:14px sans-serif'>"
                       "<header style='height:56px;background:#222;color:#fff'>Site</header><div style='display:flex;gap:16px;padding:16px'>"
                       "<div style='flex:1'><div id=player style='position:relative;width:854px;height:480px'>"
                       "<canvas id=c width=854 height=480 hidden></canvas><video id=v autoplay muted style='width:854px;height:480px;display:block'></video>"
                       "<div id=controls style='position:absolute;left:0;right:0;bottom:0;height:40px;background:rgb(0 0 0/.5)'></div></div>"
                       "<h1>A video</h1>" + "".join(f"<p>Comment {i}: lovely video, thanks for sharing it with everyone here today.</p>" for i in range(40)) +
                       "</div><aside style='width:300px'>Up next</aside></div><script>"
                       "const g = c.getContext('2d'); let t = 0;"
                       "setInterval(() => { t++; g.fillStyle = `hsl(${t % 360} 60% 45%)`; g.fillRect(0, 0, 854, 480); }, 50);"
                       "v.srcObject = c.captureStream(20);</script>")
        elif path == "/long":
            # A long page that times its own scrolling: from the first wheel
            # turn, where it is after 50, 100, 200, 400 and 800ms (in its title).
            rows = "".join(f"<p>Row {i}: the quick brown fox jumps over the lazy dog.</p>" for i in range(400))
            self._html("<!doctype html><title>Long page</title><body style='font:16px system-ui;margin:40px'>" + rows +
                       "<script>let t0 = 0; const marks = [50, 100, 200, 400, 800], out = [];"
                       "addEventListener('wheel', () => { if (t0) return; t0 = performance.now(); const y0 = scrollY;"
                       " const tick = () => { const dt = performance.now() - t0;"
                       "  while (out.length < marks.length && dt >= marks[out.length]) out.push(Math.round(scrollY - y0));"
                       "  if (out.length < marks.length) requestAnimationFrame(tick); else document.title = 'scrolled ' + out.join(' '); };"
                       " requestAnimationFrame(tick); }, { passive: true });"
                       "addEventListener('keydown', e => { if (e.key === 'r') { t0 = 0; out.length = 0; scrollTo(0, 0); document.title = 'Long page'; } });"
                       "window.zthReset = () => { t0 = 0; out.length = 0; scrollTo(0, 0); document.title = 'Long page'; };</script>")
        elif path == "/svgicon":
            # A page whose icon is an SVG in a data: address, like ChatGPT's
            # (Zen shows those through moz-remote-image://).
            svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='7' fill='%23e05'/></svg>"
            self._html(f"<!doctype html><title>Icon page</title><link rel=icon href=\"data:image/svg+xml,{svg}\"><h1>Icon</h1>")
        elif path == "/camera":
            self._html("<!doctype html><title>Camera page</title><h1>Camera</h1><video id=v autoplay muted></video>"
                       "<script>navigator.mediaDevices.getUserMedia({video:true,audio:true})"
                       ".then(s=>{v.srcObject=s;document.title='Camera on'}).catch(e=>document.title='ERR '+e)</script>")
        elif path == "/reading":
            # A page that's mostly reading, with the usual clutter: a header
            # stuck to the top, a cookie banner, a side column, share bar,
            # comments (focus mode's tidy).
            paras = "".join(f"<p>Paragraph {i}. The quick brown fox jumps over the lazy dog, again and again, while the river runs on "
                            "past the old mill and the bells ring out across the valley for the evening.</p>" for i in range(30))
            self._html("<!doctype html><title>Reading page</title><body style='margin:0;font:17px Georgia'>"
                       "<header id=bar style='position:fixed;top:0;left:0;right:0;height:56px;background:#333;color:#fff'>Site header</header>"
                       "<div id=cookie-banner class=cookie-banner style='position:fixed;bottom:0;left:0;right:0;height:80px;background:#ffd'>We use cookies</div>"
                       "<div style='display:flex;margin-top:70px'><main style='flex:1;padding:20px'><h1>A long read</h1>" + paras +
                       "<div class=share-buttons>Share this</div><section id=comments>Comments</section></main>"
                       "<aside id=side style='width:260px'>Related links</aside></div></body>")
        elif path == "/photos":
            # A page a vaguely named download comes from (local AI names).
            self._html("<!doctype html><title>Douro valley hike, day 2 - Photos</title><h1>Douro valley, day 2</h1>"
                       "<a id=get href='/photo-file'>Download the photo</a>")
        elif path == "/photo-file":
            body = ART
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Disposition", 'attachment; filename="IMG_20240812_093112.png"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path == "/download":
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", 'attachment; filename="zenith-test.bin"')
            self.send_header("Content-Length", str(40 * 65536))
            self.end_headers()
            try:
                for _ in range(40):
                    self.wfile.write(b"\0" * 65536)
                    self.wfile.flush()
                    time.sleep(0.5)
            except OSError:
                pass
        else:
            q = self.path.split("?n=")[-1] if "?n=" in self.path else "1"
            self._html(PAGE.format(title=f"Test page {q}", body="A plain page for Zenith checks."))


def serve():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


HELPERS = r"""
window.zth = {
  open(url, opts = {}) {
    const tab = gBrowser.addTab(url, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      userContextId: opts.container || 0, inBackground: !!opts.background,
    });
    if (!opts.background) gBrowser.selectedTab = tab;
    return tab;
  },
  // Mirror what Zen's settings page does for a mod dropdown/text setting.
  set(mod, prop, value, type = 'dropdown') {
    Services.prefs.setStringPref(prop, value);
    // In the one Sine mod every setting lands on #theme-Zenith.
    const id = document.getElementById('theme-Zenith') ? 'theme-Zenith' : 'theme-' + mod.replace(/\s/g, '-').replace(/[^A-Za-z_-]+/g, '');
    if (type === 'string') {
      document.documentElement.style.setProperty('--' + prop.replaceAll('.', '-'), value);
      return;
    }
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; el.style.display = 'none'; document.body.appendChild(el); }
    el.setAttribute(prop.replaceAll('.', '-'), value || 'none');
  },
  reveal(on) {
    const tb = gNavToolbox;
    if (on) tb.setAttribute('zen-has-hover', 'true'); else {
      for (const a of ['zen-has-hover', 'zen-user-show', 'zen-has-empty-tab', 'flash-popup', 'zen-compact-mode-active']) tb.removeAttribute(a);
    }
  },
  style(sel, props, pseudo = null, win = window) {
    const el = typeof sel === 'string' ? win.document.querySelector(sel) : sel;
    if (!el) return 'NO ELEMENT ' + sel;
    const cs = win.getComputedStyle(el, pseudo);
    const r = el.getBoundingClientRect();
    const out = { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
};
return true;
"""


class Scene(Zen):
    def __enter__(self):
        super().__enter__()
        self.srv, self.base = serve()
        # Long waits (a model download, a slow page) inside one script.
        self.cmd("WebDriver:SetTimeouts", {"script": 1800000})
        self.sock.settimeout(1900)
        self.chrome(HELPERS)
        # Sine imports Zenith's scripts one by one after the window opens:
        # wait (up to 10s) until the last ones are there.
        self.js("""for (let i = 0; i < 100 && !(window.ZenithTabs && window.ZenithBookmarks && window.ZenithSwitcher); i++)
                     await zth.sleep(100); return 1""")
        return self

    def __exit__(self, *exc):
        super().__exit__(*exc)
        self.srv.shutdown()

    def js(self, body, *args):
        """Run an async JS body with zth helpers available; return its value."""
        return self.chrome(f"return (async () => {{ {body} }})()", *args)
