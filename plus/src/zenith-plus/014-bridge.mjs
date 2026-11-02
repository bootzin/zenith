/* --- Bridge: Zen and Firefox settings that Zenith sets for you ------------
   Window material and scroll feel are made of Zen's and Firefox's own
   settings, which a mod's settings can't hold. The first time Zenith
   changes one, your own value (or that you had none) is kept under
   zenith.internal.<kind>.<setting>; when Zenith's setting goes back to
   "Zen's own", that value is put back. */
const Bridge = {
  // wanted: { setting: value, or null for "give it back" }
  apply(kind, wanted) {
    const P = Services.prefs;
    for (const [pref, value] of Object.entries(wanted)) {
      const owned = `zenith.internal.${kind}.${pref}`;
      if (value === null) {
        if (!P.prefHasUserValue(owned)) continue;
        const saved = P.getStringPref(owned, "");
        if (saved === "") P.clearUserPref(pref);
        else this.set(pref, JSON.parse(saved));
        P.clearUserPref(owned);
        continue;
      }
      if (!P.prefHasUserValue(owned)) P.setStringPref(owned, P.prefHasUserValue(pref) ? JSON.stringify(this.get(pref)) : "");
      if (this.get(pref) !== value) this.set(pref, value);
    }
  },

  get(pref) {
    const P = Services.prefs;
    switch (P.getPrefType(pref)) {
      case P.PREF_BOOL: return P.getBoolPref(pref);
      case P.PREF_INT: return P.getIntPref(pref);
      case P.PREF_STRING: return P.getStringPref(pref);
      default: return undefined;
    }
  },

  set(pref, value) {
    const P = Services.prefs;
    if (typeof value === "boolean") P.setBoolPref(pref, value);
    else if (typeof value === "number") P.setIntPref(pref, value);
    else P.setStringPref(pref, value);
  },
};
window.ZenithBridge = Bridge; // Zenith's local AI turns Firefox's AI on through it

