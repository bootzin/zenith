/* --- Ctrl+Tab like Alt+Tab ---------------------------------------------------
   "Recently used" turns on Firefox's own recently-used order for Ctrl+Tab:
   hold Ctrl and press Tab to step back through the tabs you used last, with
   a row of page pictures (Zenith styles it), and let go of Ctrl to land,
   as Alt+Tab does with windows. Zen keeps it within the space. "In order,
   with pictures" shows the same row in the sidebar's order instead. Through
   the bridge, so your own setting comes back with "In order". */
const CtrlTabOrder = {
  PREF: "zenith.plus.ctrl-tab",

  init() {
    window.ZenithCtrlTab = this; // for tools/checks
    const apply = () => this.apply();
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, apply);
      this.ownOrder(false);
      this.backwards(false);
    });
    apply();
  },

  // "order" (Zen's: no pictures), "pictures" (in order, with pictures) or
  // "recent" (recently used, with pictures). Both picture kinds are
  // Firefox's recently-used Ctrl+Tab; "pictures" hands it the tabs in their
  // order instead, starting from this one, so Ctrl+Tab steps down the list.
  // With either, Ctrl+Shift+Tab starts the row going back (Firefox would
  // open its list of all tabs instead).
  apply() {
    const mode = Services.prefs.getStringPref(this.PREF, "") || "order";
    Bridge.apply("ctrltab", { "browser.ctrlTab.sortByRecentlyUsed": mode === "order" ? null : true });
    this.ownOrder(mode === "pictures");
    this.backwards(mode !== "order");
    try {
      window.ctrlTab?.readPref?.();
    } catch {}
  },

  backwards(on) {
    const C = window.ctrlTab;
    if (!C) return;
    this.keyDown ??= C.onKeyDown;
    if (!on) {
      C.onKeyDown = this.keyDown;
      return;
    }
    const orig = this.keyDown;
    C.onKeyDown = function (event) {
      const cycle = window.ShortcutUtils?.getSystemActionForEvent?.(event) === window.ShortcutUtils?.CYCLE_TABS;
      if (!cycle || !event.shiftKey || this.isOpen || event.defaultPrevented) return orig.call(this, event);
      event.preventDefault();
      event.stopPropagation();
      document.addEventListener("keyup", this, { mozSystemGroup: true });
      const tabs = gBrowser.visibleTabs;
      if (tabs.length > 2 && CtrlTabOrder.all) {
        this.open();
        CtrlTabOrder.step(this, -1);
        CtrlTabOrder.step(this, -1);
      } else if (tabs.length > 2) {
        this.open();
        // From the next one (open's choice), back past this one to the
        // last; moved directly, so the pictures still wait Firefox's 200ms
        // (stepping with advanceFocus would show them at once).
        const back = i => {
          do i = i > 0 ? i - 1 : this.previews.length - 1;
          while (this.previews[i].hidden);
          return i;
        };
        this._selectedIndex = back(back(this._selectedIndex));
        if (this.selected?._tab) gBrowser.warmupTab(this.selected._tab);
      } else if (tabs.length === 2) {
        gBrowser.selectedTab = tabs[tabs[0].selected ? 1 : 0];
      }
    };
  },

  ownOrder(on) {
    const C = window.ctrlTab;
    if (!C) return;
    this.firefox ??= Object.getOwnPropertyDescriptor(C, "tabList");
    this.open ??= C.open;
    this.advance ??= C.advanceFocus;
    if (on) {
      const self = this;
      Object.defineProperty(C, "tabList", { get: () => this.shown(), configurable: true, enumerable: true });
      // (Firefox starts on the second picture: here, the tab after yours.)
      const open = this.open;
      C.open = function (...args) {
        const r = open.apply(this, args);
        this._selectedIndex = self.cursor - self.from;
        return r;
      };
      C.advanceFocus = function (forward) {
        const p = self.step(this, forward ? 1 : -1);
        if (p?._tab) gBrowser.warmupTab(p._tab);
        if (this._timer) {
          clearTimeout(this._timer);
          this._timer = null;
          this._openPanel();
        }
      };
    } else if (this.firefox) {
      Object.defineProperty(C, "tabList", this.firefox);
      C.open = this.open;
      C.advanceFocus = this.advance;
      this.all = null;
    }
  },

  // The row: as many pictures as it holds, from this space's tabs in order;
  // stepping past either end moves it along, so every tab comes round.
  // (Set afresh each time it opens.)
  shown() {
    if (!this.all || !window.ctrlTab?.isOpen) this.begin();
    return this.all.slice(this.from, this.from + this.max());
  },

  max() {
    return window.ctrlTab?.maxTabPreviews ?? 7;
  },

  begin() {
    const tabs = (this.all = this.inOrder()), n = tabs.length, here = tabs.indexOf(gBrowser.selectedTab);
    this.cursor = n ? (here + 1) % n : 0;
    this.from = Math.max(0, Math.min(here, n - this.max()));
    this.from = this.fit(this.from);
  },

  fit(from) {
    const max = this.max();
    if (this.all.length <= max) return 0;
    if (this.cursor < from) return this.cursor;
    if (this.cursor >= from + max) return this.cursor - max + 1;
    return from;
  },

  step(C, by) {
    const n = this.all?.length;
    if (!n) return null;
    const i = C.previews.indexOf(C.selected);
    if (i >= 0) this.cursor = this.from + i; // (the pointer may have moved it)
    this.cursor = (this.cursor + by + n) % n;
    const from = this.fit(this.from);
    if (from !== this.from) {
      this.from = from;
      C.updatePreviews();
    }
    const j = this.cursor - this.from;
    if (C._selectedIndex === -1) C.previews[j]?.focus();
    else C._selectedIndex = j;
    return C.previews[j];
  },

  // This space's tabs in the sidebar's order, essentials first (asleep
  // ones too). (A tab with a glance open is its glance: that's what's
  // selected and shown for it.)
  inOrder() {
    const tabs = gBrowser.visibleTabs.filter(t => !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"));
    const essential = tabs.filter(t => t.hasAttribute("zen-essential"));
    return [...essential, ...tabs.filter(t => !essential.includes(t))].map(t => t.glanceTab ?? t);
  },


};

