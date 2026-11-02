/* --- Split views: one pane fills the view (Alt+F), and back -------------------
   For a moment's attention, as a tiling window manager's monocle: the pane
   of the tab you're on fills the split's room, the others wait behind it.
   Only how it looks: the tabs stay in their split, nothing moves or
   reloads. Alt+F again, or a tab outside the split, and the split is as
   it was; another tab of the split takes the room instead. */
const SplitSolo = {
  PREF: "zenith.plus.split-solo",

  init() {
    const commandset = document.createXULElement("commandset");
    const command = document.createXULElement("command");
    command.id = "zenith-split-solo-command";
    command.addEventListener("command", () => this.toggle());
    commandset.append(command);
    const keyset = document.createXULElement("keyset");
    const key = document.createXULElement("key");
    key.id = "zenith-split-solo-key";
    key.setAttribute("modifiers", "alt");
    key.setAttribute("key", "F");
    key.setAttribute("reserved", "true");
    key.setAttribute("command", "zenith-split-solo-command");
    keyset.append(key);
    root.append(commandset, keyset);
    const watch = () => {
      const on = Services.prefs.getBoolPref(this.PREF, true);
      key.toggleAttribute("disabled", !on);
      if (!on) this.off();
    };
    const select = () => this.follow();
    Services.prefs.addObserver(this.PREF, watch);
    gBrowser.tabContainer.addEventListener("TabSelect", select);
    // Zen's layout keys (Ctrl+Alt+G/V/H) on a split: its layout only. Zen's
    // own also takes the next tab in the sidebar into the split (past the
    // end, the first one: an essential).
    const S = window.gZenViewSplitter, layout = S?.toggleShortcut;
    if (layout) {
      S.toggleShortcut = function (gridType) {
        const tab = gBrowser.selectedTab, data = gridType !== "unsplit" && !tab?.multiselected ? this._data?.find(d => d.tabs.includes(tab)) : null;
        if (!data) return layout.call(this, gridType);
        try {
          data.gridType = gridType;
          data.layoutTree = this.calculateLayoutTree(data.tabs, gridType);
          this.applyGridLayout(data.layoutTree);
          this.saveState?.();
        } catch (e) {
          console.error("[Zenith] split view: layout", e);
        }
      };
    }
    onUnload(() => {
      if (layout) S.toggleShortcut = layout;
      Services.prefs.removeObserver(this.PREF, watch);
      gBrowser.tabContainer.removeEventListener("TabSelect", select);
      this.off();
      commandset.remove();
      keyset.remove();
    });
    watch();
    window.ZenithSplitSolo = this; // for tools/checks
  },

  split(tab) {
    const g = tab?.group;
    return g?.hasAttribute?.("split-view-group") ? g : null;
  },

  toggle(on = !this.group) {
    if (!on) return this.off();
    const tab = gBrowser.selectedTab, group = this.split(tab);
    if (!group) return hint("Alt+F fills the view with one pane of a split view");
    this.group = group;
    this.mark(tab);
  },

  mark(tab) {
    const panels = gBrowser.tabpanels;
    for (const n of panels.querySelectorAll("[zenith-split-solo]")) n.removeAttribute("zenith-split-solo");
    tab.linkedBrowser?.closest(".browserSidebarContainer")?.setAttribute("zenith-split-solo", "true");
    panels.setAttribute("zenith-solo", "true");
    tab.linkedBrowser?.focus();
  },

  off() {
    this.group = null;
    const panels = gBrowser.tabpanels;
    panels?.removeAttribute("zenith-solo");
    for (const n of panels?.querySelectorAll("[zenith-split-solo]") ?? []) n.removeAttribute("zenith-split-solo");
  },

  follow() {
    if (!this.group) return;
    const tab = gBrowser.selectedTab;
    if (this.split(tab) === this.group) this.mark(tab);
    else this.off();
  },
};

