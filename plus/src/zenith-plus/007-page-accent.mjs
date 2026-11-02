/* --- Page accent: selection (and optional scrollbars) inside web pages -----
   Web pages can't see the workspace colour, so the script registers a small
   stylesheet with the current accent and refreshes it when it changes.
   It must be an AUTHOR sheet: Firefox ignores ::selection in user and agent
   sheets (measured: selection stayed at the default blue with a USER_SHEET,
   and took the accent with an AUTHOR_SHEET). Rules use low specificity, so
   sites that style their own selection or scrollbars keep their look. */

const PageAccent = {
  sss: Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService),
  prefs: ["zenith.page.selection", "zenith.page.thin-scrollbars", "zenith.core.accent"],

  init() {
    this.probe = el("div", { hidden: "true" });
    this.probe.style.color = "var(--zth-accent)";
    document.body.append(this.probe);
    const refresh = () => this.refreshSoon();
    this.prefs.forEach(p => Services.prefs.addObserver(p, refresh));
    window.addEventListener("activate", refresh);
    window.addEventListener("ZenWorkspacesUIUpdate", refresh);
    const mo = new MutationObserver(refresh);
    mo.observe(root, { attributes: true, attributeFilter: ["style"] });
    onUnload(() => {
      this.prefs.forEach(p => Services.prefs.removeObserver(p, refresh));
      mo.disconnect();
    });
    // Reading the accent makes the window work out its styles, and a new
    // sheet for every page restyles them all: wait until the browser is idle
    // (pages keep their own selection colour until then).
    window.requestIdleCallback(() => this.refresh(), { timeout: 2000 });
  },

  refreshSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 150);
  },

  refresh() {
    // Only the focused window decides the colour for all pages.
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const accent = getComputedStyle(this.probe).color;
    const rules = [];
    if (Services.prefs.getBoolPref("zenith.page.selection", true)) {
      // A tint of the accent; the text keeps its own colour.
      rules.push(`::selection { background-color: color-mix(in srgb, ${accent} 55%, transparent); }`);
    }
    if (Services.prefs.getBoolPref("zenith.page.thin-scrollbars", false)) {
      rules.push(`:where(:root) { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, ${accent} 70%, transparent) transparent; }`);
    }
    const spec = rules.length ? "data:text/css;charset=utf-8," + encodeURIComponent(rules.join("\n")) : "";
    // Every window runs its own copy of this script, so the registered sheet
    // is remembered in a hidden pref that all windows share.
    const old = Services.prefs.getStringPref(this.SHEET_PREF, "");
    const { AUTHOR_SHEET, USER_SHEET } = this.sss;
    if (old && old !== spec) {
      const oldURI = Services.io.newURI(old);
      // USER_SHEET: what versions before round 4 registered.
      for (const type of [AUTHOR_SHEET, USER_SHEET]) {
        if (this.sss.sheetRegistered(oldURI, type)) this.sss.unregisterSheet(oldURI, type);
      }
    }
    // After a restart the pref survives but the sheet doesn't, so check.
    if (spec) {
      const uri = Services.io.newURI(spec);
      if (this.sss.sheetRegistered(uri, USER_SHEET)) this.sss.unregisterSheet(uri, USER_SHEET);
      if (!this.sss.sheetRegistered(uri, AUTHOR_SHEET)) this.sss.loadAndRegisterSheet(uri, AUTHOR_SHEET);
    }
    Services.prefs.setStringPref(this.SHEET_PREF, spec);
  },

  SHEET_PREF: "zenith.internal.page-sheet",
};

