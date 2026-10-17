"""0.10.0: each screen's own wallpaper.
- For real: Windows' wallpaper service (IDesktopWallpaper) is read through
  js-ctypes, and on this machine must agree with the registry (the same
  picture, the screen where Windows says it is).
- Two screens, simulated (this machine has one): screen 1 red, screen 2
  blue, 200px higher. The drawing holds both, side by side, and is anchored
  on the window's screen; "span" draws one picture across both.
Your real wallpaper is never touched."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

TMP = Path(os.environ["TEMP"]) / "claude" / "r34"
TMP.mkdir(parents=True, exist_ok=True)
FILES = [str(TMP / "red.png"), str(TMP / "blue.png"), str(TMP / "across.png")]
HELPERS = """
  const paint = async (path, draw) => {
    const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = 64; c.height = 40;
    const x = c.getContext('2d'); draw(x);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await IOUtils.write(path, new Uint8Array(await blob.arrayBuffer()));
  };
  // The colour at a point of the desktop (device pixels from its corner).
  const at = async (fx, fy) => {
    const url = document.documentElement.style.getPropertyValue('--zth-wall').match(/url\\("(.*)"\\)/)?.[1];
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = 1; c.height = 1;
    c.getContext('2d').drawImage(bmp, Math.round(bmp.width * fx), Math.round(bmp.height * fy), 1, 1, 0, 0, 1, 1);
    return [...c.getContext('2d').getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const vars = () => ['x', 'y', 'w', 'h'].map(n => parseFloat(document.documentElement.style.getPropertyValue('--zth-wall-' + n)));
  const again = async () => { W.sig = null; await W.refresh(); await zth.sleep(300); };
"""
res = {}
with Scene() as z:
    res["real"] = z.js("""
      const W = window.ZenithWallpaper; await zth.sleep(1500);
      const desk = W.desktop(), cur = W.current();
      return { screens: desk && desk.list, fit: desk && desk.fit, colour: desk && desk.colour, 'this window is on': cur,
               registry: W.read('Control Panel\\\\Desktop', 'WallPaper'),
               'drawn': document.documentElement.getAttribute('zenith-wallpaper'),
               'place (x, y, w, h)': ['x', 'y', 'w', 'h'].map(n => document.documentElement.style.getPropertyValue('--zth-wall-' + n)),
               'screen.left/top, inner': [screen.left, screen.top, mozInnerScreenX, mozInnerScreenY] }""")
    res["simulated"] = z.js(HELPERS + """
      const W = window.ZenithWallpaper, [red, blue, across] = arguments[0], out = {};
      await paint(red, x => { x.fillStyle = 'rgb(220, 30, 30)'; x.fillRect(0, 0, 64, 40); });
      await paint(blue, x => { x.fillStyle = 'rgb(30, 60, 220)'; x.fillRect(0, 0, 64, 40); });
      await paint(across, x => { const g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgb(220,30,30)'); g.addColorStop(1, 'rgb(30,60,220)'); x.fillStyle = g; x.fillRect(0, 0, 64, 40); });
      const [desktop, current] = [W.desktop, W.current];
      let fit = 'fill', on = 0;
      const rects = [[0, 0, 1366, 768], [1366, -200, 3286, 880]];
      W.desktop = () => ({ list: [{ file: red, rect: rects[0] }, { file: blue, rect: rects[1] }], fit, colour: '0 0 0' });
      W.current = () => rects[on];
      await again();
      const base = [screen.left - mozInnerScreenX, screen.top - mozInnerScreenY];
      out['whole desktop (w, h)'] = vars().slice(2);
      out['screen 1 middle'] = await at(683 / 3286, (200 + 384) / 1080);
      out['screen 2 middle'] = await at((1366 + 960) / 3286, 540 / 1080);
      out['above screen 1 (nothing there)'] = await at(683 / 3286, 100 / 1080);
      out['on screen 1: desktop corner from the window'] = [vars()[0] - base[0], vars()[1] - base[1]];
      on = 1; await W.refresh(); await zth.sleep(200);
      out['on screen 2: desktop corner from the window'] = [vars()[0] - base[0], vars()[1] - base[1]];
      on = 0; fit = 'span'; W.desktop = () => ({ list: [{ file: across, rect: rects[0] }, { file: across, rect: rects[1] }], fit, colour: '0 0 0' });
      await again();
      out['span: far left, far right'] = [await at(0.02, 0.5), await at(0.98, 0.5)];
      W.desktop = desktop; W.current = current; await again();
      out['back to the real one'] = vars();
      return out;""", FILES)
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1))
