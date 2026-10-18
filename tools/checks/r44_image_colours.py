"""Colours from an image, wallust-style: for Windows' own wallpapers and a
few drawn pictures, the hues found (one to three) and the colours given to
Zen, drawn side by side into %TEMP%/claude/r44/board-<mode>.png for a look,
in dark and in light mode. Also: applying one to a space, and undo."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scenarios import Scene

out_dir = Path(os.environ["TEMP"]) / "claude" / "r44"
out_dir.mkdir(parents=True, exist_ok=True)
web = Path(r"C:\Windows\Web")
pictures = sorted(str(p) for p in [*web.glob("Wallpaper/*/*.jpg"), *web.glob("4K/Wallpaper/Windows/*.jpg"), *web.glob("Wallpaper/*.jpg")])[:14]

BOARD = """
  const [paths, file, drawn] = arguments, C = window.ZenithColours;
  const pics = [];
  for (const p of paths) pics.push([PathUtils.filename(p), await createImageBitmap(new Blob([await IOUtils.read(p)]))]);
  for (const [name, paint] of drawn) {
    const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = 320; c.height = 200;
    const g = c.getContext('2d');
    for (const [kind, ...a] of paint) {
      if (kind === 'lin') { const gr = g.createLinearGradient(a[0], a[1], a[2], a[3]); for (const [at, col] of a[4]) gr.addColorStop(at, col); g.fillStyle = gr; g.fillRect(0, 0, 320, 200); }
      if (kind === 'rect') { g.fillStyle = a[0]; g.fillRect(a[1], a[2], a[3], a[4]); }
      if (kind === 'circle') { g.fillStyle = a[0]; g.beginPath(); g.arc(a[1], a[2], a[3], 0, 7); g.fill(); }
    }
    pics.push([name, await createImageBitmap(c)]);
  }
  const W = 980, row = 130, board = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
  board.width = W; board.height = row * pics.length;
  const g = board.getContext('2d'); g.fillStyle = '#202024'; g.fillRect(0, 0, W, board.height);
  const res = {};
  pics.forEach(([name, bmp], i) => {
    const y = i * row;
    g.drawImage(bmp, 8, y + 8, 180, 114);
    const hues = C.palette(bmp), cols = C.colours(hues);
    hues.forEach((h, k) => {
      g.fillStyle = `oklch(${h.L} ${h.C} ${h.h})`; g.fillRect(200 + k * 90, y + 8, 80, 52);
    });
    cols.forEach((c, k) => {
      g.fillStyle = `rgb(${c.join(',')})`; g.fillRect(200 + k * 90, y + 66, 80, 56);
    });
    // Zen's gradient for those colours, as a band.
    const grad = g.createLinearGradient(480, 0, 970, 0);
    cols.forEach((c, k) => grad.addColorStop(cols.length === 1 ? 0 : k / (cols.length - 1), `rgb(${c.join(',')})`));
    if (cols.length === 1) grad.addColorStop(1, `rgb(${cols[0].join(',')})`);
    g.fillStyle = grad; g.fillRect(480, y + 8, 490, 114);
    g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.fillText(name, 488, y + 24);
    res[name] = { found: hues.map(h => [+h.L.toFixed(2), +h.C.toFixed(3), Math.round(h.h), +h.share.toFixed(2)]), given: cols,
                  all: (C.lastHues ?? []).map(h => [Math.round(h.h), +h.L.toFixed(2), +h.C.toFixed(3), +h.share.toFixed(3), +(h.score / C.lastHues[0].score).toFixed(2)]) };
  });
  const blob = await new Promise(r => board.toBlob(r, 'image/png'));
  await IOUtils.write(file, new Uint8Array(await blob.arrayBuffer()));
  return res;"""

DRAWN = [
    ["one blue (sky)", [["lin", 0, 0, 0, 200, [[0, "#1d4e89"], [1, "#8fb8de"]]]]],
    ["sunset (blue, orange)", [["lin", 0, 0, 0, 200, [[0, "#24305e"], [0.6, "#f76c5e"], [1, "#f9a03f"]]]]],
    ["grey photo", [["lin", 0, 0, 320, 200, [[0, "#222"], [1, "#bbb"]]]]],
    ["green field, red flower", [["rect", "#4a7a3a", 0, 0, 320, 200], ["circle", "#d7263d", 160, 100, 26]]],
    ["red, blue (test)", [["rect", "rgb(200,40,50)", 0, 0, 192, 200], ["rect", "rgb(40,90,210)", 192, 0, 128, 200]]],
]

res = {}
with Scene() as z:
    for mode in ("dark", "light"):
        z.js(f"""Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override', {0 if mode == 'dark' else 1});
                 Services.prefs.setIntPref('ui.systemUsesDarkTheme', {1 if mode == 'dark' else 0}); await zth.sleep(800); return 1""")
        res[mode] = {"dark mode?": z.js("return gZenThemePicker.isDarkMode")}
        res[mode]["board"] = z.js(BOARD, pictures, str(out_dir / f"board-{mode}.png"), DRAWN)
    z.js("Services.prefs.clearUserPref('ui.systemUsesDarkTheme'); Services.prefs.clearUserPref('layout.css.prefers-color-scheme.content-override'); await zth.sleep(500); return 1")
    res["apply and undo"] = z.js("""
      const W = gZenWorkspaces, space = W.getActiveWorkspace(), before = JSON.stringify(space.theme);
      const got = await window.ZenithColours.fromFile(arguments[0]);
      const after = W.getActiveWorkspace().theme;
      const out = { given: got, dots: after.gradientColors.map(d => [d.c, d.isPrimary, d.algorithm, d.lightness]),
                    'dark text kept': document.documentElement.getAttribute('zen-should-be-dark-mode') };
      window.ZenithColours.undo(); await zth.sleep(200);
      out['undo'] = JSON.stringify(W.getActiveWorkspace().theme) === before;
      return out;""", pictures[0])
    res["css errors"] = z.console_errors()
print(json.dumps(res, indent=1, ensure_ascii=False))
