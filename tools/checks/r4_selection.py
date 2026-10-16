"""Does selected text in a web page actually use the accent colour?
Opens a page that selects its own text, snapshots the real rendered pixels
and reports the most common non-white colours."""
import json, sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
from scenarios import Scene

SAMPLE = r"""
  const b = gBrowser.selectedBrowser;
  const r = arguments[0];
  const bmp = await b.browsingContext.currentWindowGlobal.drawSnapshot(new DOMRect(r[0], r[1], r[2], r[3]), 1, 'white');
  const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const n = {};
  for (let i = 0; i < d.length; i += 4) {
    const k = [d[i], d[i+1], d[i+2]].map(v => (v >> 3) << 3).join(',');
    if (k === '248,248,248') continue;
    n[k] = (n[k] || 0) + 1;
  }
  return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 3);
"""

PAGE = ("<p id=p style='font:22px sans-serif;margin:40px'>Selected text sample for the Zenith selection colour test.</p>"
        "<script>const r=document.createRange();r.selectNodeContents(p);getSelection().addRange(r);"
        "const b=r.getBoundingClientRect();document.title=[b.x,b.y,b.width,b.height].map(Math.round).join(',')</script>")


def select_text(z):
    """Open a page that selects its own text; return the selection's rect."""
    title = z.js("""
      const t = zth.open('data:text/html,' + encodeURIComponent(arguments[0]));
      for (let i = 0; i < 50 && !/^[0-9,]+$/.test(t.label); i++) await zth.sleep(100);
      await zth.sleep(300);
      return t.label;""", PAGE)
    return [int(v) for v in title.split(',')]


def selection_colour(z):
    return z.js(SAMPLE, select_text(z))


def main():
    out = {}
    with Scene() as z:
        z.js("Services.prefs.clearUserPref('ui.highlight'); Services.prefs.clearUserPref('ui.highlighttext'); await zth.sleep(300); return 1")
        out["accent"] = z.js("const p = document.createElement('div'); p.style.color = 'var(--zth-accent)'; document.body.append(p); return getComputedStyle(p).color;")
        out["ui.highlight now"] = z.js("return Services.prefs.getStringPref('ui.highlight', '(unset)')")
        out["selection"] = selection_colour(z)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
