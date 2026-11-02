/* --- Scroll feel: one setting for how pages scroll ------------------------
   For the mouse wheel and the keyboard (arrows, Page Up/Down, Space); a
   touchpad moves the page with your fingers and isn't changed. Zen's own
   (the default) leaves it to Zen: a short glide. Instant jumps; Quick is a
   crisp, short ease; Smooth an even, slower one; macOS-like glides further
   (1.6 times the distance) and settles softly, bouncing at the ends.
   Measured with real wheel turns (tools/checks/r38): where one notch has
   got to after 50, 100, 200, 400, 800ms. Written into Firefox's scrolling
   settings through the bridge. */
const ScrollFeel = {
  PREF: "zenith.plus.scroll",
  PRESETS: {
    instant: { "general.smoothScroll": false },
    quick: {
      "general.smoothScroll": true,
      "general.smoothScroll.msdPhysics.enabled": false,
      "general.smoothScroll.mouseWheel.durationMinMS": 60,
      "general.smoothScroll.mouseWheel.durationMaxMS": 120,
    },
    smooth: {
      "general.smoothScroll": true,
      "general.smoothScroll.msdPhysics.enabled": false,
      "general.smoothScroll.mouseWheel.durationMinMS": 300,
      "general.smoothScroll.mouseWheel.durationMaxMS": 450,
    },
    glide: {
      "general.smoothScroll": true,
      "general.smoothScroll.msdPhysics.enabled": true,
      "general.smoothScroll.msdPhysics.motionBeginSpringConstant": 80,
      "general.smoothScroll.msdPhysics.regularSpringConstant": 60,
      "general.smoothScroll.msdPhysics.slowdownSpringConstant": 30,
      "mousewheel.default.delta_multiplier_y": 320,
      "apz.overscroll.enabled": true,
    },
  },

  wanted() {
    const chosen = this.PRESETS[Services.prefs.getStringPref(this.PREF, "")] ?? {};
    const all = new Set(Object.values(this.PRESETS).flatMap(Object.keys));
    return Object.fromEntries([...all].map(pref => [pref, chosen[pref] ?? null]));
  },

  init() {
    const apply = () => Bridge.apply("scroll", this.wanted());
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => Services.prefs.removeObserver(this.PREF, apply));
    apply();
  },
};

