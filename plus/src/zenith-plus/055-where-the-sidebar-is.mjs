/* --- Where the sidebar is (Settings › Bars › The sidebar) ---------------------------
   Shown (as Zen has it); on hover (Zen's compact mode); or hidden (compact
   mode with its edge hover off: Ctrl+L and Ctrl+Alt+S still bring it), for
   tabs in a bar. Works with or without a bar. Compact mode as it was is
   kept and given back with "Shown". */
const SidebarMode = {
  PREF: "zenith.sidebar",
  KEPT: "zenith.internal.bar.compact-before",

  init() {
    // Zen opens the sidebar on hover (or its toolbar) when the pointer
    // leaves the window within 10px of an edge. An edge with a hiding bar
    // of Zenith's is that bar's.
    const C = window.gZenCompactModeManager, crossed = C?._getCrossedEdge;
    if (crossed) {
      C._getCrossedEdge = function (x, y, element, ...rest) {
        const edge = crossed.call(this, x, y, element, ...rest);
        if (element && element !== root) return edge;
        return edge && (root.getAttribute("zenith-bar-hides") ?? "").split(" ").includes(edge) ? undefined : edge;
      };
      onUnload(() => (C._getCrossedEdge = crossed));
    }
    const apply = () => this.apply();
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => Services.prefs.removeObserver(this.PREF, apply));
    this.apply();
  },

  apply() {
    if (window.zenithFloatFrom || root.hasAttribute("popup-window")) return;
    const P = Services.prefs, C = window.gZenCompactModeManager, how = P.getStringPref(this.PREF, "") || "hover";
    if (how === "shown") {
      Bridge.apply("bar-tabs", { "zen.view.compact.show-sidebar-and-toolbar-on-hover": null });
      if (!C || !P.prefHasUserValue(this.KEPT)) return;
      const was = P.getStringPref(this.KEPT, "") === "true";
      P.clearUserPref(this.KEPT);
      if (C.preference !== was) C.preference = was;
      return;
    }
    Bridge.apply("bar-tabs", { "zen.view.compact.show-sidebar-and-toolbar-on-hover": how === "hidden" ? false : null });
    if (!C) return;
    if (!P.prefHasUserValue(this.KEPT)) P.setStringPref(this.KEPT, String(C.preference));
    if (!C.preference) C.preference = true;
  },
};

