// SPDX-License-Identifier: GPL-3.0-or-later
// Pages made dark or light (Zenith Plus, Pages and privacy › Pages set dark or light:
// Invert those that don't follow). Firefox asks every page for dark or light
// (prefers-color-scheme); many sites don't listen. Whatever pages are set to
// (dark, light, or automatic, which is one of the two: the browser's or
// Windows'), a page still in the other once it has settled is turned:
// recoloured (the default), as Dark Reader's dynamic mode does: each colour
// in its style sheets and inline styles turned by what it colours (a
// background dark, text light, a border between), added after the page's
// own, its pictures untouched; or inverted (the fast way, as Dark Reader's
// filter mode): its colours turned over, its pictures and videos turned
// back. A page that follows, or a site you've left alone
// (Pages and privacy › Sites left alone, or the sun-and-moon's menu), stays as it is.
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

const HOW = "zenith.plus.appearance-force"; // "recolour" (the default), "invert", "palette", "off"
const SKIP = "zenith.plus.appearance-skip"; // sites left alone, comma-separated

/* --- The browser's half: what a page should be ------------------------------------ */

export function leftAlone(host = "") {
  host = host.replace(/^www\./, "");
  const skip = Services.prefs.getStringPref(SKIP, "").split(",").map(s => s.trim().replace(/^www\./, "")).filter(Boolean);
  return !!host && skip.some(s => host === s || host.endsWith(`.${s}`));
}

export class ZenithForceParent extends JSWindowActorParent {
  receiveMessage(msg) {
    const how = Services.prefs.getStringPref(HOW, "") || "recolour";
    let host = "";
    try {
      host = this.manager.documentURI?.host ?? "";
    } catch {}
    // (Palette colours: is this site out of them?)
    if (msg.name === "own") return how === "palette" && leftAlone(host);
    if (msg.name !== "want" || (how !== "invert" && how !== "recolour")) return null;
    if (leftAlone(host)) return null;
    // Dark, light, or (automatic) whichever the browser or Windows is now;
    // and how a page that doesn't follow is turned.
    const A = this.browsingContext?.topChromeWindow?.ZenithAppearance;
    if (!A) return null;
    return { want: A.forced() ?? (A.isDark() ? "dark" : "light"), how };
  }
}

/* --- The page's half ------------------------------------------------------------------ */

// Inverted (the fast way): the page's colours turned over (hue turned back,
// so a red stays red), a little softer than pure black and white, and
// what's a picture turned back again.
const SHEET = "data:text/css," + encodeURIComponent(`
html { filter: invert(1) hue-rotate(180deg) brightness(0.94) contrast(0.92) !important; background-color: white !important; }
img, picture, video, canvas, svg image, embed, object, iframe, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
img img, picture img, video video { filter: none !important; }
`);

/* --- Recoloured: each colour turned by what it colours ---------------------------- */

// A CSS colour as red, green, blue (0 to 255) and alpha, by the engine's own
// parser; null for what isn't one.
function rgba(text) {
  try {
    return InspectorUtils.colorToRGBA(text);
  } catch {
    return null;
  }
}

function toHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

// To dark: a background goes dark (white to a near-black, a light grey a
// little lighter), text goes light, a border in between; colours already
// right are left. To light, the other way.
function turn(c, role, toDark) {
  const { h, s, l } = toHsl(c);
  let L = l, S = s;
  if (toDark) {
    if (role === "bg" && l > 0.35) [L, S] = [0.07 + (1 - l) * 0.3, s * 0.8];
    else if (role === "text" && l < 0.6) L = 0.93 - l * 0.45;
    else if (role === "border" && l > 0.4) L = 0.22 + (1 - l) * 0.3;
    else if (role === "any" && l > 0.82) [L, S] = [0.07 + (1 - l) * 0.3, s * 0.8];
    else if (role === "any" && l < 0.22) L = 0.93 - l * 0.45;
  } else {
    if (role === "bg" && l < 0.65) L = 0.97 - l * 0.25;
    else if (role === "text" && l > 0.4) L = 0.1 + (1 - l) * 0.35;
    else if (role === "border" && l < 0.6) L = 0.78 + l * 0.15;
    else if (role === "any" && l < 0.18) L = 0.97 - l * 0.25;
    else if (role === "any" && l > 0.78) L = 0.1 + (1 - l) * 0.35;
  }
  if (L === l && S === s) return null;
  const pc = v => `${(v * 100).toFixed(1)}%`;
  return `hsl(${h.toFixed(1)} ${pc(S)} ${pc(L)} / ${+c.a.toFixed(3)})`;
}

// What a property colours.
function roleOf(prop) {
  if (prop === "background-color" || prop === "background-image") return "bg";
  if (/^(color|fill|stroke|caret-color|text-decoration-color|-webkit-text-fill-color|column-rule-color)$/.test(prop)) return "text";
  if (/^border-.*color$/.test(prop) || prop === "outline-color") return "border";
  if (prop.startsWith("--")) {
    if (/(bg|background|surface|base|canvas|paper|card|panel|backdrop|body(?!-?(text|color|fg)))/i.test(prop)) return "bg";
    if (/(text|fg|foreground|ink|font|heading|title|muted|link|body-?(text|color|fg))/i.test(prop)) return "text";
    if (/(border|line|divider|outline|separator|rule)/i.test(prop)) return "border";
    return "any";
  }
  return null;
}

// A value with each colour in it turned; null when nothing changed.
const TOKEN = /#[\da-f]{3,8}\b|\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\([^()]*\)|\b[a-z]{3,20}\b/gi;
function swap(value, role, toDark) {
  if (!value || /^\s*(inherit|initial|unset|revert|currentcolor|transparent|none)\s*$/i.test(value)) return null;
  const words = !/url\(/i.test(value);
  let changed = false;
  const out = value.replace(TOKEN, t => {
    if (/^[a-z]+$/i.test(t) && (!words || /^(transparent|currentcolor|inherit|initial|unset|none|auto)$/i.test(t))) return t;
    const c = rgba(t);
    if (!c || c.a === 0) return t;
    const turned = turn(c, role, toDark);
    if (!turned) return t;
    changed = true;
    return turned;
  });
  return changed ? out : null;
}

// A rule's colours turned, as declarations ("" for none).
function decls(style, toDark) {
  const out = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style[i], role = roleOf(prop);
    if (!role) continue;
    const v = swap(style.getPropertyValue(prop), role, toDark);
    if (v) out.push(`${prop}: ${v}${style.getPropertyPriority(prop) ? " !important" : ""}`);
  }
  return out.join("; ");
}

// Where a page sets nothing: the browser's usual dark or light colours.
const BASE = {
  dark: ":root { color-scheme: dark !important; } html { background-color: #1c1b22; color: #e6e6eb; } a:link { color: #8cb4ff; } a:visited { color: #c8a0ff; }",
  light: ":root { color-scheme: light !important; } html { background-color: #ffffff; color: #1c1b22; } a:link { color: #0b57d0; } a:visited { color: #6a2fb5; }",
};

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
    const dark = /\bdark\b/.test(said) && (!/\blight\b/.test(said) || win.matchMedia("(prefers-color-scheme: dark)").matches);
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
    let asked = null;
    try {
      asked = await this.sendQuery("want");
    } catch {
      return;
    }
    this.decided = true;
    const doc = this.document, want = asked?.want, how = asked?.how ?? "invert";
    if (!want || !doc?.documentElement || (doc.contentType !== "text/html" && !doc.contentType?.includes("xml"))) return this.set(false);
    // A site with its own light and dark (it says so, or its style sheets
    // have a version for the mode wanted) is trusted: its colours are left
    // as they are. Only a site without one is turned.
    if (this.supports(want)) return this.set(false);
    // (Measured as the page draws itself: the filter doesn't change its
    // colours, the recolouring does, so it's off while measuring.)
    const was = this.recoloured;
    if (was) this.recolour(false);
    const dark = this.dark();
    if (dark === null) return was && this.recolour(true, this.toDark);
    const turnIt = dark !== (want === "dark");
    this.set(turnIt && how === "invert");
    this.recolour(turnIt && how === "recolour", want === "dark");
    this.recheck();
  }

  // Recoloured, or back to the page's own colours.
  recolour(on, toDark = true) {
    const doc = this.document, wu = this.contentWindow?.windowUtils;
    if (!wu || !doc) return;
    if (this.recolourUrl) {
      try {
        wu.removeSheetUsingURIString(this.recolourUrl, wu.AUTHOR_SHEET);
      } catch {}
      this.recolourUrl = null;
    }
    for (const [el, props] of this.inline ?? []) {
      for (const [p, v, pri] of props) el.style?.setProperty(p, v, pri);
    }
    this.inline = new Map();
    this.styleWatch?.disconnect();
    this.styleWatch = null;
    this.recoloured = on;
    this.toDark = toDark;
    if (!on) return;
    // The page's style sheets, each rule's colours turned, under the same
    // conditions (media, supports), after the page's own: the same
    // selectors, so they win where the page's would.
    const rules = [BASE[toDark ? "dark" : "light"]];
    let budget = 25000;
    const walk = (list, wrap) => {
      for (const r of list) {
        if (--budget < 0) return;
        if (r.style && r.selectorText && !r.selectorText.includes("&")) {
          const d = decls(r.style, toDark);
          if (d) rules.push(wrap(`${r.selectorText} { ${d} }`));
        }
        if (r.cssRules?.length) {
          if (r.media) walk(r.cssRules, x => wrap(`@media ${r.media.mediaText} { ${x} }`));
          else if (r.conditionText !== undefined && !r.media && /supports/i.test(r.constructor?.name ?? "")) walk(r.cssRules, x => wrap(`@supports ${r.conditionText} { ${x} }`));
          else if (!r.style) walk(r.cssRules, wrap);
        }
      }
    };
    for (const sheet of [...doc.styleSheets].slice(0, 120)) {
      try {
        walk(sheet.cssRules, x => x);
      } catch {} // (a sheet not readable: its colours stay)
      if (budget < 0) break;
    }
    try {
      this.recolourUrl = "data:text/css," + encodeURIComponent(rules.join("\n"));
      wu.loadSheetUsingURIString(this.recolourUrl, wu.AUTHOR_SHEET);
    } catch (e) {
      console.error("[Zenith] pages recoloured", e);
    }
    // Inline colours (style="…") turned on the element (and put back when
    // it's turned off); new ones, and new style sheets, as they come.
    const inline = root => {
      for (const el of [root, ...(root.querySelectorAll?.("[style]") ?? [])].slice(0, 3000)) {
        if (!el.style?.length || this.inline.has(el)) continue;
        const props = [];
        for (let i = 0; i < el.style.length; i++) {
          const p = el.style[i], role = roleOf(p), v = el.style.getPropertyValue(p), pri = el.style.getPropertyPriority(p);
          const turned = role && swap(v, role, toDark);
          if (turned) props.push([p, v, pri, turned]);
        }
        if (!props.length) continue;
        this.inline.set(el, props.map(([p, v, pri]) => [p, v, pri]));
        for (const [p, , pri, turned] of props) el.style.setProperty(p, turned, pri);
      }
    };
    if (doc.documentElement) inline(doc.documentElement);
    const win = this.contentWindow;
    this.styleWatch = new win.MutationObserver(list => {
      let sheets = false;
      for (const m of list) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.localName === "style" || (n.localName === "link" && /stylesheet/i.test(n.rel ?? ""))) sheets = true;
          else inline(n);
        }
      }
      if (sheets) {
        clearTimeout(this.again2);
        this.again2 = setTimeout(() => this.recoloured && this.recolour(true, this.toDark), 400);
      }
    });
    this.styleWatch.observe(doc.documentElement, { childList: true, subtree: true });
  }

  // Sites that switch their theme by script after loading (a class or a
  // data-theme on the page): looked at again for a few seconds.
  recheck() {
    const doc = this.document, win = this.contentWindow;
    if (this.watcher || !doc?.documentElement || !win) return;
    this.watcher = new win.MutationObserver(() => {
      clearTimeout(this.again);
      this.again = setTimeout(() => this.decide(), 250);
    });
    for (const n of [doc.documentElement, doc.body]) if (n) this.watcher.observe(n, { attributes: true, attributeFilter: ["class", "data-theme", "data-color-mode", "data-bs-theme", "theme", "style"] });
    this.stopWatch = setTimeout(() => {
      this.watcher?.disconnect();
      this.watcher = null;
    }, 6000);
  }

  // Does the page have its own version for this mode? Its colour scheme
  // names it, or a style sheet has a (prefers-color-scheme) rule for it.
  supports(want) {
    const doc = this.document, win = this.contentWindow;
    const said = `${win.getComputedStyle(doc.documentElement).colorScheme ?? ""} ${doc.querySelector('meta[name="color-scheme"]')?.content ?? ""}`;
    if (new RegExp(String.raw`\b${want}\b`).test(said)) return true;
    let budget = 4000;
    const scan = rules => {
      for (const r of rules) {
        if (--budget < 0) return false;
        if (r.media && new RegExp(String.raw`prefers-color-scheme:\s*${want}`).test(r.media.mediaText)) return true;
        if (r.cssRules && scan(r.cssRules)) return true;
      }
      return false;
    };
    for (const sheet of [...doc.styleSheets].slice(0, 40)) {
      try {
        if (sheet.media?.mediaText && new RegExp(String.raw`prefers-color-scheme:\s*${want}`).test(sheet.media.mediaText)) return true;
        if (scan(sheet.cssRules)) return true;
      } catch {} // (another site's sheet: not readable)
      if (budget < 0) break;
    }
    return false;
  }

  didDestroy() {
    clearTimeout(this.wait);
    clearTimeout(this.again);
    clearTimeout(this.again2);
    this.styleWatch?.disconnect();
    clearTimeout(this.stopWatch);
    this.watcher?.disconnect();
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
