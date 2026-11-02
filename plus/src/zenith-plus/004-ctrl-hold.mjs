/* --- Ctrl hold: numbered tabs on demand -----------------------------------
   With Zenith Tabs > Numbered tabs on "While holding Ctrl", holding Ctrl on
   its own for a moment sets [zenith-ctrl-held] (the CSS shows the numbers)
   and opens the compact sidebar, so Ctrl+number can be aimed. Any other key
   (except a digit), a click or a scroll means Ctrl is part of a shortcut,
   so nothing shows; releasing Ctrl or leaving the window hides it again.
   On macOS tabs are Cmd+1-9, so there it's Cmd that's held. */

const CtrlHold = {
  DELAY: 280,
  PREF: "zenith.tabs.numbers",
  KEY: Services.appinfo.OS === "Darwin" ? "Meta" : "Control",

  init() {
    let timer = null;
    let shown = false;
    const show = on => {
      shown = on;
      root.toggleAttribute("zenith-ctrl-held", on);
      if (!gZenCompactModeManager?.preference) return;
      // Zen's own "flash" keeps the compact sidebar out; 0ms ends it.
      gZenCompactModeManager.flashElement(gNavToolbox, on ? 60000 : 0, "zenith-ctrl-hold");
    };
    const stop = () => {
      clearTimeout(timer);
      timer = null;
      if (shown) show(false);
    };
    const onDown = e => {
      if (e.key === this.KEY) {
        const other = this.KEY === "Meta" ? e.ctrlKey : e.metaKey;
        if (e.repeat || e.altKey || e.shiftKey || other) return;
        if (Services.prefs.getStringPref(this.PREF, "") !== "ctrl") return;
        clearTimeout(timer);
        timer = setTimeout(() => show(true), this.DELAY);
      } else if (!(shown && /^[1-9]$/.test(e.key))) {
        stop();
      }
    };
    const onUp = e => {
      if (e.key === this.KEY) stop();
    };
    const listeners = [["keydown", onDown], ["keyup", onUp], ["mousedown", stop], ["wheel", stop], ["blur", stop]];
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
    onUnload(() => {
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    });
  },
};

