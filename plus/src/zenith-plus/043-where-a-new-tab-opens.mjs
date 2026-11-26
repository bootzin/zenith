/* --- Where a new tab opens (Tabs › Where a new tab opens) ---------------------------
   A tab you open goes at the top of the space's tabs, at the bottom, or just
   above or below the one you're on (left or right of it in a bar). Synced
   with Zen's own: its new tab button at the top puts new tabs at the top,
   and Firefox's "after the current tab". A link opened from a page goes
   right after it (Firefox's); in a split, a new tile (NewTabBelow); in the
   scroller, a column right of yours (Layouts). */
const NewTabPlace = {
  PREF: "zenith.tabs.new-tab", // start · end · before · after
  TOP: "zen.view.show-newtab-button-top",
  AFTER: "browser.tabs.insertAfterCurrent",

  where() {
    const v = Services.prefs.getStringPref(this.PREF, "");
    return ["start", "end", "before", "after"].includes(v) ? v : "start";
  },

  init() {
    const P = Services.prefs;
    // (Not chosen yet: what Zen does now.)
    if (!P.prefHasUserValue(this.PREF)) P.setStringPref(this.PREF, P.getBoolPref(this.TOP, true) ? "start" : "end");
    const toZen = () => {
      const w = this.where();
      if ((w === "start" || w === "end") && P.getBoolPref(this.TOP, true) !== (w === "start")) P.setBoolPref(this.TOP, w === "start");
      if (P.getBoolPref(this.AFTER, false) !== (w === "after")) P.setBoolPref(this.AFTER, w === "after");
    };
    // (Zen's own changed in its settings: ours follows.)
    const fromZen = () => {
      const w = this.where(), top = P.getBoolPref(this.TOP, true);
      if ((w === "start" || w === "end") && top !== (w === "start")) P.setStringPref(this.PREF, top ? "start" : "end");
    };
    toZen();
    P.addObserver(this.PREF, toZen);
    P.addObserver(this.TOP, fromZen);
    const opened = e => {
      const tab = e.target, from = gBrowser.selectedTab;
      if (tab.openerTab || tab.pinned || tab.hasAttribute("zen-essential") || tab.hasAttribute("zen-glance-tab") || tab.hasAttribute("zen-empty-tab")) return;
      if (Layouts.strip() || NewTabBelow.splitOf(from)) return;
      // (After Zen has put it in its space.)
      setTimeout(() => this.place(tab, from), 0);
    };
    gBrowser.tabContainer.addEventListener("TabOpen", opened);
    onUnload(() => {
      P.removeObserver(this.PREF, toZen);
      P.removeObserver(this.TOP, fromZen);
      gBrowser.tabContainer.removeEventListener("TabOpen", opened);
    });
  },

  place(tab, from) {
    if (!tab.isConnected || tab.closing || tab.pinned || tab.group || Tiler.data(tab)) return;
    const space = tab.getAttribute("zen-workspace-id");
    const list = gBrowser.visibleTabs.filter(t => t !== tab && !t.pinned && !t.hasAttribute("zen-essential") && !t.hasAttribute("zen-glance-tab") &&
      !t.hasAttribute("zen-empty-tab") && t.getAttribute("zen-workspace-id") === space);
    if (!list.length) return;
    // (A folder or a split moves as one: beside it, not into it.)
    const whole = t => t.group ?? t, w = this.where();
    if (w === "start") gBrowser.moveTabBefore(tab, whole(list[0]));
    else if (w === "end") gBrowser.moveTabAfter(tab, whole(list.at(-1)));
    else if (list.includes(from)) {
      if (w === "before") gBrowser.moveTabBefore(tab, whole(from));
      else gBrowser.moveTabAfter(tab, whole(from));
    }
  },
};

