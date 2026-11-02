/* --- A tile closed comes back into its split (Ctrl+Shift+T) ----------------------
   Every tile carries an id in its session data; a tile that closes also
   keeps its neighbour's, and when it comes back it joins that neighbour's
   split again, beside it (if the split still has room). */
const TileRestore = {
  ID: "zenith-tile",
  NEXT: "zenith-tile-next",

  init() {
    const closing = e => {
      const tab = e.target, data = Tiler.data(tab);
      if (!data) return;
      const order = Layouts.order(data), i = order.indexOf(tab), next = order[i - 1] ?? order[i + 1];
      if (next) SessionStore.setCustomTabValue(tab, this.NEXT, this.id(next));
    };
    const restored = e => {
      const tab = e.target, want = SessionStore.getCustomTabValue(tab, this.NEXT);
      if (!want) return;
      SessionStore.deleteCustomTabValue(tab, this.NEXT);
      const anchor = gBrowser.tabs.find(t => t !== tab && SessionStore.getCustomTabValue(t, this.ID) === want);
      // (A split of two is gone once one closed: made again.)
      if (anchor && !anchor.pinned && gBrowser.visibleTabs.includes(anchor)) setTimeout(() => NewTabBelow.join(tab, anchor), 0);
    };
    // (Before SessionStore takes the closed tab's data.)
    window.addEventListener("TabClose", closing, true);
    gBrowser.tabContainer.addEventListener("SSTabRestored", restored);
    onUnload(() => {
      window.removeEventListener("TabClose", closing, true);
      gBrowser.tabContainer.removeEventListener("SSTabRestored", restored);
    });
  },

  id(tab) {
    let v = SessionStore.getCustomTabValue(tab, this.ID);
    if (!v) SessionStore.setCustomTabValue(tab, this.ID, (v = Math.random().toString(36).slice(2, 10)));
    return v;
  },
};

