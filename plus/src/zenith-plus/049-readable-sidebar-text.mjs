/* --- Readable sidebar text: light or dark by what's really behind it ----------------
   Zen picks light or dark text from a space's colour alone, but what the
   sidebar shows is that colour over Zenith's glass and the wallpaper: a
   light colour over a dark desktop came out dark on dark (and the other
   way round). Zenith looks at the sidebar as it's drawn (a small picture of
   a strip of it, the middle brightness, so text and the tab you're on don't
   count) and sets its text, and the bar's, to whichever reads better. Only
   when a space's colours, the wallpaper, the window's place on it or its
   material change (about 5 ms each time). Settings › Theme › Sidebar text:
   "As Zen decides" hands it back. */
const InkContrast = {
  PREF: "zenith.plus.ink",

  init() {
    const soon = () => this.soon();
    const mo = new MutationObserver(soon);
    mo.observe(root, { attributes: true, attributeFilter: ["style", "zen-should-be-dark-mode", "zen-compact-mode", "zenith-wallpaper"] });
    const palette = new MutationObserver(() => this.measure(true));
    palette.observe(root, { attributes: true, attributeFilter: ["zenith-palette"] });
    this.media = window.matchMedia("(prefers-color-scheme: dark)");
    this.media.addEventListener("change", soon);
    for (const t of ["ZenithWallpaperDrawn", "activate", "sizemodechange"]) window.addEventListener(t, soon);
    for (const p of [this.PREF, "zenith.plus.material-windows"]) Services.prefs.addObserver(p, soon);
    onUnload(() => {
      mo.disconnect();
      palette.disconnect();
      this.media.removeEventListener("change", soon);
      for (const t of ["ZenithWallpaperDrawn", "activate", "sizemodechange"]) window.removeEventListener(t, soon);
      for (const p of [this.PREF, "zenith.plus.material-windows"]) Services.prefs.removeObserver(p, soon);
      clearTimeout(this.timer);
    });
    window.ZenithInk = this; // for tools/checks
    this.soon();
  },

  soon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.measure(), 400);
  },

  sig() {
    return [root.style.getPropertyValue("--zen-primary-color"), root.getAttribute("zen-should-be-dark-mode"), root.getAttribute("zen-compact-mode"),
            Wallpaper.sig, Wallpaper.at, this.media.matches, Services.prefs.getStringPref("zenith.plus.material-windows", "")].join("|");
  },

  measure(force = false) {
    if (Services.prefs.getStringPref(this.PREF, "") === "zen") {
      root.removeAttribute("zenith-ink");
      this.last = null;
      return null;
    }
    const pal = root.getAttribute("zenith-palette");
    if (pal) {
      const ink = pal === "light" ? "dark" : "light";
      if (root.getAttribute("zenith-ink") !== ink) root.setAttribute("zenith-ink", ink);
      this.last = null;
      return { ink, palette: pal };
    }
    if (document.hidden) return null;
    const sig = this.sig();
    if (sig === this.last && !force) return null;
    // The sidebar, or (hidden away in compact mode) the bar, which sits on the same colours.
    const side = gNavToolbox.getBoundingClientRect();
    const box = side.width > 40 && side.right > 40 ? side : document.querySelector(".zenith-bar")?.getBoundingClientRect();
    if (!box?.width) return null;
    this.last = sig;
    try {
      // A strip down its right third (the tabs' text sits to the left), a tenth the size.
      const k = 0.1, x = box.left + box.width * 0.62, w = box.width * 0.3;
      const c = (this.canvas ??= document.createElementNS(HTML_NS, "canvas"));
      c.width = Math.max(1, Math.ceil(w * k));
      c.height = Math.max(1, Math.ceil(box.height * k));
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.setTransform(k, 0, 0, k, 0, 0);
      // (Behind a see-through window: the system's own backdrop, about.)
      ctx.drawWindow(window, x, box.top, w, box.height, this.media.matches ? "rgb(32,32,32)" : "rgb(243,243,243)");
      const d = ctx.getImageData(0, 0, c.width, c.height).data, L = [];
      const lin = v => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      for (let i = 0; i < d.length; i += 4) L.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
      L.sort((a, b) => a - b);
      const mid = L[L.length >> 1];
      // White or black text, whichever has the more contrast.
      const ink = 1.05 / (mid + 0.05) >= (mid + 0.05) / 0.05 ? "light" : "dark";
      root.setAttribute("zenith-ink", ink);
      return { ink, luminance: mid };
    } catch (e) {
      console.error("[Zenith] sidebar text", e);
      return null;
    }
  },
};

