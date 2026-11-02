/* --- Groups that don't pin --------------------------------------------------
   Zen's folders pin the tabs you put in them: they stay when closed (Ctrl+W
   puts them to sleep), and a tab that wandered off gets marked to go back to
   its first page. Right-click a folder › Tabs act unpinned: Ctrl+W closes
   its tabs, a tab keeps the page it's on (no "back to its first page" mark),
   and the folder sits below the pinned tabs' separator, with the tabs that
   aren't pinned. Its tabs are still pinned for Firefox (Zen's folders only
   hold pinned tabs), so they come back at startup.
   "Groups that don't pin" off hides the choice. (0.11.2 also offered
   Firefox's own tab groups; they fought Zen's split views and spaces, and
   were taken out in 0.12.1: Firefox's setting comes back as it was.)
   Which folders act unpinned is kept in zenith.internal.unpinned-folders
   (folder ids, which Zen keeps across sessions). */
const UnpinnedGroups = {
  PREF: "zenith.plus.unpinned-groups", // "" folders · off
  KEY: "zenithUnpinnedFolder", // a tab's folder, in its session data
  OLD: "zenith.plus.loose-groups", // (0.11.1)
  FOLDERS: "zenith.internal.unpinned-folders",

  init() {
    Services.prefs.clearUserPref(this.OLD);
    if (Services.prefs.getStringPref(this.PREF, "") === "firefox") Services.prefs.clearUserPref(this.PREF);
    Bridge.apply("groups", { "browser.tabs.groups.enabled": null });
    const apply = () => this.mark();
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => Services.prefs.removeObserver(this.PREF, apply));
    this.folderMenu();
    this.folderBehaviour();
    apply();
    window.ZenithGroups = this; // the tab manager, and tools/checks
  },

  get mode() {
    return Services.prefs.getStringPref(this.PREF, "") === "off" ? "off" : "folders";
  },

  // A folder whose tabs act unpinned.
  loose(g) {
    return !!g?.isZenFolder && g.hasAttribute("zenith-unpinned");
  },

  /* Zen's folders that don't pin. */

  get unpinned() {
    try {
      return new Set(JSON.parse(Services.prefs.getStringPref(this.FOLDERS, "[]")));
    } catch {
      return new Set();
    }
  },

  isUnpinned(folder) {
    return this.mode === "folders" && !!folder?.id && this.unpinned.has(folder.id);
  },

  setUnpinned(folder, on) {
    const ids = this.unpinned;
    if (on) ids.add(folder.id);
    else ids.delete(folder.id);
    Services.prefs.setStringPref(this.FOLDERS, JSON.stringify([...ids]));
    this.mark();
    // Its tabs keep the page they're on from now.
    if (on) for (const tab of folder.tabs ?? []) this.keepPage(tab);
  },

  // The folder a tab is in that acts unpinned (folders can nest).
  folderOf(tab) {
    for (let g = tab?.group; g; g = g.group) if (g.isZenFolder && this.isUnpinned(g)) return g;
    return null;
  },

  mark() {
    const ids = this.mode === "folders" ? this.unpinned : new Set();
    for (const f of document.querySelectorAll("zen-folder")) f.toggleAttribute("zenith-unpinned", ids.has(f.id));
    this.place();
    this.remember();
  },

  // Each tab in a folder (any folder: pinned ones too) carries the folder's
  // id in its session data ("~" first for one that acts unpinned), so a
  // closed one (Ctrl+Shift+T) comes back into its folder.
  remember() {
    clearTimeout(this.remembering);
    this.remembering = setTimeout(() => {
      for (const tab of gBrowser.tabs) {
        const loose = this.mode === "folders" && this.folderOf(tab);
        const folder = tab.group?.isZenFolder && !tab.hasAttribute("zen-empty-tab") ? `${loose ? "~" : ""}${tab.group.id}` : "";
        try {
          if ((SessionStore.getCustomTabValue(tab, this.KEY) || "") === folder) continue;
          if (folder) SessionStore.setCustomTabValue(tab, this.KEY, folder);
          else SessionStore.deleteCustomTabValue(tab, this.KEY);
        } catch {}
      }
    }, 200);
  },

  // A tab coming back from being closed: into its folder, if it's still
  // there; else, from a folder that acted unpinned, as the ordinary
  // unpinned tab it acted as.
  restore(tab) {
    let id = "";
    try {
      id = SessionStore.getCustomTabValue(tab, this.KEY) || "";
    } catch {}
    const loose = id.startsWith("~");
    id = id.replace(/^~/, "");
    if (!id) return;
    const folder = document.getElementById(id);
    if (folder?.isZenFolder && folder.isConnected) {
      if (tab.group === folder) return;
      const space = folder.getAttribute("zen-workspace-id");
      if (space && tab.getAttribute("zen-workspace-id") !== space) window.gZenWorkspaces?.moveTabsToWorkspace?.([tab], space);
      if (!tab.pinned) gBrowser.pinTab(tab);
      folder.addTabs([tab]);
    } else if (loose && tab.pinned && !tab.group) {
      gBrowser.unpinTab(tab);
      try {
        SessionStore.deleteCustomTabValue(tab, this.KEY);
      } catch {}
    }
  },

  // Top-level folders that act unpinned go just below the separator, the
  // rest above it (in their order). The separator is inside the pinned
  // container, so their tabs still come first, as pinned tabs must.
  place() {
    let moved = false;
    for (const box of document.querySelectorAll("zen-workspace")) {
      const pinned = box.pinnedTabsContainer, sep = pinned?.querySelector(":scope > .pinned-tabs-container-separator");
      if (!sep) continue;
      const folders = [...pinned.children].filter(c => c.localName === "zen-folder");
      let after = sep;
      for (const f of folders) {
        const below = !!(sep.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (f.hasAttribute("zenith-unpinned")) {
          if (after.nextElementSibling !== f) {
            after.after(f);
            moved = true;
          }
          after = f;
        } else if (below) {
          sep.before(f);
          moved = true;
        }
      }
    }
    if (moved) gBrowser.tabContainer._invalidateCachedTabs?.();
  },

  placeSoon() {
    clearTimeout(this.placing);
    this.placing = setTimeout(() => this.place(), 150);
  },

  keepPage(tab) {
    if (!tab?.pinned || tab.hasAttribute("zen-essential")) return;
    try {
      window.gZenWindowSync?.setPinnedTabState?.(tab);
      window.gZenPinnedTabManager?.resetPinChangedUrl?.(tab);
    } catch {}
  },

  folderMenu() {
    const menu = document.getElementById("zenFolderActions");
    if (!menu) return;
    const item = document.createXULElement("menuitem");
    item.id = "zenith-folder-unpinned";
    item.setAttribute("type", "checkbox");
    item.setAttribute("label", "Tabs act unpinned");
    item.setAttribute("tooltiptext", "Ctrl+W closes them, and they keep the page they're on");
    menu.append(item);
    menu.addEventListener("popupshowing", e => {
      if (e.target !== menu) return;
      const node = menu.triggerNode ?? e.explicitOriginalTarget;
      this.menuFolder = node?.closest?.("zen-folder") ?? null;
      item.hidden = this.mode !== "folders" || !this.menuFolder || this.menuFolder.isLiveFolder;
      item.toggleAttribute("checked", this.isUnpinned(this.menuFolder));
    });
    item.addEventListener("command", () => {
      if (this.menuFolder) this.setUnpinned(this.menuFolder, !this.isUnpinned(this.menuFolder));
    });
  },

  folderBehaviour() {
    // A tab in such a folder that goes somewhere keeps going: its page
    // becomes the one it's on (after Zen has marked it changed).
    this.progress = {
      onLocationChange: (browser, progress) => {
        if (!progress?.isTopLevel) return;
        const tab = gBrowser.getTabForBrowser(browser);
        if (this.folderOf(tab)) setTimeout(() => this.keepPage(tab), 0);
      },
    };
    gBrowser.addTabsProgressListener(this.progress);
    // Ctrl+W closes it, before Zen's pinned-tab handling puts it to sleep.
    const close = document.getElementById("cmd_close");
    this.onClose = e => {
      const tabs = gBrowser.selectedTab?.multiselected ? gBrowser.selectedTabs : [gBrowser.selectedTab];
      if (!tabs.length || !tabs.every(t => this.folderOf(t))) return;
      e.stopImmediatePropagation();
      gBrowser.removeTabs(tabs);
    };
    close?.addEventListener("command", this.onClose, true);
    // Zen brings its folders back from the session after the window opens;
    // a folder dragged above or below the separator goes back to its side.
    const mark = () => this.mark();
    const soon = () => this.placeSoon();
    const grouped = () => this.remember();
    // (Restored from closed: wait for Zen to finish placing it.)
    const restoring = e => setTimeout(() => this.restore(e.target), 0);
    gBrowser.tabContainer.addEventListener("TabGrouped", grouped);
    gBrowser.tabContainer.addEventListener("TabUngrouped", grouped);
    gBrowser.tabContainer.addEventListener("SSTabRestoring", restoring);
    window.addEventListener("SSWindowRestored", mark);
    gBrowser.tabContainer.addEventListener("TabGroupCreate", mark);
    gBrowser.tabContainer.addEventListener("TabGroupMoved", soon);
    gBrowser.tabContainer.addEventListener("TabMove", soon);
    window.gZenWorkspaces?.promiseInitialized?.then(mark);
    onUnload(() => {
      gBrowser.removeTabsProgressListener(this.progress);
      close?.removeEventListener("command", this.onClose, true);
      window.removeEventListener("SSWindowRestored", mark);
      gBrowser.tabContainer.removeEventListener("TabGrouped", grouped);
      gBrowser.tabContainer.removeEventListener("TabUngrouped", grouped);
      gBrowser.tabContainer.removeEventListener("SSTabRestoring", restoring);
      gBrowser.tabContainer.removeEventListener("TabGroupCreate", mark);
      gBrowser.tabContainer.removeEventListener("TabGroupMoved", soon);
      gBrowser.tabContainer.removeEventListener("TabMove", soon);
    });
  },
};

