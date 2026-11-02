/* --- The rice picker (plus/pages/rice-picker.mjs), on demand ----------------
   Alt+Shift+P, the Dash's Looks tile, Settings › Theme. And the font
   (Theme › Font): one, for the whole browser, or your system's. */
const RicePicker = {
  init() {
    window.ZenithLooks = this; // the Dash, tools/checks (window.ZenithRice is the rice file)
    const commandset = document.createXULElement("commandset"), command = document.createXULElement("command");
    command.id = "zenith-rice-picker";
    command.addEventListener("command", () => this.toggle());
    const menus = document.createXULElement("command");
    menus.id = "zenith-menu-items";
    menus.addEventListener("command", () => this.toggle("menus"));
    commandset.append(command, menus);
    root.append(commandset);
    const font = () => {
      const f = Services.prefs.getStringPref("zenith.core.font", "").trim().replace(/["\\;{}]/g, "");
      root.toggleAttribute("zenith-font", !!f);
      if (f) root.style.setProperty("--zth-ui-font", `"${f}", system-ui, sans-serif`);
      else root.style.removeProperty("--zth-ui-font");
    };
    Services.prefs.addObserver("zenith.core.font", font);
    onUnload(() => Services.prefs.removeObserver("zenith.core.font", font));
    font();
  },

  async toggle(category) {
    try {
      this.mod ??= await import(await BarLoader.page("rice-picker.mjs"));
      return this.mod.Picker.toggle(category);
    } catch (e) {
      console.error("[Zenith] rice picker", e);
    }
  },
};

const OverviewLoader = {
  CORNER: "zenith.overview.corner", // top-left (as it comes), top-right, bottom-left, bottom-right, off

  init() {
    window.ZenithOverview = this; // the Shell's Alt+O, the bar, tools/checks
    const corner = () => this.corner();
    Services.prefs.addObserver(this.CORNER, corner);
    onUnload(() => {
      Services.prefs.removeObserver(this.CORNER, corner);
      this.spot?.remove();
    });
    corner();
  },

  async toggle() {
    try {
      this.mod ??= await import(await BarLoader.page("overview.mjs"));
      this.mod.toggle();
    } catch (e) {
      console.error("[Zenith] overview", e);
    }
  },

  get open() {
    return !!this.mod?.isOpen();
  },

  corner() {
    const where = Services.prefs.getStringPref(this.CORNER, "") || "top-left";
    this.spot?.remove();
    this.spot = null;
    if (where === "off" || window.zenithFloatFrom || root.hasAttribute("popup-window")) return;
    const spot = (this.spot = el("div", { id: "zenith-hot-corner", corner: where }));
    let wait = null;
    spot.addEventListener("mouseenter", () => {
      clearTimeout(wait);
      wait = setTimeout(() => spot.matches(":hover") && !this.open && this.toggle(), 70);
    });
    spot.addEventListener("mouseleave", () => clearTimeout(wait));
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(spot);
  },
};

