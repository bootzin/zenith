/* --- Focus mode: Alt+Z puts everything away ----------------------------------
   For reading or watching: the sidebar hides (compact mode, if it wasn't
   already), the top toolbar too (Zen's own "hide the toolbar" for the
   while), and so do the edges, the minimap, pills, the workspace dots,
   the bookmarks bar and the link address at the bottom; whatever was open
   closes (Firefox's sidebar, Zenith's bookmarks, Zen's Library, the
   settings panel, the switcher, the find bar, menus). You can open any of
   them again while focused. The sharing alarm still shows.
   The page too (see plus/pages/focus-page.sys.mjs), the tab you're on and
   any you switch to: a video site becomes a place to watch (Focus mode ›
   Video sites), an article gets a reading view over the page, and any
   other page that's mostly reading is tidied (Focus mode › Pages). One
   pill says focus mode is on, then what was done, with "Show the page"
   (this tab, now) and "Not on <site>" (added to the sites focus mode
   leaves alone, Focus mode › Sites left alone).
   Alt+Z again brings everything back: compact mode and the toolbar as they
   were, what was open opens again, pages as they were (nothing reloads).
   Focus mode is for the site you're on (Focus mode › On for): its tabs,
   and pages on it you go to; on another site's tab the browser is as it
   was, and back on the site it's focused again. Or for every site. */
const FocusMode = {
  PREF: "zenith.plus.focus-key",
  PAGES: "zenith.plus.focus-pages", // "" reading view, tidy · reader (no tidy) · off
  SKIP: "zenith.plus.focus-skip", // sites left alone: "example.com, news.site"
  VIDEO: "zenith.plus.focus-video", // video sites, a place to watch; its parts: focus-video-<part>
  SCOPE: "zenith.plus.focus-scope", // "" the site you're on · all: every site
  PARTS: { search: true, description: true, playlist: true, comments: false, subscriptions: false },

  // (The browser's part: focused for the tab you're on.)
  get on() {
    return root.hasAttribute("zenith-focus");
  },

  get scope() {
    return Services.prefs.getStringPref(this.SCOPE, "") === "all" ? "all" : "site";
  },

  // A tab's site, as focus mode counts them (example.com for
  // news.example.com too).
  siteOf(tab) {
    const uri = tab?.linkedBrowser?.currentURI;
    if (!uri) return "";
    try {
      return Services.eTLD.getBaseDomain(uri);
    } catch {
      return uri.asciiHost || uri.spec;
    }
  },

  focused(tab) {
    return !!this.everywhere || !!this.sites?.has(this.siteOf(tab));
  },

  get pages() {
    return Services.prefs.getStringPref(this.PAGES, "") || "tidy";
  },

  get skipped() {
    return Services.prefs.getStringPref(this.SKIP, "").split(/[\s,]+/).map(s => s.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);
  },

  skips(host) {
    host = (host || "").toLowerCase().replace(/^www\./, "");
    return !!host && this.skipped.some(s => host === s || host.endsWith(`.${s}`));
  },

  // Alt+Z: on or off for the site you're on (or every site).
  toggle(want) {
    const tab = gBrowser.selectedTab, site = this.siteOf(tab);
    this.sites ??= new Set();
    want ??= !this.focused(tab);
    if (want === this.focused(tab)) return;
    this.changed ??= new Map(); // tab → what was done to its page
    if (want && this.scope === "all") this.everywhere = true;
    else if (want) this.sites.add(site);
    else if (this.everywhere || this.scope === "all") return this.off();
    else {
      this.sites.delete(site);
      this.restorePages(t => this.siteOf(t) === site);
    }
    this.follow(this.everywhere || this.sites.size > 0);
    this.browser(this.focused(tab), true);
    if (want) this.page(tab);
  },

  // Off everywhere.
  off() {
    this.everywhere = false;
    this.sites?.clear();
    this.follow(false);
    this.restorePages();
    this.browser(false, true);
  },

  // The browser around the page: away (compact, no toolbar, what's open
  // closed) or back as it was.
  browser(want, told) {
    if (want === this.on) return;
    const compact = window.gZenCompactModeManager;
    if (want) {
      this.madeCompact = !!compact && !compact.preference;
      if (this.madeCompact) compact.preference = true;
      root.setAttribute("zenith-focus", "true");
      // (The top toolbar, when Zen shows one: hidden as compact mode can.)
      if (!Services.prefs.getBoolPref("zen.view.use-single-toolbar", true)) Bridge.apply("focus", { "zen.view.compact.hide-toolbar": true });
      this.putAway();
      if (told) {
        const where = this.everywhere ? "Focus mode" : `Focus mode on ${this.siteOf(gBrowser.selectedTab)}`;
        this.say(null, Services.prefs.getBoolPref(this.PREF, true) ? `${where} · Alt+Z to leave` : where);
      }
    } else {
      root.removeAttribute("zenith-focus");
      if (this.madeCompact && compact?.preference) compact.preference = false;
      this.madeCompact = false;
      Bridge.apply("focus", { "zen.view.compact.hide-toolbar": null });
      this.bringBack();
      this.pill?.removeAttribute("show");
    }
  },

  // The tab you're on now: focused or not, as its site is.
  onTab() {
    const tab = gBrowser.selectedTab, on = this.focused(tab);
    this.browser(on, false);
    if (on) this.page(tab);
  },

  // Whatever's open closes as focus mode starts; what it was is kept, to
  // open again as focus mode ends.
  putAway() {
    const quietly = fn => {
      try {
        return fn();
      } catch {
        return null;
      }
    };
    const was = (this.was = {});
    quietly(() => {
      if (window.SidebarController?.isOpen) {
        was.sidebar = window.SidebarController.currentID;
        window.SidebarController.hide();
      }
    });
    quietly(() => {
      const P = window.ZenithBookmarks?.Panel;
      if (P?.node && !P.node.hidden) {
        was.bookmarks = true;
        P.hide();
      }
    });
    quietly(() => {
      const L = window.ZenithLive;
      if (L?.host && !L.host.hidden) {
        was.live = true;
        L.close();
      }
    });
    quietly(() => window.ZenithSwitcher?.hide?.());
    quietly(() => {
      const bar = gBrowser.getCachedFindBar?.();
      if (bar && !bar.hidden) {
        was.find = gBrowser.selectedTab;
        bar.close();
      }
    });
    quietly(() => {
      const lib = document.querySelector("zen-library");
      if (lib && (lib.hasAttribute("open") || !lib.isHidden?.())) {
        was.library = lib.activeTab || true;
        lib.onKeyDown?.({ key: "Escape", keyCode: 27, preventDefault() {}, stopPropagation() {}, target: lib });
      }
    });
    for (const p of document.querySelectorAll("panel[panelopen='true'], menupopup[open]")) quietly(() => p.hidePopup());
  },

  bringBack() {
    const was = this.was ?? {};
    this.was = null;
    const quietly = fn => {
      try {
        fn();
      } catch (e) {
        console.error("[Zenith] focus mode: opening again", e);
      }
    };
    if (was.sidebar) quietly(() => window.SidebarController?.show(was.sidebar));
    if (was.bookmarks) quietly(() => window.ZenithBookmarks?.Panel?.show());
    if (was.live) quietly(() => window.ZenithLive?.open());
    if (was.find?.isConnected && was.find.selected) quietly(() => gBrowser.getFindBar(was.find).then(bar => bar.open()));
    if (was.library) {
      quietly(() => {
        const lib = document.querySelector("zen-library");
        const open = lib && (lib.hasAttribute("open") || !lib.isHidden?.());
        if (!open) document.getElementById("cmd_zenToggleLibrary")?.doCommand();
        if (typeof was.library === "string" && lib) lib.activeTab = was.library;
      });
    }
  },

  // While focused: the tab you switch to, and pages loading in it.
  follow(on) {
    if (on && this.onSelect) return;
    if (on) {
      this.onSelect = () => this.onTab();
      this.progress = {
        onStateChange: (browser, webProgress, request, flags) => {
          const done = flags & Ci.nsIWebProgressListener.STATE_STOP && flags & Ci.nsIWebProgressListener.STATE_IS_WINDOW;
          if (done && webProgress?.isTopLevel && browser === gBrowser.selectedBrowser) this.onTab();
        },
      };
      gBrowser.tabContainer.addEventListener("TabSelect", this.onSelect);
      gBrowser.addTabsProgressListener(this.progress);
    } else if (this.onSelect) {
      gBrowser.tabContainer.removeEventListener("TabSelect", this.onSelect);
      gBrowser.removeTabsProgressListener(this.progress);
      this.onSelect = this.progress = null;
    }
  },

  actor(browser) {
    return PageActors.in(browser, "ZenithFocus", "focus-page.sys.mjs");
  },

  // What to keep on video sites (each its own setting).
  get keep() {
    return Object.fromEntries(Object.entries(this.PARTS).map(([part, on]) => [part, Services.prefs.getBoolPref(`${this.VIDEO}-${part}`, on)]));
  },

  // The page you're on: a place to watch on a video site, a reading view
  // for an article, or tidied; each only once per page.
  async page(tab) {
    const mode = this.pages, video = Services.prefs.getBoolPref(this.VIDEO, true), browser = tab?.linkedBrowser;
    if ((mode === "off" && !video) || !browser || !this.focused(tab)) return;
    const uri = browser.currentURI;
    if (!/^https?$/.test(uri?.scheme ?? "") || this.skips(uri.host)) return;
    // (Firefox works out whether it's an article a moment after it loads.)
    for (let i = 0; i < 12 && !browser.isArticle && browser.webProgress?.isLoadingDocument; i++) await new Promise(r => setTimeout(r, 250));
    await new Promise(r => setTimeout(r, 300));
    if (!this.focused(tab) || tab !== gBrowser.selectedTab || this.changed?.get(tab)?.spec === uri.spec) return;
    const actor = await this.actor(browser);
    if (!actor) return;
    const ask = (name, data) => actor.sendQuery(name, data).catch(() => false);
    const kind = (await ask("kind")) || {};
    // (An article with a video in it is still an article; the reading view
    // only for what Firefox itself takes for an article.)
    let done = null;
    if (video && (kind.site || (kind.video && !browser.isArticle)) && (await ask("watch", this.keep))) done = "watch";
    else if (mode !== "off" && browser.isArticle && (await ask("read"))) done = "read";
    else if (mode === "tidy" && kind.reading && (await ask("tidy"))) done = "tidy";
    if (!done) return;
    this.changed?.set(tab, { spec: uri.spec, done });
    this.say(tab, done);
  },

  // Each page as it was (those that pass which()).
  async restorePages(which = () => true) {
    for (const tab of [...(this.changed?.keys() ?? [])]) {
      if (!tab.isConnected || !which(tab)) continue;
      this.changed.delete(tab);
      const actor = await this.actor(tab.linkedBrowser);
      actor?.sendAsyncMessage("undo");
    }
  },

  // The pill: focus mode is on (no tab), then what was done to the page,
  // and two ways out.
  say(tab, done) {
    if (!this.pill) {
      const pill = (this.pill = el("div", { id: "zenith-focus-pill" }));
      const text = el("span", { class: "what" });
      const page = el("button", { type: "button" });
      const site = el("button", { type: "button" });
      page.textContent = "Show the page";
      pill.append(text, page, site);
      (document.getElementById("zen-main-app-wrapper") ?? document.body).append(pill);
      page.addEventListener("click", () => this.leaveAlone(this.pillTab, false));
      site.addEventListener("click", () => this.leaveAlone(this.pillTab, true));
      pill.addEventListener("mouseenter", () => clearTimeout(this.pillTimer));
      pill.addEventListener("mouseleave", () => this.hidePillSoon());
      this.pillParts = { text, site };
    }
    this.pillTab = tab;
    this.pill.toggleAttribute("buttons", !!tab);
    if (tab) {
      const host = tab.linkedBrowser.currentURI?.host?.replace(/^www\./, "") ?? "";
      this.pillParts.text.textContent = {
        read: "Reading view",
        watch: "A place to watch: recommendations, Shorts and autoplay are gone",
        tidy: "Tidied: banners and clutter hidden",
      }[done];
      this.pillParts.site.textContent = `Not on ${host}`;
    } else {
      this.pillParts.text.textContent = done;
    }
    this.pill.removeAttribute("show");
    void this.pill.offsetWidth; // (the same pill again: it comes up again)
    this.pill.setAttribute("show", "true");
    this.hidePillSoon(tab ? 6000 : 1800);
  },

  hidePillSoon(ms = 6000) {
    clearTimeout(this.pillTimer);
    this.pillTimer = setTimeout(() => this.pill?.removeAttribute("show"), ms);
  },

  // "Show the page": as it is, for this page; "Not on <site>": and never
  // again on this site.
  async leaveAlone(tab, site) {
    this.pill?.removeAttribute("show");
    if (!tab?.isConnected) return;
    if (site) {
      const host = tab.linkedBrowser.currentURI?.host?.replace(/^www\./, "");
      if (host && !this.skips(host)) Services.prefs.setStringPref(this.SKIP, [...this.skipped, host].join(", "));
      this.say(null, `Focus mode leaves ${host} alone (Zenith › Keys › Focus mode › Sites left alone)`);
    }
    const actor = await this.actor(tab.linkedBrowser);
    actor?.sendAsyncMessage("undo");
    // (This page stays as it is until it changes.)
    this.changed?.set(tab, { spec: tab.linkedBrowser.currentURI?.spec, done: null });
  },

  init() {
    const commandset = document.createXULElement("commandset");
    const command = document.createXULElement("command");
    command.id = "zenith-focus-command";
    command.addEventListener("command", () => this.toggle());
    commandset.append(command);
    const keyset = document.createXULElement("keyset");
    keyset.id = "zenith-focus-keys";
    const key = document.createXULElement("key");
    key.id = "zenith-focus-key";
    key.setAttribute("modifiers", "alt");
    key.setAttribute("key", "Z");
    key.setAttribute("reserved", "true");
    key.setAttribute("command", "zenith-focus-command");
    keyset.append(key);
    root.append(commandset, keyset);
    const watch = () => {
      const on = Services.prefs.getBoolPref(this.PREF, true);
      key.toggleAttribute("disabled", !on);
      if (!on) this.off();
    };
    Services.prefs.addObserver(this.PREF, watch);
    onUnload(() => Services.prefs.removeObserver(this.PREF, watch));
    watch();
    // On YouTube, always: no picture-in-picture for the previews that play
    // as the pointer passes over a video (Firefox's button on them broke
    // the preview and the page).
    PageActors.child("ZenithYouTube", "focus-page.sys.mjs", { loadstart: { capture: true }, play: { capture: true } },
                     ["*://*.youtube.com/*", "*://youtube.com/*"]);
    // (Zen quit while focused: its toolbar setting back as it was.)
    if (!this.on && Services.prefs.prefHasUserValue("zenith.internal.focus.zen.view.compact.hide-toolbar") &&
        Services.wm.getMostRecentWindow("navigator:browser") === window) Bridge.apply("focus", { "zen.view.compact.hide-toolbar": null });
    window.ZenithFocus = this; // the switcher's :focus
  },
};

