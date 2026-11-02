/* --- New Tab Below and a new pane in a split ------------------------------------
   New Tab Below (a tab's right-click menu) opens as Zen's own new tab does
   (the address bar, as Ctrl+T, when Zen replaces the new-tab page) and the
   tab you open goes right below; on a split's tab it joins the split, next
   to it (if the split has room; else below the split). Zen's "New empty
   split" (Alt+T, say) is turned off on a split's tab: here it adds a pane
   to that split the same way. Either way the split is drawn at once. */
const NewTabBelow = {
  init() {
    const S = window.gZenViewSplitter;
    const orig = gBrowser.addAdjacentNewTab;
    const self = this;
    if (orig) {
      gBrowser.addAdjacentNewTab = function (tab) {
        const data = self.splitOf(tab), room = data && data.tabs.length < (S?.MAX_TABS ?? 4);
        if (Services.prefs.getBoolPref("zen.urlbar.replace-newtab", true) && window.BrowserCommands?.openTab) {
          self.watch(made => (room ? self.join(made, tab) : self.place(made, data ? tab.group : tab)));
          return BrowserCommands.openTab();
        }
        if (!data) return orig.call(this, tab);
        const t = this.addTrustedTab(window.BROWSER_NEW_TAB_URL, { userContextId: tab.userContextId, focusUrlBar: true });
        if (room) self.join(t, tab);
        else self.place(t, tab.group);
        return t;
      };
      onUnload(() => (gBrowser.addAdjacentNewTab = orig));
    }
    // Zen's new empty split, on a split's tab: a new pane in it.
    const empty = S?.createEmptySplit, cmd = document.getElementById("cmd_zenNewEmptySplit");
    if (empty && cmd) {
      S.createEmptySplit = function (side) {
        const tab = gBrowser.selectedTab, data = self.splitOf(tab);
        if (!data) return empty.call(this, side);
        if (data.tabs.length >= (this.MAX_TABS ?? 4)) return window.gZenUIManager?.showToast?.("zen-split-view-limit-toast");
        self.watch(made => self.join(made, tab));
        return BrowserCommands.openTab();
      };
      const enable = () => {
        const t = gBrowser.selectedTab;
        if (cmd.hasAttribute("disabled") && t?.splitView && !t.hasAttribute("zen-empty-tab") && (self.splitOf(t)?.tabs.length ?? 4) < (S.MAX_TABS ?? 4)) cmd.removeAttribute("disabled");
      };
      const observer = new MutationObserver(enable);
      observer.observe(cmd, { attributes: true, attributeFilter: ["disabled"] });
      enable();
      onUnload(() => {
        observer.disconnect();
        S.createEmptySplit = empty;
      });
    }
    // Closing a split's tab you're on (Ctrl+W): another tab of that split is
    // selected, so the split stays on screen.
    const blur = gBrowser._findTabToBlurTo;
    if (blur) {
      gBrowser._findTabToBlurTo = function (tab, ...rest) {
        const data = self.splitOf(tab), others = data?.tabs.filter(t => t !== tab && !t.closing) ?? [];
        if (others.length) {
          const i = data.tabs.indexOf(tab);
          return data.tabs.slice(i + 1).find(t => others.includes(t)) ?? others.at(-1);
        }
        return blur.call(this, tab, ...rest);
      };
      onUnload(() => (gBrowser._findTabToBlurTo = blur));
    }
    // Any new tab while you're on a split's tab becomes a tile of that split
    // (docs/reference.md §5): Ctrl+T (the address bar), a link to a new tab,
    // window.open. Background ones too, unless Shell › Background links in
    // a split says they stay tabs. Past the split's limit: a normal tab.
    const open = window.BrowserCommands?.openTab;
    if (open) {
      BrowserCommands.openTab = function (...args) {
        const anchor = gBrowser.selectedTab;
        if (self.splitOf(anchor) && !self.unwatch) self.watch(made => self.grow(made, anchor, true));
        return open.apply(this, args);
      };
      onUnload(() => (BrowserCommands.openTab = open));
    }
    const opened = e => {
      const tab = e.target, anchor = gBrowser.selectedTab;
      if (self.unwatch || !self.splitOf(anchor) || !window.gZenWorkspaces?._hasInitializedTabsStrip) return;
      Promise.resolve().then(() => self.grow(tab, anchor, gBrowser.selectedTab === tab));
    };
    gBrowser.tabContainer.addEventListener("TabOpen", opened);
    onUnload(() => gBrowser.tabContainer.removeEventListener("TabOpen", opened));
    window.ZenithNewTabBelow = this; // for tools/checks
  },

  grow(tab, anchor, shown) {
    const S = window.gZenViewSplitter, data = this.splitOf(anchor);
    if (!tab?.isConnected || !data || this.splitOf(tab) || tab.pinned || tab.hasAttribute("zen-essential") || tab.hasAttribute("zen-glance-tab") || tab.hasAttribute("zen-empty-tab")) return;
    if (!shown && Services.prefs.getStringPref("zenith.shell.split-background", "") === "tab") return;
    if (data.tabs.length >= (S?.MAX_TABS ?? 4)) return;
    this.join(tab, anchor);
    if (!shown && gBrowser.selectedTab === tab) gBrowser.selectedTab = anchor;
  },

  splitOf(tab) {
    return tab ? window.gZenViewSplitter?._data?.find(d => d.tabs.includes(tab)) ?? null : null;
  },

  // Drawn now (Zen only redraws a split when it's shown again).
  redraw(tab) {
    const S = window.gZenViewSplitter, data = this.splitOf(tab);
    if (!S || !data) return;
    if (data.tabs.includes(gBrowser.selectedTab)) S.activateSplitView(data, true);
    else S.applyGridLayout(data.layoutTree);
  },

  // Into the split of `anchor`, beside it (as Zenith Shell places a new
  // tile), and shown: at once, so it's never drawn alone first (0.15.1: it
  // used to be moved in a moment later, which flashed).
  join(tab, anchor) {
    if (!tab?.isConnected || !anchor?.isConnected) return;
    Tiler.insert(tab, anchor);
  },

  place(tab, after) {
    try {
      if (!after?.isConnected || !tab?.isConnected) return;
      // (Zen opens a new tab next to yours: in a split, into the split.)
      if (tab.group?.hasAttribute?.("split-view-group") && tab.group !== after) window.gZenViewSplitter?.removeTabFromGroup?.(tab);
      gBrowser.moveTabAfter(tab, after);
    } catch (e) {
      console.error("[Zenith] new tab below", e);
    }
  },

  // The address bar (or a new tab page) is up: the tab it opens (a new one,
  // or Zen's empty tab made a real one) goes where `done` puts it, as it
  // opens: before the next frame, so it's never drawn on its own first.
  // Nothing opened (the address bar closed, or two minutes): nothing moves.
  watch(done) {
    this.unwatch?.();
    const empty = document.querySelector("tab[zen-empty-tab]"), since = Date.now();
    let over = false;
    const finish = () => {
      over = true;
      gBrowser.tabContainer.removeEventListener("TabOpen", opened);
      changed.disconnect();
      clearInterval(idle);
      this.unwatch = null;
    };
    // (A microtask: after Firefox has added and selected it, before it's drawn.)
    const take = tab => {
      if (over) return;
      finish();
      Promise.resolve().then(() => done(tab));
    };
    const opened = e => !e.target.hasAttribute("zen-empty-tab") && take(e.target);
    const changed = new MutationObserver(() => empty && !empty.hasAttribute("zen-empty-tab") && take(empty));
    if (empty) changed.observe(empty, { attributes: true, attributeFilter: ["zen-empty-tab"] });
    gBrowser.tabContainer.addEventListener("TabOpen", opened);
    const idle = setInterval(() => {
      const typing = gURLBar.focused || gURLBar.view?.isOpen;
      if ((!typing && Date.now() - since > 800) || Date.now() - since > 120000) finish();
    }, 400);
    this.unwatch = finish;
  },
};

