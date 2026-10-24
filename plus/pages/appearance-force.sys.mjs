// SPDX-License-Identifier: GPL-3.0-or-later
// Pages made dark or light (Zenith Plus, Pages › Pages set dark or light:
// Invert those that don't follow). Firefox asks every page for dark or light
// (prefers-color-scheme); many sites don't listen. Whatever pages are set to
// (dark, light, or automatic, which is one of the two: the browser's or
// Windows'), a page still in the other once it has settled is inverted, as
// Dark Reader's filter mode does: its colours turned over, its pictures and
// videos turned back. A page that follows, or a site you've left alone
// (Pages › Sites left alone, or the sun-and-moon's menu), stays as it is.
//
// One decision per page: taken once it has loaded and settled (a moment
// after "load"), from what's drawn where it shows (the backgrounds under a
// few points of the window), and taken again only when the setting changes,
// so a page that turns itself dark a little late isn't flipped back and
// forth.
//
// With every page in your palette's colours (Firefox's own colour override,
// for every page at once), a site left alone opts out of it: its own colours
// (CSS forced-color-adjust: none, as a page can do for itself).
//
// Two halves of a window actor. The browser's half decides what the page
// should be (a page's own process can't read Zenith's text settings), the
// page's half measures the page and inverts it or not.

const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const HOW = "zenith.plus.appearance-force"; // "invert" (as it comes), "palette", "off"
const SKIP = "zenith.plus.appearance-skip"; // sites left alone, comma-separated

/* --- The browser's half: what a page should be ------------------------------------ */

export function leftAlone(host = "") {
  host = host.replace(/^www\./, "");
  const skip = Services.prefs.getStringPref(SKIP, "").split(",").map(s => s.trim().replace(/^www\./, "")).filter(Boolean);
  return !!host && skip.some(s => host === s || host.endsWith(`.${s}`));
}

export class ZenithForceParent extends JSWindowActorParent {
  receiveMessage(msg) {
    const how = Services.prefs.getStringPref(HOW, "") || "invert";
    let host = "";
    try {
      host = this.manager.documentURI?.host ?? "";
    } catch {}
    // (Palette colours: is this site out of them?)
    if (msg.name === "own") return how === "palette" && leftAlone(host);
    if (msg.name !== "want" || how !== "invert") return null;
    if (leftAlone(host)) return null;
    // Dark, light, or (automatic) whichever the browser or Windows is now.
    const A = this.browsingContext?.topChromeWindow?.ZenithAppearance;
    if (!A) return null;
    return A.forced() ?? (A.isDark() ? "dark" : "light");
  }
}

/* --- The page's half ------------------------------------------------------------------ */

// The page's colours turned over (hue turned back, so a red stays red),
// and what's a picture turned back again.
const SHEET = "data:text/css," + encodeURIComponent(`
html { filter: invert(1) hue-rotate(180deg) !important; background-color: white !important; }
img, picture, video, canvas, svg image, embed, object, iframe, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
img img, picture img, video video { filter: none !important; }
`);

// A site's own colours under Firefox's colour override: its elements' as it
// sets them, and where it sets none, a browser's usual ones (not the
// palette's, which Firefox also uses as the page's default colours): light,
// or dark for a page that says it can be dark while pages are. Not
// !important there, so the site's own win.
const own = ([bg, fg, link, seen]) => "data:text/css," + encodeURIComponent(`
:root, *, *::before, *::after { forced-color-adjust: none !important; }
:root { background-color: ${bg}; color: ${fg}; }
:link { color: ${link}; }
:visited { color: ${seen}; }
`);
const OWN = { light: own(["#ffffff", "#000000", "#0000ee", "#551a8b"]), dark: own(["#1c1b22", "#fbfbfe", "#8c8cff", "#c88cff"]) };

// How light a CSS colour is (0 to 1), null for a (mostly) transparent one.
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
    if (e.type === "load" && e.target !== this.document) return; // (an image's, a script's)
    if (e.type === "DOMContentLoaded" || (e.type === "pageshow" && e.persisted)) this.own();
    if (e.type === "load") this.settle(500);
    else if (e.type === "pageshow" && e.persisted) this.settle(100);
    else if (e.type === "DOMContentLoaded") this.settle(1500); // (if "load" is slow: decided anyway)
  }

  // (The browser's half says "update" when the setting changes.)
  receiveMessage(msg) {
    if (msg.name === "update") {
      this.own();
      this.settle(0, true);
    }
  }

  // Out of the palette's colours (a site left alone), at once.
  async own() {
    let on = false;
    try {
      on = !!(await this.sendQuery("own"));
    } catch {
      return;
    }
    const doc = this.document, win = this.contentWindow;
    if (!doc?.documentElement || !win) return;
    const said = `${win.getComputedStyle(doc.documentElement).colorScheme ?? ""} ${doc.querySelector('meta[name="color-scheme"]')?.content ?? ""}`;
    const dark = /dark/.test(said) && (!/light/.test(said) || win.matchMedia("(prefers-color-scheme: dark)").matches);
    const url = OWN[dark ? "dark" : "light"];
    if (this.owned && this.ownUrl !== url) this.sheet(this.ownUrl, false, "owned");
    this.sheet(url, on, "owned");
    if (on) this.ownUrl = url;
  }

  // A decision a moment from now, once (or again: the setting changed).
  settle(ms, again = false) {
    if (this.decided && !again) return;
    clearTimeout(this.wait);
    this.wait = setTimeout(() => this.decide(), ms);
  }

  async decide() {
    let want = null;
    try {
      want = await this.sendQuery("want");
    } catch {
      return;
    }
    this.decided = true;
    const doc = this.document;
    if (!want || !doc?.documentElement || (doc.contentType !== "text/html" && !doc.contentType?.includes("xml"))) return this.set(false);
    const dark = this.dark();
    if (dark === null) return;
    // (Measured as the page draws itself: the filter doesn't change its colours.)
    this.set(dark !== (want === "dark"));
  }

  didDestroy() {
    clearTimeout(this.wait);
  }

  // Is the page dark where it shows? Under a few points of the window, the
  // first background drawn (the page's own colours, as it shows them); a
  // majority decides. Nothing drawn anywhere: its colour scheme, else light.
  dark() {
    const doc = this.document, win = this.contentWindow;
    if (!doc?.documentElement || !win) return null;
    const W = win.innerWidth, H = win.innerHeight, votes = [];
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.75], [0.75, 0.75], [0.5, 0.12]]) {
      let el = doc.elementFromPoint(W * fx, H * fy);
      let l = null;
      for (; el && l === null; el = el.parentElement) l = lightness(win.getComputedStyle(el).backgroundColor);
      if (l !== null) votes.push(l < 0.25);
    }
    if (votes.length) return votes.filter(Boolean).length > votes.length / 2;
    for (const el of [doc.documentElement, doc.body]) {
      const l = el && lightness(win.getComputedStyle(el).backgroundColor);
      if (l !== null && l !== undefined) return l < 0.25;
    }
    const scheme = win.getComputedStyle(doc.documentElement).colorScheme ?? "";
    return /\bdark\b/.test(scheme) && (!/\blight\b/.test(scheme) || win.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  set(on) {
    this.sheet(SHEET, on, "inverted");
  }

  sheet(url, on, key) {
    if (!!this[key] === on) return;
    if (!on && key === "owned") url = this.ownUrl ?? url;
    const wu = this.contentWindow?.windowUtils;
    if (!wu) return;
    try {
      if (on) wu.loadSheetUsingURIString(url, wu.USER_SHEET);
      else wu.removeSheetUsingURIString(url, wu.USER_SHEET);
      this[key] = on;
    } catch (e) {
      console.error("[Zenith] pages dark or light", e);
    }
  }
}
