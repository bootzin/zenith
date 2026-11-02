/* --- Motion bridge: let Zen animate when Windows animation effects are off -
   Windows "Animation effects" off makes Firefox report reduced motion, so
   Zen skips many of its own animations. With "Let Zen animate too" on (the
   default), this tells Zen alone that motion is fine, through Firefox's
   ui.prefersReducedMotion setting. Windows itself is never changed, and
   turning it off (or Zenith Motion's "Follow Windows") hands control back. */

const MotionBridge = {
  PREFS: ["zenith.plus.animate-zen", "zenith.motion.space-switch", "zenith.motion.preset"],
  OWN: "zenith.internal.motion-override",
  SYSTEM: "ui.prefersReducedMotion",

  init() {
    const apply = () => this.apply();
    this.PREFS.forEach(p => Services.prefs.addObserver(p, apply));
    onUnload(() => this.PREFS.forEach(p => Services.prefs.removeObserver(p, apply)));
    this.apply();
  },

  // Zen's slide between spaces (250 ms): as Motion's preset has it (Quick:
  // 120 ms, Smooth: Zen's, Off: none), or as Motion › Switching spaces says.
  spaces() {
    const P = Services.prefs, own = P.getStringPref("zenith.motion.space-switch", ""), preset = P.getStringPref("zenith.motion.preset", "") || "quick";
    const how = (own !== "preset" && own) || { quick: "quick", smooth: "zen", off: "instant" }[preset] || "quick";
    Bridge.apply("space-switch", { "zen.workspaces.switch-animation-duration": how === "zen" ? null : how === "instant" ? 0 : 120 });
  },

  apply() {
    this.spaces();
    // This makes Firefox report "no reduced motion" everywhere, so while it's
    // on, Zenith Motion's "Follow Windows" has nothing to follow (the
    // settings page greys it out).
    const animate = Services.prefs.getBoolPref("zenith.plus.animate-zen", true);
    if (animate) {
      if (Services.prefs.getIntPref(this.SYSTEM, -1) !== 0) Services.prefs.setIntPref(this.SYSTEM, 0);
      Services.prefs.setBoolPref(this.OWN, true);
    } else if (Services.prefs.getBoolPref(this.OWN, false)) {
      // Only undo what Zenith itself set.
      Services.prefs.clearUserPref(this.SYSTEM);
      Services.prefs.setBoolPref(this.OWN, false);
    }
  },
};

