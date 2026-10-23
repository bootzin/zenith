// SPDX-License-Identifier: GPL-3.0-or-later
// Draws the desktop's wallpaper into one picture for Window material:
// Wallpaper (Zenith Plus). It runs in a worker, away from the window's own
// thread, so a new wallpaper (a slideshow changes it every few minutes)
// never makes the window stutter; if a worker can't start, Zenith Plus
// imports the same code and draws it in the window instead.
//
// paint() gets the desktop's area, the scale, the background colour, how
// Windows fits pictures, and each screen's rectangle with its picture's
// bytes; it gives back a JPEG.

export async function paint({ area: [L, T, R, B], k, colour, fit, screens }) {
  const canvas = new OffscreenCanvas(Math.round((R - L) * k), Math.round((B - T) * k));
  const ctx = canvas.getContext("2d");
  ctx.scale(k, k);
  ctx.translate(-L, -T);
  ctx.fillStyle = colour;
  ctx.fillRect(L, T, R - L, B - T);
  ctx.imageSmoothingQuality = "high";
  // Each picture is decoded once, however many screens show it.
  const pictures = new Map();
  const picture = bytes => {
    if (!pictures.has(bytes)) pictures.set(bytes, createImageBitmap(new Blob([bytes])));
    return pictures.get(bytes);
  };
  // One picture fitted into a box, as Windows fits it.
  const draw = (img, [x0, y0, x1, y1], how) => {
    const W = x1 - x0, H = y1 - y0, { width: iw, height: ih } = img;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, W, H);
    ctx.clip();
    if (how === "tile") {
      ctx.translate(x0, y0);
      ctx.fillStyle = ctx.createPattern(img, "repeat");
      ctx.fillRect(0, 0, W, H);
    } else {
      const s = how === "fit" ? Math.min(W / iw, H / ih) : how === "center" ? 1 : Math.max(W / iw, H / ih);
      const [w, h] = how === "stretch" ? [W, H] : [iw * s, ih * s];
      ctx.drawImage(img, x0 + (W - w) / 2, y0 + (H - h) / 2, w, h);
    }
    ctx.restore();
  };
  if (fit === "span") {
    // One picture across every screen.
    const first = screens.find(s => s.bytes);
    if (first) draw(await picture(first.bytes), [L, T, R, B], "fill");
  } else {
    for (const s of screens) if (s.bytes) draw(await picture(s.bytes), s.rect, fit);
  }
  for (const p of pictures.values()) (await p).close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

// As a worker: one message per drawing, answered with the JPEG.
if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = async ({ data }) => {
    try {
      postMessage({ id: data.id, blob: await paint(data) });
    } catch (e) {
      postMessage({ id: data.id, error: String(e) });
    }
  };
}
