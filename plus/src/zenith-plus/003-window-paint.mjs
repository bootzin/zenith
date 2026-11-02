/* --- Window paint: the space's colours, for Zenith's glass ----------------
   Zen paints a space's colours as a gradient, at the space's opacity. Core's
   glass is one colour (--zth-paint) mixed into a neutral base at a share
   (--zth-paint-share). Plus copies them from what Zen paints:
     Space colour  "Its gradient" (default): the window around the page shows
                   Zen's own gradient, each colour mixed into the base
                   (--zth-desk-paint), and panels take its most vivid colour;
                   "One tint": all of them averaged into one (0.11.0's look)
     Strength      "Zen's own": the space's opacity; "Medium" (default) and
                   "Strong": at least 45% or 70%, so a space's colours read
                   even at a low opacity. Zen's default (no colours) is left
                   as Zen sets it. */
const WindowPaint = {
  MODE: "zenith.plus.space-colour", // "" gradient · tint
  STRENGTH: "zenith.plus.colour-strength", // "" medium · zen · strong
  RGBA: /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/g,

  colours(value) {
    const found = [...value.matchAll(this.RGBA)];
    return found.map(m => {
      let a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (m[4]?.endsWith("%")) a /= 100;
      return [+m[1], +m[2], +m[3], a];
    });
  },

  init() {
    const bg = document.getElementById("zen-browser-background");
    if (!bg) return;
    this.bg = bg;
    const copy = () => this.copy();
    const mo = new MutationObserver(copy);
    mo.observe(bg, { attributes: true, attributeFilter: ["style"] });
    for (const p of [this.MODE, this.STRENGTH]) Services.prefs.addObserver(p, copy);
    onUnload(() => {
      mo.disconnect();
      for (const p of [this.MODE, this.STRENGTH]) Services.prefs.removeObserver(p, copy);
    });
    copy();
  },

  share(alpha) {
    if (root.hasAttribute("zen-default-theme")) return alpha;
    const floor = { zen: 0, strong: 0.7 }[Services.prefs.getStringPref(this.STRENGTH, "")] ?? 0.45;
    return Math.min(1, Math.max(alpha, floor));
  },

  copy() {
    const value = this.bg.style.getPropertyValue("--zen-main-browser-background");
    const colours = this.colours(value);
    if (!colours.length) {
      for (const v of ["--zth-paint", "--zth-paint-share", "--zth-desk-paint"]) root.style.removeProperty(v);
      return;
    }
    const gradient = Services.prefs.getStringPref(this.MODE, "") !== "tint";
    const avg = i => colours.reduce((n, c) => n + c[i], 0) / colours.length;
    const chroma = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);
    const paint = gradient ? colours.reduce((a, c) => (chroma(c) > chroma(a) ? c : a)) : [0, 1, 2].map(i => Math.round(avg(i)));
    const share = Math.round(this.share(avg(3)) * 100);
    root.style.setProperty("--zth-paint", `rgb(${paint.slice(0, 3).map(Math.round).join(" ")})`);
    root.style.setProperty("--zth-paint-share", `${share}%`);
    if (gradient && colours.length > 1) {
      // Zen's own gradient, each colour in the glass's recipe, over the
      // glass colour (for its transparent parts).
      const mixed = value.replace(this.RGBA, (m, r, g, b) =>
        `color-mix(in srgb, color-mix(in srgb, rgb(${r} ${g} ${b}) ${share}%, var(--zth-mica)) calc(var(--zth-desk-alpha) * 100%), transparent)`);
      root.style.setProperty("--zth-desk-paint",
        `${mixed}, color-mix(in srgb, var(--zth-glass-color) calc(var(--zth-desk-alpha) * 100%), transparent)`);
    } else {
      root.style.removeProperty("--zth-desk-paint");
    }
  },
};

