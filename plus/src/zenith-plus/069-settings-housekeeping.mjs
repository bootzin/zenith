/* --- Settings housekeeping ----------------------------------------------- */

// Real progress on the edges: Zenith's own CSS sweeps step aside for the
// live edges while this attribute is set (whenever Plus runs).
function watchRealProgress() {
  root.setAttribute("zenith-real-progress", "true");
}

// Settings that moved from Zenith to Zenith Plus in 0.6.0 (once per profile).
function migrateSettings() {
  const DONE = "zenith.internal.migrated-0.6";
  if (Services.prefs.getBoolPref(DONE, false)) return;
  const str = name => Services.prefs.getStringPref(name, "");
  if (str("zenith.motion.reduced") === "all") Services.prefs.setStringPref("zenith.motion.reduced", "");
  if (str("zenith.edges.minimap") === "off") Services.prefs.setBoolPref("zenith.plus.minimap", false);
  if (str("zenith.panels.zoom-pill") === "off") Services.prefs.setBoolPref("zenith.plus.zoom-pill", false);
  Services.prefs.setBoolPref(DONE, true);
}

// 0.8.0: the "Glass edge shine" tick box became "Glass edge" (None, Shine,
// Liquid); a ticked box becomes Shine.
function migrateGlassEdge() {
  const OLD = "zenith.core.glass-shine";
  if (!Services.prefs.prefHasUserValue(OLD)) return;
  if (Services.prefs.getBoolPref(OLD, false) && !Services.prefs.getStringPref("zenith.core.glass-edge", "")) {
    Services.prefs.setStringPref("zenith.core.glass-edge", "shine");
  }
  Services.prefs.clearUserPref(OLD);
}

// 0.12.18: the bookmarks panel's place is beside or across from the
// sidebar (which can sit on either side), no longer left or right.
function migrateBookmarksPlace() {
  const PREF = "zenith.plus.bookmarks-place", was = Services.prefs.getStringPref(PREF, "");
  if (was === "right" || was === "left") Services.prefs.setStringPref(PREF, was === "right" ? "far" : "near");
}

// 0.6.3: "Numbered tabs only while holding Ctrl" moved into Zenith Tabs'
// Numbered tabs setting.
function migrateCtrlNumbers() {
  const OLD = "zenith.plus.numbers-on-ctrl";
  if (!Services.prefs.prefHasUserValue(OLD)) return;
  if (Services.prefs.getBoolPref(OLD, false)) Services.prefs.setStringPref("zenith.tabs.numbers", "ctrl");
  Services.prefs.clearUserPref(OLD);
}

