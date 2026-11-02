/* --- Zenith Shell: i3's keys and tiling, with Alt -------------------------------
   The browser as a tiling window manager (DESIGN.md, "Zenith Shell"): a
   space is a workspace, a tab a window, Zen's split view the tiling tree.
   The keys are sway's (i3 with hjkl), Alt standing in for the Windows key,
   and matched by where the key is (event.code): Alt+1 works on AZERTY,
   Alt+; is the key right of L on any layout. One listener, in the capture
   phase, sees a key before the page does (tools/checks/r77); a key the
   Shell doesn't have costs a Map lookup. Alt+P (passthrough), or a site on
   the passthrough list, gives the page its Alt keys back. Keys are changed
   on Zenith's page (Tiling and keys › Keys), kept as one setting of the changes.
   The mouse: Alt+Shift+click a link opens it as a tile (the page's half is
   in plus/pages/peek-link.sys.mjs); Alt+drag a tile onto another swaps
   them, onto one's edge moves it there; Alt+right-drag resizes; Alt+wheel
   walks the spaces (Firefox's own Alt+wheel step back is set to nothing
   through the Bridge while that's on: r79). */
const SHELL = {
  ON: "zenith.shell.keys",
  BINDINGS: "zenith.shell.bindings",
  SITES: "zenith.shell.passthrough-sites",
  MOUSE: "zenith.shell.mouse",
  WHEEL: "zenith.shell.wheel",
  FOLLOW: "zenith.shell.follow-mouse",
  NEW_TILE: "zenith.shell.new-tile",
  TILES: "zenith.shell.tiles",
};

const ShellKeys = {
  // name · default · what it does · group · works with the Shell's keys off
  LIST: [
    ["focus-left", "Alt+KeyH", "Focus the tile to the left (past the edge: the tab before)", "Tiles"],
    ["focus-down", "Alt+KeyJ", "Focus the tile below (past the edge: the next tab)", "Tiles"],
    ["focus-up", "Alt+KeyK", "Focus the tile above (past the edge: the tab before)", "Tiles"],
    ["focus-right", "Alt+KeyL", "Focus the tile to the right (past the edge: the next tab)", "Tiles"],
    ["move-left", "Alt+Shift+KeyH", "Move the tile left (past the edge: out of the split)", "Tiles"],
    ["move-down", "Alt+Shift+KeyJ", "Move the tile down (past the edge: out of the split)", "Tiles"],
    ["move-up", "Alt+Shift+KeyK", "Move the tile up (past the edge: out of the split)", "Tiles"],
    ["move-right", "Alt+Shift+KeyL", "Move the tile right (past the edge: out of the split)", "Tiles"],
    ["new-tile", "Alt+Shift+Enter", "A new tile beside this one", "Tiles"],
    ["split-right", "Alt+KeyB", "The next tile goes to the right", "Tiles"],
    ["split-below", "Alt+KeyV", "The next tile goes below", "Tiles"],
    ["flip", "Alt+KeyE", "Flip the split's direction", "Tiles"],
    ["resize", "Alt+KeyR", "Resize mode (hjkl or arrows, = to even out, Esc)", "Tiles"],
    ["layout", "Alt+KeyY", "The space's next layout (dwindle, master, scroller, monocle)", "Tiles"],
    ["layout-action", "Alt+Shift+KeyY", "Master: the tile becomes the master · Scroller: the column's next width", "Tiles"],
    ["scroll-left", "Ctrl+Alt+KeyH", "Scroll the page left", "Pages"],
    ["scroll-down", "Ctrl+Alt+KeyJ", "Scroll the page down", "Pages"],
    ["scroll-up", "Ctrl+Alt+KeyK", "Scroll the page up", "Pages"],
    ["scroll-right", "Ctrl+Alt+KeyL", "Scroll the page right", "Pages"],
    ["new-tab", "Alt+Enter", "New tab", "Tabs"],
    ["close", "Alt+Shift+KeyQ", "Close the tab", "Tabs"],
    ["sleep", "Alt+KeyU", "Put the tab to sleep", "Tabs"],
    ["sleep-others", "Alt+Shift+KeyU", "Put the space's other tabs to sleep", "Tabs"],
    ["scratchpad", "Alt+Minus", "Show or hide the scratchpad", "Tabs"],
    ["to-scratchpad", "Alt+Shift+Minus", "Send the tab to the scratchpad", "Tabs"],
    ...Array.from({ length: 10 }, (_, i) => [`space-${i + 1}`, `Alt+Digit${(i + 1) % 10}`, `Go to space ${i + 1}`, "Spaces"]),
    ...Array.from({ length: 10 }, (_, i) => [`send-${i + 1}`, `Alt+Shift+Digit${(i + 1) % 10}`, `Send the tab to space ${i + 1}`, "Spaces"]),
    ["last-space", "Alt+Backquote", "The space you were on before", "Spaces"],
    ["hints", "Alt+Semicolon", "Link hints", "Zenith", true],
    ["hints-tab", "Alt+Shift+Semicolon", "Link hints, in a new tab", "Zenith", true],
    ["launcher", "Alt+KeyD", "The launcher: open a page, search, bookmarks (Ctrl+Tab: its other modes)", "Zenith"],
    ["dash", "Alt+KeyN", "The Dash: calendar, weather, media, timers, toggles", "Zenith"],
    ["overview", "Alt+KeyO", "The overview: every tab as a picture", "Zenith"],
    ["rice", "Alt+Shift+KeyP", "Looks: the rice picker (themes, colours, glass, bars, font)", "Zenith"],
    ["reload-rice", "Alt+Shift+KeyC", "Read zenith.conf again", "Zenith"],
    ["passthrough", "Alt+KeyP", "Passthrough: every key to the page, until Alt+P", "Zenith"],
    ["keys", "Alt+Shift+Slash", "These keys", "Zenith"],
    ["restart", "Alt+Shift+KeyR", "Restart Zen (your tabs come back)", "Zenith"],
    ["quit", "Alt+Shift+KeyE", "Quit Zen", "Zenith"],
  ],
  // (Held down, these repeat; the rest happen once a press.)
  REPEAT: new Set(["focus-left", "focus-down", "focus-up", "focus-right", "scroll-left", "scroll-down", "scroll-up", "scroll-right"]),

  init() {
    this.byName = new Map(this.LIST.map(e => [e[0], e]));
    this.read();
    const read = () => this.read();
    const prefs = [SHELL.ON, SHELL.BINDINGS, SHELL.SITES];
    for (const p of prefs) Services.prefs.addObserver(p, read);
    const key = e => this.key(e);
    window.addEventListener("keydown", key, true);
    onUnload(() => {
      for (const p of prefs) Services.prefs.removeObserver(p, read);
      window.removeEventListener("keydown", key, true);
    });
    window.ZenithShell = { keys: this, tiler: Tiler, spaces: ShellSpaces, scratchpad: Scratchpad, modes: ShellModes, mouse: ShellMouse, sheet: KeySheet, nag: Nagbar, tabs: ShellTabs }; // the settings page, the page actor, the Dash, tools/checks
  },

  read() {
    this.on = Services.prefs.getBoolPref(SHELL.ON, true);
    // "name=Alt+KeyX, name=" (cleared): only what differs from the defaults.
    const changed = new Map(Services.prefs.getStringPref(SHELL.BINDINGS, "").split(",").map(x => x.trim()).filter(x => x.includes("="))
      .map(x => [x.slice(0, x.indexOf("=")).trim(), x.slice(x.indexOf("=") + 1).trim()]));
    this.combos = new Map();
    this.map = new Map();
    for (const [name, combo] of this.LIST) {
      const c = changed.has(name) ? changed.get(name) : combo;
      this.combos.set(name, c);
      if (c) this.map.set(c, name);
    }
    this.sites = Services.prefs.getStringPref(SHELL.SITES, "").split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  },

  combo(e) {
    return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta", e.code].filter(Boolean).join("+");
  },

  // "Alt+Shift+KeyH" → "Alt+Shift+H".
  pretty(combo) {
    if (!combo) return "";
    const NAMES = { Semicolon: ";", Backquote: "`", Minus: "-", Equal: "=", Slash: "/", Backslash: "\\", BracketLeft: "[",
                    BracketRight: "]", Quote: "'", Comma: ",", Period: ".", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
    return combo.split("+").map(p => NAMES[p] ?? p.replace(/^Key|^Digit|^Numpad/, "")).join("+");
  },

  // The page you're on keeps its Alt keys (Tiling and keys › Sites that keep their Alt keys).
  siteKeeps() {
    if (!this.sites.length) return false;
    let host = "";
    try {
      host = gBrowser.currentURI?.host?.toLowerCase() ?? "";
    } catch {}
    return !!host && this.sites.some(s => host === s || host.endsWith("." + s));
  },

  free() {
    return !ShellModes.passthrough && !this.siteKeeps();
  },

  key(e) {
    if (e.isComposing || this.recording) return; // (Zenith's page is taking a new key)
    if (ShellModes.mode) return ShellModes.key(e);
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
    const name = this.map.get(this.combo(e));
    if (!name) return;
    if (name === "passthrough" ? !this.on : !this.free() || !(this.on || this.byName.get(name)[4])) return;
    // Alt+Enter in the address bar is Firefox's own: open in a new tab.
    if (name === "new-tab" && e.target?.closest?.("#urlbar")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat && !this.REPEAT.has(name)) return;
    try {
      this.run(name);
    } catch (err) {
      console.error(`[Zenith] Shell: ${name}`, err);
    }
  },

  run(name) {
    const space = name.match(/^(space|send)-(\d+)$/);
    if (space) return space[1] === "space" ? ShellSpaces.go(+space[2]) : ShellSpaces.send(+space[2]);
    const dir = name.match(/^(focus|move)-(left|down|up|right)$/);
    if (dir) return Tiler[dir[1]](dir[2]);
    const scroll = name.match(/^scroll-(left|down|up|right)$/);
    if (scroll) return PageScroll.by(scroll[1]);
    switch (name) {
      case "new-tab": return BrowserCommands.openTab();
      case "new-tile": return Tiler.newTile();
      case "close": return gBrowser.removeTab(gBrowser.selectedTab, { animate: true });
      case "split-right": return Tiler.next("right");
      case "split-below": return Tiler.next("bottom");
      case "flip": return Tiler.flip();
      case "resize": return ShellModes.resize();
      case "passthrough": return ShellModes.togglePassthrough();
      case "last-space": return ShellSpaces.last();
      case "scratchpad": return Scratchpad.toggle();
      case "to-scratchpad": return Scratchpad.send();
      case "sleep": return ShellTabs.sleep();
      case "sleep-others": return ShellTabs.sleepOthers();
      case "hints": return LinkHints.show(false).catch(e => console.error("[Zenith] link hints", e));
      case "hints-tab": return LinkHints.show(true).catch(e => console.error("[Zenith] link hints", e));
      case "keys": return KeySheet.toggle();
      case "launcher": return window.ZenithSwitcher?.show?.("", "open");
      case "dash": return DashLoader.toggle();
      case "layout": return Layouts.cycle();
      case "layout-action": return Layouts.action();
      case "overview": return window.ZenithOverview?.toggle();
      case "rice": return RicePicker.toggle();
      case "reload-rice": return window.ZenithRice?.reload(true);
      case "restart": return Nagbar.ask("restart");
      case "quit": return Nagbar.ask("quit");
    }
  },
};

/* Binding modes, as i3's: resize (a key at a time changes a tile's size,
   until Esc) and passthrough (no Shell keys at all). A pill at the top of
   the page says which one is on, as i3bar does. */
const ShellModes = {
  mode: null,
  passthrough: false,

  pill() {
    const text = this.mode === "resize" ? "resize · hjkl or arrows, = to even out, Esc to end"
               : this.passthrough ? `passthrough · ${ShellKeys.pretty(ShellKeys.combos.get("passthrough")) || "Alt+P"} to end` : "";
    // (With the bar on, the mode shows in it, as i3bar's does.)
    if (BarLoader.bar?.mode(text)) return void this.node?.removeAttribute("show");
    this.node ??= (document.getElementById("zen-main-app-wrapper") ?? document.body).appendChild(el("div", { id: "zenith-mode" }));
    this.node.textContent = text;
    this.node.toggleAttribute("show", !!text);
  },

  togglePassthrough() {
    this.passthrough = !this.passthrough;
    this.pill();
  },

  resize() {
    if (this.mode === "resize") return this.end();
    if (!Tiler.data()) return hint("Resize mode is for a split (Alt+Shift+Enter makes one)");
    this.mode = "resize";
    this.left = () => !Tiler.data() && this.end();
    gBrowser.tabContainer.addEventListener("TabSelect", this.left);
    this.pill();
  },

  end() {
    if (this.left) gBrowser.tabContainer.removeEventListener("TabSelect", this.left);
    this.mode = this.left = null;
    this.pill();
  },

  // In a mode every key is the mode's (i3 swallows the rest).
  key(e) {
    if (["Alt", "Shift", "Control", "Meta"].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape" || e.key === "Enter" || ShellKeys.map.get(ShellKeys.combo(e)) === "resize") return this.end();
    const dir = { KeyH: "left", ArrowLeft: "left", KeyL: "right", ArrowRight: "right", KeyK: "up", ArrowUp: "up", KeyJ: "down", ArrowDown: "down" }[e.code];
    if (dir) Tiler.resize(dir);
    else if (e.code === "Equal" || e.code === "Digit0") Tiler.even();
  },
};

/* The tiles: Zen's split view is already a tree (a node has a direction,
   row or column, and children with their share of it), so the Shell works
   on that tree and has Zen draw it. Zen keeps the tree with the session. */
const Tiler = {
  get S() {
    return window.gZenViewSplitter;
  },

  init() {
    // Tiles in one split (Tiling and keys › Tiles in one split): Zen's own is 4; 0 is
    // no limit (experimental: Zen's grid takes any number).
    // A strip (the scroller with every tab of the space) has none: Zen's
    // own checks read MAX_TABS, so it answers for the space you're on.
    let max = 4;
    const cap = () => {
      const n = parseInt(Services.prefs.getStringPref(SHELL.TILES, ""), 10);
      max = n === 0 ? Infinity : n >= 2 && n <= 12 ? n : 4;
    };
    // An essential in a split: Zen copies it (its split can't hold one).
    // Unless Tiling and keys › Tiles › Splitting an essential says Zen's
    // way, nothing is split and a notice says why (any way in: Zen's menu,
    // a drag, a key, a link opened beside it).
    const split = this.S?.splitTabs;
    if (split) {
      this.S.splitTabs = function (tabs, ...rest) {
        if (Array.isArray(tabs) && tabs.some(t => t?.hasAttribute?.("zen-essential")) &&
            (Services.prefs.getStringPref("zenith.shell.split-essential", "") || "warn") === "warn") {
          hint("Zen can't split an essential without copying it, so it stays as it is (Settings › Tiling and keys › Splitting an essential)");
          return undefined;
        }
        return split.call(this, tabs, ...rest);
      };
      onUnload(() => (this.S.splitTabs = split));
    }
    if (this.S) {
      Object.defineProperty(this.S, "MAX_TABS", { configurable: true, get: () => (Layouts.strip() ? Infinity : max), set: v => (max = v) });
      onUnload(() => {
        delete this.S.MAX_TABS;
        this.S.MAX_TABS = 4;
      });
    }
    Services.prefs.addObserver(SHELL.TILES, cap);
    onUnload(() => Services.prefs.removeObserver(SHELL.TILES, cap));
    cap();
  },

  data(tab = gBrowser.selectedTab) {
    return NewTabBelow.splitOf(tab);
  },

  // The tree's leaf for a tab (Zen's own map only has drawn ones).
  leaf(data, tab) {
    const walk = n => (n.tab ? (n.tab === tab ? n : null) : n.children.reduce((f, c) => f ?? walk(c), null));
    return data?.layoutTree ? walk(data.layoutTree) : null;
  },

  box(tab) {
    return tab?.linkedBrowser?.closest(".browserSidebarContainer")?.getBoundingClientRect() ?? null;
  },

  // The tile beside a tab's, that way: the nearest, then the one sharing
  // most of that edge.
  neighbour(tab, dir) {
    const data = this.data(tab), a = data && this.box(tab);
    if (!a) return null;
    let best = null, score = Infinity;
    for (const t of data.tabs) {
      const b = t !== tab && this.box(t);
      if (!b) continue;
      const gap = { left: a.left - b.right, right: b.left - a.right, up: a.top - b.bottom, down: b.top - a.bottom }[dir];
      const shared = dir === "left" || dir === "right" ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
                                                       : Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (gap < -8 || shared <= 8) continue;
      const s = Math.max(gap, 0) * 10 - shared;
      if (s < score) [score, best] = [s, t];
    }
    return best;
  },

  focus(dir) {
    if (Layouts.focus(dir)) return;
    const tab = gBrowser.selectedTab, to = this.neighbour(tab, dir);
    if (to) return void (gBrowser.selectedTab = to);
    this.step(dir === "left" || dir === "up" ? -1 : 1);
  },

  // Past the last tile: the tab before or after (the split's other tiles
  // skipped), as niri walks its columns.
  step(by) {
    const tab = gBrowser.selectedTab, own = this.data(tab)?.tabs ?? [tab];
    const tabs = gBrowser.visibleTabs.filter(t => !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"));
    const at = own.map(t => tabs.indexOf(t)).filter(i => i >= 0);
    if (!at.length) return;
    for (let i = (by < 0 ? Math.min(...at) : Math.max(...at)) + by; i >= 0 && i < tabs.length; i += by) {
      if (!own.includes(tabs[i])) return void (gBrowser.selectedTab = tabs[i]);
    }
  },

  move(dir) {
    if (Layouts.move(dir)) return;
    const tab = gBrowser.selectedTab, to = this.neighbour(tab, dir);
    if (to) {
      SplitReorder.swap(tab, to);
      gBrowser.selectedTab = tab;
      return;
    }
    // Past the split's edge: out of it, as i3 moves a window out of its container.
    if (this.data(tab)) {
      this.S.removeTabFromGroup(tab);
      gBrowser.selectedTab = tab;
      return;
    }
    if (dir === "left" || dir === "up") gBrowser.moveTabBackward();
    else gBrowser.moveTabForward();
  },

  // Where a new tile goes: as Alt+B or Alt+V said, or by Shell › New
  // tiles (along the tile's longer side, Hyprland's dwindle, by default).
  sideFor(anchor) {
    const next = this.nextSide;
    this.nextSide = null;
    if (next) return next;
    const how = Services.prefs.getStringPref(SHELL.NEW_TILE, "") || "dwindle";
    if (how === "right") return "right";
    if (how === "below") return "bottom";
    const b = (this.data(anchor) && this.box(anchor)) || gBrowser.tabpanels.getBoundingClientRect();
    return b.width >= b.height ? "right" : "bottom";
  },

  next(side) {
    this.nextSide = side;
    hint(side === "right" ? "The next tile goes to the right" : "The next tile goes below");
  },

  full() {
    hint(`This split is full (${this.S?.MAX_TABS ?? 4} tiles: Tiling and keys › Tiles in one split)`);
  },

  // Alt+Shift+Enter: the address bar, and the tab it opens is a tile.
  newTile() {
    const anchor = gBrowser.selectedTab, data = this.data(anchor);
    if (data && data.tabs.length >= this.S.MAX_TABS) return this.full();
    const side = this.sideFor(anchor);
    NewTabBelow.watch(made => this.insert(made, anchor, side));
    BrowserCommands.openTab();
  },

  // A tab becomes a tile beside `anchor`'s, on `side`.
  insert(tab, anchor, side = this.sideFor(anchor)) {
    const S = this.S;
    try {
      if (!S || !tab?.isConnected || !anchor?.isConnected || tab === anchor) return;
      if (Layouts.insert(tab, anchor)) return;
      if (this.data(tab)) S.removeTabFromGroup(tab);
      let data = this.data(anchor);
      if (data && data.tabs.length >= S.MAX_TABS) return this.full();
      if (!data) {
        const tabs = side === "left" || side === "top" ? [tab, anchor] : [anchor, tab];
        S.splitTabs(tabs, side === "left" || side === "right" ? "vsep" : "hsep", tabs.indexOf(tab));
        return;
      }
      // Zen adds it at the end of the split; the Shell moves it beside the anchor.
      S.splitTabs([anchor, tab], undefined, -1, { activate: false });
      data = this.data(anchor);
      const leaf = this.leaf(data, tab);
      if (leaf && this.leaf(data, anchor)) {
        S.removeNode(leaf);
        S.splitIntoNode(this.leaf(data, anchor), leaf, side, 0.5);
      }
      gBrowser.selectedTab = tab;
      S.activateSplitView(data, true);
      this.save();
    } catch (e) {
      console.error("[Zenith] Shell: a new tile", e);
    }
  },

  // Alt+Shift+click on a link (its page sends it here): a new tile beside
  // the one it was clicked in.
  link(url, principal, browser) {
    const anchor = (browser && gBrowser.getTabForBrowser(browser)) || gBrowser.selectedTab, data = this.data(anchor);
    if (data && data.tabs.length >= this.S.MAX_TABS) return this.full();
    const tab = gBrowser.addTab(url, {
      triggeringPrincipal: principal ?? Services.scriptSecurityManager.createNullPrincipal({ userContextId: anchor.userContextId }),
      userContextId: anchor.userContextId,
      inBackground: true,
    });
    this.insert(tab, anchor);
  },

  // A tile goes to `side` of another's (Alt+drag onto its edge).
  place(tab, target, side) {
    const S = this.S, data = this.data(tab);
    if (!data || data !== this.data(target) || tab === target) return;
    const leaf = this.leaf(data, tab);
    S.removeNode(leaf);
    S.splitIntoNode(this.leaf(data, target), leaf, side, 0.5);
    this.tidy(data.layoutTree);
    gBrowser.selectedTab = tab;
    S.activateSplitView(data, true);
    this.save();
  },

  flip() {
    const data = this.data(), parent = this.leaf(data, gBrowser.selectedTab)?.parent;
    if (!parent) return hint("Alt+E flips a split's direction");
    parent.direction = parent.direction === "row" ? "column" : "row";
    this.tidy(data.layoutTree);
    this.S.activateSplitView(data, true);
    this.save();
  },

  // Zen's tree never has a node inside one of the same direction: folded in.
  tidy(node) {
    if (!node?.children) return;
    for (let i = 0; i < node.children.length; i++) {
      const c = node.children[i];
      if (c.children && c.direction === node.direction) {
        for (const g of c.children) {
          g.sizeInParent *= c.sizeInParent / 100;
          g.parent = node;
        }
        node.children.splice(i, 1, ...c.children);
        this.S._removeNodeSplitters?.(c, false);
        i--;
        continue;
      }
      this.tidy(c);
    }
  },

  // The two nodes either side of the edge a tile's resize moves, along
  // `axis`: the edge after the tile (`after`) or before it, and how many
  // pixels the whole of their parent is.
  edge(leaf, axis, after) {
    let x = leaf;
    while (x?.parent && x.parent.direction !== axis) x = x.parent;
    const p = x?.parent;
    if (!p) return null;
    const i = p.children.indexOf(x);
    const j = after ? (i + 1 < p.children.length ? i + 1 : i - 1) : (i > 0 ? i - 1 : i + 1);
    const [a, b] = j > i ? [x, p.children[j]] : [p.children[j], x];
    const panels = gBrowser.tabpanels.getBoundingClientRect(), at = p.positionToRoot ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const px = axis === "row" ? (panels.width * (100 - at.left - at.right)) / 100 : (panels.height * (100 - at.top - at.bottom)) / 100;
    return { a, b, from: [a.sizeInParent, b.sizeInParent], px };
  },

  // Moves an edge by `d` (in % of its parent), no tile under 10%.
  shift(edge, d) {
    const [fa, fb] = edge.from;
    d = Math.max(10 - fa, Math.min(d, fb - 10));
    edge.a.sizeInParent = fa + d;
    edge.b.sizeInParent = fb - d;
  },

  // Resize mode: l and j grow the tile (to the right, downwards), h and k
  // shrink it, a twentieth at a time.
  resize(dir) {
    const data = this.data(), leaf = this.leaf(data, gBrowser.selectedTab);
    const edge = leaf && this.edge(leaf, dir === "left" || dir === "right" ? "row" : "column", true);
    if (!edge) return;
    const grow = dir === "right" || dir === "down" ? 5 : -5;
    this.shift(edge, edge.a.tab === gBrowser.selectedTab || this.holds(edge.a, gBrowser.selectedTab) ? grow : -grow);
    this.S.applyGridLayout(data.layoutTree);
    this.save();
  },

  holds(node, tab) {
    return node.tab ? node.tab === tab : node.children.some(c => this.holds(c, tab));
  },

  even(node = this.data()?.layoutTree, top = true) {
    if (!node?.children) return;
    for (const c of node.children) {
      c.sizeInParent = 100 / node.children.length;
      this.even(c, false);
    }
    if (top) {
      this.S.applyGridLayout(node);
      this.save();
    }
  },

  save() {
    try {
      this.S.saveState?.();
    } catch {}
  },
};

/* The mouse, as i3's floating_modifier and Hyprland's bindm: Alt+drag a
   tile, Alt+right-drag resizes it, Alt+wheel walks the spaces. The window
   sees an Alt+press over a page first (r79); the page, told by Zenith,
   starts no selection or drag from it, and still gets its click (so
   Alt+click is still Zen's Glance). */
