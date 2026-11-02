/* --- Glance's and Peek's buttons -------------------------------------------------
   Where they sit (Panels › Glance's and Peek's buttons): beside the page
   as Zen has them, on the other side, above or below it in a row. */
const GlanceButtons = {
  PREF: "zenith.plus.glance-buttons", // zen · other-side · top · bottom

  init() {
    const where = () => root.setAttribute("zenith-glance-buttons", Services.prefs.getStringPref(this.PREF, "") || "zen");
    where();
    Services.prefs.addObserver(this.PREF, where);
    onUnload(() => Services.prefs.removeObserver(this.PREF, where));
  },
};

