// SPDX-License-Identifier: GPL-3.0-or-later
// The rice picker (Alt+Shift+P, the Dash, Settings › Theme, a bar's
// right-click menu): one big window in the middle of the browser, as Linux
// rice switchers have (HyDE's theme selector, ML4W's settings, end-4's),
// every look in one place. Categories on the left; on the right each
// setting with what it does, its choices drawn from the very tokens they
// set (a picture is what you get), and its default when it's been changed.
// A click shows the change at once; Save keeps everything, Cancel (or Esc)
// puts back everything as it was when the picker opened. Themes bundle the
// look settings (never layout, keys or behaviour); yours are saved by name.
// Settings are read and written through looks.mjs. docs/reference.md §7.

import {
  SCHEMA, PRESETS, Bars, EDGES, SHAPE_KEYS, value, label, set, setLook, defaultOf, changed, snapshot, restore, applyTheme,
  choosePreset,
  stops,
} from "./looks.mjs";

const P = Services.prefs;
const HTML = "http://www.w3.org/1999/xhtml";

// Built-in themes, after rice styles (r/unixporn, end-4, HyDE, caelestia).
const THEMES = [
  { name: "Zenith", note: "Every look at its default", sets: {} },
  { name: "Hypr floating", note: "Catppuccin, a rounded bar off the edges", sets: { "zenith.palette": "catppuccin-mocha", "zenith.bar.style": "floating", "zenith.bar.corners": "12", "zenith.bar.module-corners": "999", "zenith.bar.opacity": "92", "zenith.core.corners": "soft" } },
  { name: "Material", note: "From your wallpaper, pills on glass (end-4)", sets: { "zenith.palette": "wallpaper", "zenith.bar.style": "floating", "zenith.bar.corners": "999", "zenith.bar.module-corners": "999", "zenith.bar.opacity": "82", "zenith.bar.size": "36" } },
  { name: "Bare", note: "Rosé Pine, modules on the window, no bar", sets: { "zenith.palette": "rose-pine", "zenith.bar.style": "bare", "zenith.bar.module-corners": "8" } },
  { name: "Powerline night", note: "Tokyo Night, arrows", sets: { "zenith.palette": "tokyo-night", "zenith.bar.style": "powerline", "zenith.bar.size": "28" } },
  { name: "i3", note: "Nord, plain and thin", sets: { "zenith.palette": "nord", "zenith.bar.style": "minimal", "zenith.bar.size": "24", "zenith.core.corners": "square" } },
  { name: "Polybar", note: "Gruvbox, one solid strip", sets: { "zenith.palette": "gruvbox-dark", "zenith.bar.style": "strip", "zenith.bar.size": "28", "zenith.bar.opacity": "100" } },
  { name: "Paper", note: "Rosé Pine Dawn, light", sets: { "zenith.palette": "rose-pine-dawn", "zenith.bar.style": "islands", "zenith.bar.border": "hairline" } },
];

// The categories: each a list of settings.
const CATEGORIES = [
  { id: "themes", label: "Themes", icon: "palette", blurb: "A theme sets every look at once: colours, glass, shape, font and the bars. Right-click one of yours to forget it." },
  { id: "colours", label: "Colours", icon: "palette", prefs: ["zenith.palette", "zenith.core.accent"] },
  { id: "glass", label: "Glass", icon: "window", prefs: ["zenith.core.window-transparency", "zenith.core.glass", "zenith.core.glass-edge"],
    blurb: "Every see-through surface: the sidebar, panels, popups, the Dash, this picker and the bars." },
  { id: "shape", label: "Shape", icon: "settings", prefs: ["zenith.core.corners", "zenith.core.pills", "zenith.core.density"] },
  { id: "bars", label: "Bars", icon: "tabs", blurb: "Every bar, or one of them: pick it above. A look writes its margin, corners and spacing; change any after." },
  { id: "font", label: "Font", icon: "edit" },
  { id: "motion", label: "Motion", icon: "play", prefs: ["zenith.motion.preset", "zenith.motion.easing", "zenith.motion.speed"] },
  { id: "menus", label: "Menus and buttons", icon: "tray" },
];
// (A bar's font is in Font, with the browser's.)
const BAR_SETTINGS = ["style", "size", "length", "opacity", "margin", "corners", "module-corners", "spacing", "separators", "border", "icons"];

const MENUS = [["contentAreaContextMenu", "The page's right-click menu"], ["tabContextMenu", "A tab's right-click menu"]];
const PLACES = [["shown", "Shown"], ["more", "In More"], ["off", "Off"]];
const MOTION_PRESET = { off: "Off", quick: "Quick", smooth: "Smooth" };

function node(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(HTML, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
  n.append(...kids.filter(k => k !== null && k !== undefined));
  return n;
}

const short = text => text.replace(/ \(.*\)$/, "");

// The bars that are on.
function barsOn() {
  return EDGES.filter(e => !["", "off"].includes(P.getStringPref(`zenith.bar.${e}`, "")));
}

function saved() {
  try {
    return JSON.parse(P.getStringPref("zenith.internal.themes", "") || "[]");
  } catch {
    return [];
  }
}

let fonts = null;
async function allFonts() {
  if (fonts) return fonts;
  const E = Cc["@mozilla.org/gfx/fontenumerator;1"].getService(Ci.nsIFontEnumerator);
  fonts = [...new Set(await E.EnumerateAllFontsAsync())].sort((a, b) => a.localeCompare(b));
  return fonts;
}

// A setting the picker shows: where it's read and written, its choices, and
// its default. A bar's setting goes to the bar picked at the top of Bars.
function field(id, scope) {
  if (!id.startsWith("bar:")) {
    const e = SCHEMA[id] ?? null, preset = PRESETS[id];
    return {
      id, label: preset ? "Preset" : e?.label ?? id, desc: e?.desc ?? "", range: e?.range,
      options: preset ? preset.values.map(v => ({ value: v, label: MOTION_PRESET[v] ?? v })) : e?.options ?? [],
      now: () => value(id),
      base: () => (preset ? preset.default : defaultOf(id)),
      changed: () => (preset ? value(id) !== preset.default : changed(id)),
      write: v => (preset ? choosePreset(id, v) : setLook(id, v)),
    };
  }
  const key = id.slice(4), e = SCHEMA[`zenith.bar.${key}`];
  const edge = scope === "all" ? null : scope;
  return {
    id, key, label: e.label, desc: e.desc ?? "", options: e.options, range: e.range,
    now: () => (edge ? Bars.value(edge, key) : value(`zenith.bar.${key}`)),
    base: () => Bars.base(scope, key),
    changed() {
      return this.now() !== this.base();
    },
    write: v => (key === "style" ? Bars.chooseLook(scope, v) : Bars.set(scope, key, v)),
    // (In "every bar": the bars that have their own, said.)
    others: () => (edge ? [] : Bars.others(key)),
    fixed: () => Bars.fixed(edge ? Bars.value(edge, "style") : value("zenith.bar.style"), key),
  };
}

export const Picker = {
  host: null,
  scope: "all", // Bars: every bar, or one

  async open(category = "themes", bar = null) {
    if (bar) this.scope = bar;
    if (this.host) return this.show(category);
    // What everything was when it opened: Cancel's.
    this.before = snapshot(["zenith.internal.theme", "zenith.internal.menu-items", "zenith.plus.glance-buttons",
                            "zenith.motion.preset", "zenith.motion.easing", "zenith.motion.speed", "zenith.motion.space-switch",
                            "zenith.motion.swipe", "zenith.motion.swipe-round", "zenith.core.pills"]);
    const host = (this.host = node("div", { id: "zenith-rice", role: "dialog", "aria-modal": "true", "aria-label": "Looks" }));
    const nav = node("nav", { class: "zr-nav", "aria-label": "Categories" });
    for (const c of CATEGORIES) {
      const b = node("button", { type: "button", cat: c.id }, node("span", { class: "zs-i", icon: c.icon }), node("span", {}, c.label));
      b.addEventListener("click", () => this.show(c.id));
      nav.append(b);
    }
    const cancel = node("button", { type: "button", class: "zr-quiet" }, "Cancel");
    cancel.title = "Put back everything as it was when you opened this (Esc)";
    cancel.addEventListener("click", () => this.cancel());
    const save = node("button", { type: "button", class: "zr-primary" }, "Save");
    save.title = "Keep what you see (Ctrl+Enter)";
    save.addEventListener("click", () => this.close());
    const body = (this.body = node("section", { class: "zr-body" }));
    const foot = node("footer", { class: "zr-foot" }, node("span", { class: "zr-hint" }, "Changes show as you click. Save keeps them; Cancel puts everything back."), cancel, save);
    host.append(node("div", { class: "zr-panel" }, node("header", { class: "zr-head" }, node("strong", {}, "Looks"), node("span", {}, "Alt+Shift+P")), nav, body, foot));
    this.onKey = e => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.cancel();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener("keydown", this.onKey, true);
    // (Redrawn as settings change, from here or elsewhere.)
    this.onPref = () => {
      clearTimeout(this.redraw);
      this.redraw = setTimeout(() => this.host && this.mark(), 40);
    };
    for (const branch of ["zenith.", "zenith.internal.theme"]) P.addObserver(branch, this.onPref);
    (document.getElementById("zen-main-app-wrapper") ?? document.documentElement).append(host);
    this.show(category);
  },

  // Save: what you see stays.
  close() {
    if (!this.host) return;
    window.removeEventListener("keydown", this.onKey, true);
    for (const branch of ["zenith.", "zenith.internal.theme"]) P.removeObserver(branch, this.onPref);
    this.host.remove();
    this.host = null;
  },

  cancel() {
    if (this.before) restore(this.before);
    this.close();
  },

  toggle(category) {
    return this.host ? this.close() : this.open(category);
  },

  show(id) {
    this.cat = id;
    for (const b of this.host.querySelectorAll(".zr-nav button")) b.toggleAttribute("current", b.getAttribute("cat") === id);
    const c = CATEGORIES.find(x => x.id === id);
    this.fields = [];
    // (replaceChildren() writes a null out as "null": only what there is.)
    this.body.replaceChildren(...[node("h2", {}, c.label), c.blurb && node("p", { class: "zr-blurb" }, c.blurb)].filter(Boolean));
    if (id === "themes") this.themes();
    else if (id === "font") this.fonts();
    else if (id === "menus") this.menus();
    else if (id === "bars") this.bars();
    else for (const p of c.prefs) this.setting(field(p));
    this.body.scrollTop = 0;
    this.mark();
  },

  // One setting: its name, what it does, its choices, its default.
  setting(f) {
    if (!f.options?.length) return;
    this.fields.push(f);
    const kind = this.kind(f);
    const box = node("div", { class: kind === "seg" ? "zr-seg" : kind === "slider" ? "zr-slider" : "zr-grid", kind, field: f.id, role: "radiogroup", "aria-label": f.label });
    if (kind === "slider") {
      // (A size: every pixel; else its choices in order.)
      const s = (f.stops = stops(f.options, f.range));
      const range = node("input", { type: "range", min: String(s.min), max: String(s.max), step: "1", "aria-label": f.label });
      const out = node("output", { class: "zr-value" });
      range.addEventListener("input", () => this.slid(range, out, s));
      range.addEventListener("change", () => f.write(s.value(range.valueAsNumber)));
      box.append(range, out);
    } else {
      for (const o of f.options) {
        // (An accent: its colour as a circle before its name.)
        const dot = f.id === "zenith.core.accent" ? node("i", { class: "zr-dot", style: `background: var(--zth-hue-${o.value})` }) : null;
        const pick = kind === "seg"
          ? node("button", { type: "button", class: "zr-opt", value: o.value, role: "radio", title: o.label }, dot, short(o.label))
          : node("button", { type: "button", class: "zr-card", value: o.value, role: "radio", title: o.label }, this.picture(f, o.value), node("span", { class: "zr-label" }, short(o.label)));
        pick.addEventListener("click", () => f.write(o.value));
        box.append(pick);
      }
    }
    const head = node("div", { class: "zr-field-head" }, node("h3", {}, f.label), node("span", { class: "zr-was", field: f.id }));
    const wrap = node("div", { class: "zr-field", field: f.id }, head, f.desc ? node("p", { class: "zr-desc" }, f.desc) : null, box,
      node("p", { class: "zr-why", field: f.id }));
    this.body.append(wrap);
  },

  // A slider moved or set: its value said, the track filled to it.
  slid(range, out, s) {
    out.textContent = s.text(range.valueAsNumber);
    range.style.setProperty("--zr-fill", `${((range.valueAsNumber - s.min) / Math.max(1, s.max - s.min)) * 100}%`);
  },

  // How a setting's choices are shown: drawn (what they look like), a
  // slider (sizes and amounts), or words.
  kind(f) {
    const p = f.key ? `bar:${f.key}` : f.id;
    if (f.range) return "slider";
    if (["zenith.palette", "bar:style", "zenith.core.window-transparency", "zenith.core.glass", "zenith.core.glass-edge",
         "zenith.core.corners", "zenith.motion.easing"].includes(p)) return "drawn";
    const numbers = f.options.filter(o => /^\d+$/.test(o.value)).length;
    return numbers >= 4 && numbers === f.options.length ? "slider" : "seg";
  },

  // A choice drawn from the tokens it sets (core/chrome.css, motion/chrome.css).
  picture(f, v) {
    const p = f.key ? `bar:${f.key}` : f.id;
    // (A palette made from your wallpaper, a colours file or your own: drawn
    // as it would be now, once read.)
    if (p === "zenith.palette") {
      if (window.ZenithPaletteColours?.[v]) return this.window(v, null);
      const pic = this.window(null, null);
      pic.setAttribute("reading", "true");
      window.ZenithPalettes?.peek(v).then(pal => {
        pic.removeAttribute("reading");
        if (pal) this.paint(pic, pal);
        else pic.setAttribute("title", v === "wallpaper" ? "No wallpaper to take colours from yet" : `No ${v} colours file found`);
      });
      return pic;
    }
    if (p === "bar:style") return this.window(null, v);
    const glass = node("i", { class: "zr-glass" }, node("b"), node("b"), node("b"));
    const pic = node("span", { class: "zr-pic", kind: "swatch" }, node("i", { class: "zr-backdrop" }), glass);
    const tokens = {
      "zenith.core.window-transparency": `--zr-alpha: var(--zth-alpha-${v})`,
      "zenith.core.glass": `--zr-blur: calc(var(--zth-frost-${v}) * 2)`,
      "zenith.core.glass-edge": `--zr-rim: var(--zth-rim-${v})`,
      "zenith.core.corners": `--zr-corner: var(--zth-corner-${v})`,
      "zenith.motion.easing": `--zr-ease: var(--zth-ease-${v})`,
    }[p];
    pic.setAttribute("style", tokens);
    if (p === "zenith.motion.easing") pic.setAttribute("kind", "curve");
    return pic;
  },

  // A tiny browser window in a palette and a bar's look: the backdrop, the
  // bar (its groups as that look draws them) and a page with a few lines.
  window(palette, look) {
    const pal = window.ZenithPaletteColours?.[palette];
    const bar = node("span", { class: "zr-wbar" }, node("i", { class: "zr-a" }), node("i"), node("i", { class: "zr-mid" }), node("i"), node("i", { class: "zr-a2" }));
    const page = node("span", { class: "zr-wpage" }, node("i"), node("i"), node("i"));
    const pic = node("span", { class: "zr-pic", kind: "window", look: look || "islands" }, bar, page);
    if (pal) this.paint(pic, pal);
    return pic;
  },

  // A tiny window in a palette's colours, its accents as dots.
  paint(pic, pal) {
    pic.style.cssText = `--zr-base:${pal.base};--zr-mantle:${pal.mantle ?? pal.base};--zr-surface:${pal.surface};--zr-accent:${pal.accent};` +
      `--zr-second:${pal.second ?? pal.accent};--zr-ink:${pal.text}`;
    pic.querySelector(".zr-dots")?.remove();
    pic.append(node("span", { class: "zr-dots" }, ...["accent", "second", "red", "green", "yellow"].filter(k => pal[k]).map(k => node("i", { style: `background:${pal[k]}` }))));
  },

  themes() {
    const grid = node("div", { class: "zr-grid zr-themes" });
    const add = (t, own) => {
      const pic = this.window(t.sets["zenith.palette"], t.sets["zenith.bar.style"]);
      const card = node("button", { type: "button", class: "zr-card", theme: t.name }, pic, node("span", { class: "zr-label" }, t.name), node("span", { class: "zr-note" }, t.note ?? ""));
      card.addEventListener("click", () => {
        applyTheme(t.sets);
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
      // (Each bar's own values too.)
      const sets = Object.fromEntries(Object.entries(snapshot()).filter(([, v]) => v !== null && v !== ""));
      P.setStringPref("zenith.internal.themes", JSON.stringify([...saved().filter(x => x.name !== name), { name, sets }]));
      P.setStringPref("zenith.internal.theme", name);
      this.show("themes");
    });
    grid.append(save);
    this.body.append(grid);
  },

  // Bars: which bar (every one, or one of those that are on), then its settings.
  bars() {
    const on = barsOn();
    if (this.scope !== "all" && !on.includes(this.scope)) this.scope = "all";
    const which = node("div", { class: "zr-seg zr-scope", role: "radiogroup", "aria-label": "Which bar" });
    for (const [v, text] of [["all", "Every bar"], ...on.map(e => [e, `${e[0].toUpperCase()}${e.slice(1)}`])]) {
      const b = node("button", { type: "button", class: "zr-opt", value: v, role: "radio" }, text);
      b.toggleAttribute("current", v === this.scope);
      b.addEventListener("click", () => {
        this.scope = v;
        this.show("bars");
      });
      which.append(b);
    }
    this.body.append(node("div", { class: "zr-field" }, node("div", { class: "zr-field-head" }, node("h3", {}, "Which bar")), which));
    if (!on.length) this.body.append(node("p", { class: "zr-desc" }, "No bar is on: Settings › Bars turns one on."));
    for (const k of BAR_SETTINGS) this.setting(field(`bar:${k}`, this.scope));
  },

  // Font: the installed fonts, each in its own face, for the browser or the
  // bars (every bar, or one). A bar's font is the browser's unless it has
  // its own; the browser's is your system's unless you pick one.
  async fonts() {
    const on = barsOn();
    if (!["browser", "all", ...on].includes(this.fontFor)) this.fontFor = "browser";
    const which = node("div", { class: "zr-seg zr-scope", role: "radiogroup", "aria-label": "Whose font" });
    for (const [v, text] of [["browser", "The browser"], ["all", "Every bar"], ...on.map(e => [e, `The ${e} bar`])]) {
      const b = node("button", { type: "button", class: "zr-opt", value: v, role: "radio" }, text);
      b.toggleAttribute("current", v === this.fontFor);
      b.addEventListener("click", () => {
        this.fontFor = v;
        this.show("font");
      });
      which.append(b);
    }
    const bars = this.fontFor !== "browser";
    const find = node("input", { type: "search", class: "zr-search", placeholder: "Find a font", "aria-label": "Find a font" });
    const list = node("div", { class: "zr-fonts" });
    this.body.append(node("div", { class: "zr-field" }, node("div", { class: "zr-field-head" }, node("h3", {}, "Whose font"), node("span", { class: "zr-was", field: "font" })),
      node("p", { class: "zr-desc" }, bars ? SCHEMA["zenith.bar.font"]?.desc ?? "" : SCHEMA["zenith.core.font"]?.desc ?? ""), which, find, list));
    const all = await allFonts();
    if (this.cat !== "font") return;
    const draw = () => {
      const q = find.value.trim().toLowerCase();
      const pick = name => {
        const b = node("button", { type: "button", class: "zr-font", value: name }, name || (bars ? "The browser's font" : "Your system's font"));
        if (name) b.style.fontFamily = `"${name}"`;
        b.addEventListener("click", () => this.chooseFont(name));
        return b;
      };
      list.replaceChildren(pick(""), ...all.filter(f => !q || f.toLowerCase().includes(q)).slice(0, 200).map(pick));
      this.mark();
    };
    find.addEventListener("input", draw);
    draw();
    find.focus();
  },

  // The font picked for whose it is ("": the browser's, or your system's).
  fontNow() {
    if (this.fontFor === "browser") return P.getStringPref("zenith.core.font", "");
    return this.fontFor === "all" ? value("zenith.bar.font") : Bars.value(this.fontFor, "font");
  },

  chooseFont(name) {
    if (this.fontFor !== "browser") return Bars.set(this.fontFor, "font", name);
    if (name) set("zenith.core.font", name);
    else P.clearUserPref("zenith.core.font");
  },

  // Menus and buttons: where Glance's and Peek's buttons sit, and each
  // right-click menu item shown, in More, or off.
  menus() {
    this.setting(field("zenith.plus.glance-buttons"));
    const M = window.ZenithMenus;
    if (!M) return;
    for (const [menu, title] of MENUS) {
      const list = node("div", { class: "zr-items" });
      for (const item of M.items(menu)) {
        const seg = node("div", { class: "zr-seg", item: item.id });
        for (const [v, text] of PLACES) {
          const b = node("button", { type: "button", class: "zr-opt", value: v }, text);
          b.addEventListener("click", () => {
            const all = M.places();
            if (v === (item.rare && P.getBoolPref("zenith.plus.more-menu", true) ? "more" : "shown")) delete all[item.id];
            else all[item.id] = v;
            P.setStringPref(M.PLACES, JSON.stringify(all));
          });
          seg.append(b);
        }
        list.append(node("div", { class: "zr-item" }, node("span", {}, item.label), seg));
      }
      this.body.append(node("div", { class: "zr-field" }, node("div", { class: "zr-field-head" }, node("h3", {}, title)), list));
    }
  },

  // What's chosen now, lit; a changed setting's default, with Reset; a
  // setting a bar's look doesn't use, said why.
  mark() {
    if (!this.host) return;
    for (const f of this.fields ?? []) {
      const now = f.now(), box = this.host.querySelector(`[kind][field="${f.id}"]`);
      if (box?.getAttribute("kind") === "slider") {
        const range = box.querySelector("input");
        range.value = String(f.stops.at(now));
        this.slid(range, box.querySelector("output"), f.stops);
      } else if (box) {
        for (const c of box.children) {
          c.toggleAttribute("current", c.getAttribute("value") === String(now));
          c.setAttribute("aria-checked", String(c.getAttribute("value") === String(now)));
        }
      }
      const was = this.host.querySelector(`.zr-was[field="${f.id}"]`);
      if (was) {
        const parts = [];
        if (f.changed()) {
          const reset = node("button", { type: "button", class: "zr-link" }, "Reset");
          reset.addEventListener("click", () => f.write(f.base()));
          parts.push(node("span", {}, `Default: ${short(f.options.find(o => o.value === f.base())?.label ?? (f.range ? `${f.base()}px` : f.base()))}`), reset);
        }
        was.replaceChildren(...parts);
      }
      const why = this.host.querySelector(`.zr-why[field="${f.id}"]`);
      if (why) {
        const fixed = f.fixed?.() ?? null, others = f.others?.() ?? [];
        why.textContent = fixed ?? (others.length ? `Not on ${others.map(([e, v]) => `the ${e} bar (${short(f.options.find(o => o.value === v)?.label ?? v)})`).join(", ")}: it has its own` : "");
        this.host.querySelector(`.zr-field[field="${f.id}"]`)?.toggleAttribute("off", !!fixed);
      }
    }
    const theme = P.getStringPref("zenith.internal.theme", "Zenith");
    for (const c of this.host.querySelectorAll(".zr-card[theme]")) c.toggleAttribute("current", c.getAttribute("theme") === theme);
    const M = window.ZenithMenus;
    for (const seg of this.host.querySelectorAll(".zr-seg[item]")) {
      const id = seg.getAttribute("item"), rare = (M?.MENUS.contentAreaContextMenu ?? []).concat(M?.MENUS.tabContextMenu ?? []).includes(id);
      const now = M?.place(id, rare);
      for (const b of seg.children) b.toggleAttribute("current", b.getAttribute("value") === now);
    }
    const fontWas = this.host.querySelector('.zr-was[field="font"]');
    if (fontWas) {
      const font = this.fontNow();
      for (const f of this.host.querySelectorAll(".zr-font")) f.toggleAttribute("current", f.getAttribute("value") === font);
      const reset = node("button", { type: "button", class: "zr-link" }, "Reset");
      reset.addEventListener("click", () => this.chooseFont(""));
      fontWas.replaceChildren(...(font ? [node("span", {}, `Default: ${this.fontFor === "browser" ? "your system's font" : "the browser's font"}`), reset] : []));
    }
  },
};
