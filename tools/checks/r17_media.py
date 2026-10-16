"""0.7.0: cover art behind the media card, and picture-in-picture."""
import base64, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

SHOTS = Path(os.environ["TEMP"]) / "claude" / "r17"
SHOTS.mkdir(parents=True, exist_ok=True)

CARD = """
  const card = document.querySelector('#zen-media-controls-toolbar .zen-media-card');
  if (!card) return 'no card';
  const before = getComputedStyle(card, '::before');
  return { art: card.hasAttribute('zenith-art'), tint: card.style.getPropertyValue('--zth-media-tint'),
           layer: before.backgroundImage.slice(0, 30), filter: before.filter, rect: Object.values(card.getBoundingClientRect().toJSON()).slice(0, 4) };
"""
PIP_SHOT = """
  const w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')][0];
  if (!w) return null;
  const bmp = await w.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, 'rgb(255,0,255)');
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0); return c.toDataURL('image/png');
"""


def save(name, data):
    if data:
        (SHOTS / name).write_bytes(base64.b64decode(data.split(",")[1]))


res = {}
with Scene() as z:
    z.js("zth.open(arguments[0] + '/music'); await zth.sleep(2500); zth.open(arguments[0] + '/page?n=2'); await zth.sleep(2000); return 1", z.base)
    res["card with art"] = z.js(CARD)
    z.js("zth.reveal(true); await zth.sleep(800); return 1")
    x, y, w, h = res["card with art"]["rect"] if isinstance(res["card with art"], dict) else (0, 600, 300, 100)
    z.zoom(str(SHOTS / "card-dark.png"), max(0, x - 8), max(0, y - 8), w + 16, h + 16, 3)
    res["art off"] = z.js("Services.prefs.setBoolPref('zenith.plus.media-art', false); await zth.sleep(800);" + CARD)
    z.js("Services.prefs.setBoolPref('zenith.plus.media-art', true); await zth.sleep(800); return 1")

    # Picture-in-picture
    z.js("zth.open(arguments[0] + '/video'); await zth.sleep(2500); document.getElementById('View:PictureInPicture').doCommand(); await zth.sleep(3000); return 1", z.base)
    res["pip"] = z.js("""
      const w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')][0];
      if (!w) return 'no pip window';
      const d = w.document;
      const walk = (e, dep) => dep > 6 ? [] : [`${'  '.repeat(dep)}${e.localName}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().replaceAll(/\\s+/g, '.') : ''}${e.hidden ? ' [hidden]' : ''}`, ...[...e.children].flatMap(c => walk(c, dep + 1))];
      return walk(d.getElementById('controls'), 0);
    """)
    save("pip-idle.png", z.js(PIP_SHOT))
    z.js("""const w = [...Services.wm.getEnumerator('Toolkit:PictureInPicture')][0];
            w.document.getElementById('controls').setAttribute('showing', 'true');
            w.windowUtils.sendMouseEvent('mousemove', 200, 120, 0, 0, 0); await zth.sleep(600); return 1""")
    save("pip-hover.png", z.js(PIP_SHOT))
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
