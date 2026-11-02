/* --- about:zenith-fetch (:fetch): your setup as fastfetch prints a system's ----- */
const FetchPage = {
  URL: "about:zenith-fetch",

  init() {
    window.ZenithFetch = this; // the switcher's :fetch, tools/checks
    this.ready = registerAbout("zenith-fetch", "fetch.html");
  },

  open() {
    if (!(this.ready ||= registerAbout("zenith-fetch", "fetch.html"))) return;
    const tab = gBrowser.visibleTabs.find(t => t.linkedBrowser?.currentURI?.spec === this.URL);
    if (tab) {
      gBrowser.selectedTab = tab;
      tab.linkedBrowser.reload();
    } else openTrustedLinkIn(this.URL, "tab");
  },
};

