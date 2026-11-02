/* --- Palettes: one palette for the whole browser ------------------------------------
   Settings › Bars › Palette: Catppuccin, Tokyo Night, Gruvbox, Nord, Rosé
   Pine, Everforest, Kanagawa, Dracula. A palette colours the bar, Zenith's
   accent and every space (Zen's own colours, as Palette sync does: the
   accent as the space's main colour, the palette's base around it), so a
   rice is one palette everywhere. The spaces' own colours are kept the
   first time and come back with "Your own colours". */
const PALETTES = {
  "catppuccin-mocha": { base: "#1e1e2e", mantle: "#181825", surface: "#313244", overlay: "#6c7086", text: "#cdd6f4", accent: "#cba6f7", second: "#89b4fa", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af" },
  "catppuccin-macchiato": { base: "#24273a", mantle: "#1e2030", surface: "#363a4f", overlay: "#6e738d", text: "#cad3f5", accent: "#c6a0f6", second: "#8aadf4", red: "#ed8796", green: "#a6da95", yellow: "#eed49f" },
  "catppuccin-frappe": { base: "#303446", mantle: "#292c3c", surface: "#414559", overlay: "#737994", text: "#c6d0f5", accent: "#ca9ee6", second: "#8caaee", red: "#e78284", green: "#a6d189", yellow: "#e5c890" },
  "catppuccin-latte": { light: true, base: "#eff1f5", mantle: "#e6e9ef", surface: "#ccd0da", overlay: "#9ca0b0", text: "#4c4f69", accent: "#8839ef", second: "#1e66f5", red: "#d20f39", green: "#40a02b", yellow: "#df8e1d" },
  "tokyo-night": { base: "#1a1b26", mantle: "#16161e", surface: "#292e42", overlay: "#565f89", text: "#c0caf5", accent: "#7aa2f7", second: "#bb9af7", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68" },
  "gruvbox-dark": { base: "#282828", mantle: "#1d2021", surface: "#3c3836", overlay: "#928374", text: "#ebdbb2", accent: "#fe8019", second: "#fabd2f", red: "#fb4934", green: "#b8bb26", yellow: "#fabd2f" },
  "gruvbox-light": { light: true, base: "#fbf1c7", mantle: "#f2e5bc", surface: "#ebdbb2", overlay: "#928374", text: "#3c3836", accent: "#af3a03", second: "#b57614", red: "#9d0006", green: "#79740e", yellow: "#b57614" },
  nord: { base: "#2e3440", mantle: "#272c36", surface: "#3b4252", overlay: "#4c566a", text: "#eceff4", accent: "#88c0d0", second: "#81a1c1", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b" },
  "rose-pine": { base: "#191724", mantle: "#16141f", surface: "#26233a", overlay: "#6e6a86", text: "#e0def4", accent: "#c4a7e7", second: "#ebbcba", red: "#eb6f92", green: "#9ccfd8", yellow: "#f6c177" },
  "rose-pine-dawn": { light: true, base: "#faf4ed", mantle: "#f2e9e1", surface: "#f2e9e1", overlay: "#9893a5", text: "#575279", accent: "#907aa9", second: "#d7827e", red: "#b4637a", green: "#56949f", yellow: "#ea9d34" },
  everforest: { base: "#2d353b", mantle: "#232a2e", surface: "#3d484d", overlay: "#859289", text: "#d3c6aa", accent: "#a7c080", second: "#83c092", red: "#e67e80", green: "#a7c080", yellow: "#dbbc7f" },
  kanagawa: { base: "#1f1f28", mantle: "#16161d", surface: "#2a2a37", overlay: "#727169", text: "#dcd7ba", accent: "#7e9cd8", second: "#957fb8", red: "#ff5d62", green: "#98bb6c", yellow: "#e6c384" },
  dracula: { base: "#282a36", mantle: "#21222c", surface: "#44475a", overlay: "#6272a4", text: "#f8f8f2", accent: "#bd93f9", second: "#ff79c6", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c" },
};

window.ZenithPaletteColours = PALETTES; // the rice picker's swatches

const Palettes = {
  PREF: "zenith.palette",
  SAVED: "zenith.internal.palette.own-spaces", // { uuid: theme } as they were before a palette
  DONE: "zenith.internal.palette.spaces",      // the palette (and its colours) the spaces have
  COMPUTED: "zenith.internal.palette.computed", // { name, pal }: the last palette made from a wallpaper or a file
  // Palettes made on the fly, as a rice's are: your wallpaper's (as
  // wallbash or matugen), or pywal's or wallust's colours file.
  SOURCES: { wallpaper: "your wallpaper", pywal: "pywal", wallust: "wallust" },

  init() {
    window.ZenithPalettes = this; // the settings page's swatches, tools/checks
    this.migrate();
    const apply = () => this.apply();
    for (const p of [this.PREF, "zenith.plus.palette-spaces"]) Services.prefs.addObserver(p, apply);
    // A new wallpaper; the file pywal or wallust writes, looked at every
    // few seconds while the window is in front (a changed date: read again).
    const drawn = () => this.name() === "wallpaper" && this.apply(true);
    window.addEventListener("ZenithWallpaperDrawn", drawn);
    const look = async () => {
      const name = this.name();
      if (!["pywal", "wallust"].includes(name) || document.hidden || !document.hasFocus()) return;
      const path = await PaletteSync.file(name);
      const stamp = path ? (await IOUtils.stat(path).catch(() => null))?.lastModified : null;
      if (stamp && stamp !== this.stamp) {
        this.stamp = stamp;
        this.apply(true);
      }
    };
    const timer = setInterval(look, 5000);
    onUnload(() => {
      for (const p of [this.PREF, "zenith.plus.palette-spaces"]) Services.prefs.removeObserver(p, apply);
      window.removeEventListener("ZenithWallpaperDrawn", drawn);
      clearInterval(timer);
    });
    this.apply();
  },

  // 0.15's Palette sync is a palette now.
  migrate() {
    const P = Services.prefs, OLD = "zenith.plus.palette-sync";
    if (!P.prefHasUserValue(OLD)) return;
    const v = P.getStringPref(OLD, "");
    if (v in this.SOURCES && !P.getStringPref(this.PREF, "")) P.setStringPref(this.PREF, v);
    P.clearUserPref(OLD);
  },

  name() {
    const v = Services.prefs.getStringPref(this.PREF, "");
    return v in PALETTES || v in this.SOURCES ? v : "";
  },

  rgb(hex) {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  },

  hex(rgb) {
    return `#${rgb.map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  },

  mix(x, y, t) {
    const a = this.rgb(x), b = this.rgb(y);
    return this.hex(a.map((v, i) => v * (1 - t) + b[i] * t));
  },

  luminance(hex) {
    const lin = v => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = this.rgb(hex).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  },

  // A palette's colours (the settings page's swatches): named ones as they
  // are, made ones as they were last made.
  colours(name) {
    if (PALETTES[name]) return PALETTES[name];
    try {
      const c = JSON.parse(Services.prefs.getStringPref(this.COMPUTED, "") || "null");
      return c?.name === name ? c.pal : null;
    } catch {
      return null;
    }
  },

  // pywal's or wallust's colors.json: 0 the background, 7 (or the special
  // foreground) the text, 1–6 the accents (the most colourful first), 8 the muted.
  fromWal(j) {
    const c = i => (/^#[0-9a-f]{6}$/i.test(j.colors?.[`color${i}`] ?? "") ? j.colors[`color${i}`] : null);
    const bg = j.special?.background ?? c(0), fg = j.special?.foreground ?? c(7) ?? c(15);
    if (!bg || !fg) return null;
    const vivid = [1, 2, 3, 4, 5, 6].map(c).filter(Boolean).map(hex => {
      const [L, a, b] = ImageColours.lab(this.rgb(hex));
      return [Math.hypot(a, b), hex];
    }).sort((x, y) => y[0] - x[0]).map(([, hex]) => hex);
    const light = this.luminance(bg) > 0.4;
    return { light, base: bg, mantle: this.mix(bg, light ? "#ffffff" : "#000000", 0.25), surface: this.mix(bg, fg, 0.12),
             overlay: c(8) ?? this.mix(bg, fg, 0.45), text: fg, accent: vivid[0] ?? c(4) ?? fg, second: vivid[1] ?? c(5) ?? fg,
             red: c(1) ?? "#e06c75", green: c(2) ?? "#98c379", yellow: c(3) ?? "#e5c07b" };
  },

  // A palette from a picture, as wallbash and matugen do: dark or light by
  // the picture, the base a quiet tint of its main colour, the accents its
  // most striking colours.
  async fromImage(blob) {
    const bitmap = await createImageBitmap(blob);
    try {
      const hues = ImageColours.palette(bitmap);
      const c = document.createElementNS(HTML_NS, "canvas");
      c.width = c.height = 16;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += ImageColours.lab([d[i], d[i + 1], d[i + 2]])[0];
      const dark = sum / (d.length / 4) < 0.62;
      const h0 = hues[0] ?? { h: 260, C: 0.05 }, h1 = hues[1] ?? { h: (h0.h + 40) % 360, C: h0.C };
      const at = (L, C, h) => this.hex(ImageColours.rgb(L, C, h));
      const tint = Math.min(0.035, h0.C * 0.35), pop = h => Math.max(0.08, Math.min(0.17, h.C * 1.2));
      const A = dark ? 0.76 : 0.52;
      return {
        light: !dark,
        base: at(dark ? 0.21 : 0.96, tint, h0.h), mantle: at(dark ? 0.17 : 0.92, tint, h0.h),
        surface: at(dark ? 0.29 : 0.88, tint, h0.h), overlay: at(dark ? 0.56 : 0.6, tint, h0.h),
        text: at(dark ? 0.93 : 0.26, 0.012, h0.h),
        accent: at(A, pop(h0), h0.h), second: at(A, pop(h1), h1.h),
        red: at(A, 0.14, 25), green: at(A, 0.13, 145), yellow: at(dark ? 0.84 : 0.62, 0.13, 90),
      };
    } finally {
      bitmap.close();
    }
  },

  // Make a palette from a wallpaper or a file (kept for the swatches, and
  // for a start before the source is read again).
  async make(name) {
    try {
      let pal = null;
      if (name === "wallpaper") {
        if (Wallpaper.url) pal = await this.fromImage(await (await fetch(Wallpaper.url)).blob());
      } else {
        const path = await PaletteSync.file(name);
        if (path) pal = this.fromWal(JSON.parse(await IOUtils.readUTF8(path)));
      }
      if (pal) Services.prefs.setStringPref(this.COMPUTED, JSON.stringify({ name, pal }));
      else hint(name === "wallpaper" ? "No wallpaper to take colours from (Window material: Wallpaper)" : `No ${name} colours file found`);
      return pal ?? this.colours(name);
    } catch (e) {
      console.error("[Zenith] palette", e);
      return this.colours(name);
    }
  },

  async apply(again = false) {
    const name = this.name();
    const pal = PALETTES[name] ?? (name ? (again ? await this.make(name) : (this.colours(name) ?? (await this.make(name)))) : null);
    if (name !== this.name()) return; // (changed meanwhile)
    // The bar and Zenith's accent: properties on the window (plus/chrome.css).
    for (const k of ["base", "mantle", "surface", "overlay", "text", "accent", "second", "red", "green", "yellow"]) {
      if (pal) root.style.setProperty(`--zth-pal-${k}`, pal[k]);
      else root.style.removeProperty(`--zth-pal-${k}`);
    }
    if (pal) root.setAttribute("zenith-palette", pal.light ? "light" : "dark");
    else root.removeAttribute("zenith-palette");
    // The whole window light or dark as the palette is (Zen's own Window
    // scheme, given back with no palette), so Zen's colours, its text and
    // the bar's background agree with the palette's.
    Bridge.apply("palette-scheme", {
      "zen.view.window.scheme": pal ? (pal.light ? 1 : 0) : null,
      "browser.theme.toolbar-theme": pal ? (pal.light ? 1 : 0) : null,
    });
    // The spaces are shared: the window in front changes them, once per palette (and its colours).
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const all = Services.prefs.getStringPref("zenith.plus.palette-spaces", "") !== "current";
    const sig = pal ? `${name}:${all ? "all" : "here"}:${[...JSON.stringify(pal)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)}` : "";
    if (Services.prefs.getStringPref(this.DONE, "") === sig) return;
    try {
      if (pal) this.paint(pal, all);
      else this.giveBack();
      if (sig) Services.prefs.setStringPref(this.DONE, sig);
      else Services.prefs.clearUserPref(this.DONE);
    } catch (e) {
      console.error("[Zenith] palette", e);
    }
  },

  // Every space (or the one you're in): the palette's base, its accent as a
  // glow in one corner and as the space's main colour (Zen's accent).
  paint(pal, all = true) {
    const W = window.gZenWorkspaces, picker = window.gZenThemePicker;
    if (!W || !picker) return;
    const spaces = all ? (W.getWorkspaces?.() ?? []) : [W.getActiveWorkspace?.()].filter(Boolean);
    if (!Services.prefs.prefHasUserValue(this.SAVED)) {
      Services.prefs.setStringPref(this.SAVED, JSON.stringify(Object.fromEntries((W.getWorkspaces?.() ?? []).map(s => [s.uuid, s.theme ?? null]))));
    }
    const dot = (hex, primary, c = this.rgb(hex)) => {
      const [r, g, b] = c.map(v => v / 255);
      return { c, isCustom: false, isPrimary: primary, algorithm: "floating", type: "explicit-lightness",
               lightness: Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100) };
    };
    // (The glow is the accent mixed into the base, 40%: a narrow sidebar is
    // mostly that corner. Zen brightens its own accent from the hue; Zenith's
    // is the palette's exact one.)
    const base = this.rgb(pal.base), tint = this.rgb(pal.accent).map((v, i) => Math.round(v * 0.4 + base[i] * 0.6));
    const dots = [dot(pal.base, false), dot(null, true, tint), dot(pal.mantle, false)];
    for (const space of spaces) {
      const opacity = space.theme?.opacity ?? 0.5, texture = space.theme?.texture ?? 0;
      space.theme = picker.constructor.getTheme?.(structuredClone(dots), opacity, texture)
                    ?? { type: "gradient", gradientColors: structuredClone(dots), opacity, texture };
      W.saveWorkspace(space);
    }
    const active = W.getActiveWorkspace?.();
    if (active) picker.onWorkspaceChange(active);
  },

  giveBack() {
    const W = window.gZenWorkspaces, picker = window.gZenThemePicker;
    let saved = null;
    try {
      saved = JSON.parse(Services.prefs.getStringPref(this.SAVED, "null"));
    } catch {}
    if (!saved || !W || !picker) return;
    for (const space of W.getWorkspaces?.() ?? []) {
      if (!(space.uuid in saved)) continue;
      space.theme = saved[space.uuid] ?? undefined;
      W.saveWorkspace(space);
    }
    Services.prefs.clearUserPref(this.SAVED);
    const active = W.getActiveWorkspace?.();
    if (active) picker.onWorkspaceChange(active);
  },
};

