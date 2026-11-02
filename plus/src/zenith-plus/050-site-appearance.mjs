/* --- Site appearance: pages dark or light, at a click -------------------------------
   After Zen-Site-Appearance-Toggle (MIT, by ravenothere). Pages follow
   Firefox's own Website appearance (Settings › General), which this sets: a
   click goes from automatic to the opposite of what pages show now, and a
   click again back to automatic. A space can have its own (dark or light),
   set as you go there; a space without one goes back to automatic if the
   one you left had set it. The bar's button (right-click: this space's),
   the Dash, and :appearance in the switcher. */
const SiteAppearance = {
  // Firefox's Website appearance: 0 dark, 1 light, 2 (its own default) as
  // the browser is (Zen's window scheme: a palette's, else the system's),
  // 3 as the system is.
  PREF: "layout.css.prefers-color-scheme.content-override",
  AUTO: "zenith.plus.appearance-auto", // what automatic follows: "browser" (the default) or "system"
  GLOBAL: "zenith.internal.appearance.global", // your choice where a space has none of its own: "dark", "light" or none
  SPACES: "zenith.internal.appearance.spaces", // { space: "dark" | "light" }

  forced() {
    if (!Services.prefs.prefHasUserValue(this.PREF)) return null;
    return { 0: "dark", 1: "light" }[Services.prefs.getIntPref(this.PREF, 2)] ?? null;
  },

  follows() {
    return Services.prefs.getStringPref(this.AUTO, "") === "system" ? "system" : "browser";
  },

  // Windows' own light or dark (Settings › Personalisation › Colours).
  systemDark() {
    if (Services.appinfo.OS === "WINNT") {
      try {
        const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
        key.open(key.ROOT_KEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", key.ACCESS_READ);
        try {
          return key.readIntValue("AppsUseLightTheme") === 0;
        } finally {
          key.close();
        }
      } catch {}
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  },

  // Dark on automatic? (The window's own media query answers for the
  // browser's frame, not its pages, so it's worked out here.)
  autoDark() {
    if (this.follows() === "browser") {
      const zen = Services.prefs.getIntPref("zen.view.window.scheme", 2);
      if (zen === 0) return true;
      if (zen === 1) return false;
    }
    return this.systemDark();
  },

  isDark() {
    const f = this.forced();
    return f ? f === "dark" : this.autoDark();
  },

  // Why automatic is dark or light now.
  reason() {
    const os = Services.appinfo.OS === "WINNT" ? "Windows" : "your system", dark = this.autoDark() ? "dark" : "light";
    if (this.follows() === "system") return `${os} is ${dark}`;
    const zen = Services.prefs.getIntPref("zen.view.window.scheme", 2);
    if (zen === 2) return `${os} is ${dark} (the browser follows it)`;
    return root.hasAttribute("zenith-palette") ? `your palette is ${dark}` : `Zen is set to ${dark}`;
  },

  // For tooltips: what pages are now, why, and what's done for sites that
  // don't listen (and whether this one is left alone).
  describe(host = (() => {
    try {
      return gBrowser.currentURI?.host ?? "";
    } catch {
      return "";
    }
  })()) {
    const f = this.forced(), here = this.space() !== "auto" ? " (this space's own)" : "";
    const now = f ? `Pages: ${f}${here}` : `Pages: ${this.autoDark() ? "dark" : "light"}, automatic: ${this.reason()}`;
    const how = Services.prefs.getStringPref(this.FORCE, "") || "invert";
    const done = how === "off" ? "sites only asked" : this.alone(host) ? "this site left alone"
      : how === "palette" ? "every page in your palette's colours" : "sites that don't follow are inverted";
    return `${now} · ${done}`;
  },

  // A site left alone (never inverted), or not.
  alone(host) {
    host = (host ?? "").replace(/^www\./, "");
    const list = Services.prefs.getStringPref("zenith.plus.appearance-skip", "").split(",").map(s => s.trim().replace(/^www\./, "")).filter(Boolean);
    return !!host && list.some(s => host === s || host.endsWith(`.${s}`));
  },

  leaveAlone(host, on) {
    host = (host ?? "").replace(/^www\./, "");
    if (!host) return;
    const P = Services.prefs, list = P.getStringPref("zenith.plus.appearance-skip", "").split(",").map(s => s.trim()).filter(Boolean)
      .filter(s => s.replace(/^www\./, "") !== host);
    if (on) list.push(host);
    if (list.length) P.setStringPref("zenith.plus.appearance-skip", list.join(", "));
    else P.clearUserPref("zenith.plus.appearance-skip");
  },

  write(mode) {
    const P = Services.prefs;
    if (mode === "dark") P.setIntPref(this.PREF, 0);
    else if (mode === "light") P.setIntPref(this.PREF, 1);
    else if (this.follows() === "system") P.setIntPref(this.PREF, 3);
    else P.clearUserPref(this.PREF);
  },

  global() {
    return Services.prefs.getStringPref(this.GLOBAL, "") || "auto";
  },

  // Your choice, wherever a space has none of its own.
  set(mode) {
    if (mode === "dark" || mode === "light") Services.prefs.setStringPref(this.GLOBAL, mode);
    else Services.prefs.clearUserPref(this.GLOBAL);
    if (this.space() === "auto") this.write(mode);
  },

  // A click: the opposite of what pages show now, again automatic; in a
  // space with its own, that space's.
  toggle() {
    const next = this.forced() ? "auto" : this.isDark() ? "light" : "dark";
    if (this.space() !== "auto") this.setSpace(next);
    else this.set(next);
    hint(this.describe());
  },

  spaces() {
    try {
      return JSON.parse(Services.prefs.getStringPref(this.SPACES, "") || "{}");
    } catch {
      return {};
    }
  },

  // This space's own (or "auto": none).
  space(uuid = window.gZenWorkspaces?.activeWorkspace) {
    return this.spaces()[uuid] ?? "auto";
  },

  setSpace(mode, uuid = window.gZenWorkspaces?.activeWorkspace) {
    if (!uuid) return;
    const all = this.spaces();
    if (mode === "dark" || mode === "light") all[uuid] = mode;
    else delete all[uuid];
    if (Object.keys(all).length) Services.prefs.setStringPref(this.SPACES, JSON.stringify(all));
    else Services.prefs.clearUserPref(this.SPACES);
    if (uuid === window.gZenWorkspaces?.activeWorkspace) this.write(mode === "dark" || mode === "light" ? mode : this.global());
  },

  FORCE: "zenith.plus.appearance-force", // "invert" (the default), "palette" or "off"

  // Pages set dark or light, beyond asking them: inverted where they don't
  // follow (a helper in each page: plus/pages/appearance-force.sys.mjs), or
  // every page in the palette's colours (Firefox's own colour override,
  // through the bridge: yours come back when pages are automatic again).
  force() {
    const P = Services.prefs, how = P.getStringPref(this.FORCE, "") || "invert", mode = this.forced() ?? (this.isDark() ? "dark" : "light");
    // The page helper, both halves (its page half can't read text settings:
    // the browser half decides), registered once it's wanted (inverting, or
    // sites left alone out of the palette's colours); every page of this
    // window is told at once, no reload needed.
    if (how !== "off") {
      this.helper ??= PageActors.url("appearance-force.sys.mjs").then(url => {
        try {
          ChromeUtils.registerWindowActor("ZenithForce", {
            parent: { esModuleURI: url }, child: { esModuleURI: url, events: { DOMContentLoaded: {}, pageshow: {}, load: { capture: true } } },
            matches: ["*://*/*", "file:///*"], safeForUntrustedWebProcess: true,
          });
        } catch (e) {
          if (e.name !== "NotSupportedError") console.error("[Zenith] pages dark or light", e); // (another window registered it)
        }
      });
    }
    this.helper?.then(() => {
      for (const tab of gBrowser.tabs) {
        if (tab.hasAttribute("pending")) continue;
        try {
          tab.linkedBrowser?.browsingContext?.currentWindowGlobal?.getActor("ZenithForce").sendAsyncMessage("update");
        } catch {}
      }
    });
    // (Only the window in front: the colour settings are shared.)
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const PAL = getComputedStyle(root), pal = n => PAL.getPropertyValue(`--zth-pal-${n}`).trim();
    const own = root.getAttribute("zenith-palette") === mode;
    const colours = mode === "dark"
      ? { bg: own ? pal("base") : "#1c1b22", fg: own ? pal("text") : "#fbfbfe", link: own ? pal("accent") : "#8c8cff", seen: own ? pal("second") : "#c88cff" }
      : { bg: own ? pal("base") : "#ffffff", fg: own ? pal("text") : "#15141a", link: own ? pal("accent") : "#0060df", seen: own ? pal("second") : "#551a8b" };
    const on = how === "palette" && !!mode;
    Bridge.apply("appearance-palette", {
      "browser.display.document_color_use": on ? 2 : null,
      "browser.display.use_system_colors": on ? false : null,
      ...Object.fromEntries(["", ".dark"].flatMap(dark => [
        [`browser.display.background_color${dark}`, on ? colours.bg : null],
        [`browser.display.foreground_color${dark}`, on ? colours.fg : null],
        [`browser.anchor_color${dark}`, on ? colours.link : null],
        [`browser.visited_color${dark}`, on ? colours.seen : null],
      ])),
    });
  },

  init() {
    const W = window.gZenWorkspaces, P = Services.prefs;
    window.ZenithAppearance = this; // the bar, the Dash, the switcher, tools/checks
    const force = () => this.force();
    // (What automatic is follows these: the palette, Zen's scheme, Windows'.)
    const FORCE = [this.FORCE, this.PREF, this.AUTO, "zenith.palette", "zenith.plus.appearance-skip", "zen.view.window.scheme", "browser.theme.toolbar-theme"];
    for (const p of FORCE) P.addObserver(p, force);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", force);
    onUnload(() => {
      for (const p of FORCE) P.removeObserver(p, force);
      scheme.removeEventListener("change", force);
    });
    force();
    // (0.15: dark or light set before there was a choice of your own.)
    if (!P.prefHasUserValue(this.GLOBAL) && this.forced() && this.space() === "auto") P.setStringPref(this.GLOBAL, this.forced());
    // Automatic now follows the other one: pages on automatic too.
    const follows = () => !this.forced() && this.write("auto");
    P.addObserver(this.AUTO, follows);
    onUnload(() => P.removeObserver(this.AUTO, follows));
    if (!this.forced()) this.write("auto");
    if (!W?.addChangeListeners) return;
    this.here = W.activeWorkspace;
    // Another space: its own, else your choice.
    this.onChange = () => {
      const id = W.activeWorkspace;
      if (!id || id === this.here) return;
      this.here = id;
      const own = this.space(id);
      this.write(own !== "auto" ? own : this.global());
    };
    W.addChangeListeners(this.onChange);
    onUnload(() => W.removeChangeListeners?.(this.onChange));
  },
};

