/* --- Layouts: each space's own (Tiling and keys › Layout; Alt+Y the next one) ---------------
   Dwindle: a new tile splits the one you're on along its longer side
   (Hyprland's). Master: one master tile and a stack (dwm's: the master on
   the left; or centred, the stack either side); Alt+Shift+Y makes the tile
   you're on the master. Scroller: niri's, rule for rule. Tiles are
   columns on a strip (every tab of the space, not essentials, pinned tabs
   or Firefox's groups; Tiling and keys › The scroller's strip holds: or
   only a split's tabs), with no limit on how many; a column can hold tiles
   stacked (Alt+[ and Alt+] take the tile into the column beside it or out
   of its own, Alt+, and Alt+. the next column's tile in, the last one out).
   A new tab is a column right of yours. Closing a column you just opened
   takes you back to the one you came from, else to the column on its
   right (on its left at the end). The view moves as little as shows the
   column whole, a gap from the edge (or centres it: Tiling and keys › The
   scroller keeps the column you're on); columns slide into place. Widths:
   a third, a half, two thirds (Alt+Shift+Y), the whole view (Alt+F), or
   a tenth at a time (Alt+R, then h and l; j and k a stacked tile's
   height); Alt+C centres the column. Columns out of view aren't drawn,
   their pages asleep. Monocle: the tile you're on fills the
   view (Alt+F's), Alt+H and Alt+L go to the others. */
const Layouts = {
  ALL: ["dwindle", "master", "scroller", "monocle"],
  NAMES: { dwindle: "Dwindle", master: "Master and stack", scroller: "Scroller", monocle: "Monocle" },
  PREF: "zenith.shell.layout",
  SPACES: "zenith.internal.layout.spaces", // { space: layout }
  WIDTHS: [1 / 3, 1 / 2, 2 / 3], // niri's preset column widths (Alt+Shift+Y)
  STRIP: "zenith.shell.scroller-tabs", // all · split
  FOCUS: "zenith.shell.scroller-focus", // view · centre · overflow (niri's center-focused-column never · always · on-overflow)
  LONE: "zenith.shell.scroller-centre-lone", // niri's always-center-single-column
  widths: new WeakMap(), // a column's tiles → its width (a share of the view, niri's proportion)
  full: new WeakSet(), // a column's tiles while it takes the whole view (Alt+F)
  heights: new WeakMap(), // a stacked tile → its weight in its column
  seen: new WeakMap(), // a tile → when you were last on it (a column comes back to that tile)
  clock: 0,
  back: null, // niri's activate_prev_column_on_removal: { tab, from, view }
  burst: null, // the last tab opened while you stayed on a column: { from, tab }
  unrestored: new WeakSet(), // a strip's columns whose pages wait to come into view
  slept: new WeakSet(), // columns you put to sleep in view: they stay asleep until you go to them
  cards: new Map(), // a sleeping column in view → its card
  fresh: new WeakMap(), // a new tab → { after: the column it goes right of, from: the column you were on }
  KEPT: "zenith.internal.layout.kept", // { space: [shape…] }: its splits while the strip holds its tabs

  init() {
    window.ZenithLayouts = this; // the bar's module, the settings page, tools/checks
    const P = Services.prefs, W = window.gZenWorkspaces;
    // A strip would be saved with the session as one split of many tabs,
    // and Firefox restores a split only once it has the tabs it counted (Zen's
    // hold 4), before Zenith runs: its tabs would never come back. So what
    // Firefox and Zen write is cleaned first: such a split's tabs are saved
    // as plain tabs (the strip is made again from them at start).
    sessionSaneOnce();
    (window.SessionStore?.promiseAllWindowsRestored ?? Promise.resolve()).then(() => setTimeout(() => this.rescue().catch(e => console.error("[Zenith] a strip's lost tabs", e)), 2500));
    // A strip's column pinned, made an essential, put in a folder or sent to
    // another space leaves the strip first: Zen moves a split's tabs
    // together, so the whole strip would follow it.
    const leave = tabs => {
      for (const t of [].concat(tabs ?? [])) if (Tiler.data(t)?.zenithStrip) Tiler.S.removeTabFromGroup(t, undefined, { changeTab: false });
    };
    for (const [owner, name] of [[gBrowser, "pinTab"], [window.gZenPinnedTabManager, "addToEssentials"], [window.gZenFolders, "createFolder"],
                                 [W, "moveTabToWorkspace"], [W, "moveTabsToWorkspace"]]) {
      const orig = owner?.[name];
      if (!orig) continue;
      owner[name] = function (tabs, ...rest) {
        try {
          leave(tabs);
        } catch (e) {
          console.error("[Zenith] strip", e);
        }
        return orig.call(this, tabs, ...rest);
      };
      onUnload(() => (owner[name] = orig));
    }
    // Another space: its layout (monocle fills the view there, or stops).
    this.here = W?.activeWorkspace;
    const spaceChanged = () => {
      const was = this.here && this.of(this.here);
      this.here = W?.activeWorkspace;
      if (was === "monocle" && this.of() !== "monocle") SplitSolo.off();
      if (this.of() === "monocle") this.solo();
      setTimeout(() => this.shown(), 0); // (once the space's tab is shown)
      this.soon();
      this.tell();
    };
    W?.addChangeListeners?.(spaceChanged);
    const select = () => {
      const how = this.of(), tab = gBrowser.selectedTab;
      this.seen.set(tab, ++this.clock);
      this.slept.delete(tab);
      // (niri: once you go to another column. Zen selects tabs itself while
      // the strip takes one in: those aren't you going anywhere.)
      if (!this.gathering && !this.arranging && !this.settling) {
        if (this.back?.tab !== tab) this.back = null;
        if (this.burst?.from !== tab) this.burst = null;
      }
      this.unrestored.delete(tab); // (SessionStore restores the tab you're on)
      this.shown();
      if (how === "monocle") this.solo();
      else if (how === "scroller" && !this.arranging && Tiler.data(tab)) this.arrange(tab);
      if (how === "scroller" && !this.gathering && this.members().includes(tab) && !this.whole()) this.soon();
    };
    // A strip takes in every new tab of its space as a column right of the
    // one you're on, as niri's (Ctrl+T, a link, a page from another app);
    // tabs opened one after another while you stay put (links opened in
    // the background) keep the order you opened them in.
    const opened = e => {
      const tab = e.target, from = gBrowser.selectedTab, b = this.burst;
      if (this.strip() && from !== tab && (Tiler.data(from)?.zenithStrip || this.members().includes(from))) {
        const after = b?.from === from && b.tab.isConnected && !b.tab.closing ? b.tab : from;
        this.fresh.set(tab, { after, from });
        this.burst = { from, tab };
      }
      this.soon();
    };
    gBrowser.tabContainer.addEventListener("TabOpen", opened);
    // Zen restores every page of a split as it shows it: a strip has every
    // tab of its space, so opening the browser loaded them all. A column's
    // page is restored when it comes into view instead (Layouts.after).
    const restoring = e => {
      const tabs = e.detail?.tabs, data = tabs?.length && !e.detail.zenith ? Tiler.data(tabs[0]) : null;
      if (!data || !this.scroller(data)) return;
      const now = tabs.filter(t => t === gBrowser.selectedTab);
      for (const t of tabs) if (!now.includes(t)) this.unrestored.add(t);
      tabs.splice(0, tabs.length, ...now);
    };
    // (Before SessionStore's own, on the tab strip.)
    window.addEventListener("TabSplitViewActivate", restoring, true);
    const scope = () => (this.strip() ? this.soon() : null);
    Services.prefs.addObserver(this.STRIP, scope);
    onUnload(() => {
      gBrowser.tabContainer.removeEventListener("TabOpen", opened);
      window.removeEventListener("TabSplitViewActivate", restoring, true);
      Services.prefs.removeObserver(this.STRIP, scope);
    });
    // After the session is back: a strip space's tabs on their strip; a
    // monocle space's tile you're on alone.
    (window.SessionStore?.promiseAllWindowsRestored ?? Promise.resolve()).then(() => setTimeout(() => {
      if (this.of() === "monocle") this.solo();
      this.soon();
    }, 500));
    // The scroller: Zen lays a split out (sizes that add up to the view);
    // a scroller's columns are then moved to where they are on the strip,
    // those beyond either edge out of sight.
    const S = window.gZenViewSplitter, grid = S?.applyGridLayout;
    if (grid) {
      S.applyGridLayout = function (node) {
        const done = grid.apply(this, arguments);
        try {
          Layouts.after(node);
        } catch (e) {
          console.error("[Zenith] scroller", e);
        }
        return done;
      };
      onUnload(() => (S.applyGridLayout = grid));
    }
    // A tile closed: the master layout laid out again; a column off its
    // strip, and the tile that takes over is niri's (Layouts.successor).
    const closed = e => {
      const tab = e.target, data = tab === gBrowser.selectedTab && this.of() === "scroller" ? Tiler.data(tab) : null;
      const next = data ? this.successor(tab, data) : null;
      const view = next && this.back?.tab === tab ? this.back.view : null;
      this.back = null;
      // (Selected now: Zen's own would pick the split's first tab.)
      if (next) gBrowser.selectedTab = next;
      setTimeout(() => this.closed(tab, next, view), 0);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", select);
    // (Before Zen's own, which takes the tab out of its split.)
    window.addEventListener("TabClose", closed, true);
    // Firefox picks the tab to show after closing one (sometimes before the
    // close event): in the scroller, niri's.
    const blurTo = gBrowser._findTabToBlurTo;
    if (blurTo) {
      gBrowser._findTabToBlurTo = function (tab, exclude) {
        try {
          const data = Layouts.of() === "scroller" ? Tiler.data(tab) : null;
          const next = data && Layouts.successor(tab, data);
          if (next && !exclude?.includes?.(next)) return next;
        } catch {}
        return blurTo.apply(this, arguments);
      };
      onUnload(() => (gBrowser._findTabToBlurTo = blurTo));
    }
    // The page area resized (the sidebar opened, the window): the strip's
    // columns are in px, so laid out again.
    let sizing = 0;
    const resized = new ResizeObserver(() => {
      cancelAnimationFrame(sizing);
      sizing = requestAnimationFrame(() => {
        const data = Tiler.data();
        if (data && this.scroller(data)) Tiler.S.applyGridLayout(data.layoutTree);
      });
    });
    resized.observe(gBrowser.tabpanels);
    onUnload(() => resized.disconnect());
    const prefs = () => {
      const data = Tiler.data();
      if (data && this.of() === "master") this.master(data);
      this.tell();
    };
    for (const p of [this.PREF, "zenith.shell.master", "zenith.shell.master-ratio"]) P.addObserver(p, prefs);
    onUnload(() => {
      W?.removeChangeListeners?.(spaceChanged);
      gBrowser.tabContainer.removeEventListener("TabSelect", select);
      window.removeEventListener("TabClose", closed, true);
      for (const p of [this.PREF, "zenith.shell.master", "zenith.shell.master-ratio"]) P.removeObserver(p, prefs);
    });
    this.tell(); // (the bar's layout module, if it came first)
  },

  space() {
    return window.gZenWorkspaces?.activeWorkspace ?? "";
  },

  // A strip saved before 0.18.6 (as one split of many tabs) loses its tabs
  // when Zen starts. The last session's file still has them: offered back,
  // once, with their history.
  async rescue() {
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const P = Services.prefs, dir = PathUtils.profileDir, started = Services.startup.getStartupInfo?.().process?.getTime?.() ?? Date.now();
    let last = null;
    for (const parts of [["sessionstore-backups", "previous.jsonlz4"], ["sessionstore-backups", "recovery.jsonlz4"], ["sessionstore-backups", "recovery.baklz4"], ["sessionstore.jsonlz4"]]) {
      try {
        const path = PathUtils.join(dir, ...parts), state = await IOUtils.readJSON(path, { decompress: true });
        const at = state?.session?.lastUpdate || (await IOUtils.stat(path)).lastModified || 0;
        if (at && at < started && (!last || at > last.at)) last = { state, at };
      } catch {}
    }
    if (!last || P.getStringPref("zenith.internal.strip-rescued", "") === String(last.at)) return;
    const open = new Set();
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      for (const t of win.gBrowser.tabs) open.add(t.linkedBrowser?.currentURI?.spec);
    }
    const lost = [];
    for (const w of last.state.windows ?? []) {
      // (A strip is a split of many tabs, or a split group of many.)
      const count = new Map(), splitGroups = new Set((w.groups ?? []).filter(g => g.splitView).map(g => g.id));
      for (const t of w.tabs ?? []) {
        if (t.splitViewId) count.set(t.splitViewId, (count.get(t.splitViewId) ?? 0) + 1);
        if (splitGroups.has(t.groupId)) count.set(`g:${t.groupId}`, (count.get(`g:${t.groupId}`) ?? 0) + 1);
      }
      for (const t of w.tabs ?? []) {
        const entry = t.entries?.[(t.index || t.entries.length) - 1];
        const big = (count.get(t.splitViewId) ?? 0) > 4 || (count.get(`g:${t.groupId}`) ?? 0) > 4;
        if (big && entry?.url && !open.has(entry.url)) lost.push(t);
      }
    }
    if (!lost.length) return;
    const done = () => P.setStringPref("zenith.internal.strip-rescued", String(last.at));
    notice({
      title: `${lost.length} tab${lost.length === 1 ? "" : "s"} from your scroller didn't come back`,
      body: "They were in a scroller strip when Zen last closed, and Zen couldn't restore a strip saved by Zenith 0.18.5 or earlier. Reopen them here, with their history.",
      actions: [
        { label: `Reopen ${lost.length} tab${lost.length === 1 ? "" : "s"}`, run: () => {
          done();
          for (const data of lost) {
            const copy = { ...data };
            delete copy.splitViewId;
            delete copy.groupId;
            const tab = gBrowser.addTrustedTab("about:blank", { inBackground: true, skipAnimation: true });
            try {
              SessionStore.setTabState(tab, JSON.stringify(copy));
            } catch (e) {
              console.error("[Zenith] a strip's tab back", e);
            }
          }
        } },
        { label: "Not now", run: done },
      ],
    });
    this.rescueOffered = lost.length; // (tools/checks)
  },


  spaces() {
    try {
      return JSON.parse(Services.prefs.getStringPref(this.SPACES, "") || "{}");
    } catch {
      return {};
    }
  },

  of(space = this.space()) {
    const own = this.spaces()[space], def = Services.prefs.getStringPref(this.PREF, "");
    return this.ALL.includes(own) ? own : this.ALL.includes(def) ? def : "dwindle";
  },

  set(how, space = this.space()) {
    if (!this.ALL.includes(how)) return;
    const was = this.of(space), all = this.spaces();
    all[space] = how;
    Services.prefs.setStringPref(this.SPACES, JSON.stringify(all));
    if (was === how) return;
    try {
      this.leave(was);
      this.enter(how);
    } catch (e) {
      console.error("[Zenith] layout", e);
    }
    hint(`Layout: ${this.NAMES[how]}`);
    this.tell();
  },

  cycle() {
    this.set(this.ALL[(this.ALL.indexOf(this.of()) + 1) % this.ALL.length]);
  },

  // (The bar's layout module listens.)
  tell() {
    window.dispatchEvent(new CustomEvent("ZenithLayout", { detail: this.of() }));
  },

  enter(how) {
    const data = Tiler.data();
    if (how === "master" && data) {
      data.zenithBefore ??= this.shape(data.layoutTree); // (back as it was when the space leaves Master)
      this.master(data);
    }
    else if (how === "scroller" && this.strip()) {
      this.keep();
      this.gather(true);
    }
    else if (how === "scroller" && data) {
      this.lay(data);
      this.arrange(gBrowser.selectedTab);
    }
    else if (how === "monocle") this.solo();
  },

  leave(was) {
    if (was === "monocle") SplitSolo.off();
    if (was === "master") {
      const data = Tiler.data(), before = data?.zenithBefore;
      if (data) delete data.zenithBefore;
      const same = before && this.tabsIn(before).length === data.tabs.length && this.tabsIn(before).every(t => data.tabs.includes(t));
      if (same) this.build(data, before);
    }
    if (was === "scroller") {
      const data = Tiler.data() ?? Tiler.data(this.members().find(t => Tiler.data(t)));
      gBrowser.tabpanels.removeAttribute("zenith-scroller");
      gBrowser.tabpanels.style.removeProperty("--zth-strip-x");
      this.card([]);
      // A strip made of the whole space goes back to tabs; a split stays.
      // (Zen keeps no mark of a strip across restarts: the setting says.)
      if (data && (data.zenithStrip || Services.prefs.getStringPref(this.STRIP, "") !== "split")) {
        this.dissolve(data);
        return this.unkeep();
      }
      if (data) {
        data.zenithView = null;
        Tiler.even(data.layoutTree);
      }
    }
  },

  /* The strip: the scroller with every tab of the space on it. */
  strip(space = this.space()) {
    return this.of(space) === "scroller" && Services.prefs.getStringPref(this.STRIP, "") !== "split";
  },

  // The space's tabs that are columns, in the sidebar's order: not
  // essentials, pinned tabs (folders' too), Firefox's groups, Zen's empty tab.
  members() {
    return gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute("zen-essential") && !t.hasAttribute("zen-empty-tab") &&
      !t.hasAttribute("zen-glance-tab") && !t.closing && (!t.group || t.group.hasAttribute("split-view-group")));
  },

  // Every member already on one strip?
  whole(tabs = this.members()) {
    const data = Tiler.data(tabs[0]);
    return tabs.length < 2 || (!!data && tabs.every(t => data.tabs.includes(t)));
  },

  soon() {
    if (this.soonTimer) return;
    this.soonTimer = setTimeout(() => {
      this.soonTimer = null;
      try {
        if (this.strip()) this.gather();
        else this.tidy();
      } catch (e) {
        console.error("[Zenith] strip", e);
      }
    }, 60);
  },

  // A strip left behind in a space that isn't a scroller's (a strip from
  // before 0.18, or one whose layout changed while Zen was closed): more
  // tiles than a split may have, so back to tabs.
  tidy() {
    const S = Tiler.S, max = S?.MAX_TABS ?? 4;
    if (!S || max === Infinity) return;
    const here = new Set(gBrowser.visibleTabs);
    for (const data of [...(S._data ?? [])]) {
      if (data.tabs.length > max && data.tabs.some(t => here.has(t))) this.dissolve(data);
    }
  },

  // The space's tabs onto one strip: those missing go after the column
  // before them in the sidebar; the strip's order is the sidebar's.
  // (Only while you're on one of its columns, or entering the layout: on a
  // pinned tab or an essential the strip waits, Zen showing that tab alone.)
  gather(force = false) {
    if (this.gathering || !this.strip()) return;
    const tabs = this.members(), S = Tiler.S;
    if (!S || this.whole(tabs)) return;
    const sel = gBrowser.selectedTab, here = tabs.includes(sel);
    if (!here && !force) return;
    this.gathering = true;
    try {
      let data = Tiler.data(here && Tiler.data(sel) ? sel : tabs.find(t => Tiler.data(t)) ?? tabs[0]);
      // Another split's tabs leave it first.
      for (const t of tabs) {
        const d = Tiler.data(t);
        if (d && d !== data) S.removeTabFromGroup(t, undefined, { changeTab: false });
      }
      data = data && S._data.includes(data) ? data : null;
      const view = data?.zenithView ?? null;
      const cols = data ? this.cols(data).map(c => c.filter(t => tabs.includes(t))).filter(c => c.length) : [];
      const placed = t => cols.some(c => c.includes(t));
      // Each new one a column right of the one it was opened from (in the
      // order they were opened); one from elsewhere (restored, sent from
      // another space) after the column before it in the sidebar.
      let pending = tabs.filter(t => !placed(t)), moved = true;
      while (pending.length && moved) {
        moved = false;
        for (const t of [...pending]) {
          // (One you're on now, opened in front: right of the column you
          // came from, after any opened behind it.)
          const f = this.fresh.get(t), after = f && (t === sel ? f.from : f.after), ci = f ? cols.findIndex(c => c.includes(after)) : -1;
          if (f && ci < 0 && pending.includes(after)) continue; // (its own first)
          let at = ci + 1;
          if (ci < 0) {
            const before = tabs.slice(0, tabs.indexOf(t)).reverse().find(placed);
            at = before ? cols.findIndex(c => c.includes(before)) + 1 : 0;
          }
          cols.splice(at, 0, [t]);
          // (niri: closing it at once goes back to the column you came from.)
          if (f && t === sel) this.back = { tab: t, from: f.from, view };
          this.fresh.delete(t);
          pending = pending.filter(x => x !== t);
          moved = true;
        }
      }
      const order = cols.flat();
      if (data) S.splitTabs([data.tabs[0], ...order.filter(t => !data.tabs.includes(t))], undefined, -1, { activate: false });
      else S.splitTabs(order, "vsep", here ? order.indexOf(sel) : -1, { activate: here });
      data = Tiler.data(order[0]);
      if (!data) return;
      data.zenithStrip = true;
      this.relay(data, cols, here ? sel : null);
    } finally {
      this.gathering = false;
      // (Zen may select a tile a moment later, as it shows the split.)
      clearTimeout(this.settled);
      this.settling = true;
      this.settled = setTimeout(() => (this.settling = false), 150);
    }
  },

  // A split's tree as build() takes it: [direction, [tab | shape…], sizes].
  shape(node, id = false) {
    if (node.tab) return id ? node.tab.id : node.tab;
    return [node.direction, node.children.map(c => this.shape(c, id)), node.children.map(c => c.sizeInParent)];
  },

  tabsIn(shape) {
    return Array.isArray(shape) ? shape[1].flatMap(s => this.tabsIn(s)) : [shape];
  },

  kept() {
    try {
      return JSON.parse(Services.prefs.getStringPref(this.KEPT, "") || "{}");
    } catch {
      return {};
    }
  },

  // Entering the strip: the space's splits (their tiles side by side or
  // stacked, their sizes) kept, by tab, across restarts too, to come back
  // when the space leaves the scroller.
  keep(space = this.space()) {
    const here = new Set(this.members()), all = this.kept();
    const splits = (Tiler.S?._data ?? []).filter(d => !d.zenithStrip && d.tabs.some(t => here.has(t)));
    if (splits.length) all[space] = splits.map(d => this.shape(d.layoutTree, true));
    else delete all[space];
    Services.prefs.setStringPref(this.KEPT, JSON.stringify(all));
  },

  // Leaving it: those splits back as they were (their tabs still here).
  unkeep(space = this.space()) {
    const all = this.kept(), shapes = all[space] ?? [], S = Tiler.S, sel = gBrowser.selectedTab;
    delete all[space];
    Services.prefs.setStringPref(this.KEPT, JSON.stringify(all));
    const live = s => (Array.isArray(s) ? [s[0], s[1].map(live), s[2]] : document.getElementById(s));
    for (const ids of shapes) {
      try {
        const shape = live(ids), tabs = this.tabsIn(shape);
        if (tabs.length < 2 || tabs.some(t => !t || t.closing || Tiler.data(t) || !this.members().includes(t))) continue;
        S.splitTabs(tabs, undefined, -1, { activate: false });
        const data = Tiler.data(tabs[0]);
        if (data) this.build(data, shape);
      } catch (e) {
        console.error("[Zenith] layout", e);
      }
    }
    gBrowser.selectedTab = sel;
  },

  // The page area as the tab you're on has it: a strip's shift only on a
  // strip (Layouts.after sets it); none left over on another space's tab.
  shown() {
    const data = Tiler.data(gBrowser.selectedTab);
    if (data && this.scroller(data)) return;
    gBrowser.tabpanels.removeAttribute("zenith-scroller");
    gBrowser.tabpanels.style.removeProperty("--zth-strip-x");
    this.card([]);
  },

  // A strip back to the space's tabs, the one you're on shown.
  dissolve(data) {
    const S = Tiler.S, i = S._data.indexOf(data), sel = gBrowser.selectedTab;
    if (i < 0) return;
    for (const t of data.tabs) t.linkedBrowser?.closest(".browserSidebarContainer")?.removeAttribute("zenith-off-strip");
    S.removeGroup(i);
    gBrowser.selectedTab = sel;
    Tiler.save();
  },

  solo() {
    if (SplitSolo.split(gBrowser.selectedTab)) SplitSolo.toggle(true);
  },

  // A split's tabs in order: left to right, top to bottom.
  order(data) {
    const out = [], walk = n => (n.tab ? out.push(n.tab) : n.children?.forEach(walk));
    if (data?.layoutTree) walk(data.layoutTree);
    return out;
  },

  // A split laid out again as `shape`: [direction, [tab | shape…], sizes].
  // Its tiles keep their own nodes; the old tree's splitters go with it.
  build(data, shape) {
    const S = Tiler.S, leaves = new Map();
    let Node = null;
    const walk = n => {
      if (n.tab) leaves.set(n.tab, n);
      else {
        Node ??= n.constructor;
        n.children?.forEach(walk);
      }
    };
    walk(data.layoutTree);
    if (!Node) return false;
    S._removeNodeSplitters?.(data.layoutTree, true);
    const make = (spec, size) => {
      if (!Array.isArray(spec)) {
        const leaf = leaves.get(spec);
        leaf.sizeInParent = size;
        leaf.positionToRoot = null;
        return leaf;
      }
      const [dir, kids, sizes] = spec, node = new Node(dir, size);
      node.children = kids.map((k, i) => make(k, sizes?.[i] ?? 100 / kids.length));
      return node;
    };
    const tree = make(shape, 100);
    tree.positionToRoot = null;
    data.layoutTree = tree;
    if (data.tabs.includes(gBrowser.selectedTab)) S.activateSplitView(data, true);
    else S.applyGridLayout(tree);
    Tiler.save();
    return true;
  },

  /* Master and stack */
  master(data) {
    const tabs = this.order(data);
    const m = tabs.includes(data.zenithMaster) ? data.zenithMaster : tabs[0];
    data.zenithMaster = m;
    const rest = tabs.filter(t => t !== m);
    if (!m || !rest.length) return;
    const ratio = parseInt(Services.prefs.getStringPref("zenith.shell.master-ratio", ""), 10) || 55;
    const col = list => (list.length === 1 ? list[0] : ["column", list]);
    if (Services.prefs.getStringPref("zenith.shell.master", "") === "centred" && rest.length >= 2) {
      const left = rest.filter((_, i) => i % 2 === 1), right = rest.filter((_, i) => i % 2 === 0), side = (100 - ratio) / 2;
      this.build(data, ["row", [col(left), m, col(right)], [side, ratio, side]]);
    } else this.build(data, ["row", [m, col(rest)], [ratio, 100 - ratio]]);
  },

  /* The scroller, as niri's: the split's tree is a row of columns, each a
     tile or a stack of them; every column stays in the split (one group
     in the sidebar). Its own width (niri's proportion of the view, gaps
     taken out), the strip as wide as they are, and a view along it. */
  share(tab) {
    if (this.full.has(tab)) return 1;
    return this.widths.get(tab) ?? { third: 1 / 3, half: 1 / 2, twothirds: 2 / 3, full: 1 }[Services.prefs.getStringPref("zenith.shell.scroller-width", "")] ?? 1 / 2;
  },

  // The split's columns, left to right, each top to bottom.
  cols(data) {
    const root = data?.layoutTree, leaves = n => (n.tab ? [n.tab] : n.children.flatMap(leaves));
    if (!root) return [];
    if (root.tab) return [[root.tab]];
    if (root.direction !== "row") return leaves(root).map(t => [t]);
    return root.children.map(leaves).filter(c => c.length);
  },

  colOf(data, tab) {
    return this.cols(data).find(c => c.includes(tab)) ?? [tab];
  },

  // The split as one row of its columns.
  lay(data, cols = this.cols(data)) {
    const shape = c => (c.length === 1 ? c[0] : ["column", c, c.map(() => 100 / c.length)]);
    return this.build(data, ["row", cols.map(shape), cols.map(() => 100 / cols.length)]);
  },

  // Columns changed: the sidebar in their order (a strip), the split laid
  // out as them, the view to `focus`.
  relay(data, cols, focus) {
    cols = cols.map(c => c.filter(t => data.tabs.includes(t))).filter(c => c.length);
    const order = cols.flat();
    if (data.zenithStrip) {
      for (let i = 1; i < order.length; i++) {
        if (order[i].previousElementSibling !== order[i - 1]) gBrowser.moveTabAfter(order[i], order[i - 1]);
      }
    }
    this.lay(data, cols);
    if (focus) this.arrange(focus);
  },

  // A tile joins a column: its width is the column's.
  join(tab, col) {
    const w = this.widths.get(col[0]);
    if (w === undefined) this.widths.delete(tab);
    else this.widths.set(tab, w);
    if (this.full.has(col[0])) this.full.add(tab);
    else this.full.delete(tab);
  },

  // A tile leaves its column: a new column's width, its own height.
  part(tab) {
    this.widths.delete(tab);
    this.full.delete(tab);
    this.heights.delete(tab);
  },

  scroller(data) {
    const tab = data?.tabs?.[0];
    return !!tab && this.of(tab.getAttribute("zen-workspace-id") ?? this.space()) === "scroller";
  },

  // The gap between Zen's tiles (each tile's right margin).
  gap() {
    const box = gBrowser.tabpanels.querySelector(":scope > .browserSidebarContainer[zen-split]");
    return box ? parseFloat(getComputedStyle(box).marginRight) || 0 : 6;
  },

  // Where each column is on the strip, in px: niri's widths, (view − gap)
  // × share − gap, one gap between columns.
  geometry(data) {
    const W = gBrowser.tabpanels.clientWidth || 1, G = this.gap(), cols = this.cols(data), xs = [];
    const ws = cols.map(c => Math.max(1, (W - G) * this.share(c[0]) - G));
    let x = 0;
    for (const w of ws) {
      xs.push(x);
      x += w + G;
    }
    return { W, G, cols, ws, xs };
  },

  // niri's view for column i (where the view's left edge is on the strip):
  // fit (the column whole, a gap from the edge, the view moved as little as
  // it can; kept if it's already whole), centred, or centred only when the
  // column you came from wouldn't fit beside it (on-overflow).
  view(g, i, prev, cur) {
    const { W, G, ws, xs, cols } = g, x = xs[i], w = ws[i];
    const fit = () => {
      if (W <= w) return x;
      const pad = Math.min(Math.max((W - w) / 2, 0), G), l = x - pad, r = x + w + pad;
      if (cur == null) return l;
      if (cur <= l && r <= cur + W) return cur;
      return Math.abs(cur - l) <= Math.abs(cur + W - r) ? l : r - W;
    };
    const centred = () => (W <= w ? fit() : x - (W - w) / 2);
    const mode = Services.prefs.getStringPref(this.FOCUS, "") || "view";
    if (mode === "centre" || (cols.length <= 1 && Services.prefs.getBoolPref(this.LONE, false))) return centred();
    if (mode === "overflow" && prev >= 0 && prev !== i) {
      const s = prev > i ? Math.min(i + 1, cols.length - 1) : Math.max(i - 1, 0);
      const total = (xs[s] < x ? x - xs[s] + w : xs[s] - x + ws[s]) + G * 2;
      return total <= W ? fit() : centred();
    }
    return fit();
  },

  // Is `tab`'s column (any of it) on screen now?
  inView(data, tab) {
    const g = this.geometry(data), i = g.cols.findIndex(c => c.includes(tab)), v = data.zenithView;
    return i >= 0 && v != null && g.xs[i] - v < g.W - 0.5 && g.xs[i] + g.ws[i] - v > 0.5;
  },

  // A scroller's tab (a strip's, or a split's in a scroller space).
  inStrip(tab) {
    const data = tab && Tiler.data(tab);
    return !!data && this.scroller(data);
  },

  // The nearest awake column's tile, right of `tab`'s first, then left; any
  // neighbour if none is awake (it wakes as you go to it).
  awake(tab, leaving = [tab]) {
    const cols = this.cols(Tiler.data(tab)), ci = cols.findIndex(c => c.includes(tab));
    const up = t => t && !leaving.includes(t) && !t.closing && t.linkedPanel && !t.hasAttribute("pending");
    for (let d = 1; d < cols.length; d++) {
      for (const j of [ci + d, ci - d]) {
        const t = this.tileOf((cols[j] ?? []).filter(up));
        if (t) return t;
      }
    }
    return this.tileOf((cols[ci + 1] ?? cols[ci - 1] ?? []).filter(t => !leaving.includes(t)));
  },

  // The tile of a column you were on last (niri's column keeps its own).
  tileOf(col) {
    const live = (col ?? []).filter(t => !t.closing);
    return live.reduce((a, b) => ((this.seen.get(b) ?? 0) > (this.seen.get(a) ?? 0) ? b : a), live[0]) ?? null;
  },

  // niri's next tile after closing one: in a stack, the one below (above
  // at the bottom); a column you just opened, the one you came from; else
  // the column on its right, on its left at the end.
  successor(tab, data = Tiler.data(tab)) {
    const cols = this.cols(data), ci = cols.findIndex(c => c.includes(tab));
    if (ci < 0) return null;
    const col = cols[ci], k = col.indexOf(tab), ok = t => t && t !== tab && !t.closing;
    if (col.length > 1) return [col[k + 1], col[k - 1]].find(ok) ?? null;
    if (this.back?.tab === tab && ci > 0 && cols[ci - 1].includes(this.back.from) && ok(this.back.from)) return this.tileOf(cols[ci - 1]);
    return this.tileOf(cols[ci + 1]) ?? this.tileOf(cols[ci - 1]);
  },

  // The view to `focus`'s column, as niri moves it.
  arrange(focus) {
    const data = Tiler.data(focus);
    if (!data) return;
    const g = this.geometry(data), i = g.cols.findIndex(c => c.includes(focus));
    if (i < 0) return;
    const prev = data.zenithActive?.isConnected ? g.cols.findIndex(c => c.includes(data.zenithActive)) : -1;
    data.zenithView = this.view(g, i, prev, data.zenithView);
    data.zenithActive = focus;
    this.arranging = true;
    try {
      if (gBrowser.selectedTab !== focus) gBrowser.selectedTab = focus;
      Tiler.S.applyGridLayout(data.layoutTree);
    } finally {
      this.arranging = false;
    }
  },

  // After Zen's layout: a scroller's columns where the strip puts them.
  after(node) {
    const data = Tiler.S?._data?.find(d => d.layoutTree === node);
    if (!data) return;
    const shown = data.tabs.includes(gBrowser.selectedTab), panels = gBrowser.tabpanels;
    if (!this.scroller(data)) {
      if (shown) panels.removeAttribute("zenith-scroller");
      return;
    }
    if (shown) panels.setAttribute("zenith-scroller", "true");
    // (A strip is the space's tabs, not a group of them: the sidebar shows
    // no group header for it.)
    const group = data.tabs[0]?.group;
    if (group?.hasAttribute("split-view-group")) group.toggleAttribute("zenith-strip", !!data.zenithStrip);
    const g = this.geometry(data), { W, G, cols, ws, xs } = g, H = panels.clientHeight || 1;
    // (The window resized: the view kept on the column you're on.)
    if (data.zenithW && data.zenithW !== W && data.zenithActive) {
      const i = cols.findIndex(c => c.includes(data.zenithActive));
      if (i >= 0) data.zenithView = this.view(g, i, -1, data.zenithView);
    }
    data.zenithW = W;
    const v = data.zenithView ?? 0;
    // The strip slides as one transform (drawn on the GPU, no layout while
    // it moves); a column that moved slides from where it was (niri's).
    if (shown) panels.style.setProperty("--zth-strip-x", `${(-v).toFixed(1)}px`);
    const speed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--zth-speed")) || 1;
    const off = [], cards = [], wake = [];
    cols.forEach((col, i) => {
      const weights = col.map(t => this.heights.get(t) ?? 1), sum = weights.reduce((a, b) => a + b, 0);
      let y = 0;
      col.forEach((tab, k) => {
        const h = (H * weights[k]) / sum, inset = `${y.toFixed(1)}px ${(W - xs[i] - ws[i] - G).toFixed(1)}px ${(H - y - h).toFixed(1)}px ${xs[i].toFixed(1)}px`;
        const away = xs[i] - v >= W - 0.5 || xs[i] + ws[i] - v <= 0.5, asleep = !tab.linkedPanel || tab.hasAttribute("pending");
        // A sleeping column in view: a card in its place (a click wakes it),
        // and it wakes by itself unless you put it to sleep there.
        if (asleep && !away && shown) cards.push([tab, inset]);
        // (Only once the view is set: the strip is laid out before it is.)
        if (asleep && !away && !this.slept.has(tab) && data.zenithView != null && !this.gathering) wake.push(tab);
        if (away) this.slept.delete(tab);
        const box = tab.linkedBrowser?.closest(".browserSidebarContainer");
        if (!box) return void (y += h);
        box.style.inset = inset;
        const was = box.zenithAt, now = [xs[i], y];
        box.zenithAt = now;
        if (shown && was && (Math.abs(was[0] - now[0]) > 0.5 || Math.abs(was[1] - now[1]) > 0.5)) {
          box.style.setProperty("transition", "none", "important");
          box.style.setProperty("--zth-col-dx", `${(was[0] - now[0]).toFixed(1)}px`);
          box.style.setProperty("--zth-col-dy", `${(was[1] - now[1]).toFixed(1)}px`);
          getComputedStyle(box).transform; // (from there…)
          box.style.removeProperty("transition");
          box.style.setProperty("--zth-col-dx", "0px"); // (…to here)
          box.style.setProperty("--zth-col-dy", "0px");
        }
        y += h;
        // (One sliding out stays drawn until it's out.)
        clearTimeout(box.zenithHide);
        if (away && !box.hasAttribute("zenith-off-strip") && shown) box.zenithHide = setTimeout(() => box.setAttribute("zenith-off-strip", "true"), 260 * speed);
        else box.toggleAttribute("zenith-off-strip", away);
        off.push([tab, away]);
      });
    });
    if (shown) this.card(cards);
    if (wake.length) this.wake(wake);
    // (Peek, over a column, follows it: now, and once the strip has slid.)
    if (shown) {
      window.dispatchEvent(new CustomEvent("ZenithStrip"));
      clearTimeout(this.slid);
      this.slid = setTimeout(() => window.dispatchEvent(new CustomEvent("ZenithStrip")), 260 * speed);
    }
    // Columns out of sight: their pages asleep, as a background tab's (Zen
    // wakes every tile of a split after laying it out, hence a moment later);
    // one not restored yet stays unloaded until it comes into view.
    if (shown) {
      Promise.resolve().then(() => {
        for (const [tab, away] of off) {
          try {
            if (this.unrestored.has(tab)) {
              if (away) tab.setAttribute("pending", "true"); // (Zen took it off: the sidebar shows it unloaded)
            }
            // (Zen's zenModeActive keeps a split's tile awake whatever it's told.)
            const br = tab.linkedBrowser;
            if (!br || tab === gBrowser.selectedTab) continue;
            br.zenModeActive = !away;
            br.docShellIsActive = !away;
          } catch {}
        }
      });
    }
  },

  // A moment after the strip settles (it's laid out again for each column it
  // takes in): the columns waiting to be restored that are in view.
  wake(tabs) {
    this.waiting = new Set([...(this.waiting ?? []), ...tabs]);
    clearTimeout(this.waking);
    this.waking = setTimeout(() => {
      const data = Tiler.data(gBrowser.selectedTab), list = [...this.waiting];
      this.waiting = null;
      for (const tab of list) {
        if (!tab.isConnected || tab.closing || this.slept.has(tab) || !data?.tabs.includes(tab) || !this.inView(data, tab)) continue;
        this.unrestored.delete(tab);
        try {
          if (!tab.linkedPanel) gBrowser._insertBrowser?.(tab);
          gBrowser.tabContainer.dispatchEvent(new CustomEvent("TabSplitViewActivate", { detail: { tabs: [tab], zenith: true } }));
        } catch (e) {
          console.error("[Zenith] a column waking", e);
        }
      }
      if (data && this.scroller(data)) Tiler.S.applyGridLayout(data.layoutTree);
    }, 400);
  },

  // The cards of sleeping columns in view (and no others): its icon, title,
  // and that it's asleep; a click goes to it, which wakes it.
  card(list) {
    const want = new Map(list);
    for (const [tab, node] of this.cards) {
      if (!want.has(tab)) {
        node.remove();
        this.cards.delete(tab);
      }
    }
    for (const [tab, inset] of want) {
      let node = this.cards.get(tab);
      if (!node) {
        node = el("div", { class: "zenith-asleep" });
        node.append(el("img", { alt: "" }), el("span", { class: "zenith-asleep-title" }), el("span", { class: "zenith-asleep-note" }));
        node.lastChild.textContent = "Asleep · a click wakes it";
        node.addEventListener("click", () => tab.isConnected && this.arrange(tab));
        this.cards.set(tab, node);
      }
      const img = node.firstChild, src = tab.getAttribute("image") || "";
      if (img.getAttribute("src") !== src) src ? img.setAttribute("src", src) : img.removeAttribute("src");
      node.children[1].textContent = tab.label;
      node.style.inset = inset;
      if (node.parentNode !== gBrowser.tabpanels) gBrowser.tabpanels.append(node);
    }
  },

  /* Tiler's hooks: a new tile, focus, moving, the layout's own action */
  insert(tab, anchor) {
    const how = this.of(), S = Tiler.S;
    if (how === "scroller") {
      let data = Tiler.data(anchor);
      if (data && data.tabs.length >= S.MAX_TABS) return Tiler.full(), true;
      if (Tiler.data(tab)) S.removeTabFromGroup(tab, undefined, { changeTab: false });
      this.gathering = true; // (the strip takes it in here, beside the anchor)
      setTimeout(() => (this.gathering = false), 0);
      data = Tiler.data(anchor);
      const cols = data ? this.cols(data) : [[anchor]], view = data?.zenithView ?? null;
      if (!data) S.splitTabs([anchor, tab], "vsep", 1);
      else S.splitTabs([anchor, tab], undefined, -1, { activate: false });
      data = Tiler.data(anchor);
      if (!data) return false;
      // niri: a new column right of the one you're on, and you on it.
      cols.splice(cols.findIndex(c => c.includes(anchor)) + 1, 0, [tab]);
      if (this.strip()) data.zenithStrip = true;
      this.fresh.delete(tab);
      this.relay(data, cols, tab);
      this.back = { tab, from: anchor, view };
      return true;
    }
    if (how === "master") {
      let data = Tiler.data(anchor);
      if (data && data.tabs.length >= S.MAX_TABS) return Tiler.full(), true;
      if (Tiler.data(tab)) S.removeTabFromGroup(tab);
      if (!data) S.splitTabs([anchor, tab], "vsep", 1);
      else S.splitTabs([anchor, tab], undefined, -1, { activate: false });
      data = Tiler.data(anchor);
      if (!data) return false;
      data.zenithMaster ??= anchor;
      gBrowser.selectedTab = tab;
      this.master(data);
      return true;
    }
    return false;
  },

  // Scroller: Alt+H and Alt+L the column beside (its tile you were on
  // last), Alt+J and Alt+K the tile below or above in the column; nothing
  // past the strip's ends (niri's). Monocle: the tile before or after.
  focus(dir) {
    const how = this.of(), tab = gBrowser.selectedTab;
    if (how === "scroller") {
      const data = Tiler.data(tab);
      if (!data) return false;
      const cols = this.cols(data), ci = cols.findIndex(c => c.includes(tab)), col = cols[ci] ?? [tab];
      const to = dir === "left" || dir === "right" ? this.tileOf(cols[ci + (dir === "left" ? -1 : 1)]) : col[col.indexOf(tab) + (dir === "up" ? -1 : 1)];
      if (to) this.arrange(to);
      return !!to || this.strip();
    }
    if (how === "monocle") {
      const data = Tiler.data(tab);
      if (!data) return false;
      const order = this.order(data), i = order.indexOf(tab), j = i + (dir === "left" || dir === "up" ? -1 : 1);
      if (j < 0 || j >= order.length) return false;
      gBrowser.selectedTab = order[j];
      return true;
    }
    return false;
  },

  // Scroller: Alt+Shift+H and L move the column, J and K the tile in its
  // column (niri's move-column and move-window).
  move(dir) {
    if (this.of() !== "scroller") return false;
    const tab = gBrowser.selectedTab, data = Tiler.data(tab);
    if (!data) return false;
    const cols = this.cols(data), ci = cols.findIndex(c => c.includes(tab)), col = cols[ci];
    if (dir === "left" || dir === "right") {
      const j = ci + (dir === "left" ? -1 : 1);
      if (j < 0 || j >= cols.length) return true;
      [cols[ci], cols[j]] = [cols[j], cols[ci]];
    } else {
      const k = col.indexOf(tab), j = k + (dir === "up" ? -1 : 1);
      if (j < 0 || j >= col.length) return true;
      [col[k], col[j]] = [col[j], col[k]];
    }
    this.back = null;
    this.relay(data, cols, tab);
    return true;
  },

  // niri's consume-or-expel-window-left/right (Alt+[ and Alt+]): a column of
  // one tile joins the column beside it (at its bottom); a stacked tile
  // leaves its column for a column of its own on that side.
  consumeOrExpel(dir) {
    const tab = gBrowser.selectedTab, data = this.of() === "scroller" ? Tiler.data(tab) : null;
    if (!data) return hint("Scroller: Alt+[ and Alt+] take a tile into the column beside it, or out of its own");
    const cols = this.cols(data), ci = cols.findIndex(c => c.includes(tab)), col = cols[ci];
    if (col.length === 1) {
      const target = cols[ci + (dir === "left" ? -1 : 1)];
      if (!target) return;
      target.push(tab);
      this.join(tab, target);
      cols.splice(ci, 1);
    } else {
      col.splice(col.indexOf(tab), 1);
      cols.splice(dir === "left" ? ci : ci + 1, 0, [tab]);
      this.part(tab);
    }
    this.back = null;
    this.relay(data, cols, tab);
  },

  // niri's consume-into-column (Alt+,): the next column's top tile joins
  // this column; expel-from-column (Alt+.): its bottom tile leaves for a
  // column of its own, right of it. You stay on your tile.
  consume() {
    const tab = gBrowser.selectedTab, data = this.of() === "scroller" ? Tiler.data(tab) : null;
    if (!data) return hint("Scroller: Alt+, takes the next column's top tile into this one");
    const cols = this.cols(data), ci = cols.findIndex(c => c.includes(tab)), next = cols[ci + 1];
    if (!next) return;
    const t = next.shift();
    cols[ci].push(t);
    this.join(t, cols[ci]);
    this.relay(data, cols.filter(c => c.length), tab);
  },

  expel() {
    const tab = gBrowser.selectedTab, data = this.of() === "scroller" ? Tiler.data(tab) : null;
    if (!data) return hint("Scroller: Alt+. makes a column's bottom tile a column of its own");
    const cols = this.cols(data), ci = cols.findIndex(c => c.includes(tab)), col = cols[ci];
    if (col.length < 2) return;
    const t = col.pop();
    this.part(t);
    cols.splice(ci + 1, 0, [t]);
    this.relay(data, cols, tab);
  },

  // Alt+drag in the scroller (niri's interactive move): onto a column's
  // left or right edge, a column of its own there; its top or bottom, into
  // that column above or below the tile; its middle, the two swap places.
  place(tab, target, side) {
    const data = Tiler.data(tab);
    if (!data || data !== Tiler.data(target) || tab === target) return;
    let cols = this.cols(data);
    if (side === "swap") {
      cols = cols.map(c => c.map(t => (t === tab ? target : t === target ? tab : t)));
      const a = this.widths.get(tab), b = this.widths.get(target);
      a === undefined ? this.widths.delete(target) : this.widths.set(target, a);
      b === undefined ? this.widths.delete(tab) : this.widths.set(tab, b);
    } else {
      cols = cols.map(c => c.filter(t => t !== tab)).filter(c => c.length);
      const ci = cols.findIndex(c => c.includes(target));
      if (side === "left" || side === "right") {
        cols.splice(side === "left" ? ci : ci + 1, 0, [tab]);
        this.part(tab);
      } else {
        const col = cols[ci];
        col.splice(col.indexOf(target) + (side === "bottom" ? 1 : 0), 0, tab);
        this.join(tab, col.filter(t => t !== tab));
      }
    }
    this.back = null;
    this.relay(data, cols, tab);
  },

  // Alt+right-drag in the scroller (niri's interactive resize): the
  // column's width follows the pointer sideways; a stacked tile's height up
  // and down (from where the drag began, in `from`).
  drag(tab, from, dx, dy, box) {
    const data = Tiler.data(tab);
    if (!data) return;
    const col = this.colOf(data, tab);
    const p = Math.min(1, Math.max(0.1, from.share + dx / Math.max(1, from.W)));
    for (const t of col) {
      this.full.delete(t);
      this.widths.set(t, p);
    }
    if (col.length > 1 && dy) {
      const H = gBrowser.tabpanels.clientHeight || 1, base = new Map(from.heights), w = t => base.get(t) ?? 1;
      const sum = col.reduce((a, t) => a + w(t), 0), rest = sum - w(tab);
      const n = Math.min(0.9, Math.max(0.1, w(tab) / sum + dy / H));
      for (const t of col) if (t !== tab) this.heights.set(t, (w(t) / rest) * (1 - n));
      this.heights.set(tab, n);
    } else if (col.length > 1) for (const [t, h] of from.heights) h === undefined ? this.heights.delete(t) : this.heights.set(t, h);
    this.arrange(tab);
  },

  // niri's center-column (Alt+C).
  centre() {
    const tab = gBrowser.selectedTab, data = this.of() === "scroller" ? Tiler.data(tab) : null;
    if (!data) return hint("Scroller: Alt+C puts the column you're on in the middle");
    const g = this.geometry(data), i = g.cols.findIndex(c => c.includes(tab));
    if (g.W > g.ws[i]) data.zenithView = g.xs[i] - (g.W - g.ws[i]) / 2;
    Tiler.S.applyGridLayout(data.layoutTree);
  },

  // niri's maximize-column (Alt+F in the scroller): the column takes the
  // whole view (gaps kept), and back to its width.
  maximize() {
    const tab = gBrowser.selectedTab, data = Tiler.data(tab);
    if (!data) return false;
    const col = this.colOf(data, tab), on = !this.full.has(tab);
    for (const t of col) on ? this.full.add(t) : this.full.delete(t);
    hint(on ? "Column: the whole view (Alt+F again: back)" : "Column: back to its width");
    this.arrange(tab);
    return true;
  },

  // Resize mode in the scroller: h and l the column's width a tenth of the
  // view at a time, j and k a stacked tile's height (niri's
  // set-column-width and set-window-height ±10%).
  resize(dir) {
    const tab = gBrowser.selectedTab, data = this.of() === "scroller" ? Tiler.data(tab) : null;
    if (!data) return false;
    const col = this.colOf(data, tab);
    if (dir === "left" || dir === "right") {
      const p = Math.min(1, Math.max(0.1, this.share(tab) + (dir === "right" ? 0.1 : -0.1)));
      for (const t of col) {
        this.full.delete(t);
        this.widths.set(t, p);
      }
    } else if (col.length > 1) {
      const w = t => this.heights.get(t) ?? 1, sum = col.reduce((a, t) => a + w(t), 0), rest = sum - w(tab);
      const n = Math.min(0.9, Math.max(0.1, w(tab) / sum + (dir === "down" ? 0.1 : -0.1)));
      for (const t of col) if (t !== tab) this.heights.set(t, (w(t) / rest) * (1 - n));
      this.heights.set(tab, n);
    }
    this.arrange(tab);
    return true;
  },

  // Resize mode's = in the scroller: the column back to a new column's
  // width, its tiles even.
  even() {
    const tab = gBrowser.selectedTab, data = this.of() === "scroller" ? Tiler.data(tab) : null;
    if (!data) return false;
    for (const t of this.colOf(data, tab)) {
      this.widths.delete(t);
      this.full.delete(t);
      this.heights.delete(t);
    }
    this.arrange(tab);
    return true;
  },

  // Alt+Shift+Y: master, the tile you're on is the master; scroller, the
  // column's next preset width (niri's switch-preset-column-width).
  action() {
    const how = this.of(), tab = gBrowser.selectedTab;
    if (how === "master") {
      const data = Tiler.data(tab);
      if (!data) return hint("Master: a split's tile becomes the master");
      data.zenithMaster = tab;
      return this.master(data);
    }
    if (how === "scroller") {
      const data = Tiler.data(tab);
      if (!data) return hint("Scroller: a split's column gets its next width");
      const now = this.share(tab), p = this.WIDTHS.find(w => w > now + 0.01) ?? this.WIDTHS[0];
      for (const t of this.colOf(data, tab)) {
        this.full.delete(t);
        this.widths.set(t, p);
      }
      hint(`Column: ${{ 33: "a third", 50: "half", 67: "two thirds" }[Math.round(p * 100)]} of the view`);
      return this.arrange(tab);
    }
    hint(`${this.NAMES[how]}: Alt+Shift+Y does nothing here (in master, the master; in scroller, a column's width)`);
  },

  closed(tab, next, view) {
    const how = this.of();
    if (how === "master") {
      const data = Tiler.data(gBrowser.selectedTab);
      if (data) this.master(data);
    } else if (how === "scroller") {
      const to = next?.isConnected && Tiler.data(next) ? next : Tiler.data(gBrowser.selectedTab) ? gBrowser.selectedTab : null;
      const data = to && Tiler.data(to);
      if (!data) return;
      // (niri: back to the column you came from, the view as it was.)
      if (view != null) data.zenithView = view;
      this.relay(data, this.cols(data), to);
    }
  },
};

// The session as written (Firefox's file and Zen's own), for every window
// of this run, cleaned once: a split of more than 4 tabs, or one whose tab
// count doesn't match, is saved as its plain tabs.
function sessionSaneOnce() {
  const MAX = 4;
  const window1 = data => {
    const tabs = data?.tabs ?? [], groups = data?.groups ?? [], splits = data?.splitViews ?? [];
    const count = new Map(), inGroup = new Map();
    for (const t of tabs) {
      if (t.splitViewId) count.set(t.splitViewId, (count.get(t.splitViewId) ?? 0) + 1);
      if (t.groupId) inGroup.set(t.groupId, (inGroup.get(t.groupId) ?? 0) + 1);
    }
    const known = new Set(splits.map(x => x.id)), bad = new Set([...count.keys()].filter(id => !known.has(id)));
    for (const x of splits) if ((count.get(x.id) ?? 0) > MAX || (count.get(x.id) ?? 0) !== x.numberOfTabs) bad.add(x.id);
    const badGroups = new Set(groups.filter(g => g.splitView && (inGroup.get(g.id) ?? 0) > MAX).map(g => g.id));
    if (!bad.size && !badGroups.size) return 0;
    for (const t of tabs) {
      if (bad.has(t.splitViewId)) delete t.splitViewId;
      if (badGroups.has(t.groupId)) delete t.groupId;
    }
    if (data.splitViews) data.splitViews = splits.filter(x => !bad.has(x.id));
    if (data.groups) data.groups = groups.filter(g => !badGroups.has(g.id));
    if (Array.isArray(data.splitViewData)) data.splitViewData = data.splitViewData.filter(d => !badGroups.has(d.groupId) && !((d.tabs?.length ?? 0) > MAX));
    return bad.size + badGroups.size;
  };
  const clean = state => {
    if (Services.prefs.getBoolPref("zenith.internal.strip-save-raw", false)) return state; // (tools/checks: as 0.18.5 saved it)
    let n = 0;
    try {
      for (const w of [...(state?.windows ?? []), ...(state?._closedWindows ?? [])]) n += window1(w);
      if (state?.splitViewData || state?.tabs) n += window1(state); // (Zen's sidebar data)
    } catch (e) {
      console.error("[Zenith] the session's strips", e);
    }
    if (n) Services.prefs.setIntPref("zenith.internal.strip-saved", (Services.prefs.getIntPref("zenith.internal.strip-saved", 0) || 0) + 1);
    return state;
  };
  const wrap = (owner, name) => {
    const orig = owner?.[name];
    if (typeof orig !== "function" || orig.zenithSane) return;
    const fn = function (state, ...rest) {
      return orig.call(this, clean(state), ...rest);
    };
    fn.zenithSane = true;
    owner[name] = fn;
  };
  try {
    wrap(ChromeUtils.importESModule("moz-src:///browser/components/sessionstore/SessionFile.sys.mjs").SessionFile, "write");
  } catch (e) {
    console.error("[Zenith] the session's strips (Firefox's file)", e);
  }
  try {
    wrap(ChromeUtils.importESModule("resource:///modules/zen/ZenSessionManager.sys.mjs").ZenSessionStore, "saveState");
  } catch (e) {
    console.error("[Zenith] the session's strips (Zen's file)", e);
  }
}

const ShellMouse = {
  init() {
    const down = e => this.down(e);
    this.onMove = e => this.move(e);
    this.onUp = e => this.up(e);
    const menu = e => this.menu(e);
    const wheel = e => this.wheel(e);
    window.addEventListener("mousedown", down, true);
    window.addEventListener("contextmenu", menu, true);
    window.addEventListener("wheel", wheel, { capture: true, passive: true });
    const follow = e => this.follow(e);
    const read = () => {
      const P = Services.prefs;
      this.on = P.getBoolPref(SHELL.MOUSE, true);
      this.wheelOn = P.getBoolPref(SHELL.WHEEL, true);
      // Firefox's own Alt+wheel (a step back or forward in history) would
      // happen as well: set to nothing while the Shell has Alt+wheel.
      Bridge.apply("shell-wheel", { "mousewheel.with_alt.action": this.wheelOn ? 0 : null });
      const followOn = P.getBoolPref(SHELL.FOLLOW, false);
      if (followOn !== !!this.following) {
        this.following = followOn;
        if (followOn) gBrowser.tabpanels.addEventListener("mousemove", follow, { passive: true });
        else gBrowser.tabpanels.removeEventListener("mousemove", follow);
      }
      LinkClicks.update();
    };
    const prefs = [SHELL.MOUSE, SHELL.WHEEL, SHELL.FOLLOW];
    for (const p of prefs) Services.prefs.addObserver(p, read);
    onUnload(() => {
      for (const p of prefs) Services.prefs.removeObserver(p, read);
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("contextmenu", menu, true);
      window.removeEventListener("wheel", wheel, { capture: true });
      gBrowser.tabpanels.removeEventListener("mousemove", follow);
      this.end();
    });
    read();
  },

  // The split's tab whose tile is under the pointer.
  tileAt(target) {
    const box = target?.closest?.(".browserSidebarContainer"), browser = box?.querySelector("browser");
    const tab = browser && gBrowser.getTabForBrowser(browser);
    return tab && Tiler.data(tab) ? tab : null;
  },

  down(e) {
    if (!this.on || !e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || (e.button !== 0 && e.button !== 2) || !ShellKeys.free()) return;
    const tab = this.tileAt(e.target);
    if (!tab) return;
    this.press = { tab, data: Tiler.data(tab), button: e.button, x: e.clientX, y: e.clientY, box: Tiler.box(tab) };
    window.addEventListener("mousemove", this.onMove, true);
    window.addEventListener("mouseup", this.onUp, true);
  },

  move(e) {
    const p = this.press;
    if (!p) return;
    if (!(e.buttons & (p.button === 2 ? 2 : 1))) return this.end();
    if (!p.going) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
      this.start(p);
    }
    p.at = [e.clientX, e.clientY];
    this.frame ??= requestAnimationFrame(() => {
      this.frame = null;
      if (this.press?.going) this.press.button === 2 ? this.resizing() : this.aiming();
    });
  },

  start(p) {
    p.going = true;
    gBrowser.selectedTab = p.tab;
    // The rest of the drag is the window's: a sheet over the tiles takes it.
    const panels = gBrowser.tabpanels.getBoundingClientRect();
    this.sheet = el("div", { id: "zenith-tile-drag", kind: p.button === 2 ? "resize" : "move" });
    this.sheet.style.inset = `${panels.top}px ${innerWidth - panels.right}px ${innerHeight - panels.bottom}px ${panels.left}px`;
    this.aim = el("div", { id: "zenith-tile-aim" });
    this.sheet.append(this.aim);
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(this.sheet);
    this.esc = e => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.end(true);
    };
    window.addEventListener("keydown", this.esc, true);
    // (The scroller: a column's own width, a stacked tile's own height.)
    if (p.button === 2 && Layouts.inStrip(p.tab)) {
      p.strip = { share: Layouts.share(p.tab), heights: Layouts.colOf(p.data, p.tab).map(t => [t, Layouts.heights.get(t)]), W: gBrowser.tabpanels.clientWidth - Layouts.gap() };
      return;
    }
    if (p.button === 2) {
      const leaf = Tiler.leaf(p.data, p.tab);
      p.across = Tiler.edge(leaf, "row", p.x > p.box.left + p.box.width / 2);
      p.updown = Tiler.edge(leaf, "column", p.y > p.box.top + p.box.height / 2);
    }
  },

  // Over another tile: its middle swaps the two, an edge puts this tile there.
  aiming() {
    const p = this.press, [x, y] = p.at;
    p.target = null;
    for (const t of p.data.tabs) {
      const b = t !== p.tab && Tiler.box(t);
      if (!b || x < b.left || x > b.right || y < b.top || y > b.bottom) continue;
      const fx = (x - b.left) / b.width, fy = (y - b.top) / b.height;
      const near = Math.min(fx, 1 - fx, fy, 1 - fy);
      const side = near > 0.3 ? "swap" : near === fx ? "left" : near === 1 - fx ? "right" : near === fy ? "top" : "bottom";
      p.target = { tab: t, side };
      const s = this.sheet.getBoundingClientRect();
      const r = { left: b.left - s.left, top: b.top - s.top, width: b.width, height: b.height };
      if (side === "right") r.left += r.width / 2;
      if (side === "bottom") r.top += r.height / 2;
      if (side === "left" || side === "right") r.width /= 2;
      if (side === "top" || side === "bottom") r.height /= 2;
      Object.assign(this.aim.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      break;
    }
    this.aim.toggleAttribute("show", !!p.target);
  },

  resizing() {
    const p = this.press, [x, y] = p.at;
    if (p.strip) return Layouts.drag(p.tab, p.strip, x - p.x, y - p.y, p.box);
    if (p.across) Tiler.shift(p.across, ((x - p.x) / p.across.px) * 100);
    if (p.updown) Tiler.shift(p.updown, ((y - p.y) / p.updown.px) * 100);
    if (p.across || p.updown) Tiler.S.applyGridLayout(p.data.layoutTree);
  },

  up(e) {
    const p = this.press;
    if (!p || e.button !== p.button) return;
    if (p.going) {
      e.preventDefault();
      e.stopPropagation();
      // (Aimed again where it's let go: the last frame may be a move behind.)
      p.at = [e.clientX, e.clientY];
      if (p.button === 0) this.aiming();
      if (p.button === 0 && p.target) {
        try {
          if (Layouts.inStrip(p.tab)) Layouts.place(p.tab, p.target.tab, p.target.side);
          else if (p.target.side === "swap") {
            SplitReorder.swap(p.tab, p.target.tab);
            gBrowser.selectedTab = p.tab;
          } else Tiler.place(p.tab, p.target.tab, p.target.side);
        } catch (err) {
          console.error("[Zenith] Shell: Alt+drag", err);
        }
      }
      if (p.button === 2) Tiler.save();
      // (The right-click menu that follows a right-drag stays shut.)
      this.dragged = p.button === 2 ? performance.now() : 0;
    }
    this.end();
  },

  end(cancel = false) {
    const p = this.press;
    if (cancel && p?.going && p.strip) Layouts.drag(p.tab, p.strip, 0, 0, p.box);
    else if (cancel && p?.going && p.button === 2) {
      if (p.across) Tiler.shift(p.across, 0);
      if (p.updown) Tiler.shift(p.updown, 0);
      Tiler.S?.applyGridLayout(p.data.layoutTree);
    }
    this.press = null;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    window.removeEventListener("mousemove", this.onMove, true);
    window.removeEventListener("mouseup", this.onUp, true);
    if (this.esc) window.removeEventListener("keydown", this.esc, true);
    this.esc = null;
    this.sheet?.remove();
    this.sheet = this.aim = null;
  },

  // The right-click menu stays shut during an Alt+right press (some systems
  // open it as the button goes down) and just after a right-drag (Windows
  // opens it as the button comes up). A plain Alt+right-click on Windows
  // still gets its menu.
  menu(e) {
    if (this.press?.button === 2 || performance.now() - (this.dragged ?? 0) < 600) {
      e.preventDefault();
      e.stopPropagation();
      this.dragged = 0;
    }
  },

  // A notch (or a trackpad's worth) a space; Firefox's own Alt+wheel is
  // off meanwhile, so nothing needs stopping here (a passive listener:
  // scrolling never waits on it).
  wheel(e) {
    if (!this.wheelOn || !e.altKey || e.ctrlKey || e.metaKey || !ShellKeys.free()) return;
    // Alt with a sideways wheel (or Alt+Shift+wheel): along the scroller's strip.
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      if (Layouts.of() !== "scroller" || !Tiler.data()) return;
      const now = performance.now(), d = e.deltaX || e.deltaY;
      if (now - (this.stripAt ?? 0) < 160 || !d) return;
      this.stripAt = now;
      Layouts.focus(d > 0 ? "right" : "left");
      return;
    }
    const now = performance.now();
    if (now - (this.wheelAt ?? 0) > 400) this.wheelSum = 0;
    this.wheelAt = now;
    this.wheelSum = (this.wheelSum ?? 0) + (e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY);
    if (Math.abs(this.wheelSum) < 40 || now - (this.switched ?? 0) < 180) return;
    this.switched = now;
    window.gZenWorkspaces?.changeWorkspaceShortcut?.(this.wheelSum > 0 ? 1 : -1);
    this.wheelSum = 0;
  },

  // Focus follows the mouse (Tiling and keys › off by default): a tile rested on
  // for a moment is the one you're on.
  follow(e) {
    const tab = this.tileAt(e.target);
    clearTimeout(this.followTimer);
    if (!tab || tab === gBrowser.selectedTab || this.press) return;
    this.followTimer = setTimeout(() => {
      if (tab.isConnected && Tiler.data(tab) && Tiler.data(tab) === Tiler.data()) gBrowser.selectedTab = tab;
    }, 150);
  },
};

/* Clicking a link with keys (Tiling and keys › Mouse): each key combo does one thing,
   Zen's Glance, Peek, a tile beside this one, or nothing of Zenith's. The
   page's helper (plus/pages/peek-link.sys.mjs) answers the click before
   Zen or Firefox do: Firefox's Ctrl+click opens a tab, and Zen's Glance
   only answers a click with one or three keys held, so neither could have
   Ctrl+Alt. AltGr (the right Alt on layouts that have one) is Ctrl+Alt.
   While Zenith answers clicks, Zen's own Glance key moves to the Windows
   key through the Bridge (given back once every combo is "nothing").
   Pages are told what to do (they can't read Zenith's settings), and
   whether an Alt+press is the window's (Alt+drag). */
const LinkClicks = {
  // combo · what it does unless changed
  COMBOS: { alt: "glance", "alt-shift": "tile", "ctrl-alt": "peek", "ctrl-shift": "nothing" },

  pref(combo) {
    return `zenith.links.${combo}`;
  },

  read() {
    const out = {}, peek = Services.prefs.getBoolPref("zenith.peek.enabled", true);
    for (const [combo, def] of Object.entries(this.COMBOS)) {
      const v = Services.prefs.getStringPref(this.pref(combo), "") || def;
      out[combo] = v === "peek" && !peek ? "nothing" : v;
    }
    return out;
  },

  update() {
    const combos = this.read();
    Services.ppmm.sharedData.set("zenith-link-clicks", { combos, press: !!ShellMouse.on });
    Services.ppmm.sharedData.flush();
    Bridge.apply("link-clicks", { "zen.glance.activation-method": Object.values(combos).some(v => v !== "nothing") ? "meta" : null });
  },

  // 0.13's two settings (Peek's keys, the Shell's tile keys) become the
  // combos they amounted to, the tile winning Alt+Shift as it did.
  migrate() {
    const P = Services.prefs, OLD_PEEK = "zenith.plus.peek-click", OLD_TILE = "zenith.shell.tile-click";
    // (0.13's Peek gave Zen's Glance key back through its own bridge.)
    Bridge.apply("peek-click", { "zen.glance.activation-method": null });
    if (!P.prefHasUserValue(OLD_PEEK) && !P.prefHasUserValue(OLD_TILE)) return;
    const tile = P.getStringPref(OLD_TILE, "") || "alt-shift";
    const peek = P.getStringPref(OLD_PEEK, "") || (tile === "alt-shift" ? "ctrl-alt" : "alt-shift");
    const map = { alt: "glance", "alt-shift": "nothing", "ctrl-alt": "nothing", "ctrl-shift": "nothing" };
    if (peek === "alt") map.alt = "peek";
    else if (peek === "alt-swap") Object.assign(map, { alt: "peek", "alt-shift": "glance" });
    else if (peek in map) map[peek] = "peek";
    if (tile in map) map[tile] = "tile";
    for (const [combo, v] of Object.entries(map)) {
      if (v === this.COMBOS[combo]) P.clearUserPref(this.pref(combo));
      else P.setStringPref(this.pref(combo), v);
    }
    P.clearUserPref(OLD_PEEK);
    P.clearUserPref(OLD_TILE);
  },

  init() {
    window.ZenithLinkClicks = this; // for tools/checks
    this.migrate();
    const update = () => this.update();
    const prefs = [...Object.keys(this.COMBOS).map(c => this.pref(c)), "zenith.peek.enabled"];
    for (const p of prefs) Services.prefs.addObserver(p, update);
    onUnload(() => {
      for (const p of prefs) Services.prefs.removeObserver(p, update);
    });
    this.update();
  },
};

/* Spaces as i3's workspaces: Alt+1…0 goes there, Alt+Shift+1…0 sends the
   tab (you stay), Alt+` goes back to the one before. */
const ShellSpaces = {
  init() {
    const W = window.gZenWorkspaces;
    if (!W?.addChangeListeners) return;
    this.now = W.activeWorkspace;
    this.onChange = () => {
      const id = W.activeWorkspace;
      if (id && id !== this.now) [this.prev, this.now] = [this.now, id];
    };
    W.addChangeListeners(this.onChange);
    onUnload(() => W.removeChangeListeners?.(this.onChange));
  },

  list() {
    return window.gZenWorkspaces?.getWorkspaces?.() ?? [];
  },

  go(n) {
    const s = this.list()[n - 1];
    if (!s) return hint(`There's no space ${n}`);
    if (s.uuid !== gZenWorkspaces.activeWorkspace) gZenWorkspaces.changeWorkspaceWithID(s.uuid);
  },

  send(n) {
    const s = this.list()[n - 1], tab = gBrowser.selectedTab;
    if (!s) return hint(`There's no space ${n}`);
    if (tab.getAttribute("zen-workspace-id") === s.uuid || tab.hasAttribute("zen-essential")) return;
    if (Tiler.data(tab)) Tiler.S.removeTabFromGroup(tab);
    gZenWorkspaces.moveTabToWorkspace(tab, s.uuid);
    hint(`Sent to ${s.name || `space ${n}`}`);
  },

  last() {
    if (this.prev && this.list().some(s => s.uuid === this.prev)) gZenWorkspaces.changeWorkspaceWithID(this.prev);
  },
};

const ShellTabs = {
  // Putting the tab you're on to sleep (Zenith's key, Zen's or Firefox's
  // Unload): the nearest awake tab is shown, after it in the sidebar, else
  // before it; not simply the next one, which would wake to be shown.
  init() {
    const unload = gBrowser.explicitUnloadTabs;
    if (!unload) return;
    gBrowser.explicitUnloadTabs = function (tabs, ...rest) {
      try {
        // A scroller's column sleeps where it is, the strip as it was: you
        // go to the nearest awake column first. (Firefox's own unloading
        // treats a split as one: it would leave the whole strip.)
        const list = [].concat(tabs ?? []), columns = list.filter(t => Layouts.inStrip(t));
        if (columns.length) {
          ShellTabs.sleepColumns(columns);
          const others = list.filter(t => !columns.includes(t));
          if (!others.length) return Promise.resolve();
          tabs = others;
        }
        const sel = gBrowser.selectedTab, to = tabs?.includes?.(sel) && !Tiler.data(sel) ? ShellTabs.next(sel, tabs) : null;
        if (to) gBrowser.selectedTab = to;
      } catch (e) {
        console.error("[Zenith] unload", e);
      }
      return unload.call(this, tabs, ...rest);
    };
    onUnload(() => (gBrowser.explicitUnloadTabs = unload));
  },

  next(tab, leaving = [tab]) {
    const list = gBrowser.visibleTabs.filter(t => !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"));
    const awake = t => !leaving.includes(t) && !!t.linkedPanel && !t.hasAttribute("pending");
    const i = list.indexOf(tab);
    return list.slice(i + 1).find(awake) ?? list.slice(0, Math.max(0, i)).reverse().find(awake) ?? null;
  },

  unload(tabs) {
    if (typeof gBrowser.explicitUnloadTabs === "function") gBrowser.explicitUnloadTabs(tabs);
    else for (const t of tabs) gBrowser.discardBrowser(t, true);
  },

  // Scroller columns to sleep: the one you're on hands over to the nearest
  // awake column (right first, as niri's next column), then each sleeps.
  sleepColumns(columns) {
    const sel = gBrowser.selectedTab;
    if (columns.includes(sel)) {
      const to = Layouts.awake(sel, columns);
      if (!to) return hint("The only awake column can't sleep");
      Layouts.arrange(to);
    }
    for (const t of columns) {
      try {
        Layouts.slept.add(t);
        if (t !== gBrowser.selectedTab && t.linkedPanel && !t.hasAttribute("pending")) gBrowser.discardBrowser(t, true);
      } catch (e) {
        console.error("[Zenith] a column to sleep", e);
      }
    }
  },

  sleep() {
    const tab = gBrowser.selectedTab;
    if (Layouts.inStrip(tab)) return this.sleepColumns([tab]);
    if (Tiler.data(tab)) return hint("A tile on screen can't sleep");
    const to = this.next(tab) ?? gBrowser._findTabToBlurTo?.(tab);
    if (!to || to === tab) return hint("Your only tab can't sleep");
    gBrowser.selectedTab = to;
    this.unload([tab]);
  },

  // The space's other tabs (not this split's, nor one playing sound).
  sleepOthers() {
    const keep = new Set(Tiler.data()?.tabs ?? [gBrowser.selectedTab]);
    const tabs = gBrowser.visibleTabs.filter(t => !keep.has(t) && !t.closing && t.linkedPanel && !t.hasAttribute("pending")
                                                   && !t.soundPlaying && !t.hasAttribute("zen-empty-tab"));
    this.unload(tabs);
    hint(tabs.length ? `${tabs.length} tab${tabs.length === 1 ? "" : "s"} asleep` : "Nothing else to put to sleep");
  },
};

/* The scratchpad: tabs you call up over everything and send away again
   (Slack, music, a chat), as i3's. A tab sent there floats (Float a tab)
   and its float window is put away; Alt+- shows it, or the next one, and
   puts it away again. Away is off the screen for a float above its Zen
   window (it has no taskbar button, so nothing shows), minimised for one
   above every app; either way its page rests, as a background tab does.
   (Firefox won't hide a window outright: r80.) */
const Scratchpad = {
  shown(win) {
    return !win.zenithScratchAway;
  },

  show(win, on) {
    try {
      const browser = win.gBrowser?.selectedBrowser;
      if (!on) {
        win.zenithScratchAway = true;
        if (win.zenithFloatMode === "all") win.minimize();
        else {
          win.zenithScratchAt = [win.screenX, win.screenY];
          win.moveTo(-32000, -32000);
        }
        if (browser) browser.docShellIsActive = false;
        return;
      }
      win.zenithScratchAway = false;
      if (win.windowState === win.STATE_MINIMIZED) win.restore();
      if (win.zenithScratchAt) win.moveTo(...win.zenithScratchAt);
      win.zenithScratchAt = null;
      if (browser) browser.docShellIsActive = true;
      win.setTimeout(() => win.focus(), 0); // (as Float a tab does: once it's back on screen)
    } catch (e) {
      console.error("[Zenith] scratchpad", e);
    }
  },

  // The main window's scratchpad floats.
  list(home = window.zenithFloatFrom ?? window) {
    const out = [];
    for (const w of Services.wm.getEnumerator("navigator:browser")) {
      if (!w.closed && w.zenithFloatFrom === home && w.zenithScratchpad) out.push(w);
    }
    return out;
  },

  async send() {
    if (window.zenithFloatFrom) return hint("Already floating: Alt+- hides it");
    const tab = gBrowser.selectedTab;
    if (!Services.prefs.getBoolPref(FloatTab.PREF, true)) return hint("The scratchpad floats tabs: Tools › Float a tab is off");
    const win = await FloatTab.float(tab, { focus: false });
    if (!win) return hint("This tab can't go to the scratchpad");
    win.zenithScratchpad = true; // (the float puts itself away once it's in place)
    hint(`In the scratchpad: ${ShellKeys.pretty(ShellKeys.combos.get("scratchpad")) || "Alt+-"} brings it back`);
  },

  toggle() {
    const home = window.zenithFloatFrom ?? window, list = this.list(home);
    if (!list.length) return hint("The scratchpad is empty (Alt+Shift+- sends a tab there)");
    const open = list.find(w => this.shown(w));
    if (open) {
      this.show(open, false);
      home.focus();
      return;
    }
    this.i = ((this.i ?? -1) + 1) % list.length;
    this.show(list[this.i], true);
  },
};

/* Alt+Shift+E and Alt+Shift+R ask first, in a bar across the top as
   i3-nagbar does. */
const Nagbar = {
  ask(kind) {
    this.close();
    const bar = (this.bar = el("div", { id: "zenith-nagbar", role: "alertdialog" }));
    const text = el("span"), yes = el("button", { type: "button" }), no = el("button", { type: "button" });
    text.textContent = kind === "quit" ? "Quit Zen?" : "Restart Zen? Your tabs come back as they are.";
    yes.textContent = kind === "quit" ? "Yes, quit" : "Yes, restart";
    no.textContent = "Cancel (Esc)";
    bar.append(text, yes, no);
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(bar);
    yes.addEventListener("click", () => this.go(kind));
    no.addEventListener("click", () => this.close());
    this.esc = e => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
    };
    window.addEventListener("keydown", this.esc, true);
    // (Enter answers only once the button has the focus: a page's own
    // Enter can't quit Zen.)
    yes.focus();
    this.timer = setTimeout(() => this.close(), 10000);
  },

  close() {
    this.bar?.remove();
    this.bar = null;
    if (this.esc) window.removeEventListener("keydown", this.esc, true);
    this.esc = null;
    clearTimeout(this.timer);
  },

  go(kind) {
    this.close();
    if (kind === "quit") return window.goQuitApplication ? goQuitApplication() : Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
    if (window.canQuitApplication && !canQuitApplication("restart")) return;
    Services.prefs.setBoolPref("browser.sessionstore.resume_session_once", true);
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
  },
};

/* Alt+Shift+/: every key, the Shell's and Zenith's others, on one sheet
   (Hyprland's keybind viewer). Any key or a click puts it away. */
const KeySheet = {
  // Every key there is, as it's set now, by group (also about:zenith-help's).
  groups() {
    const groups = new Map();
    const add = (group, combo, label) => {
      if (!combo) return;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([combo, label]);
    };
    const K = ShellKeys, plain = n => K.combos.get(n) === K.byName.get(n)[1];
    const spacesPlain = K.LIST.filter(e => /^(space|send)-/.test(e[0])).every(e => plain(e[0]));
    for (const [name, , label, group] of K.LIST) {
      if (spacesPlain && /^(space|send)-/.test(name)) continue;
      add(group, K.pretty(K.combos.get(name)), label);
    }
    if (spacesPlain) {
      add("Spaces", "Alt+1 … 0", "Go to that space");
      add("Spaces", "Alt+Shift+1 … 0", "Send the tab to that space (you stay)");
    }
    // Zenith's other keys, as about:keyboard has them.
    for (const [id, label] of ZenithKeys.OWN) add("Zenith", ZenithKeys.shown(id), label);
    const DOES = { glance: "Zen's Glance", peek: "Peek", tile: "A new tile" };
    for (const [combo, v] of Object.entries(LinkClicks.read())) {
      if (DOES[v]) add("Mouse", `${{ alt: "Alt", "alt-shift": "Alt+Shift", "ctrl-alt": "Ctrl+Alt", "ctrl-shift": "Ctrl+Shift" }[combo]}+click`, `A link in ${DOES[v]}`.replace("in A new", "as a new"));
    }
    add("Mouse", "Alt+drag", "A tile onto another (middle: swap; edge: there)");
    add("Mouse", "Alt+right-drag", "Resize a tile");
    add("Mouse", "Alt+wheel", "The next or previous space");
    return groups;
  },

  toggle() {
    if (this.node) return this.close();
    const node = (this.node = el("div", { id: "zenith-keysheet", role: "dialog", "aria-label": "Keys" }));
    const groups = this.groups(), K = ShellKeys;
    const head = el("div", { class: "zth-ks-head" });
    head.textContent = ShellModes.passthrough ? "Keys (passthrough is on: only Alt+P works)" : K.on ? "Keys" : "Keys (the Shell's keys are off: Settings › Zenith › Shell)";
    node.append(head);
    const cols = el("div", { class: "zth-ks-cols" });
    for (const [group, rows] of groups) {
      const box = el("section");
      const h = el("h3");
      h.textContent = group;
      box.append(h);
      for (const [combo, label] of rows) {
        const row = el("div", { class: "zth-ks-row" }), k = el("kbd"), t = el("span");
        k.textContent = combo;
        t.textContent = label;
        row.append(k, t);
        box.append(row);
      }
      cols.append(box);
    }
    node.append(cols);
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(node);
    this.away = e => {
      if (e.type === "keydown" && ["Alt", "Shift", "Control", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
    };
    window.addEventListener("keydown", this.away, true);
    node.addEventListener("mousedown", this.away);
  },

  close() {
    if (this.away) window.removeEventListener("keydown", this.away, true);
    this.away = null;
    this.node?.remove();
    this.node = null;
  },
};

