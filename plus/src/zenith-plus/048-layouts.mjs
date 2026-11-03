/* --- Layouts: each space's own (Tiling and keys › Layout; Alt+Y the next one) ---------------
   Dwindle: a new tile splits the one you're on along its longer side
   (Hyprland's). Master: one master tile and a stack (dwm's: the master on
   the left; or centred, the stack either side); Alt+Shift+Y makes the tile
   you're on the master. Scroller: tiles are columns on a strip, as niri's:
   every tab of the space (not essentials, pinned tabs or Firefox's groups;
   Tiling and keys › The scroller's strip holds: or only a split's tabs), with no
   limit on how many; those that fit show, the rest wait to the side (not
   drawn, their pages asleep), Alt+H and Alt+L (or Alt and a sideways
   wheel) walk the strip, Alt+Shift+Y the column's next width (a third, a
   half, two thirds, all), the column you're on kept in view or centred
   (Tiling and keys › The scroller keeps the column you're on). Monocle: the tile you're on fills the
   view (Alt+F's), Alt+H and Alt+L go to the others. */
const Layouts = {
  ALL: ["dwindle", "master", "scroller", "monocle"],
  NAMES: { dwindle: "Dwindle", master: "Master and stack", scroller: "Scroller", monocle: "Monocle" },
  PREF: "zenith.shell.layout",
  SPACES: "zenith.internal.layout.spaces", // { space: layout }
  WIDTHS: [100 / 3, 50, 200 / 3, 100],
  STRIP: "zenith.shell.scroller-tabs", // all · split
  FOCUS: "zenith.shell.scroller-focus", // view · centre
  widths: new WeakMap(), // a scroller column's tab → its width (% of the view)
  unrestored: new WeakSet(), // a strip's columns whose pages wait to come into view

  init() {
    window.ZenithLayouts = this; // the bar's module, the settings page, tools/checks
    const P = Services.prefs, W = window.gZenWorkspaces;
    // A strip's column pinned, made an essential or put in a folder leaves
    // the strip first: Zen moves a split's tabs together, so the whole strip
    // would follow it (pinned, with an essential in it).
    const leave = tabs => {
      for (const t of [].concat(tabs ?? [])) if (Tiler.data(t)?.zenithStrip) Tiler.S.removeTabFromGroup(t, undefined, { changeTab: false });
    };
    for (const [owner, name] of [[gBrowser, "pinTab"], [window.gZenPinnedTabManager, "addToEssentials"], [window.gZenFolders, "createFolder"]]) {
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
      this.soon();
      this.tell();
    };
    W?.addChangeListeners?.(spaceChanged);
    const select = () => {
      const how = this.of(), tab = gBrowser.selectedTab;
      this.unrestored.delete(tab); // (SessionStore restores the tab you're on)
      if (how === "monocle") this.solo();
      else if (how === "scroller" && !this.arranging && Tiler.data(tab)) this.arrange(tab);
      if (how === "scroller" && !this.gathering && this.members().includes(tab) && !this.whole()) this.soon();
    };
    // A strip takes in every new tab of its space.
    const opened = () => this.soon();
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
    // After the session is back: a strip space's tabs on their strip.
    (window.SessionStore?.promiseAllWindowsRestored ?? Promise.resolve()).then(() => setTimeout(() => this.soon(), 500));
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
    // A tile closed: the master layout laid out again; a column off its strip.
    // (A strip's column you're on closed: the one to its right is next, as
    // niri's, else the one to its left.)
    const closed = e => {
      const tab = e.target, data = tab === gBrowser.selectedTab && this.of() === "scroller" ? Tiler.data(tab) : null;
      const order = data ? this.order(data) : [], i = order.indexOf(tab), next = order[i + 1] ?? order[i - 1];
      // (Selected now: Zen's own would pick the split's first tab.)
      if (next) gBrowser.selectedTab = next;
      setTimeout(() => this.closed(tab, next), 0);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", select);
    // (Before Zen's own, which takes the tab out of its split.)
    window.addEventListener("TabClose", closed, true);
    // Firefox picks the tab to show after closing one (sometimes before the
    // close event): in the scroller, the column's neighbour.
    const blurTo = gBrowser._findTabToBlurTo;
    if (blurTo) {
      gBrowser._findTabToBlurTo = function (tab, exclude) {
        try {
          const data = Layouts.of() === "scroller" ? Tiler.data(tab) : null;
          if (data) {
            const order = Layouts.order(data), i = order.indexOf(tab);
            const next = [order[i + 1], order[i - 1]].find(t => t && !t.closing && !exclude?.includes?.(t));
            if (next) return next;
          }
        } catch {}
        return blurTo.apply(this, arguments);
      };
      onUnload(() => (gBrowser._findTabToBlurTo = blurTo));
    }
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
    if (how === "master" && data) this.master(data);
    else if (how === "scroller" && this.strip()) this.gather(true);
    else if (how === "scroller" && data) {
      this.row(data);
      this.arrange(gBrowser.selectedTab);
    }
    else if (how === "monocle") this.solo();
  },

  leave(was) {
    if (was === "monocle") SplitSolo.off();
    if (was === "scroller") {
      const data = Tiler.data() ?? Tiler.data(this.members().find(t => Tiler.data(t)));
      gBrowser.tabpanels.removeAttribute("zenith-scroller");
      gBrowser.tabpanels.style.removeProperty("--zth-strip-x");
      // A strip made of the whole space goes back to tabs; a split stays.
      // (Zen keeps no mark of a strip across restarts: the setting says.)
      if (data && (data.zenithStrip || Services.prefs.getStringPref(this.STRIP, "") !== "split")) return this.dissolve(data);
      if (data) {
        data.zenithOffset = 0;
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
      const order = data ? this.order(data).filter(t => tabs.includes(t)) : [];
      for (const t of tabs) {
        if (order.includes(t)) continue;
        const before = tabs.slice(0, tabs.indexOf(t)).reverse().find(b => order.includes(b));
        order.splice(before ? order.indexOf(before) + 1 : 0, 0, t);
      }
      if (data) S.splitTabs([data.tabs[0], ...order.filter(t => !data.tabs.includes(t))], undefined, -1, { activate: false });
      else S.splitTabs(order, "vsep", here ? order.indexOf(sel) : -1, { activate: here });
      data = Tiler.data(order[0]);
      if (!data) return;
      data.zenithStrip = true;
      // The sidebar in the strip's order.
      for (let i = 1; i < order.length; i++) {
        if (order[i].previousElementSibling !== order[i - 1]) gBrowser.moveTabAfter(order[i], order[i - 1]);
      }
      this.row(data, order);
      if (here) this.arrange(sel);
    } finally {
      this.gathering = false;
    }
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

  /* The scroller: every column stays in the split (one group in the
     sidebar); a column's width is its own, the strip is as wide as they
     are, and it slides to show the column you're on, as niri's. */
  width(tab) {
    return this.widths.get(tab) ?? { third: 100 / 3, half: 50, twothirds: 200 / 3, full: 100 }[Services.prefs.getStringPref("zenith.shell.scroller-width", "")] ?? 50;
  },

  // The split as one row of its columns, in order.
  row(data, order = this.order(data)) {
    this.build(data, ["row", order, order.map(() => 100 / order.length)]);
  },

  scroller(data) {
    const tab = data?.tabs?.[0];
    return !!tab && this.of(tab.getAttribute("zen-workspace-id") ?? this.space()) === "scroller";
  },

  // The strip slid as little as shows `focus` whole (or as much of it as fits).
  arrange(focus) {
    const data = Tiler.data(focus);
    if (!data) return;
    const order = this.order(data), widths = order.map(t => this.width(t)), i = order.indexOf(focus);
    const x = widths.slice(0, i).reduce((a, b) => a + b, 0), w = widths[i], total = widths.reduce((a, b) => a + b, 0);
    let off = data.zenithOffset ?? 0;
    if (Services.prefs.getStringPref(this.FOCUS, "") === "centre") off = x + w / 2 - 50;
    else if (x < off) off = x;
    else if (x + w > off + 100) off = x + w - 100;
    data.zenithOffset = Math.max(0, Math.min(off, Math.max(0, total - 100)));
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
    const shown = data.tabs.includes(gBrowser.selectedTab);
    if (!this.scroller(data)) {
      if (shown) gBrowser.tabpanels.removeAttribute("zenith-scroller");
      return;
    }
    if (shown) gBrowser.tabpanels.setAttribute("zenith-scroller", "true");
    // Columns sit where they are on the strip; the strip slides as one
    // transform (drawn on the GPU, no layout while it moves).
    const shift = data.zenithOffset ?? 0;
    if (shown) gBrowser.tabpanels.style.setProperty("--zth-strip-x", `${(-shift * gBrowser.tabpanels.clientWidth / 100).toFixed(1)}px`);
    let x = 0;
    const off = [];
    for (const tab of this.order(data)) {
      const w = this.width(tab), box = tab.linkedBrowser?.closest(".browserSidebarContainer");
      if (box) {
        box.style.inset = `0% ${(100 - x - w).toFixed(3)}% 0% ${x.toFixed(3)}%`;
        const away = x - shift >= 99.9 || x - shift + w <= 0.1;
        box.toggleAttribute("zenith-off-strip", away);
        off.push([tab, away]);
      }
      x += w;
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
              else this.wake();
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
  wake() {
    clearTimeout(this.waking);
    this.waking = setTimeout(() => {
      const data = Tiler.data(gBrowser.selectedTab);
      for (const tab of data && this.scroller(data) ? data.tabs : []) {
        const box = tab.linkedBrowser?.closest(".browserSidebarContainer");
        if (!this.unrestored.has(tab) || !box || box.hasAttribute("zenith-off-strip")) continue;
        this.unrestored.delete(tab);
        gBrowser.tabContainer.dispatchEvent(new CustomEvent("TabSplitViewActivate", { detail: { tabs: [tab], zenith: true } }));
      }
    }, 400);
  },

  /* Tiler's hooks: a new tile, focus, moving, the layout's own action */
  insert(tab, anchor) {
    const how = this.of(), S = Tiler.S;
    if (how === "scroller") {
      let data = Tiler.data(anchor);
      if (data && data.tabs.length >= S.MAX_TABS) return Tiler.full(), true;
      if (Tiler.data(tab)) S.removeTabFromGroup(tab);
      this.gathering = true; // (the strip takes it in here, beside the anchor)
      setTimeout(() => (this.gathering = false), 0);
      const order = data ? this.order(data) : [anchor];
      if (!data) S.splitTabs([anchor, tab], "vsep", 1);
      else S.splitTabs([anchor, tab], undefined, -1, { activate: false });
      data = Tiler.data(anchor);
      if (!data) return false;
      order.splice(order.indexOf(anchor) + 1, 0, tab);
      if (this.strip()) {
        data.zenithStrip = true;
        if (tab.previousElementSibling !== anchor) gBrowser.moveTabAfter(tab, anchor);
      }
      this.row(data, order.filter(t => data.tabs.includes(t)));
      this.arrange(tab);
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

  focus(dir) {
    const how = this.of(), tab = gBrowser.selectedTab;
    if (how === "scroller" && (dir === "left" || dir === "right")) {
      const data = Tiler.data(tab);
      if (!data) return false;
      const order = this.order(data), j = order.indexOf(tab) + (dir === "left" ? -1 : 1);
      if (j >= 0 && j < order.length) this.arrange(order[j]);
      return true;
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

  move(dir) {
    if (this.of() !== "scroller" || (dir !== "left" && dir !== "right")) return false;
    const tab = gBrowser.selectedTab, data = Tiler.data(tab);
    if (!data) return false;
    const order = this.order(data), i = order.indexOf(tab), j = i + (dir === "left" ? -1 : 1);
    if (j < 0 || j >= order.length) return true;
    [order[i], order[j]] = [order[j], order[i]];
    if (this.strip()) dir === "left" ? gBrowser.moveTabBefore(tab, order[i]) : gBrowser.moveTabAfter(tab, order[i]);
    this.row(data, order);
    this.arrange(tab);
    return true;
  },

  // Alt+Shift+Y: master, the tile you're on is the master; scroller, the
  // column's next width.
  action() {
    const how = this.of(), tab = gBrowser.selectedTab;
    if (how === "master") {
      const data = Tiler.data(tab);
      if (!data) return hint("Master: a split's tile becomes the master");
      data.zenithMaster = tab;
      return this.master(data);
    }
    if (how === "scroller") {
      if (!Tiler.data(tab)) return hint("Scroller: a split's column gets its next width");
      const k = this.WIDTHS.findIndex(w => Math.abs(w - this.width(tab)) < 1), w = this.WIDTHS[(k + 1) % this.WIDTHS.length];
      this.widths.set(tab, w);
      hint(`Column: ${{ 33: "a third", 50: "half", 67: "two thirds", 100: "all" }[Math.round(w)]} of the view`);
      return this.arrange(tab);
    }
    hint(`${this.NAMES[how]}: Alt+Shift+Y does nothing here (in master, the master; in scroller, a column's width)`);
  },

  closed(tab, next) {
    const how = this.of();
    if (how === "master") {
      const data = Tiler.data(gBrowser.selectedTab);
      if (data) this.master(data);
    } else if (how === "scroller") {
      if (next?.isConnected && Tiler.data(next)) this.arrange(next);
      else if (Tiler.data(gBrowser.selectedTab)) this.arrange(gBrowser.selectedTab);
    }
  },
};

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
          if (p.target.side === "swap") {
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
    if (cancel && p?.going && p.button === 2) {
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
  unload(tabs) {
    if (typeof gBrowser.explicitUnloadTabs === "function") gBrowser.explicitUnloadTabs(tabs);
    else for (const t of tabs) gBrowser.discardBrowser(t, true);
  },

  sleep() {
    const tab = gBrowser.selectedTab;
    if (Tiler.data(tab)) return hint("A tile on screen can't sleep");
    const to = gBrowser._findTabToBlurTo?.(tab);
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
    // Zenith's other keys, as Zen's Keyboard shortcuts have them.
    const zen = window.gZenKeyboardShortcutsManager?._currentShortcutList ?? [];
    for (const [id, , , , label] of ZenithKeys.LIST) {
      const s = zen.find(x => x.getID?.() === id);
      if (s && !s.isEmpty?.()) add("Zenith", s.toDisplayString?.() ?? "", label);
    }
    add("Zenith", "Alt+F", "The tile you're on fills the split, and back");
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

