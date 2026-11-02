/* --- Window material: Windows' backdrop, macOS vibrancy, Linux see-through -
   Zen draws its window over the system's own material, set by a few number
   and switch settings Zen's mod settings can't hold. The Plus settings for
   each platform write them ("Zen default" hands them back). Windows and
   macOS switch at once; Linux needs a restart. A value you had set yourself
   before Zenith took over is kept and put back. */
const WindowMaterial = {
  PREFS: ["zenith.plus.material-windows", "zenith.plus.material-macos", "zenith.plus.material-linux"],

  // The platform's settings and the values Zenith wants (null: Zen's own).
  wanted() {
    const s = name => Services.prefs.getStringPref(name, "");
    switch (Services.appinfo.OS) {
      case "WINNT": {
        // "" is Wallpaper (Zenith draws it; see Wallpaper below) and "zen"
        // Zen's own: both leave Windows' backdrop to Zen.
        const v = s("zenith.plus.material-windows");
        const own = v === "" || v === "zen";
        return {
          "widget.windows.mica": own ? null : v !== "off",
          "widget.windows.mica.toplevel-backdrop": { auto: 0, mica: 1, acrylic: 2, "mica-alt": 3 }[v] ?? null,
        };
      }
      case "Darwin": {
        const v = s("zenith.plus.material-macos");
        const material = { hud: 1, fullscreen: 2, popover: 3, menu: 4, tooltip: 5, header: 6, under: 7 }[v];
        return { "zen.widget.macos.window-vibrancy": v ? v !== "off" : null, "zen.widget.macos.window-material": material ?? null };
      }
      default: {
        const v = s("zenith.plus.material-linux");
        return { "zen.widget.linux.transparency": v ? v === "on" : null };
      }
    }
  },

  init() {
    const apply = () => this.apply();
    this.PREFS.forEach(p => Services.prefs.addObserver(p, apply));
    onUnload(() => this.PREFS.forEach(p => Services.prefs.removeObserver(p, apply)));
    this.apply();
  },

  apply() {
    Bridge.apply("material", this.wanted());
  },
};

