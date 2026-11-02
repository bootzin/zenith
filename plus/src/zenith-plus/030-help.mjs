/* --- Help (about:zenith-help) -------------------------------------------------
   What Zenith can do and how, each with a "Try it", and every key as it's
   set now (KeySheet's). :help opens it (":help tiles" at that part), or
   goes to it if it's open in this space. "Beside" tiles it next to the
   page you came from. */
const HelpPage = {
  URL: "about:zenith-help",

  init() {
    window.ZenithHelp = this; // the switcher's :help, the page itself, tools/checks
    this.ready = registerAbout("zenith-help", "help.html");
  },

  open(topic = "") {
    if (!(this.ready ||= registerAbout("zenith-help", "help.html"))) return;
    const url = this.URL + (topic ? `#${encodeURIComponent(topic.trim().toLowerCase())}` : "");
    const tab = gBrowser.visibleTabs.find(t => t.linkedBrowser?.currentURI?.spec.startsWith(this.URL));
    if (!tab) this.from = gBrowser.selectedTab;
    if (tab) {
      gBrowser.selectedTab = tab;
      if (topic) tab.linkedBrowser.browsingContext?.window?.location?.replace(url);
    } else openTrustedLinkIn(url, "tab");
  },

  // The page beside the tab it was opened from (or the one before it).
  beside(tab) {
    if (!tab || Tiler.data(tab)) return;
    const tabs = gBrowser.visibleTabs.filter(t => t !== tab && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"));
    const from = this.from?.isConnected && this.from !== tab && tabs.includes(this.from) ? this.from : tabs[Math.max(0, gBrowser.visibleTabs.indexOf(tab) - 1)] ?? tabs[0];
    if (from) Tiler.insert(tab, from, "right");
  },

  groups: () => KeySheet.groups(),
  links: () => LinkClicks.read(),
};

