/* --- Background tab ready: a pulse when a tab you're not on has loaded -----
   A tab opened in the background (a middle click, say) finishes loading: the
   page's left edge (the sidebar's side) glows once in the accent colour.
   Not for the tabs Zen restores as it starts. */
const ReadyPulse = {
  PREF: "zenith.plus.ready-pulse",

  init() {
    this.since = performance.now();
    this.edge = el("div", { id: "zenith-ready" });
    document.getElementById("tabbrowser-tabbox").append(this.edge);
    this.listener = {
      onStateChange: (browser, webProgress, request, flags, status) => {
        const NL = Ci.nsIWebProgressListener;
        if (!webProgress.isTopLevel || !(flags & NL.STATE_STOP) || !(flags & NL.STATE_IS_NETWORK)) return;
        if (browser === gBrowser.selectedBrowser || !Components.isSuccessCode(status)) return;
        if (!Services.prefs.getBoolPref(this.PREF, false) || performance.now() - this.since < 8000) return;
        const tab = gBrowser.getTabForBrowser(browser);
        if (!tab || tab.hidden && !tab.pinned) return; // another space's tab
        this.pulse();
      },
    };
    gBrowser.addTabsProgressListener(this.listener);
    onUnload(() => gBrowser.removeTabsProgressListener(this.listener));
    window.ZenithReady = this; // for tools/checks
  },

  pulse() {
    this.edge.removeAttribute("go");
    void this.edge.offsetWidth;
    this.edge.setAttribute("go", "true");
  },
};

