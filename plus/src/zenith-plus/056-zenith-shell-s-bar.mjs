/* --- Zenith Shell's bar: imported only while it's on ---------------------------
   The bar (Settings › Bar) is plus/pages/bar.mjs, imported into this window
   when it's on and stopped when it's off, so with the bar off none of it
   runs or is even read. A change to what's in it rebuilds it; its look
   changes in place. Not in a floating tab's window. */
const BarLoader = {
  EDGES: ["top", "bottom", "left", "right"],
  // What a bar can show, by the name its list uses, and how the settings
  // page's editor names it.
  MODULES: [
    ["launcher", "Switcher button"], ["spaces", "Spaces"], ["mode", "The Shell's mode (resize, passthrough)"],
    ["title", "The tab you're on"], ["tabs", "This space's tabs"], ["media", "What's playing"], ["downloads", "Downloads"],
    ["timers", "Timers"], ["trackers", "Trackers blocked"], ["weather", "Weather"], ["memory", "Memory the browser uses"],
    ["appearance", "Pages dark or light"], ["extensions", "Extensions"], ["clock", "Clock"],
    ["buttons", "The window's buttons"], ["power", "Power menu"], ["layout", "The layout (monocle, dwindle, master, scroller)"], ["overview", "Overview button"],
  ],
  // Each edge's list until you make your own: start | middle | end (top |
  // middle | bottom on the left and right), as waybar's modules-left,
  // modules-center and modules-right.
  DEFAULTS: {
    top: "launcher,spaces,mode|title|media,downloads,timers,trackers,appearance,extensions,clock,buttons",
    bottom: "spaces,mode|tabs|downloads,timers,clock",
    left: "launcher,spaces,mode|tabs|downloads,appearance,clock,power",
    right: "launcher,spaces,mode|tabs|downloads,appearance,clock,power",
  },
  get REBUILD() {
    return [...this.EDGES.flatMap(e => [`zenith.bar.${e}`, `zenith.bar.${e}.modules`, `zenith.bar.display-${e}`]),
            ...this.EDGES.map(e => `zenith.bar.${e}.icons`), "zenith.bar.side-width", "zenith.bar.icons", "zenith.bar.fullscreen"];
  },

  on(edge) {
    return !["", "off"].includes(Services.prefs.getStringPref(`zenith.bar.${edge}`, ""));
  },

  // An edge's modules: { left, centre, right }, names only Zenith knows.
  lists(edge) {
    const known = new Set(this.MODULES.map(m => m[0]));
    const list = Services.prefs.getStringPref(`zenith.bar.${edge}.modules`, "") || this.DEFAULTS[edge];
    const [l = "", c = "", r = ""] = list.split("|");
    const names = part => part.split(",").map(x => x.trim()).filter(x => known.has(x));
    return { left: names(l), centre: names(c), right: names(r) };
  },

  migrate() {
    const P = Services.prefs, OLD = "zenith.bar.position", TABS = "zenith.bar.tabs";
    // 0.17's "hides until reached" (a switch): 0.18's way it shows.
    for (const e of this.EDGES) {
      const old = `zenith.bar.hide-${e}`;
      if (!P.prefHasUserValue(old)) continue;
      if (P.getBoolPref(old, false) && !P.prefHasUserValue(`zenith.bar.display-${e}`)) P.setStringPref(`zenith.bar.display-${e}`, "hide");
      P.clearUserPref(old);
    }
    // 0.15.0's "The bar" (where) and "Where tabs are": the edges' bars and
    // the sidebar's setting, as they amounted to.
    if (P.prefHasUserValue(OLD) || P.prefHasUserValue(TABS)) {
      const pos = P.getStringPref(OLD, ""), tabs = P.getStringPref(TABS, "") || "sidebar";
      if (pos === "both") {
        P.setStringPref("zenith.bar.top", "status");
        P.setStringPref("zenith.bar.bottom", "tabs");
      } else if (pos === "top" || pos === "bottom") P.setStringPref(`zenith.bar.${pos}`, tabs === "bar" ? "both" : "status");
      if (tabs !== "sidebar") P.setStringPref("zenith.sidebar", tabs === "bar" ? "hidden" : "hover");
      P.clearUserPref(OLD);
      P.clearUserPref(TABS);
    }
    // 0.15.1's Status, Tabs or Both on each edge, with the modules switched
    // on or off for every bar and the window's buttons: each bar's own list.
    const TOGGLES = { launcher: ["launcher", true], media: ["media", true], downloads: ["downloads", true], timers: ["timers", true],
                      privacy: ["trackers", true], weather: ["weather", false], resources: ["memory", false],
                      appearance: ["appearance", true], tray: ["extensions", true] };
    const old = this.EDGES.filter(e => ["status", "tabs", "both"].includes(P.getStringPref(`zenith.bar.${e}`, "")));
    const had = n => (P.prefHasUserValue(`zenith.bar.${n}`) ? P.getBoolPref(`zenith.bar.${n}`, TOGGLES[n][1]) : TOGGLES[n][1]);
    if (old.length) {
      const what = Object.fromEntries(old.map(e => [e, P.getStringPref(`zenith.bar.${e}`, "")]));
      const buttonsAs = P.getStringPref("zenith.bar.buttons", "") || "window";
      const powerAt = buttonsAs === "power" ? ["top", "right", "left", "bottom"].find(e => what[e] === "status" || what[e] === "both") : null;
      for (const edge of old) {
        const vertical = edge === "left" || edge === "right", status = what[edge] !== "tabs";
        const left = status ? [had("launcher") && "launcher", "spaces", "mode"] : [];
        const right = status ? ["media", "downloads", "timers", "privacy", "weather", "resources", "appearance", "tray"]
          .filter(had).map(n => TOGGLES[n][0]).concat("clock") : [];
        const centre = what[edge] !== "status" ? ["tabs"] : !vertical && P.getStringPref("zenith.bar.title", "") !== "off" ? ["title"] : [];
        if (edge === "top" && buttonsAs === "window") right.push("buttons");
        if (edge === powerAt) right.push("power");
        P.setStringPref(`zenith.bar.${edge}.modules`, [left.filter(Boolean), centre, right].map(x => x.join(",")).join("|"));
        P.setStringPref(`zenith.bar.${edge}`, "on");
      }
    }
    for (const n of [...Object.keys(TOGGLES), "buttons"]) P.clearUserPref(`zenith.bar.${n}`);
    if (P.getStringPref("zenith.bar.title", "") === "off") P.clearUserPref("zenith.bar.title");
  },

  // A hiding bar on the sidebar's side turns its hover off there: said when
  // it happens (the bar set to hide, or the sidebar set to hover beside it).
  tellSidebar() {
    const P = Services.prefs, side = root.getAttribute("zen-right-side") === "true" ? "right" : "left";
    if ((P.getStringPref("zenith.sidebar", "") || "shown") !== "hover" || !this.on(side) || P.getStringPref(`zenith.bar.display-${side}`, "") !== "hide") return;
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    notice({
      title: "The sidebar won't open on hover here",
      body: `While the ${side} bar hides on the sidebar's side, reaching that edge brings the bar, not the sidebar. Ctrl+Alt+S still opens the sidebar.`,
      actions: [{ label: "Keep the bar on screen", run: () => P.clearUserPref(`zenith.bar.display-${side}`) }],
    });
  },

  init() {
    this.migrate();
    // Settings as everything reads them (plus/pages/looks.mjs), brought up
    // to date before a bar is drawn.
    this.ready = this.page("looks.mjs").then(u => import(u)).then(L => {
      window.ZenithSettings = L; // (window.ZenithLooks is the rice picker)
      L.migrate();
    }).catch(e => console.error("[Zenith] settings", e));
    // (An observer sees a setting's whole branch: zenith.bar.top's covers
    // that bar's own look, which bar.mjs changes in place.)
    const apply = (s, t, pref) => {
      if (/^zenith\.bar\.(top|bottom|left|right)\.(?!modules$|icons$)/.test(pref)) return;
      this.apply();
    };
    for (const p of this.REBUILD) Services.prefs.addObserver(p, apply);
    const tell = (s, t, pref) => (pref === "zenith.sidebar" || Services.prefs.getStringPref(pref, "") === "hide") && this.tellSidebar();
    const told = ["zenith.sidebar", ...this.EDGES.map(e => `zenith.bar.display-${e}`)];
    for (const p of told) Services.prefs.addObserver(p, tell);
    onUnload(() => {
      for (const p of this.REBUILD) Services.prefs.removeObserver(p, apply);
      for (const p of told) Services.prefs.removeObserver(p, tell);
      this.bar?.stop();
    });
    window.ZenithBar = this; // the settings page's editor, tools/checks
    this.apply();
  },

  async url() {
    return this.page("bar.mjs");
  },

  // A file of plus/pages (beside the scripts, or where Sine's install has it).
  async page(file) {
    for (const d of ["../pages/", "zenith-pages/"]) {
      const url = new URL(`${d}${file}`, import.meta.url).href;
      if (await fetch(url).then(r => r.ok, () => false)) return url;
    }
    throw new Error(`plus/pages/${file} isn't there`);
  },

  apply() {
    const on = this.EDGES.some(e => this.on(e));
    this.ready = (this.ready ?? Promise.resolve()).then(async () => {
      this.bar?.stop();
      this.bar = null;
      if (!on || window.zenithFloatFrom || root.hasAttribute("popup-window")) return;
      this.bar = (await import(await this.url())).start({ Bridge, on: e => this.on(e), lists: e => this.lists(e) });
      ShellModes.pill();
    }).catch(e => console.error("[Zenith] bar", e));
    return this.ready;
  },
};

