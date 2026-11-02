/* --- Float a tab (Alt+Shift+F) --------------------------------------------------
   The tab you're on (or the one you right-click › Float this tab) moves into
   a small window of its own, its page carrying on as it was (nothing
   reloads). The window has the focus once it opens, so Alt+Shift+F again
   puts the tab back. It stays on top (Tools › Float a tab › Stays above):
     zen  above its Zen window only, not other apps (the default); it closes
          with that window (Ctrl+Shift+T brings it back floating, or the next start does);
     all  above every app (a call or a stream while you work elsewhere).
   Its bar: the page's title (click it, or Ctrl+L, Alt+D or F4, to type
   another address), a pin (pinned, the bar stays above the page; unpinned,
   it slides down when the pointer comes into the window or to its top
   edge), back into the window, minimise (above every app), and
   close (Ctrl+Shift+T brings it back,
   floating). Drag the bar to move it (it settles against an edge it's let
   go near; double-click for its corner). A floating tab is kept with the
   session: as Zen quits it goes back into its window, marked, and floats
   again as Zen starts. */
const FloatTab = {
  PREF: "zenith.plus.float-tab",
  ABOVE: "zenith.plus.float-above", // zen · all
  PINNED: "zenith.internal.float.bar-pinned",
  MARK: "zenithFloat", // a tab to float again once it's back (session)
  KEPT: "zenith.internal.float.kept", // floats kept as Zen closed its last window: [{ state, essential }]
  GAP: 16,
  NEAR: 48,

  get above() {
    return Services.prefs.getStringPref(this.ABOVE, "zen") === "all" ? "all" : "zen";
  },

  init() {
    const commandset = document.createXULElement("commandset");
    const command = document.createXULElement("command");
    command.id = "zenith-float-command";
    command.addEventListener("command", () => this.toggle());
    commandset.append(command);
    const keyset = document.createXULElement("keyset");
    const key = document.createXULElement("key");
    key.id = "zenith-float-key";
    key.setAttribute("modifiers", "alt,shift");
    key.setAttribute("key", "F");
    key.setAttribute("reserved", "true");
    key.setAttribute("command", command.id);
    keyset.append(key);
    root.append(commandset, keyset);
    this.menu();
    const watch = () => {
      const on = Services.prefs.getBoolPref(this.PREF, true);
      key.toggleAttribute("disabled", !on);
      if (this.item) this.item.hidden = !on;
    };
    Services.prefs.addObserver(this.PREF, watch);
    onUnload(() => Services.prefs.removeObserver(this.PREF, watch));
    watch();
    if (window.zenithFloatFrom) this.asWindow();
    else this.asHome();
    window.ZenithFloat = this; // for tools/checks
  },

  // The tab's right-click menu, beside Pin, Unload and Duplicate: Float
  // this tab (or, in a float window, Put back in the window).
  menu() {
    const menu = document.getElementById("tabContextMenu");
    if (!menu) return;
    const item = (this.item = document.createXULElement("menuitem"));
    item.id = "zenith-float-tab";
    item.setAttribute("key", "zenith-float-key");
    const after = document.getElementById("context_duplicateTabs") ?? document.getElementById("context_duplicateTab");
    if (after) after.after(item);
    else menu.append(item);
    menu.addEventListener("popupshowing", e => {
      if (e.target !== menu) return;
      const tab = window.TabContextMenu?.contextTab;
      item.setAttribute("label", window.zenithFloatFrom ? "Put back in the window" : "Float this tab");
      item.disabled = !tab || tab.hasAttribute("zen-empty-tab") || (tab.hasAttribute("zen-essential") && !window.zenithFloatFrom);
    });
    item.addEventListener("command", () => {
      const tab = window.TabContextMenu?.contextTab;
      if (window.zenithFloatFrom) this.back(tab);
      else this.float(tab);
    });
  },

  toggle() {
    if (window.zenithFloatFrom) return this.back();
    return this.float(gBrowser.selectedTab);
  },

  // The tab itself when a glance is open in it (the glance closed first).
  own(tab = gBrowser.selectedTab) {
    const parent = window.gZenGlanceManager?.getTabOrGlanceParent?.(tab) ?? tab;
    if (parent !== tab) {
      try {
        window.gZenGlanceManager.quickCloseGlance?.();
      } catch {}
    }
    return parent;
  },

  floating(tab) {
    return !!tab && !tab.hasAttribute("zen-empty-tab");
  },

  /* In a main window */

  // Tabs marked to float again (closed from a float, or brought home as Zen
  // quit or their window closed) float once they're back; above Zen, its
  // floats come home with this window as it closes.
  asHome() {
    const restoring = e => {
      const tab = e.target;
      if (!SessionStore.getCustomTabValue(tab, this.MARK)) return;
      SessionStore.promiseAllWindowsRestored.then(() => setTimeout(() => {
        if (tab.isConnected && Services.prefs.getBoolPref(this.PREF, true)) this.float(tab, { focus: Services.focus.activeWindow === window });
      }, 400));
    };
    gBrowser.tabContainer.addEventListener("SSTabRestoring", restoring);
    // As Zen starts: marked tabs come back asleep, which says nothing; they
    // float once the session is back. So do the floats kept as Zen closed
    // its last window.
    SessionStore.promiseAllWindowsRestored.then(() => setTimeout(() => {
      if (!Services.prefs.getBoolPref(this.PREF, true)) return;
      if (Services.prefs.prefHasUserValue(this.KEPT) && Services.wm.getMostRecentWindow("navigator:browser") === window) {
        let kept = [];
        try {
          kept = JSON.parse(Services.prefs.getStringPref(this.KEPT, "[]"));
        } catch {}
        Services.prefs.clearUserPref(this.KEPT);
        for (const { state, essential } of kept) {
          // (The session may have brought it back as a plain sleeping tab.)
          let url = null;
          try {
            const st = typeof state === "string" ? JSON.parse(state) : state;
            url = st?.entries?.at((st.index ?? st.entries.length) - 1)?.url ?? null;
          } catch {}
          const twin = gBrowser.tabs.find(t => t.hasAttribute("pending") && !SessionStore.getCustomTabValue(t, this.MARK) &&
                                              (SessionStore.getLazyTabValue(t, "url") || t.linkedBrowser?.currentURI?.spec) === url);
          if (twin) gBrowser.removeTab(twin, { animate: false });
          // (Opened afresh at its page: a restored sleeping tab can't be
          // woken here without taking the selection.)
          if (!url) continue;
          const tab = gBrowser.addTrustedTab(url, { inBackground: true });
          if (essential) SessionStore.setCustomTabValue(tab, this.MARK, "essential");
          setTimeout(() => this.float(tab, { focus: false }), 1200);
        }
      }
      for (const tab of gBrowser.tabs) {
        if (!tab.isConnected || !SessionStore.getCustomTabValue(tab, this.MARK)) continue;
        this.float(tab, { focus: false });
      }
    }, 800));
    // This window closing: its floats above Zen close with it. Their tabs
    // go to another Zen window's recently closed tabs (Ctrl+Shift+T there
    // floats them again: Zen keeps no closed windows to bring back), or,
    // with no other window (Zen is quitting), home, to float again next time.
    const closing = () => {
      window.zenithClosing = true;
      const other = [...Services.wm.getEnumerator("navigator:browser")].reverse()
        .find(w => w !== window && !w.zenithFloatFrom && !w.closed && !w.closing);
      // (The last window: Zen is closing; each float's kept state brings
      // it back at the next start.)
      if (!other) return;
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        if (win.zenithFloatFrom !== window || win.closed || win.ZenithFloat?.mode !== "zen") continue;
        const moved = win.ZenithFloat.comeHome(other);
        if (moved) other.gBrowser.removeTab(moved, { animate: false });
      }
    };
    window.addEventListener("SSWindowClosing", closing);
    onUnload(() => {
      gBrowser.tabContainer.removeEventListener("SSTabRestoring", restoring);
      window.removeEventListener("SSWindowClosing", closing);
    });
  },

  float(tab, { focus = true } = {}) {
    tab = tab && this.own(tab);
    if (!this.floating(tab)) return null;
    // Your only tab: a new one keeps this window (Firefox closes a window
    // whose last tab leaves, and Zen's empty tab doesn't count).
    if (!gBrowser.tabs.some(t => t !== tab && !t.closing && !t.hasAttribute("zen-empty-tab"))) {
      gBrowser.addTrustedTab(window.BROWSER_NEW_TAB_URL || "about:newtab", { inBackground: true });
    }
    // Asleep (as it comes back at start): woken first, the way Firefox wakes
    // a tab, by selecting it, so the window gets the page and not a blank;
    // then the tab you were on is selected again.
    if (!tab.linkedPanel || tab.hasAttribute("pending")) {
      const was = gBrowser.selectedTab;
      const woke = new Promise(resolve => {
        tab.addEventListener("SSTabRestored", resolve, { once: true });
        setTimeout(resolve, 5000);
      });
      gBrowser.selectedTab = tab;
      return woke.then(() => {
        if (!tab.isConnected) return null;
        const win = this.float(tab, { focus });
        if (was?.isConnected && was !== tab) gBrowser.selectedTab = was;
        return win;
      });
    }
    // In a split: back into it when it comes back (its partners, its place).
    const split = tab.group?.hasAttribute?.("split-view-group") ? tab.group : null;
    const splitInfo = split ? { partners: split.tabs.filter(t => t !== tab), index: split.tabs.indexOf(tab) } : null;
    // An essential floats too, and is an essential again when it's back.
    const essential = tab.hasAttribute("zen-essential") || SessionStore.getCustomTabValue(tab, this.MARK) === "essential";
    SessionStore.deleteCustomTabValue(tab, this.MARK);
    const { w, h, x, y } = this.box(), mode = this.above;
    // Above Zen: a window owned by this one (the system keeps it above this
    // window only, minimises it with it, and closes it with it).
    const features = { popup: "yes", resizable: "yes", outerWidth: w, outerHeight: h, left: x, top: y,
                       ...(mode === "zen" ? { dependent: "yes" } : { alwaysontop: "yes" }) };
    // Zen's own pages (Settings, the tab manager, the start page) run in the
    // browser itself and come out blank when moved: they open there afresh.
    let win;
    if (!tab.linkedBrowser?.isRemoteBrowser) {
      const url = tab.linkedBrowser?.currentURI?.spec ?? "about:blank";
      win = window.openDialog(AppConstants.BROWSER_CHROME_URL, "_blank",
                              "chrome,dialog=no,all," + Object.entries(features).map(([k, v]) => `${k}=${v}`).join(","), url);
      win?.addEventListener("load", () => gBrowser.removeTab(tab, { animate: false }), { once: true });
    } else {
      win = gBrowser.replaceTabWithWindow(tab, features);
    }
    if (!win) return null;
    // Only this tab: with Zen's window sync a new window would otherwise
    // take every tab (and leave this window empty).
    win._zenStartupSyncFlag = "unsynced";
    win.zenithFloatFrom = window;
    win.zenithFloatMode = mode;
    win.zenithFloatEssential = essential;
    win.zenithFloatSplit = splitInfo;
    if (focus) win.addEventListener("load", () => win.setTimeout(() => win.focus(), 0), { once: true });
    return win;
  },

  // The float window's size on this screen (half the width on small
  // screens, 40%, a third on big ones; 16:10) in the bottom right corner.
  box() {
    const s = screen, wide = s.availWidth;
    const w = Math.round(wide * (wide <= 1400 ? 0.42 : wide < 2200 ? 0.34 : 0.28));
    const h = Math.round(w * 0.625);
    return { w, h, x: s.availLeft + s.availWidth - w - this.GAP, y: s.availTop + s.availHeight - h - this.GAP };
  },

  /* In the float window itself */

  asWindow() {
    this.mode = window.zenithFloatMode ?? this.above;
    root.setAttribute("zenith-float", this.mode);
    if (this.mode === "all") {
      try {
        window.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow).zLevel = Ci.nsIAppWindow.highestZ;
      } catch {}
    }
    this.buildBar();
    const pinned = () => root.toggleAttribute("zenith-float-pinned", Services.prefs.getBoolPref(this.PINNED, true));
    Services.prefs.addObserver(this.PINNED, pinned);
    onUnload(() => Services.prefs.removeObserver(this.PINNED, pinned));
    pinned();
    // Ctrl+L, Alt+D, F4: type an address (the window has no address bar).
    window.addEventListener("keydown", e => {
      const k = e.key.toLowerCase();
      if (!((e.ctrlKey && !e.altKey && !e.shiftKey && k === "l") || (e.altKey && !e.ctrlKey && !e.shiftKey && k === "d") || (e.key === "F4" && !e.altKey && !e.ctrlKey))) return;
      e.preventDefault();
      e.stopPropagation();
      this.edit();
    }, true);
    // Ctrl+W, or the window closing any other way: the tab closes in the
    // main window, so Ctrl+Shift+T there brings it back (floating).
    document.getElementById("cmd_close")?.addEventListener("command", e => {
      e.stopImmediatePropagation();
      this.closeFromWindow();
    }, true);
    window.addEventListener("close", e => {
      if (this.closing) return;
      e.preventDefault();
      this.closeFromWindow();
    });
    // Its tab as it is, kept up to date while it floats: if Zen closes
    // without taking it home (its last window closed), it floats again at
    // the next start. Put back or closed, it's forgotten.
    this.keepId = `${Date.now()}-${Math.random()}`;
    const keep = () => {
      clearTimeout(this.keepTimer);
      this.keepTimer = setTimeout(() => this.keep(), 500);
    };
    gBrowser.addTabsProgressListener({ onLocationChange: keep });
    keep();
    // Zen quitting: the tab goes home first, marked, so it floats again
    // when Zen starts.
    const quitting = () => !this.closing && this.comeHome();
    Services.obs.addObserver(quitting, "quit-application-requested");
    onUnload(() => Services.obs.removeObserver(quitting, "quit-application-requested"));
    requestAnimationFrame(() => {
      this.place();
      // Sent to the scratchpad (Zenith Shell): put away once it's in place
      // (place() moves it a frame later).
      if (window.zenithScratchpad) setTimeout(() => Scratchpad.show(window, false), 200);
    });
  },

  buildBar() {
    const holder = document.getElementById("zen-appcontent-wrapper") ?? document.body;
    const bar = (this.bar = el("div", { class: "zenith-float-bar" }));
    const title = (this.title = el("span", { class: "zenith-float-title", title: "Type an address (Ctrl+L)" }));
    const button = (kind, tip, fn) => {
      const b = el("button", { class: "zenith-float-button", kind, title: tip });
      b.addEventListener("click", e => {
        e.stopPropagation();
        fn();
      });
      return b;
    };
    const pin = button("pin", "", () => Services.prefs.setBoolPref(this.PINNED, !Services.prefs.getBoolPref(this.PINNED, true)));
    const tipPin = () => pin.setAttribute("title", Services.prefs.getBoolPref(this.PINNED, true) ? "Unpin the bar: it shows when the pointer comes in" : "Pin the bar above the page");
    Services.prefs.addObserver(this.PINNED, tipPin);
    onUnload(() => Services.prefs.removeObserver(this.PINNED, tipPin));
    tipPin();
    bar.append(title, pin,
      button("back", "Put back in the window (Alt+Shift+F)", () => this.back()),
      ...(this.mode === "all" ? [button("minimise", "Minimise", () => window.minimize())] : []),
      button("close", "Close the tab (Ctrl+Shift+T brings it back)", () => this.closeFromWindow()));
    // (Unpinned: a strip along the top edge to bring it down.)
    const edge = el("div", { class: "zenith-float-edge" });
    holder.append(edge, bar);
    const name = () => {
      if (!bar.hasAttribute("editing")) title.textContent = gBrowser.selectedTab?.label ?? "";
    };
    gBrowser.tabContainer.addEventListener("TabAttrModified", name);
    name();
    // Unpinned, the bar comes down for a moment when the pointer comes into
    // the window, and while it's on the top edge or the bar.
    const peek = ms => {
      root.setAttribute("zenith-float-peek", "true");
      clearTimeout(this.peekTimer);
      this.peekTimer = setTimeout(() => !bar.matches(":hover") && root.removeAttribute("zenith-float-peek"), ms);
    };
    edge.addEventListener("mouseenter", () => peek(1200));
    bar.addEventListener("mouseleave", () => peek(400));
    document.addEventListener("mouseover", e => !e.relatedTarget && peek(1500));
    this.draggable(bar, () => [window.screenX, window.screenY],
      ([x0, y0], dx, dy) => window.moveTo(Math.round(x0 + dx), Math.round(y0 + dy)),
      moved => {
        if (!moved) return;
        const s = screen;
        const [x, y] = this.settle(window.screenX, window.screenY, window.outerWidth, window.outerHeight,
                                   s.availLeft, s.availTop, s.availLeft + s.availWidth, s.availTop + s.availHeight);
        window.moveTo(x, y);
      },
      target => target === title && this.edit());
    bar.addEventListener("dblclick", e => !e.target.closest("button, input") && this.place());
  },

  // Dragging the bar moves the float: move(from, dx, dy); done(moved) once
  // let go; clicked(target) if it was let go where it was pressed.
  draggable(bar, start, move, done, clicked) {
    bar.addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest("button, input")) return;
      e.preventDefault();
      const from = start(), sx = e.screenX, sy = e.screenY, target = e.target;
      let moved = false;
      bar.setPointerCapture(e.pointerId);
      const onMove = m => {
        if (!moved && Math.abs(m.screenX - sx) + Math.abs(m.screenY - sy) < 4) return;
        moved = true;
        bar.setAttribute("moving", "true");
        move(from, m.screenX - sx, m.screenY - sy);
      };
      const up = () => {
        bar.removeEventListener("pointermove", onMove);
        bar.removeEventListener("lostpointercapture", up);
        bar.removeAttribute("moving");
        done(moved);
        if (!moved) clicked(target);
      };
      bar.addEventListener("pointermove", onMove);
      bar.addEventListener("lostpointercapture", up, { once: true });
    });
  },

  // Near an edge: against it, a small gap away; at least part of it stays
  // within reach.
  settle(x, y, w, h, L, T, R, B) {
    if (x - L < this.NEAR) x = L + this.GAP;
    else if (R - (x + w) < this.NEAR) x = R - w - this.GAP;
    if (y - T < this.NEAR) y = T + this.GAP;
    else if (B - (y + h) < this.NEAR) y = B - h - this.GAP;
    return [Math.min(Math.max(x, L - w + 80), R - 80), Math.min(Math.max(y, T), B - 40)];
  },

  // (Zen keeps windows fairly tall unless told otherwise: placed by the
  // size it got.)
  place() {
    const { w, h } = this.box(), s = screen;
    window.resizeTo(w, h);
    requestAnimationFrame(() => window.moveTo(s.availLeft + s.availWidth - window.outerWidth - this.GAP,
                                              Math.max(s.availTop, s.availTop + s.availHeight - window.outerHeight - this.GAP)));
  },

  // The title becomes an address field: Enter goes there (an address, or a
  // search with your engine), Escape or clicking away leaves it be.
  edit() {
    const bar = this.bar;
    if (!bar || bar.hasAttribute("editing")) return bar?.querySelector("input")?.select();
    bar.setAttribute("editing", "true");
    const input = el("input", { class: "zenith-float-address", type: "text", spellcheck: "false" });
    input.value = gBrowser.selectedBrowser.currentURI?.displaySpec ?? "";
    this.title.after(input);
    const finish = go => {
      if (!input.isConnected) return;
      const text = input.value.trim();
      input.remove();
      bar.removeAttribute("editing");
      this.title.textContent = gBrowser.selectedTab?.label ?? "";
      if (!go || !text) return gBrowser.selectedBrowser.focus();
      let flags = Ci.nsIURIFixup.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP | Ci.nsIURIFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS;
      if (ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs").PrivateBrowsingUtils.isWindowPrivate(window)) flags |= Ci.nsIURIFixup.FIXUP_FLAG_PRIVATE_CONTEXT;
      try {
        const uri = Services.uriFixup.getFixupURIInfo(text, flags).preferredURI;
        if (uri) gBrowser.selectedBrowser.loadURI(uri, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      } catch (e) {
        console.error("[Zenith] float address", e);
      }
      gBrowser.selectedBrowser.focus();
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    input.addEventListener("blur", () => finish(false));
    input.focus();
    input.select();
  },

  // The window it came from (else the last browser window); none while
  // that's closing (its floats go with it, kept for the next start).
  home() {
    const closing = w => !w || w.closed || w.zenithClosing || w.gBrowser?._windowIsClosing;
    let home = window.zenithFloatFrom;
    if (closing(home) && home && !home.closed) return null;
    if (!home || home.closed) home = [...Services.wm.getEnumerator("navigator:browser")].reverse().find(w => w !== window && !w.zenithFloatFrom && !w.closed);
    return home ?? null;
  },

  // Back to the window it came from (or the last browser window), selected.
  keep(forget = false) {
    let kept = [];
    try {
      kept = JSON.parse(Services.prefs.getStringPref(FloatTab.KEPT, "[]")).filter(k => k.id !== this.keepId);
    } catch {}
    const tab = !forget && !this.closing && gBrowser.selectedTab;
    if (tab && !PrivateBrowsingUtilsOf(window)) {
      try {
        kept.push({ id: this.keepId, state: SessionStore.getTabState(tab), essential: !!window.zenithFloatEssential });
      } catch {}
    }
    if (kept.length) Services.prefs.setStringPref(FloatTab.KEPT, JSON.stringify(kept));
    else Services.prefs.clearUserPref(FloatTab.KEPT);
  },

  // Into the home window: moved (nothing reloads), or, for Zen's own pages,
  // opened there afresh (this window, with nothing left, closes).
  moveTo(home, tab, select) {
    clearTimeout(this.keepTimer);
    this.keep(true);
    // (Whatever's left, a closed glance say, doesn't keep this window open.)
    setTimeout(() => !window.closed && window.close(), 100);
    let moved;
    if (tab.linkedBrowser?.isRemoteBrowser) {
      moved = home.gBrowser.adoptTab(tab, { selectTab: select });
    } else {
      moved = home.gBrowser.addTrustedTab(tab.linkedBrowser?.currentURI?.spec ?? "about:blank", { inBackground: !select });
      if (select) home.gBrowser.selectedTab = moved;
    }
    if (moved && window.zenithFloatSplit) home.ZenithFloat?.joinSplit(moved, window.zenithFloatSplit, select);
    return moved;
  },

  back(tab = gBrowser.selectedTab) {
    const home = this.home();
    tab = tab && this.own(tab);
    if (!home || !tab) return null;
    this.closing = true;
    const moved = this.moveTo(home, tab, true);
    this.essentialAgain(home, moved);
    home.focus();
    return moved;
  },

  // Run by the home window's own Zenith (this window is closing: what it
  // schedules wouldn't run).
  essentialAgain(home, tab) {
    if (tab && window.zenithFloatEssential) home.ZenithFloat?.makeEssential(tab);
  },

  // Back into the split it floated out of (run by the home window's own
  // Zenith): beside its partners, in its place.
  joinSplit(tab, info, select) {
    setTimeout(() => {
      try {
        const S = window.gZenViewSplitter, partners = info.partners.filter(t => t.isConnected && !t.closing);
        if (!S || !tab.isConnected || !partners.length) return;
        const into = partners.find(t => t.group?.hasAttribute("split-view-group"));
        if (into) {
          S.splitTabs([into, tab], undefined, -1, { activate: !!select });
          // (Joined at the end: moved back to its place.)
          setTimeout(() => {
            const tabs = () => tab.group?.tabs ?? [];
            for (let i = tabs().indexOf(tab); i > info.index && i > 0; i = tabs().indexOf(tab)) {
              if (!SplitReorder.swap(tab, tabs()[i - 1])) break;
            }
          }, 300);
        } else {
          S.splitTabs([...partners.slice(0, info.index), tab, ...partners.slice(info.index)], undefined, info.index, { activate: !!select });
        }
        if (select) gBrowser.selectedTab = tab;
      } catch (e) {
        console.error("[Zenith] float: back into its split", e);
      }
    }, 400);
  },

  makeEssential(tab) {
    setTimeout(() => {
      try {
        if (tab.isConnected && !tab.hasAttribute("zen-essential")) gZenPinnedTabManager?.addToEssentials?.(tab);
      } catch (e) {
        console.error("[Zenith] float: essential again", e);
      }
    }, 300);
  },


  // Home (marked, not selected) without a fuss: Zen quitting, or the window
  // it floats above closing (that window: `to`).
  comeHome(to = this.home()) {
    const tab = this.own();
    if (!to || !tab || this.closing) return null;
    this.closing = true;
    const moved = this.moveTo(to, tab, false);
    if (moved) to.SessionStore.setCustomTabValue(moved, this.MARK, window.zenithFloatEssential ? "essential" : "1");
    return moved;
  },

  // Closed from the float window: back to the main window first, closed
  // there (so it's among that window's closed tabs, marked to float).
  closeFromWindow() {
    const home = this.home(), tab = this.own();
    this.closing = true;
    if (!home || !tab) return window.close();
    const moved = this.moveTo(home, tab, false);
    if (moved) {
      home.SessionStore.setCustomTabValue(moved, this.MARK, window.zenithFloatEssential ? "essential" : "1");
      home.gBrowser.removeTab(moved, { animate: false });
    }
    return moved;
  },
};

