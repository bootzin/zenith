/* --- Links from other apps: ask where they go --------------------------------
   With "Links from other apps" on Ask, a link from another app (mail, chat,
   a login) that none of Zen's Space routing rules sends somewhere stops at
   a small card: pick the space (and so its container) it opens in, with
   "always open <site> there" to turn the choice into a Space routing rule.
   Escape opens it as Zen would have. Rules you already have still apply
   without asking. Firefox hands such links to the window's browserDOMWindow
   (OPEN_EXTERNAL); Zenith waits there for your answer.
   Zen's Space routing dialog gains "Ask me each time" in each rule's list of
   spaces (that rule then asks) and in the default for other links (the same
   as this setting; the two follow each other). Zen reads "Ask me each time"
   as no space, so without Zenith such links simply open where you are. */
const ExternalLinks = {
  PREF: "zenith.plus.external-links",
  ASK: "zenith-ask",
  SAVED: "zenith.internal.links.default",

  init() {
    const hook = () => {
      // window.browserDOMWindow hands back an XPCOM wrapper; the method
      // Firefox calls lives on the script object inside it.
      const bdw = window.browserDOMWindow?.wrappedJSObject ?? window.browserDOMWindow;
      if (!bdw?.openURI || bdw.zenithAsks) return;
      const orig = bdw.openURI;
      bdw.zenithAsks = true;
      bdw.openURI = (...args) => {
        const [uri, , , context] = args;
        if (context === Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL && uri?.spec) this.tidyLater(uri.spec);
        if (context === Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL && this.wanted(uri)) {
          this.ask(uri, () => orig.apply(bdw, args));
          return null;
        }
        return orig.apply(bdw, args);
      };
      onUnload(() => {
        bdw.openURI = orig;
        delete bdw.zenithAsks;
      });
    };
    if (window.browserDOMWindow) hook();
    else window.delayedStartupPromise?.then(hook);
    // Zen's routing of a page that's loading (a link that goes on to a site
    // a rule sends to another space, as Slack's links do through slack.com)
    // stops the load and opens it again in a new tab there. A tab opened just
    // for that load is left with no page at all: it closes. (One with pages
    // of its own keeps them.)
    const opened = e => {
      const tab = e.target, owner = tab.owner, since = Date.now() - 60000;
      if (owner && owner !== tab) setTimeout(() => this.leftBehind(owner, tab), 1500);
      clearTimeout(this.strayTimer);
      this.strayTimer = setTimeout(() => {
        this.closeStrays(since);
        for (const ms of [4000, 12000, 30000, 57000]) setTimeout(() => this.closeStrays(since), ms);
      }, 2500);
    };
    gBrowser.tabContainer.addEventListener("TabOpen", opened);
    onUnload(() => gBrowser.tabContainer.removeEventListener("TabOpen", opened));
    // (As Zen starts, that may happen before Zenith is here: looked for once
    // it has started, and a little later.)
    const scan = () => {
      for (const t of document.querySelectorAll("tab.tabbrowser-tab")) if (t.owner && t.owner !== t) this.leftBehind(t.owner, t);
    };
    let started = Date.now();
    try {
      started = Services.startup.getStartupInfo().process.getTime();
    } catch {}
    Promise.resolve(window.gZenStartup?.promiseInitialized).then(() => {
      for (const ms of [2000, 5000, 9000, 15000, 25000]) {
        setTimeout(() => {
          scan();
          if (Date.now() - started < 180000) this.closeStrays(started);
        }, ms);
      }
    });
    // A link that starts Zen: Zen leaves tabs alone while it starts (they'd
    // be the session's), so its rules (or Ask) apply here once it's ready.
    // (A window Zen opened for them as it started: Zenith's scripts may come
    // after Zen is ready.)
    this.startup();
    this.patchDialog();
    const follow = () => this.followSetting();
    Services.prefs.addObserver(this.PREF, follow);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, follow);
      this.unpatchDialog();
    });
    window.ZenithLinks = this; // for tools/checks
  },

  routing() {
    return window.gZenSpaceRoutingManager ?? null;
  },

  // The links Zen was started with, as the command line hands them to the
  // window: only strings (a window opened for a link from a page gets
  // more: who opened it, and so on).
  startupLinks() {
    const a = window.arguments?.[0];
    const urls = [];
    try {
      if (!(a instanceof Ci.nsIArray)) return [];
      for (let i = 0; i < a.length; i++) {
        const s = a.queryElementAt(i, Ci.nsISupports);
        if (!(s instanceof Ci.nsISupportsString)) return [];
        urls.push(s.data);
      }
    } catch {
      return [];
    }
    return urls.map(u => u.trim()).filter(u => /^https?:/i.test(u));
  },

  async startup() {
    let started = Date.now();
    try {
      started = Services.startup.getStartupInfo().process.getTime();
    } catch {}
    // (Any window Zen restored may be the one; only links from its start.)
    const urls = Date.now() - started < 120000 ? this.startupLinks() : [];
    this.startupState = urls.length ? "links" : "none"; // (for tools/checks)
    if (!urls.length) return;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const wait = async (ok, tries) => {
      for (let i = 0; i < tries && !ok(); i++) await sleep(100);
    };
    await wait(() => window.gZenStartup?.isReady, 300);
    // (Zen's window sync copies a window's first tab to the other windows
    // once it's started: after that, so its copies go when it goes.)
    await Promise.race([window.gZenStartup?.promiseInitialized, sleep(20000)]);
    await sleep(600);
    // (Zen reads its rules from disk as it starts.)
    await wait(() => this.routing()?.getAllRoutes?.().length, 30);
    for (const url of urls) {
      let tabs = [];
      for (let i = 0; i < 100 && !tabs.length; i++) {
        tabs = this.tabsFor(url, started);
        if (!tabs.length) await sleep(150);
      }
      // (Zen may open more than one for it, a moment apart.)
      await sleep(1500);
      tabs = this.tabsFor(url, started);
      this.startupState = `routing ${tabs.length}`;
      if (tabs.length) await this.route(tabs, url).catch(e => console.error("[Zenith] links: a link that started Zen", e));
      this.startupState = `routed ${tabs.length}`;
    }
  },

  // Every tab this start opened for a link, in any window: Zen may open
  // more than one (the window's first tab, one it routes itself, or one
  // that never loads, a link handed on to an app). Found by where it went,
  // the link it started from (links often redirect), what its address bar
  // shows, or the page it's waiting to load.
  tabsFor(url, started = 0) {
    const bare = u => (u || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    const urlsOf = t => {
      const b = t.linkedBrowser, out = [b?.currentURI?.spec, b?.userTypedValue, b?.documentURI?.spec];
      try {
        out.push(SessionStore.getLazyTabValue(t, "url"));
      } catch {}
      try {
        const h = b?.browsingContext?.sessionHistory;
        for (let i = 0; i < (h?.count ?? 0); i++) {
          const e = h.getEntryAtIndex(i);
          out.push(e.originalURI?.spec, e.URI?.spec);
        }
      } catch {}
      return out;
    };
    // (Not one the session brought back with the same page: those were
    // last used before this start. A tab never selected says 0.)
    const fresh = t => t.selected || !(t.lastAccessed > 0 && t.lastAccessed < started);
    // A dead one: the link handed on to an app (Slack's login link opens
    // Slack) leaves its tab with no page, sometimes no browser at all: only
    // its title says the link. Those go, the session's too.
    const dead = t => this.dead(t) && bare(t.label) === bare(url);
    const out = [];
    for (const w of Services.wm.getEnumerator("navigator:browser")) {
      if (w.closed || w.zenithFloatFrom) continue;
      // (Every space's: Zen's gBrowser.tabs is the space you're in.)
      for (const t of w.document.querySelectorAll("tab.tabbrowser-tab")) {
        if (t.pinned || t.closing || t.hasAttribute("zen-essential") || t.hasAttribute("zen-empty-tab")) continue;
        if ((fresh(t) && urlsOf(t).some(u => u && bare(u) === bare(url))) || dead(t)) out.push(t);
      }
    }
    return out;
  },

  leftBehind(owner, tab) {
    if (!owner.isConnected || owner.closing || owner.pinned || owner.hasAttribute("zen-essential") || !tab.isConnected) return;
    // Zen can leave the source tab at about:blank after routing within the
    // current workspace. Its label still names the source URL, and the new
    // tab's first history entry identifies that same URL. Check this before
    // the same-workspace fast path and before treating a never-ending load as
    // proof that the tab is alive.
    const from = this.startedAt(tab);
    const ownerURL = owner.linkedBrowser?.currentURI?.spec ?? "";
    const blank = u => !u || /^about:(blank|newtab|home)$/.test(u);
    const key = u => (u || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    if (from && blank(ownerURL) && key(owner.label) === key(from)) {
      this.close(owner);
      return;
    }
    // A routed tab can prove that its still-loading owner is only the copy
    // left at the link, even when Zen kept both tabs in the same workspace.
    if (this.strays(Date.now() - 60000).includes(owner)) {
      this.close(owner);
      return;
    }
    if (owner.getAttribute("zen-workspace-id") === tab.getAttribute("zen-workspace-id")) return; // (not moved: not routing)
    const b = owner.linkedBrowser;
    if (b?.webProgress?.isLoadingDocument || !blank(b?.currentURI?.spec)) return;
    try {
      const h = b?.browsingContext?.sessionHistory;
      for (let i = 0; i < (h?.count ?? 0); i++) if (!blank(h.getEntryAtIndex(i).URI?.spec)) return;
    } catch {}
    this.close(owner);
  },

  // A link from another app while Zen runs: any tab it leaves with no page
  // (handed on to an app, or stopped and opened again elsewhere, in this
  // space or another), closes in the seconds after.
  tidyLater(url) {
    const since = Date.now() - 1000;
    for (const ms of [2500, 6000, 15000]) {
      setTimeout(() => {
        for (const t of this.tabsFor(url, since)) if (this.dead(t)) this.close(t);
        this.closeStrays(since);
      }, ms);
    }
  },

  // A link from Slack (and others) reaches the browser twice as Zen starts
  // or routes it: one tab goes on (slack.com, then Jira) in the space and
  // container its rule says; the other stays at the link itself with nothing
  // in it, in the space you were in. That one: a tab still at the address
  // another tab started from and went on from, with nothing else in its
  // history, opened since `since`. (Found in a real session: the left tab's
  // one entry is the Slack link; the good one's first entry came from it.)
  strays(since = 0) {
    const bare = u => (u || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    const tabs = [];
    for (const w of Services.wm.getEnumerator("navigator:browser")) {
      if (!w.closed && !w.zenithFloatFrom) tabs.push(...w.document.querySelectorAll("tab.tabbrowser-tab"));
    }
    const history = t => {
      const out = [];
      try {
        const h = t.linkedBrowser?.browsingContext?.sessionHistory;
        for (let i = 0; i < (h?.count ?? 0); i++) out.push(h.getEntryAtIndex(i));
      } catch {}
      return out;
    };
    const wentOn = new Map();
    for (const t of tabs) {
      const from = this.startedAt(t);
      if (from) {
        const key = bare(from), copies = wentOn.get(key) ?? [];
        copies.push(t);
        wentOn.set(key, copies);
      }
    }
    if (!wentOn.size) return [];
    return tabs.filter(t => {
      if (t.pinned || t.closing || t.hasAttribute("zen-essential") || t.hasAttribute("zen-empty-tab") || !t.linkedBrowser) return false;
      if (history(t).length > 1) return false;
      const current = t.linkedBrowser.currentURI?.spec ?? "";
      const blank = !current || /^about:(blank|newtab|home)$/.test(current);
      const label = blank ? bare(t.label) : "";
      const source = label && wentOn.has(label) ? label : bare(current);
      const namedDangling = blank && source === label && !!label;
      if (!namedDangling && t.lastAccessed > 0 && t.lastAccessed < since) return false;
      // The app handoff can leave a blank, still-loading tab whose label is
      // the source URL. Session restore may make that tab old by lastAccessed,
      // so an exact label match to another tab's starting URL is sufficient.
      return (wentOn.get(source) ?? []).some(other => other !== t);
    });
  },

  closeStrays(since) {
    for (const t of this.strays(since)) this.close(t);
  },

  // The URL this tab was opened from, including redirects that leave only
  // one live history entry and the copy retained in session restore data.
  startedAt(t) {
    const bare = u => (u || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    const b = t.linkedBrowser, current = bare(b?.currentURI?.spec);
    const entries = [];
    try {
      const h = b?.browsingContext?.sessionHistory;
      for (let i = 0; i < (h?.count ?? 0); i++) entries.push(h.getEntryAtIndex(i));
    } catch {}
    const first = entries[0], original = first?.originalURI?.spec;
    if (original && bare(original) !== bare(first.URI?.spec)) return original;
    if (entries.length === 1 && first?.URI?.spec && bare(first.URI.spec) !== current) return first.URI.spec;
    try {
      const state = JSON.parse(SessionStore.getTabState(t));
      const saved = state.entries ?? [], savedFirst = saved[0];
      const savedOriginal = savedFirst?.originalURI;
      if (savedOriginal && bare(savedOriginal) !== bare(savedFirst?.url)) return savedOriginal;
      const savedStart = savedFirst?.url;
      if (saved.length === 1 && savedStart && bare(savedStart) !== current) return savedStart;
    } catch {}
    return null;
  },

  // No page in it: no browser, or a blank one that's done loading.
  dead(t) {
    const b = t.linkedBrowser;
    return !b || !t.linkedPanel || (["", "about:blank"].includes(b.currentURI?.spec ?? "") && !b.webProgress?.isLoadingDocument);
  },

  close(t) {
    try {
      const id = t.id;
      if (t.ownerDocument.defaultView.gBrowser.tabs.length <= 1) return; // (a window's last tab: its window would go)
      t.ownerDocument.defaultView.gBrowser.removeTab(t, { animate: false, skipPermitUnload: true });
      if (id) for (const ms of [1500, 5000]) setTimeout(() => this.sweep(id, null), ms);
    } catch (e) {
      console.error("[Zenith] links: closing a tab", e);
    }
  },

  // A link opened from another app, routed as Zen would have: the space
  // its rule (or the default for other links) names, or the card to ask.
  // One tab is kept for it.
  async route(tabs, url) {
    if (!Array.isArray(tabs)) tabs = [tabs];
    const R = this.routing(), uri = Services.io.newURI(url);
    const settle = space => this.settle(tabs, url, space);
    if (R && this.spaces().length > 1 && this.wanted(uri)) {
      return this.ask(uri, () => settle(gZenWorkspaces.getWorkspaceFromId(gZenWorkspaces.activeWorkspace)));
    }
    const id = R && this.spaces().length > 1 ? R.routeUri(url, { fromExternal: true }) : null;
    return settle(gZenWorkspaces.getWorkspaceFromId?.(id) ?? null);
  },

  // One tab for the link: one already in the space (and its container), or
  // the best of them placed there (the one that loaded, in this window);
  // the others close, with their copies in other windows (Zen's window
  // sync makes them).
  async settle(tabs, url, space) {
    tabs = tabs.filter(t => t.isConnected && !t.closing);
    if (!tabs.length) return null;
    const here = t => t.ownerDocument?.defaultView === window;
    // (Only one that loaded counts: one that never did, a link handed on to
    // an app, has no page, and no space Zen can move it from.)
    const alive = t => !this.dead(t);
    const fits = t => alive(t) && here(t) && (!space || (t.getAttribute("zen-workspace-id") === space.uuid && (!space.containerTabId || t.userContextId === space.containerTabId)));
    const best = tabs.filter(alive).sort((a, b) => here(b) - here(a))[0] ?? null;
    // None has a page: the link went on to an app, which has it. Not opened
    // again (that would hand it on twice); the empty tabs close.
    if (!best) {
      for (const t of tabs) this.close(t);
      return null;
    }
    const keep = tabs.find(fits) ?? (space ? this.place(best, url, space) : best);
    for (const t of tabs) {
      if (t === keep || !t.isConnected || t.closing || (keep.id && t.id === keep.id)) continue;
      this.close(t);
    }
    // (Opened again in its space: if that hands it on to an app too, its
    // empty tab closes.)
    if (keep !== best) this.closeIfHandedOn(keep);
    if (space && gZenWorkspaces.activeWorkspace !== space.uuid) await gZenWorkspaces.changeWorkspaceWithID(space.uuid);
    if (keep.ownerDocument?.defaultView === window) gBrowser.selectedTab = keep;
    return keep;
  },

  closeIfHandedOn(tab) {
    const since = Date.now();
    let loading = false;
    const check = () => {
      if (!tab.isConnected || tab.closing) return;
      const b = tab.linkedBrowser;
      if (b?.webProgress?.isLoadingDocument) loading = true;
      if (b && !["", "about:blank"].includes(b.currentURI?.spec ?? "")) return; // (a page: it stays)
      if ((loading || Date.now() - since > 6000) && this.dead(tab)) {
        if (tab.ownerDocument.defaultView.gBrowser.visibleTabs.length > 1) this.close(tab);
        return;
      }
      if (Date.now() - since < 30000) setTimeout(check, 500);
    };
    setTimeout(check, 1000);
  },

  sweep(id, keep) {
    for (const w of Services.wm.getEnumerator("navigator:browser")) {
      for (const t of [...w.document.querySelectorAll("tab.tabbrowser-tab")]) if (t.id === id && t !== keep && !t.closing) w.gBrowser.removeTab(t, { animate: false });
    }
  },

  // Into a space, and its container (a tab can't change container: opened
  // again in it; with no tab, opened there). The tab it's now in.
  place(tab, url, space) {
    if (!tab || (space.containerTabId && (tab.userContextId ?? 0) !== space.containerTabId)) {
      const fresh = gBrowser.addTrustedTab(url, { userContextId: space.containerTabId || 0, skipRoute: true });
      gZenWorkspaces.moveTabToWorkspace(fresh, space.uuid);
      return fresh;
    }
    if (tab.ownerDocument?.defaultView !== window) tab = gBrowser.adoptTab(tab, { selectTab: false }) ?? tab;
    if (tab.getAttribute("zen-workspace-id") !== space.uuid) gZenWorkspaces.moveTabToWorkspace(tab, space.uuid);
    return tab;
  },

  // The setting and Zen's default for links no rule matches follow each
  // other: "Ask each time" here is "Ask me each time" there, and back.
  followSetting() {
    const R = this.routing();
    if (!R?.getDefaultExternalRoute) return;
    const ask = Services.prefs.getStringPref(this.PREF, "") === "ask";
    try {
      const now = R.getDefaultExternalRoute();
      if (ask && now !== this.ASK) {
        Services.prefs.setStringPref(this.SAVED, now);
        R.setDefaultExternalRoute(this.ASK);
        R.saveRoutes();
      } else if (!ask && now === this.ASK) {
        R.setDefaultExternalRoute(Services.prefs.getStringPref(this.SAVED, "") || "most-recent-space");
        R.saveRoutes();
      }
    } catch (e) {
      console.error("[Zenith] links: Space routing default", e);
    }
  },

  // Zen's dialog builds each list of spaces with createOpenInList; Zenith's
  // choice goes in after "Most recent space". The dialog's code is shared by
  // every window, so one window patches it and hands over when it closes.
  patchDialog() {
    let proto;
    try {
      proto = ChromeUtils.importESModule("resource:///modules/zen/spacerouting/ZenSpaceRoutingDialog.mjs")
        .nsZenSpaceRoutingDialog.prototype;
    } catch {
      return;
    }
    if (proto.zenithOrig) return;
    const orig = (proto.zenithOrig = proto.createOpenInList);
    const links = this;
    proto.createOpenInList = async function (select, value) {
      await orig.call(this, select, value);
      const popup = select.querySelector("menupopup") ?? select;
      const item = this.doc.createXULElement("menuitem");
      item.setAttribute("label", "Ask me each time");
      item.setAttribute("value", links.ASK);
      item.className = "zenith-route-ask";
      const recent = popup.querySelector('menuitem[value="most-recent-space"]');
      if (recent) recent.after(item);
      else popup.append(item);
      const isDefault = select.id === "sr-default-external-open-in";
      const asking = value === links.ASK || (isDefault && Services.prefs.getStringPref(links.PREF, "") === "ask");
      if (asking) select.value = links.ASK;
      if (isDefault) {
        if (value !== links.ASK) Services.prefs.setStringPref(links.SAVED, value);
        select.addEventListener("command", () => {
          if (select.value === links.ASK) Services.prefs.setStringPref(links.PREF, "ask");
          else Services.prefs.clearUserPref(links.PREF);
        });
      }
    };
    this.patched = proto;
  },

  unpatchDialog() {
    const proto = this.patched;
    if (!proto?.zenithOrig) return;
    proto.createOpenInList = proto.zenithOrig;
    delete proto.zenithOrig;
    this.patched = null;
    for (const w of Services.wm.getEnumerator("navigator:browser")) {
      if (w !== window && !w.closed && w.ZenithLinks) {
        w.ZenithLinks.patchDialog();
        break;
      }
    }
  },

  spaces() {
    try {
      return gZenWorkspaces.workspaceEnabled ? gZenWorkspaces.getWorkspaces() ?? [] : [];
    } catch {
      return [];
    }
  },

  // Ask only for web links, with more than one space: when the first rule
  // that matches says "Ask me each time", or when none matches and the
  // default is to ask.
  wanted(uri) {
    if (!/^https?$/.test(uri?.scheme ?? "") || this.spaces().length < 2) return false;
    const route = this.rule(uri);
    if (route) return route.openIn === this.ASK;
    return Services.prefs.getStringPref(this.PREF, "") === "ask" || this.routing()?.getDefaultExternalRoute?.() === this.ASK;
  },

  rule(uri) {
    const R = this.routing();
    try {
      return R?.getAllRoutes().find(route => R.isRouteMatching(uri.spec, route)) ?? null;
    } catch {
      return null;
    }
  },

  ask(uri, open) {
    // (The same link asked about again: the card already up stays.)
    if (this.pending?.spec === uri.spec) return;
    this.pending?.cancel();
    const host = uri.host.replace(/^www\./, "");
    const card = el("div", { id: "zenith-linkask" });
    const box = el("div", { id: "zenith-linkask-box" });
    const head = el("div", { class: "zth-la-head" });
    head.textContent = "Open a link from another app";
    const site = el("div", { class: "zth-la-site" });
    site.textContent = uri.spec.length > 90 ? uri.spec.slice(0, 90) + "…" : uri.spec;
    const list = el("div", { class: "zth-la-list" });
    const always = el("label", { class: "zth-la-always" });
    const tick = el("input", { type: "checkbox" });
    always.append(tick, document.createTextNode(` Always open ${host} there (a Space routing rule)`));
    const foot = el("div", { class: "zth-la-foot" });
    foot.textContent = "↑↓ or 1–9 choose · Enter opens · Esc opens it as usual";
    const done = () => {
      card.remove();
      this.pending = null;
    };
    const asked = this.rule(uri);
    const choose = async space => {
      done();
      if (tick.checked) this.remember(host, space.uuid, !!asked);
      if (gZenWorkspaces.activeWorkspace !== space.uuid) await gZenWorkspaces.changeWorkspaceWithID(space.uuid);
      open();
    };
    const spaces = this.spaces();
    let selected = Math.max(0, spaces.findIndex(s => s.uuid === gZenWorkspaces.activeWorkspace));
    const rows = spaces.map((space, i) => {
      const row = el("button", { class: "zth-la-row", type: "button" });
      const name = el("span", { class: "zth-la-name" });
      name.textContent = `${i + 1}  ${space.name}`;
      const box2 = el("span", { class: "zth-la-container" });
      let container = "";
      try {
        if (space.containerTabId) container = ContextualIdentityService.getUserContextLabel(space.containerTabId);
      } catch {}
      box2.textContent = [container && `container: ${container}`, space.uuid === gZenWorkspaces.activeWorkspace && "here"].filter(Boolean).join(" · ");
      row.append(name, box2);
      row.addEventListener("click", () => choose(space));
      list.append(row);
      return row;
    });
    const mark = () => rows.forEach((r, i) => r.toggleAttribute("selected", i === selected));
    mark();
    box.append(head, site, list, always, foot);
    card.append(box);
    card.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        e.preventDefault();
        done();
        open();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        selected = (selected + (e.key === "ArrowDown" ? 1 : spaces.length - 1)) % spaces.length;
        mark();
      } else if (e.key === "Enter" && e.target !== tick) {
        e.preventDefault();
        choose(spaces[selected]);
      } else if (/^[1-9]$/.test(e.key) && spaces[+e.key - 1]) {
        e.preventDefault();
        choose(spaces[+e.key - 1]);
      }
    });
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(card);
    window.focus();
    rows[selected]?.focus();
    this.pending = { cancel: () => { done(); open(); }, choose, spaces, tick, spec: uri.spec };
  },

  // "Always open <site> there": a Space routing rule, as Zen's own dialog
  // would make (contains <site> → that space). When an "ask" rule asked, the
  // new one goes first, or the asking rule would still win.
  remember(host, spaceId, first = false) {
    const R = this.routing();
    if (!R?.createNewRoute) return;
    const route = R.createNewRoute();
    route.reference = host;
    route.matchType = "contains";
    route.openIn = spaceId;
    R.updateRoute(route);
    if (first) {
      // Zen keeps rules in a list and finds them by id; moving every rule's
      // contents down one place puts the new rule at the top.
      const all = R.getAllRoutes();
      const wanted = [all.at(-1), ...all.slice(0, -1)];
      all.forEach((slot, i) => R.updateRoute({ ...wanted[i], id: slot.id }));
    }
    R.saveRoutes();
  },
};

