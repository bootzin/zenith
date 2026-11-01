// SPDX-License-Identifier: GPL-3.0-or-later
// The rice picker (Alt+Shift+P, the Dash, Settings › Theme): one big window
// in the middle of the browser, as Linux rice switchers have (HyDE's theme
// selector, ML4W's settings, end-4's), with every look in one place.
// Categories on the left, choices as pictures on the right; a click applies
// at once, so you see it. Revert puts back everything as it was when the
// picker opened; Esc or Done keeps what you chose. Themes bundle the look
// settings (never layout, keys or behaviour); yours are saved by name.
// docs/reference.md §7.

const P = Services.prefs;
const HTML = "http://www.w3.org/1999/xhtml";

// What a theme holds: look settings only.
export const LOOK = [
  "zenith.palette", "zenith.core.accent", "zenith.core.corners", "zenith.core.density", "zenith.core.glass", "zenith.core.glass-edge",
  "zenith.core.window-transparency", "zenith.core.font", "zenith.bar.style", "zenith.bar.size", "zenith.bar.length", "zenith.bar.margin",
  "zenith.bar.corners", "zenith.bar.opacity", "zenith.bar.module-corners", "zenith.bar.spacing", "zenith.bar.border",
  "zenith.bar.separators", "zenith.bar.font", "zenith.bar.icons",
];

// Built-in themes, after rice styles (r/unixporn, end-4, HyDE, caelestia).
const THEMES = [
  { name: "Zenith", note: "As it comes", sets: {} },
  { name: "Hypr floating", note: "Catppuccin, a rounded bar off the edges", sets: { "zenith.palette": "catppuccin-mocha", "zenith.bar.style": "floating", "zenith.bar.margin": "8", "zenith.bar.corners": "12", "zenith.bar.module-corners": "999", "zenith.bar.opacity": "90", "zenith.core.corners": "soft" } },
  { name: "Material", note: "From your wallpaper, pills on glass (end-4)", sets: { "zenith.palette": "wallpaper", "zenith.bar.style": "floating", "zenith.bar.margin": "8", "zenith.bar.corners": "999", "zenith.bar.module-corners": "999", "zenith.bar.opacity": "75", "zenith.bar.size": "36" } },
  { name: "Bare", note: "Rosé Pine, modules on the window, no bar", sets: { "zenith.palette": "rose-pine", "zenith.bar.style": "bare", "zenith.bar.module-corners": "8", "zenith.bar.separators": "off" } },
  { name: "Powerline night", note: "Tokyo Night, arrows", sets: { "zenith.palette": "tokyo-night", "zenith.bar.style": "powerline", "zenith.bar.size": "28" } },
  { name: "i3", note: "Nord, plain and thin", sets: { "zenith.palette": "nord", "zenith.bar.style": "minimal", "zenith.bar.size": "24", "zenith.core.corners": "square" } },
  { name: "Polybar", note: "Gruvbox, one solid strip", sets: { "zenith.palette": "gruvbox-dark", "zenith.bar.style": "strip", "zenith.bar.size": "28" } },
  { name: "Paper", note: "Rosé Pine Dawn, light", sets: { "zenith.palette": "rose-pine-dawn", "zenith.bar.style": "islands", "zenith.bar.border": "hairline" } },
];

// The categories: each a list of settings shown as choices.
const CATEGORIES = [
  { id: "themes", label: "Themes", icon: "palette" },
  { id: "colours", label: "Colours", icon: "palette", prefs: ["zenith.palette", "zenith.core.accent"] },
  { id: "glass", label: "Glass", icon: "window", prefs: ["zenith.core.window-transparency", "zenith.core.glass", "zenith.core.glass-edge"] },
  { id: "bars", label: "Bars", icon: "tabs", prefs: ["zenith.bar.style", "zenith.bar.size", "zenith.bar.length", "zenith.bar.margin", "zenith.bar.corners", "zenith.bar.opacity", "zenith.bar.module-corners", "zenith.bar.separators", "zenith.bar.border"] },
  { id: "shape", label: "Shape", icon: "settings", prefs: ["zenith.core.corners", "zenith.core.density"] },
  { id: "font", label: "Font", icon: "edit" },
];

function node(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(HTML, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
  n.append(...kids.filter(k => k !== null && k !== undefined));
  return n;
}

function read(p) {
  if (!P.prefHasUserValue(p)) return null;
  const t = P.getPrefType(p);
  return t === P.PREF_BOOL ? P.getBoolPref(p) : t === P.PREF_INT ? P.getIntPref(p) : P.getStringPref(p);
}

function write(p, v) {
  if (v === null || v === undefined || v === "") return P.clearUserPref(p);
  if (typeof v === "boolean") P.setBoolPref(p, v);
  else if (typeof v === "number") P.setIntPref(p, v);
  else P.setStringPref(p, String(v));
}

function saved() {
  try {
    return JSON.parse(P.getStringPref("zenith.internal.themes", "") || "[]");
  } catch {
    return [];
  }
}

let SETTINGS = null; // property → its entry in preferences.json (labels, options)
async function settings() {
  if (SETTINGS) return SETTINGS;
  const list = await (await fetch(new URL("look-options.json", import.meta.url))).json();
  SETTINGS = new Map(list.map(e => [e.property, e]));
  return SETTINGS;
}

let fonts = null;
async function allFonts() {
  if (fonts) return fonts;
  const E = Cc["@mozilla.org/gfx/fontenumerator;1"].getService(Ci.nsIFontEnumerator);
  fonts = [...new Set(await E.EnumerateAllFontsAsync())].sort((a, b) => a.localeCompare(b));
  return fonts;
}

export const Picker = {
  host: null,

  async open(category = "themes") {
    if (this.host) return this.show(category);
    await settings();
    // What everything was when it opened: Revert's.
    this.before = Object.fromEntries(LOOK.map(p => [p, read(p)]));
    const host = (this.host = node("div", { id: "zenith-rice", role: "dialog", "aria-label": "Looks" }));
    const nav = node("nav", { class: "zr-nav" });
    for (const c of CATEGORIES) {
      const b = node("button", { type: "button", cat: c.id }, node("span", { class: "zs-i", icon: c.icon }), node("span", {}, c.label));
      b.addEventListener("click", () => this.show(c.id));
      nav.append(b);
    }
    const revert = node("button", { type: "button", class: "zr-quiet" }, "Revert");
    revert.title = "Everything as it was when you opened this";
    revert.addEventListener("click", () => {
      for (const [p, v] of Object.entries(this.before)) write(p, v);
      this.show(this.cat);
    });
    const done = node("button", { type: "button", class: "zr-primary" }, "Done");
    done.addEventListener("click", () => this.close());
    const body = (this.body = node("section", { class: "zr-body" }));
    const foot = node("footer", { class: "zr-foot" }, node("span", { class: "zr-hint" }, "Changes apply as you click"), revert, done);
    host.append(node("div", { class: "zr-panel" }, node("header", { class: "zr-head" }, node("strong", {}, "Looks"), node("span", {}, "Alt+Shift+P")), nav, body, foot));
    host.addEventListener("click", e => e.target === host && this.close());
    this.onKey = e => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    window.addEventListener("keydown", this.onKey, true);
    // (Redrawn as settings change, from here or elsewhere.)
    this.onPref = () => {
      clearTimeout(this.redraw);
      this.redraw = setTimeout(() => this.host && this.mark(), 60);
    };
    for (const p of LOOK) P.addObserver(p, this.onPref);
    (document.getElementById("zen-main-app-wrapper") ?? document.documentElement).append(host);
    this.show(category);
  },

  close() {
    if (!this.host) return;
    window.removeEventListener("keydown", this.onKey, true);
    for (const p of LOOK) P.removeObserver(p, this.onPref);
    this.host.remove();
    this.host = null;
  },

  toggle(category) {
    return this.host ? this.close() : this.open(category);
  },

  show(id) {
    this.cat = id;
    for (const b of this.host.querySelectorAll(".zr-nav button")) b.toggleAttribute("current", b.getAttribute("cat") === id);
    const c = CATEGORIES.find(x => x.id === id);
    this.body.replaceChildren(node("h2", {}, c.label));
    if (id === "themes") this.themes();
    else if (id === "font") this.fonts();
    else for (const p of c.prefs) this.choices(p);
    this.mark();
  },

  // One setting's values: as pictures when a value can be drawn (palettes,
  // the bar's looks), else a row of words to pick from (sizes, corners).
  choices(p) {
    const e = SETTINGS.get(p);
    if (!e?.options) return;
    const drawn = p === "zenith.palette" || p === "zenith.bar.style";
    const grid = node("div", { class: drawn ? "zr-grid" : "zr-seg", pref: p });
    for (const o of e.options) {
      const pick = drawn
        ? node("button", { type: "button", class: "zr-card", value: o.value }, this.preview(p, o.value), node("span", { class: "zr-label" }, o.label.replace(/ \(.*\)$/, "")))
        : node("button", { type: "button", class: "zr-opt", value: o.value, title: o.label }, o.label);
      pick.addEventListener("click", () => write(p, o.value === e.defaultValue ? null : o.value));
      grid.append(pick);
    }
    this.body.append(node("h3", {}, e.label), grid);
  },

  // A small picture of a value: a palette's colours, a bar's look.
  preview(p, v) {
    const pal = window.ZenithPaletteColours?.[v];
    if (p === "zenith.palette" && pal) return this.window(v, null);
    if (p === "zenith.bar.style") return this.window(null, v);
    return node("span", { class: "zr-pic" });
  },

  // A tiny browser window in a palette and a bar's look: the backdrop, the
  // bar (its groups as that look draws them) and a page with a few lines.
  window(palette, look) {
    const pal = window.ZenithPaletteColours?.[palette];
    const bar = node("span", { class: "zr-wbar" }, node("i", { class: "zr-a" }), node("i"), node("i", { class: "zr-mid" }), node("i"), node("i", { class: "zr-a2" }));
    const page = node("span", { class: "zr-wpage" }, node("i"), node("i"), node("i"));
    const pic = node("span", { class: "zr-pic", kind: "window", look: look || "islands" }, bar, page);
    if (pal) {
      pic.style.cssText = `--zr-base:${pal.base};--zr-mantle:${pal.mantle ?? pal.base};--zr-surface:${pal.surface};--zr-accent:${pal.accent};` +
        `--zr-second:${pal.second ?? pal.accent};--zr-ink:${pal.text}`;
      pic.append(node("span", { class: "zr-dots" }, ...["accent", "second", "red", "green", "yellow"].filter(k => pal[k]).map(k => node("i", { style: `background:${pal[k]}` }))));
    }
    return pic;
  },

  themes() {
    const grid = node("div", { class: "zr-grid zr-themes" });
    const add = (t, own) => {
      const pic = this.window(t.sets["zenith.palette"], t.sets["zenith.bar.style"]);
      const card = node("button", { type: "button", class: "zr-card", theme: t.name }, pic, node("span", { class: "zr-label" }, t.name), node("span", { class: "zr-note" }, t.note ?? ""));
      card.addEventListener("click", () => {
        // (A theme sets every look setting: what it doesn't name goes back
        // to as it comes.)
        for (const p of LOOK) write(p, t.sets[p] ?? null);
        P.setStringPref("zenith.internal.theme", t.name);
      });
      if (own) {
        card.addEventListener("contextmenu", e => {
          e.preventDefault();
          P.setStringPref("zenith.internal.themes", JSON.stringify(saved().filter(x => x.name !== t.name)));
          this.show("themes");
        });
        card.title = "Right-click: forget it";
      }
      grid.append(card);
    };
    for (const t of THEMES) add(t);
    for (const t of saved()) add({ ...t, note: "Yours" }, true);
    const save = node("button", { type: "button", class: "zr-card zr-save" }, node("span", { class: "zr-pic", kind: "plus" }, "+"), node("span", { class: "zr-label" }, "Save this look"),
      node("span", { class: "zr-note" }, "Keeps what you see by name"));
    save.addEventListener("click", () => {
      const name = window.prompt("A name for this look:", "My rice")?.trim();
      if (!name) return;
      const sets = Object.fromEntries(LOOK.map(p => [p, read(p)]).filter(([, v]) => v !== null));
      P.setStringPref("zenith.internal.themes", JSON.stringify([...saved().filter(x => x.name !== name), { name, sets }]));
      P.setStringPref("zenith.internal.theme", name);
      this.show("themes");
    });
    grid.append(save);
    this.body.append(grid);
  },

  async fonts() {
    const field = node("input", { type: "search", class: "zr-search", placeholder: "Find a font" });
    const list = node("div", { class: "zr-fonts" });
    this.body.append(field, list);
    this.choices("zenith.bar.font");
    const all = await allFonts();
    const draw = () => {
      const q = field.value.trim().toLowerCase();
      const pick = name => {
        const b = node("button", { type: "button", class: "zr-font", value: name }, name || "Your system's (as it comes)");
        if (name) b.style.fontFamily = `"${name}"`;
        b.addEventListener("click", () => write("zenith.core.font", name || null));
        return b;
      };
      list.replaceChildren(pick(""), ...all.filter(f => !q || f.toLowerCase().includes(q)).slice(0, 200).map(pick));
      this.mark();
    };
    field.addEventListener("input", draw);
    draw();
    field.focus();
  },

  // What's chosen now, lit.
  mark() {
    if (!this.host) return;
    for (const g of this.host.querySelectorAll(":is(.zr-grid, .zr-seg)[pref]")) {
      const p = g.getAttribute("pref"), e = SETTINGS.get(p), now = read(p) ?? e.defaultValue;
      for (const c of g.children) c.toggleAttribute("current", c.getAttribute("value") === String(now));
    }
    const theme = P.getStringPref("zenith.internal.theme", "Zenith");
    for (const c of this.host.querySelectorAll(".zr-card[theme]")) c.toggleAttribute("current", c.getAttribute("theme") === theme);
    const font = P.getStringPref("zenith.core.font", "");
    for (const f of this.host.querySelectorAll(".zr-font")) f.toggleAttribute("current", f.getAttribute("value") === font);
  },
};
