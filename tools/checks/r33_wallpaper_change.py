"""0.9.x: a new wallpaper is picked up. Without touching your real
wallpaper, Zenith is pointed at a test picture (red), which is then
replaced (blue, a newer file), and then a different file is chosen
(green, as Windows Settings would); each time Zen comes back to the front
(a focus event) the drawing must follow. Nothing changes when nothing did."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

TMP = Path(os.environ["TEMP"]) / "claude" / "r33"
TMP.mkdir(parents=True, exist_ok=True)
FILES = [str(TMP / "wall-a.png"), str(TMP / "wall-b.png")]
HELPERS = """
  const paint = async (path, colour) => {
    const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = 64; c.height = 40;
    const x = c.getContext('2d'); x.fillStyle = colour; x.fillRect(0, 0, 64, 40);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await IOUtils.write(path, new Uint8Array(await blob.arrayBuffer()));
  };
  // The colour in the middle of what Zenith drew.
  const drawn = async () => {
    const url = document.documentElement.style.getPropertyValue('--zth-wall').match(/url\\("(.*)"\\)/)?.[1];
    if (!url) return null;
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = 1; c.height = 1;
    c.getContext('2d').drawImage(bmp, bmp.width / 2, bmp.height / 2, 1, 1, 0, 0, 1, 1);
    return [...c.getContext('2d').getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const back = async () => { window.dispatchEvent(new Event('focus')); await zth.sleep(1200); };
"""
res = {}
with Scene() as z:
    res["steps"] = z.js(HELPERS + """
      const W = window.ZenithWallpaper, [a, b] = arguments[0], out = {};
      let file = a;
      const real = W.desktop;
      W.desktop = () => ({ list: [{ file, rect: [0, 0, Math.round(screen.width * devicePixelRatio), Math.round(screen.height * devicePixelRatio)] }], fit: 'fill', colour: '0 0 0' });
      document.documentElement.removeAttribute('zen-no-acrylic');
      await paint(a, 'rgb(220, 30, 30)'); await back();
      out['red picture'] = [document.documentElement.getAttribute('zenith-wallpaper'), await drawn()];
      const url = document.documentElement.style.getPropertyValue('--zth-wall');
      await back();
      out['nothing changed: same drawing'] = document.documentElement.style.getPropertyValue('--zth-wall') === url;
      await zth.sleep(1100);  // a newer date on the file
      await paint(a, 'rgb(30, 60, 220)'); await back();
      out['same file, new picture (blue)'] = await drawn();
      await paint(b, 'rgb(30, 200, 60)'); file = b; await back();
      out['another file chosen (green)'] = await drawn();
      out['checks every'] = '15s';
      W.desktop = real; await back();
      return out;""", FILES)
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
