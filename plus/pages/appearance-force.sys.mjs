// SPDX-License-Identifier: GPL-3.0-or-later
// Pages forced dark or light (Zenith Plus, Pages › When pages are set dark
// or light: Invert those that don't follow). Firefox asks every page for
// dark or light (prefers-color-scheme); many sites don't listen. With pages
// set dark (or light), a page that's still light (or dark) once it has
// loaded is inverted, as Dark Reader's filter mode does: the page's colours
// turned over, its pictures and videos turned back. A page that follows,
// or a site in Pages › Sites left alone, is left as it is.
//
// A window actor: this file runs inside the page's process. It reads the
// browser's settings there (they're shared with every process) and only
// changes how the page is drawn; nothing goes back to the browser.

const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const OVERRIDE = "layout.css.prefers-color-scheme.content-override"; // 0 dark, 1 light
const HOW = "zenith.plus.appearance-force"; // "invert" (as it comes), "palette", "off"
const SKIP = "zenith.plus.appearance-skip"; // sites left alone, comma-separated

// The page's colours turned over (hue turned back, so a red stays red),
// and what's a picture turned back again.
const SHEET = "data:text/css," + encodeURIComponent(`
html { filter: invert(1) hue-rotate(180deg) !important; background-color: white !important; }
img, picture, video, canvas, svg image, embed, object, iframe, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
img img, picture img, video video { filter: none !important; }
`);

// How light a CSS colour is (0 to 1), null for a transparent one.
function lightness(colour) {
  const m = colour?.match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (a < 0.5) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(v => {
    const c = parseFloat(v) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export class ZenithForceChild extends JSWindowActorChild {
  handleEvent(e) {
    if (e.type === "DOMContentLoaded" || e.type === "pageshow") this.start();
  }

  start() {
    if (this.on) return this.check();
    this.on = true;
    this.follow = () => this.check();
    for (const p of [OVERRIDE, HOW, SKIP]) Services.prefs.addObserver(p, this.follow);
    // (A page may change its own colours as the scheme it's asked for
    // changes, or a moment after loading: looked at again then.)
    try {
      this.media = this.contentWindow.matchMedia("(prefers-color-scheme: dark)");
      this.media.addEventListener("change", this.follow);
    } catch {}
    this.check();
    this.later = setTimeout(() => this.check(), 1500);
  }

  didDestroy() {
    if (!this.on) return;
    for (const p of [OVERRIDE, HOW, SKIP]) Services.prefs.removeObserver(p, this.follow);
    try {
      this.media?.removeEventListener("change", this.follow);
    } catch {}
    clearTimeout(this.later);
  }

  // "dark", "light" or null: what pages are set to, if Zenith inverts.
  wanted() {
    const P = Services.prefs;
    if (P.getStringPref(HOW, "") !== "" && P.getStringPref(HOW, "") !== "invert") return null;
    if (!P.prefHasUserValue(OVERRIDE)) return null;
    const mode = { 0: "dark", 1: "light" }[P.getIntPref(OVERRIDE, 2)] ?? null;
    if (!mode) return null;
    let host = "";
    try {
      host = this.document.location.hostname.replace(/^www\./, "");
    } catch {}
    const skip = P.getStringPref(SKIP, "").split(",").map(s => s.trim().replace(/^www\./, "")).filter(Boolean);
    if (host && skip.some(s => host === s || host.endsWith(`.${s}`))) return null;
    return mode;
  }

  // Is the page itself dark? Its root's or body's background, else what
  // colour scheme it says it uses (else the canvas: light).
  dark() {
    const doc = this.document, win = this.contentWindow;
    if (!doc?.documentElement || !win) return null;
    for (const el of [doc.documentElement, doc.body]) {
      if (!el) continue;
      const l = lightness(win.getComputedStyle(el).backgroundColor);
      if (l !== null) return l < 0.25;
    }
    const scheme = win.getComputedStyle(doc.documentElement).colorScheme ?? "";
    return /\bdark\b/.test(scheme) && (!/\blight\b/.test(scheme) || win.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  check() {
    let want = null;
    try {
      want = this.wanted();
    } catch {}
    const doc = this.document;
    if (!doc?.documentElement || (doc.contentType !== "text/html" && !doc.contentType?.includes("xml"))) return this.set(false);
    if (!want) return this.set(false);
    const dark = this.dark();
    if (dark === null) return;
    // (The page's own colours are measured: the filter doesn't change them.)
    this.set(dark !== (want === "dark"));
  }

  set(on) {
    if (!!this.inverted === on) return;
    const wu = this.contentWindow?.windowUtils;
    if (!wu) return;
    try {
      if (on) wu.loadSheetUsingURIString(SHEET, wu.USER_SHEET);
      else wu.removeSheetUsingURIString(SHEET, wu.USER_SHEET);
      this.inverted = on;
    } catch (e) {
      console.error("[Zenith] pages dark or light", e);
    }
  }
}
