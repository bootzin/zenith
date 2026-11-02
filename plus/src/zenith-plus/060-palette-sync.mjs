/* --- Palette sync: the spaces follow pywal or wallust ------------------------
   pywal (and winwal on Windows) writes the colours it takes from your
   wallpaper to ~/.cache/wal/colors.json; wallust can write the same file
   (a template, to ~/.cache/wallust/colors.json). With Palette sync on, every
   space takes that palette's most striking colours (one, two or three, as
   with colours from an image) the moment the file changes, and once at
   start if it changed while Zen was closed. :colours undo puts the spaces
   back as they were. */
const PaletteSync = {
  PREF: "zenith.plus.palette-sync",
  DONE: "zenith.internal.palette.applied",
  FILES: { pywal: [".cache/wal/colors.json"], wallust: [".cache/wallust/colors.json", ".config/wallust/colors.json"] },

  init() {
    let timer = null;
    const check = () => {
      const on = !["", "off"].includes(Services.prefs.getStringPref(this.PREF, ""));
      if (on && !timer) timer = setInterval(() => document.hidden || this.check(), 5000);
      if (!on && timer) timer = clearInterval(timer);
      if (on) this.check();
    };
    Services.prefs.addObserver(this.PREF, check);
    window.addEventListener("focus", check);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, check);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    });
    window.ZenithPalette = this; // for tools/checks
    check();
  },

  async file(kind) {
    // (zenith.internal.palette.home: another home folder, for tools/checks.)
    const home = Services.prefs.getStringPref("zenith.internal.palette.home", "") || Services.dirsvc.get("Home", Ci.nsIFile).path;
    for (const rel of this.FILES[kind] ?? []) {
      const path = PathUtils.join(home, ...rel.split("/"));
      if (await IOUtils.exists(path)) return path;
    }
    return null;
  },

  async check() {
    const kind = Services.prefs.getStringPref(this.PREF, "");
    if (!kind || kind === "off" || this.busy) return;
    // Only the window in front changes the spaces (they're shared).
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    this.busy = true;
    try {
      // Your wallpaper (the one Zenith draws: Window material › Wallpaper):
      // when it changes, the spaces take its colours.
      if (kind === "wallpaper") {
        if (!Wallpaper.url || !Wallpaper.sig) return;
        const sig = `wallpaper:${Wallpaper.sig}`;
        if (sig === Services.prefs.getStringPref(this.DONE, "")) return;
        const W = window.gZenWorkspaces;
        const all = Services.prefs.getStringPref("zenith.plus.palette-spaces", "") !== "current";
        const spaces = all ? (W?.getWorkspaces?.() ?? []) : [W?.getActiveWorkspace?.()].filter(Boolean);
        const bitmap = await createImageBitmap(await (await fetch(Wallpaper.url)).blob());
        if (ImageColours.apply(bitmap, "your wallpaper", spaces)) Services.prefs.setStringPref(this.DONE, sig);
        return;
      }
      const path = await this.file(kind);
      if (!path) return;
      const text = await IOUtils.readUTF8(path);
      if (text === this.last) return;
      this.last = text;
      const sig = `${kind}:${text.length}:${[...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)}`;
      if (sig === Services.prefs.getStringPref(this.DONE, "")) return;
      if (this.apply(JSON.parse(text))) Services.prefs.setStringPref(this.DONE, sig);
    } catch (e) {
      console.error("[Zenith] palette sync", e);
    } finally {
      this.busy = false;
    }
  },

  // pywal's colors.json: colours 1–6 are the palette's accents (0 and 7
  // are its background and text, 8–15 brighter copies).
  hues(json) {
    const C = ImageColours;
    const gap = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
    const all = [1, 2, 3, 4, 5, 6].map(i => json.colors?.[`color${i}`]).filter(v => /^#[0-9a-f]{6}$/i.test(v ?? "")).map(hex => {
      const [L, a, b] = C.lab([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
      return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
    });
    const hues = all.filter(f => f.C >= 0.03).sort((x, y) => y.C - x.C);
    if (!hues.length) return all.length ? [{ ...all[0], C: 0 }] : [];
    const chosen = [hues[0]];
    for (const h of hues.slice(1)) {
      if (chosen.length === 3) break;
      if (h.C >= 0.4 * chosen[0].C && chosen.every(c => gap(c.h, h.h) >= 30)) chosen.push(h);
    }
    return chosen;
  },

  apply(json) {
    const W = window.gZenWorkspaces, picker = window.gZenThemePicker;
    const hues = this.hues(json);
    if (!hues.length || !W || !picker) return false;
    const colours = ImageColours.colours(hues);
    const [r, g, b] = colours[0].map(v => v / 255);
    const lightness = Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100);
    const dots = colours.map((c, i) => ({ c, isCustom: false, isPrimary: i === 0, algorithm: "floating", lightness, type: "explicit-lightness" }));
    // Every space, or only the one you're in (Palette sync colours).
    const all = Services.prefs.getStringPref("zenith.plus.palette-spaces", "") !== "current";
    const spaces = all ? (W.getWorkspaces?.() ?? []) : [W.getActiveWorkspace?.()].filter(Boolean);
    ImageColours.previous = spaces.map(s => ({ uuid: s.uuid, theme: structuredClone(s.theme) }));
    for (const space of spaces) {
      const opacity = space.theme?.opacity ?? 0.5, texture = space.theme?.texture ?? 0;
      space.theme = picker.constructor.getTheme?.(structuredClone(dots), opacity, texture) ?? { type: "gradient", gradientColors: structuredClone(dots), opacity, texture };
      W.saveWorkspace(space);
    }
    const active = W.getActiveWorkspace?.();
    if (active) picker.onWorkspaceChange(active);
    hint(`${all ? "Spaces follow" : "This space follows"} your palette: ${colours.length === 1 ? "one colour" : `${colours.length} colours`}`);
    return true;
  },
};

