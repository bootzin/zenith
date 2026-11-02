/* --- See-through Zen pages ------------------------------------------------
   With "See-through Zen pages" on, Zen's own pages (Settings, Add-ons,
   about:config, Downloads and the other about: pages that run inside Zen
   itself) show the window's glass behind them, like the docked sidebar:
   their page colour goes, boxes and cards turn half see-through, and
   headers that stay put are clear too (frosting them read as a darker
   band). Only that one page is see-through:
   its <browser> gets Firefox's "transparent" attribute, which Firefox
   checks as it paints pages that run inside it. Web pages run in other
   processes and decide on it when they're created, so the attribute goes
   before a tab switches to one (otherwise a page without a background of
   its own would be see-through too, which is what the global
   browser.tabs.allow_transparent_browser does; Zenith leaves that alone). */
const SeeThroughPages = {
  PREF: "zenith.plus.see-through-pages",
  GLOBAL: "browser.tabs.allow_transparent_browser",
  SHEET: "data:text/css," + encodeURIComponent(`
    :root {
      background: transparent !important;
      --zth-canvas: var(--background-color-canvas);
      --zth-box: var(--background-color-box);
    }
    :root > * {
      --background-color-canvas: transparent !important;
      --background-color-box: color-mix(in srgb, var(--zth-box) 70%, transparent) !important;
      --in-content-box-background: color-mix(in srgb, var(--zth-box) 70%, transparent) !important;
      --card-background-color: color-mix(in srgb, var(--zth-box) 70%, transparent) !important;
      --table-row-background-color: transparent !important;
      --table-row-background-color-alternate: color-mix(in srgb, var(--zth-box) 45%, transparent) !important;
    }
    #search-container, .sticky-container, #process-thead, .main-heading, .main-search {
      background: transparent !important;
      backdrop-filter: none !important;
      box-shadow: none !important;
    }`),

  init() {
    const apply = () => {
      this.on = Services.prefs.getBoolPref(this.PREF, false);
      for (const b of gBrowser.browsers) this.update(b);
    };
    this.listener = {
      onLocationChange: (browser, webProgress) => {
        if (webProgress.isTopLevel) this.update(browser);
      },
    };
    // Before a tab's page moves to another process (a web page): no
    // longer see-through.
    const before = e => this.clear(e.target.linkedBrowser ?? e.target);
    gBrowser.addTabsProgressListener(this.listener);
    window.addEventListener("BeforeTabRemotenessChange", before, true);
    window.addEventListener("WillChangeBrowserRemoteness", before, true);
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => {
      gBrowser.removeTabsProgressListener(this.listener);
      window.removeEventListener("BeforeTabRemotenessChange", before, true);
      window.removeEventListener("WillChangeBrowserRemoteness", before, true);
      Services.prefs.removeObserver(this.PREF, apply);
    });
    apply();
  },

  wanted(browser) {
    const uri = browser.currentURI;
    // (Not Zenith's own tab manager page, which reads better on its own
    // background; Zenith's start page always, it's made for the glass.)
    if (browser.isRemoteBrowser || !uri?.schemeIs("about")) return false;
    if (uri.spec.startsWith("about:zenith-start")) return true;
    return this.on && uri.spec !== "about:blank" && !uri.spec.startsWith("about:zenith-tabs");
  },

  update(browser) {
    if (!this.wanted(browser)) return this.clear(browser);
    if (!Services.prefs.getBoolPref(this.GLOBAL, false)) browser.setAttribute("transparent", "true");
    browser.setAttribute("zenith-see-through", "true");
    const utils = browser.contentWindow?.windowUtils;
    if (!utils) return;
    try {
      utils.removeSheetUsingURIString(this.SHEET, utils.USER_SHEET);
    } catch {}
    utils.loadSheetUsingURIString(this.SHEET, utils.USER_SHEET);
  },

  clear(browser) {
    if (!browser?.hasAttribute?.("zenith-see-through")) return;
    if (!Services.prefs.getBoolPref(this.GLOBAL, false)) browser.removeAttribute("transparent");
    browser.removeAttribute("zenith-see-through");
    try {
      const utils = browser.contentWindow?.windowUtils;
      utils?.removeSheetUsingURIString(this.SHEET, utils.USER_SHEET);
    } catch {}
  },
};

