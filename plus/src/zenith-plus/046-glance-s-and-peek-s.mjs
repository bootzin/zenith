/* --- Glance's and Peek's buttons -------------------------------------------------
   Where they sit (Panels › Glance's and Peek's buttons): to the right or
   the left of the page, above or below it in a row. */
const GlanceButtons = {
  PREF: "zenith.plus.glance-buttons", // right · left · top · bottom

  init() {
    const where = () => root.setAttribute("zenith-glance-buttons", ["left", "top", "bottom"].find(v => v === Services.prefs.getStringPref(this.PREF, "")) ?? "right");
    where();
    Services.prefs.addObserver(this.PREF, where);
    onUnload(() => Services.prefs.removeObserver(this.PREF, where));
  },
};

