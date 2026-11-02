/* --- Flash on key switch: the hidden sidebar shows the new tab -------------
   In compact mode, switching tabs from the keyboard (Ctrl+Tab, Ctrl+1–9,
   Ctrl+Page Up/Down…) shows the sidebar for a moment, so you see where you
   landed. */
const KeySwitchFlash = {
  PREF: "zenith.plus.key-switch-flash",

  init() {
    this.at = 0;
    const key = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Control" || e.key === "Meta") this.at = performance.now();
    };
    const pointer = () => (this.at = 0);
    const select = () => {
      const compact = window.gZenCompactModeManager;
      if (!Services.prefs.getBoolPref(this.PREF, false) || !compact?.preference) return;
      if (performance.now() - this.at < 1500) compact.flashSidebar(800);
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    window.addEventListener("pointerdown", pointer, true);
    gBrowser.tabContainer.addEventListener("TabSelect", select);
    onUnload(() => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      window.removeEventListener("pointerdown", pointer, true);
      gBrowser.tabContainer.removeEventListener("TabSelect", select);
    });
  },
};

