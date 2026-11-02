/* --- More: rare menu items in a submenu --------------------------------------
   The page's and the tab's right-click menus keep what you use; the rest
   (view source, send to device, set as desktop background, ask an AI…)
   moves into a "More" submenu at the end. Nothing is removed, and each item
   still appears only when Firefox would show it. Separators that end up
   doubled or at an edge are hidden. Turning the setting off puts every
   item back where it was. Each item can also be placed by hand (the rice
   picker's Menus and buttons): shown, in More, or off; yours win over the
   list below. */
const MoreMenus = {
  PREF: "zenith.plus.more-menu",
  PLACES: "zenith.internal.menu-items", // { item id: "shown" | "more" | "off" }
  MENUS: {
    contentAreaContextMenu: [
      "context-openlinkincurrent", "context-openlinkprivate", "context-openlinksmartwindow", "context-previewlink",
      "context-bookmarklink", "context-savelink", "context-stripOnShareLink", "context-sendlinktodevice",
      "context-media-playbackrate", "context-media-loop", "context-media-hidecontrols", "context-media-showcontrols",
      "context-viewvideo", "context-copyvideourl", "context-copyaudiourl", "context-video-saveimage",
      "context-reloadimage", "context-sendimage", "context-sendvideo", "context-sendaudio", "context-viewimageinfo",
      "context-viewimagedesc", "context-setDesktopBackground", "context-savepage", "context-paste-no-formatting",
      "context-print-selection", "context-copy-link-to-highlight", "context-copy-clean-link-to-highlight",
      "context-remove-highlight", "context-use-mini-window", "context-add-engine", "context-searchselect-private",
      "context-ask-chat", "context-create-aitab", "frame", "spell-check-enabled", "spell-add-dictionaries-main",
      "spell-dictionaries", "context-bidi-text-direction-toggle", "context-bidi-page-direction-toggle",
      "context-viewpartialsource-selection", "context-viewsource", "context-inspect-a11y", "context-sendpagetodevice",
      "context-media-eme-learnmore",
    ],
    tabContextMenu: [
      "context_selectAllTabs", "context_bookmarkTab", "context_bookmarkSelectedTabs", "context_askChat",
      "context_askChatSummarize", "context_createAITab", "context_addNote", "context_editNote", "context_sendTabToDevice", "context_shareSelectedTabs", "context_closeDuplicateTabs",
      "context_fullscreenAutohide", "context_fullscreenExit", "context_zen-add-domain-to-routing",
      "context_zen-edit-tab-icon",
    ],
  },

  places() {
    try {
      return JSON.parse(Services.prefs.getStringPref(this.PLACES, "") || "{}");
    } catch {
      return {};
    }
  },

  // Where an item goes: yours, else More for the rare ones (with More on).
  place(id, rare) {
    return this.places()[id] ?? (rare && Services.prefs.getBoolPref(this.PREF, true) ? "more" : "shown");
  },

  // The rice picker's list: a menu's items, wherever they are now.
  items(menu) {
    const popup = document.getElementById(menu);
    if (!popup) return [];
    const inner = popup.querySelector(":scope > .zenith-more")?.menupopup;
    const rare = new Set(this.MENUS[menu] ?? []);
    return [...popup.children, ...(inner?.children ?? [])]
      .filter(n => n.id && /^(menu|menuitem)$/.test(n.localName) && !n.id.includes("zenith-more") && !n.id.startsWith("context-viewsource-") && n.getAttribute("label"))
      .map(n => ({ id: n.id, label: n.getAttribute("label") || n.label || n.id, rare: rare.has(n.id) }));
  },

  init() {
    window.ZenithMenus = this; // the rice picker
    this.handlers = [];
    for (const [id, items] of Object.entries(this.MENUS)) {
      const popup = document.getElementById(id);
      if (!popup) continue;
      // After Firefox's own handler, which decides what shows this time.
      const fn = e => {
        if (e.target === popup) this.arrange(popup, new Set(items));
      };
      popup.addEventListener("popupshowing", fn);
      this.handlers.push([popup, fn]);
    }
    const watch = () => {
      if (!Services.prefs.getBoolPref(this.PREF, true)) for (const [popup] of this.handlers) this.restore(popup);
    };
    Services.prefs.addObserver(this.PREF, watch);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, watch);
      for (const [popup, fn] of this.handlers) popup.removeEventListener("popupshowing", fn);
    });
  },

  shown(node) {
    return !node.hidden && !node.collapsed && getComputedStyle(node).display !== "none";
  },

  arrange(popup, rare) {
    // (From where Firefox has them each time: a choice may have changed.)
    this.restore(popup);
    const where = new Map([...popup.children].filter(n => n.id).map(n => [n.id, this.place(n.id, rare.has(n.id))]));
    for (const n of popup.children) n.toggleAttribute("zenith-menu-off", where.get(n.id) === "off");
    const items = new Set([...where].filter(([, w]) => w === "more").map(([id]) => id));
    if (!items.size) return this.tidy(popup);
    let more = popup.querySelector(":scope > .zenith-more");
    if (!more) {
      more = document.createXULElement("menu");
      more.className = "zenith-more";
      more.id = `${popup.id}-zenith-more`;
      more.setAttribute("label", "More");
      more.append(document.createXULElement("menupopup"));
      popup.append(more);
    }
    const inner = more.menupopup ?? more.firstElementChild;
    // Move listed items over, leaving a hidden marker where each lived.
    let group = 0;
    for (const node of [...popup.children]) {
      if (node.localName === "menuseparator") group++;
      else if (node.id && items.has(node.id)) {
        const home = document.createXULElement("box");
        home.className = "zenith-more-home";
        home.hidden = true;
        home.dataset.item = node.id;
        node.replaceWith(home);
        node.dataset.zenithGroup = group;
        inner.append(node);
      }
    }
    // Inside More: a separator between items that were apart in the menu.
    for (const sep of inner.querySelectorAll(":scope > .zenith-more-sep")) sep.remove();
    let last = null;
    for (const node of [...inner.children]) {
      if (!this.shown(node)) continue;
      if (last !== null && node.dataset.zenithGroup !== last) {
        const sep = document.createXULElement("menuseparator");
        sep.className = "zenith-more-sep";
        node.before(sep);
      }
      last = node.dataset.zenithGroup;
    }
    more.hidden = last === null;
    this.tidy(popup);
  },

  // Hide separators that lead, trail or follow another separator.
  tidy(popup) {
    const nodes = [...popup.children];
    for (const n of nodes) n.removeAttribute("zenith-collapse");
    let before = false, pending = null;
    for (const n of nodes) {
      if (n.localName === "menuseparator") {
        if (!this.shown(n)) continue;
        if (!before || pending) n.setAttribute("zenith-collapse", "true");
        else pending = n;
      } else if (this.shown(n)) {
        before = true;
        pending = null;
      }
    }
    pending?.setAttribute("zenith-collapse", "true");
  },

  restore(popup) {
    const more = popup.querySelector(":scope > .zenith-more");
    if (!more) return;
    for (const home of popup.querySelectorAll(":scope > .zenith-more-home")) {
      const node = document.getElementById(home.dataset.item);
      if (node) home.replaceWith(node);
      else home.remove();
    }
    more.remove();
    for (const n of popup.children) n.removeAttribute("zenith-collapse");
  },
};

