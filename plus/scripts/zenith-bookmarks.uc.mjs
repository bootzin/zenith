// ==UserScript==
// @name           Zenith Bookmarks
// @description    Zenith Plus: your bookmarks in Zenith's look (Ctrl+B), beside the page or in Zen's Library.
// @include        main
// @version        0.14.0
// ==/UserScript==
// SPDX-License-Identifier: GPL-3.0-or-later

// Ctrl+B opens Zenith's bookmarks instead of Firefox's sidebar (unless the
// look is "Firefox's tree", which keeps Firefox's, restyled):
//   where   Right, over the page (default) · Right, the page makes room ·
//           Left, beside the tabs
//   look    Like the tab list (default): rows with icons, folders that open
//           in place · Tiles: a grid, folders you step into · Firefox's tree
// Your bookmarks toolbar's contents come first, then Bookmarks Menu and
// Other Bookmarks as folders. "This space's bookmarks first" adds a section
// for the space you're in: its own folder (Other Bookmarks › Spaces ›
// <space>, made the first time you drop something there) and the bookmarks
// Zen's own edit dialog assigns to it; bookmarks assigned only to other
// spaces are left out, as in Zen's menus.
// Drop a tab (or a link) on it to bookmark it: on a folder to put it there,
// between rows to put it there, on the space's section to keep it with the
// space. Drag a bookmark onto a folder to move it. Click opens it (or goes
// to its tab if it's already open in this space); middle-click or Ctrl
// opens it behind; right-click edits, moves to this space or deletes.
// The same view is a section of Zen's Library ("Bookmarks in Zen's Library").
// Settings: Zenith › Panels › Bookmarks. Styles: plus/chrome.css (the panel)
// and STYLE below (inside the view).

const HTML_NS = "http://www.w3.org/1999/xhtml";

const FIRST = !window.zenithBookmarksStarted;
window.zenithBookmarksStarted = true;

// Fast start (zenith.plus.fast-start): parts not needed for the first
// picture wait until the page you're on has loaded (2.5 seconds at most),
// then start one at a time while the browser is idle, so the page comes
// first. Anything that needs one of them sooner calls zenithLater.now().
const Later = (window.zenithLater ??= (() => {
  const queue = [];
  let open = false;
  const fast = Services.prefs.getBoolPref("zenith.plus.fast-start", false);
  const step = () => {
    const job = queue.shift();
    if (job) job();
    if (queue.length) window.requestIdleCallback(step, { timeout: 300 });
  };
  const later = {
    fast,
    add(job) {
      if (!fast || open) return job();
      queue.push(job);
    },
    // Start what's waiting, a part per idle moment.
    open() {
      if (open) return;
      open = true;
      later.openedAt ??= performance.now();
      window.requestIdleCallback(step, { timeout: 300 });
    },
    // Start everything now (a feature was asked for before its turn).
    now() {
      open = true;
      later.openedAt ??= performance.now();
      while (queue.length) queue.shift()();
    },
  };
  if (fast) {
    setTimeout(() => later.open(), 2500);
    const waitForPage = async () => {
      await window.delayedStartupPromise;
      for (let i = 0; i < 25 && gBrowser.selectedBrowser?.webProgress?.isLoadingDocument; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      later.open();
    };
    waitForPage();
  }
  return later;
})());

function start(name, fn, now = false) {
  if (!FIRST) return;
  if (!now) return Later.add(() => start(name, fn, true));
  const t0 = performance.now();
  try {
    const r = fn();
    r?.catch?.(e => console.error(`[Zenith Bookmarks] ${name} failed to start`, e));
  } catch (e) {
    console.error(`[Zenith Bookmarks] ${name} failed to start`, e);
  }
  // How long each part took to start, for tools/bench_startup.py.
  (window.zenithStartup ??= []).push({ script: "bookmarks", name, at: Math.round(t0), ms: +(performance.now() - t0).toFixed(1) });
}

function make(tag, attrs = {}, text = "") {
  const node = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

const PREFS = {
  look: "zenith.plus.bookmarks-look", // "" list · tiles · firefox
  place: "zenith.plus.bookmarks-place", // "" float · far · near (across from or beside the sidebar)
  spaceFirst: "zenith.plus.bookmarks-space-first",
  library: "zenith.plus.bookmarks-library",
  width: "zenith.internal.bookmarks.width",
  open: "zenith.internal.bookmarks.open-folders",
  folders: "zenith.internal.bookmarks.space-folders",
};
const TAB_TYPE = "application/x-moz-tabbrowser-tab";
const OURS = "application/x-zenith-bookmark";
const SPACES_FOLDER = "Spaces";

const look = () => Services.prefs.getStringPref(PREFS.look, "") || "list";
const place = () => {
  const v = Services.prefs.getStringPref(PREFS.place, "");
  return { right: "far", left: "near" }[v] ?? (v || "float"); // (before 0.12.18)
};
// The page's side beside the sidebar (Zenith Plus's Dock; Zen's own mark
// until Plus has started), and the side the panel goes: floating and "far"
// across from the sidebar, "near" beside it.
const near = () => window.ZenithDock?.near ?? (document.documentElement.getAttribute("zen-right-side") === "true" ? "right" : "left");
const side = () => (place() === "near") === (near() === "left") ? "left" : "right";
const spaceFirst = () => Services.prefs.getBoolPref(PREFS.spaceFirst, true);

function readJSON(pref, fallback) {
  try {
    return JSON.parse(Services.prefs.getStringPref(pref, "")) ?? fallback;
  } catch {
    return fallback;
  }
}

/* --- Where bookmarks come from -------------------------------------------------- */

const Data = {
  get P() {
    return window.PlacesUtils;
  },

  space() {
    try {
      const W = window.gZenWorkspaces;
      return W?.workspaceEnabled ? W.getWorkspaceFromId(W.activeWorkspace) : null;
    } catch {
      return null;
    }
  },

  // Zen's own "this bookmark belongs to these spaces" (its edit dialog):
  // left out when it belongs only to other spaces.
  elsewhere(guid) {
    try {
      return !!window.gZenWorkspaces?.isBookmarkInAnotherWorkspace?.({ bookmarkGuid: guid });
    } catch {
      return false;
    }
  },

  assignedHere() {
    const W = window.gZenWorkspaces;
    return W?._workspaceBookmarksCache?.bookmarks?.[W.activeWorkspace] ?? [];
  },

  async tree(guid) {
    if (!guid) return null; // ("" would be the whole of Places)
    try {
      return await this.P.promiseBookmarksTree(guid, { includeItemIds: false });
    } catch {
      return null;
    }
  },

  // Everything the view shows, as plain items:
  // { guid, parent, index, kind: link|folder|sep, title, url, children }.
  async all() {
    const P = this.P;
    const plain = (node, parent) => {
      const kind = node.typeCode === P.bookmarks.TYPE_FOLDER ? "folder" : node.typeCode === P.bookmarks.TYPE_SEPARATOR ? "sep" : "link";
      const item = { guid: node.guid, parent, index: node.index, kind, title: node.title || "", url: node.uri ?? "" };
      if (kind === "folder") {
        item.children = (node.children ?? []).map(c => plain(c, node.guid))
          .filter(c => !(c.kind === "link" && this.elsewhere(c.guid)) && c.guid !== this.spacesFolderGuid());
      }
      return item;
    };
    const [toolbar, menu, other] = await Promise.all([P.bookmarks.toolbarGuid, P.bookmarks.menuGuid, P.bookmarks.unfiledGuid].map(g => this.tree(g)));
    const out = {
      toolbar: toolbar ? plain(toolbar, null) : null,
      folders: [menu, other].filter(Boolean).map(f => ({ ...plain(f, null), title: f.guid === P.bookmarks.menuGuid ? "Bookmarks Menu" : "Other Bookmarks" })),
      space: null,
    };
    const space = this.space();
    if (space && spaceFirst()) {
      const folder = await this.tree(readJSON(PREFS.folders, {})[space.uuid] ?? "");
      const own = folder ? plain(folder, folder.guid).children ?? [] : [];
      const seen = new Set(own.map(i => i.guid));
      const assigned = [];
      for (const guid of this.assignedHere()) {
        if (seen.has(guid)) continue;
        const b = await P.bookmarks.fetch(guid).catch(() => null);
        if (b?.url) assigned.push({ guid, parent: b.parentGuid, index: b.index, kind: "link", title: b.title || "", url: b.url.href });
      }
      out.space = { space, folder: folder?.guid ?? null, items: [...own, ...assigned] };
    }
    return out;
  },

  async search(query) {
    const found = await this.P.bookmarks.search({ query }).catch(() => []);
    return found.filter(b => b.url && !this.elsewhere(b.guid)).slice(0, 80)
      .map(b => ({ guid: b.guid, parent: b.parentGuid, index: b.index, kind: "link", title: b.title || "", url: b.url.href }));
  },

  spacesFolderGuid() {
    return Services.prefs.getStringPref(`${PREFS.folders}.root`, "") || null;
  },

  // This space's folder, made the first time something goes in it.
  async spaceFolder(space) {
    const P = this.P, map = readJSON(PREFS.folders, {});
    if (map[space.uuid] && (await P.bookmarks.fetch(map[space.uuid]).catch(() => null))) return map[space.uuid];
    let root = this.spacesFolderGuid();
    if (!root || !(await P.bookmarks.fetch(root).catch(() => null))) {
      root = (await P.bookmarks.insert({ parentGuid: P.bookmarks.unfiledGuid, type: P.bookmarks.TYPE_FOLDER, title: SPACES_FOLDER })).guid;
      Services.prefs.setStringPref(`${PREFS.folders}.root`, root);
    }
    const folder = await P.bookmarks.insert({ parentGuid: root, type: P.bookmarks.TYPE_FOLDER, title: space.name || "Space" });
    map[space.uuid] = folder.guid;
    Services.prefs.setStringPref(PREFS.folders, JSON.stringify(map));
    return folder.guid;
  },

  async add(parentGuid, url, title, index) {
    const T = window.PlacesTransactions;
    const where = index ?? this.P.bookmarks.DEFAULT_INDEX;
    return T.NewBookmark({ parentGuid, url: Services.io.newURI(url), title: title || url, index: where }).transact();
  },

  async move(guid, parentGuid, index) {
    const T = window.PlacesTransactions;
    return T.Move({ guid, newParentGuid: parentGuid, newIndex: index ?? this.P.bookmarks.DEFAULT_INDEX }).transact();
  },

  async remove(guid) {
    return window.PlacesTransactions.Remove({ guids: [guid] }).transact();
  },

  // A Places result node for Firefox's (and Zen's) edit dialog.
  node(guid, parent) {
    try {
      const root = this.P.getFolderContents(parent).root;
      for (let i = 0; i < root.childCount; i++) {
        const n = root.getChild(i);
        if (n.bookmarkGuid === guid) return n;
      }
    } catch {}
    return null;
  },
};

/* --- Opening ------------------------------------------------------------------- */

function openBookmark(url, event) {
  const behind = event?.button === 1 || event?.ctrlKey || event?.metaKey;
  if (event?.shiftKey) return openTrustedLinkIn(url, "window");
  if (!behind) {
    // Already open here: go to it, as the tab list would.
    const tab = gBrowser.visibleTabs.find(t => t.linkedBrowser?.currentURI?.spec === url);
    if (tab) {
      gBrowser.selectedTab = tab;
      return;
    }
  }
  openTrustedLinkIn(url, behind ? "tabshifted" : "tab");
}

/* --- The view -------------------------------------------------------------------- */

const STYLE = `
  :host { display: flex; flex-direction: column; min-height: 0; flex: 1; color: var(--zth-ink, CanvasText);
          font: menu; font-size: var(--zth-font, 13px); -moz-window-dragging: no-drag; }
  * { box-sizing: border-box; }
  .head { display: flex; align-items: center; gap: 6px; padding: 10px 10px 6px; }
  .search { flex: 1; min-width: 0; border: 1px solid var(--zth-hairline, color-mix(in srgb, currentColor 15%, transparent));
            background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; font: inherit;
            border-radius: var(--zth-pill-radius, 8px); padding: 6px 10px; outline: none; margin: 0; }
  .search:focus { border-color: var(--zth-accent, AccentColor); }
  .btn { appearance: none; border: none; background: transparent; color: var(--zth-ink-dim, GrayText); width: 26px; height: 26px;
         border-radius: 7px; display: grid; place-items: center; cursor: pointer; padding: 0; margin: 0; flex: none; }
  .btn:hover { background: color-mix(in srgb, currentColor 10%, transparent); color: inherit; }
  .btn > span { width: 14px; height: 14px; background: currentColor; mask: var(--icon) center / 14px no-repeat; }
  .crumbs { display: flex; align-items: center; gap: 4px; padding: 0 10px 6px; color: var(--zth-ink-dim, GrayText); font-size: 0.92em; }
  .crumbs[hidden] { display: none; }
  .crumbs .back { appearance: none; border: none; background: none; color: inherit; font: inherit; cursor: pointer; padding: 2px 6px;
                  border-radius: 6px; margin: 0; }
  .crumbs .back:hover { background: color-mix(in srgb, currentColor 10%, transparent); color: var(--zth-ink, CanvasText); }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 6px 10px; scrollbar-width: thin; }
  .label { padding: 10px 8px 4px; font-size: 0.78em; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
           color: var(--zth-ink-dim, GrayText); display: flex; align-items: center; gap: 6px; }
  .label .emoji { text-transform: none; letter-spacing: 0; font-size: 1.2em; }
  .row { display: flex; align-items: center; gap: 8px; height: var(--zth-row, 32px); padding: 0 8px; border-radius: var(--zth-radius, 8px);
         cursor: default; user-select: none; position: relative; }
  .row:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  .row:focus-visible { outline: 2px solid var(--zth-accent, AccentColor); outline-offset: -2px; }
  .row .icon { width: 16px; height: 16px; flex: none; display: grid; place-items: center; }
  .row .icon img { width: 16px; height: 16px; }
  .row .icon:empty::before, .tile .icon:empty::before { content: ""; width: 16px; height: 16px; background: currentColor; opacity: 0.75;
         mask: url("chrome://global/skin/icons/defaultFavicon.svg") center / 16px no-repeat; }
  .row[kind="folder"] .icon::before, .tile[kind="folder"] .icon::before { content: ""; width: 16px; height: 16px; background: currentColor; opacity: 0.85;
         mask: url("chrome://browser/skin/zen-icons/folder.svg") center / 16px no-repeat; }
  .row .chev { width: 10px; height: 10px; flex: none; background: currentColor; opacity: 0.5; margin-inline-start: -2px;
               mask: url("chrome://global/skin/icons/arrow-right.svg") center / 10px no-repeat; transition: rotate 0.12s; }
  .row[open] .chev { rotate: 90deg; }
  .row .text { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .row .count { color: var(--zth-ink-dim, GrayText); font-size: 0.85em; }
  .row .host { color: var(--zth-ink-dim, GrayText); font-size: 0.85em; max-width: 40%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .sep { height: 1px; margin: 5px 10px; background: var(--zth-hairline, color-mix(in srgb, currentColor 15%, transparent)); }
  .empty { padding: 10px; color: var(--zth-ink-dim, GrayText); font-size: 0.92em; }
  .drop-here { margin: 2px 4px; padding: 8px 10px; border: 1px dashed var(--zth-hairline, color-mix(in srgb, currentColor 20%, transparent));
               border-radius: var(--zth-radius, 8px); color: var(--zth-ink-dim, GrayText); font-size: 0.9em; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; padding: 2px 2px 6px; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px 8px; border-radius: calc(var(--zth-radius, 8px) + 2px);
          background: color-mix(in srgb, currentColor 5%, transparent); user-select: none; min-width: 0; }
  .tile:hover { background: color-mix(in srgb, currentColor 11%, transparent); }
  .tile .icon { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px;
                background: color-mix(in srgb, currentColor 7%, transparent); }
  .tile .icon img { width: 18px; height: 18px; }
  .tile .text { font-size: 0.86em; text-align: center; width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2;
                -webkit-box-orient: vertical; line-height: 1.25; word-break: break-word; }
  [drop="into"] { background: var(--zth-accent-soft, color-mix(in srgb, AccentColor 25%, transparent)) !important;
                  box-shadow: inset 0 0 0 1px var(--zth-accent, AccentColor); }
  [drop="before"]::after { content: ""; position: absolute; inset: -2px 6px auto 6px; height: 2px; border-radius: 2px; background: var(--zth-accent, AccentColor); }
  .body[drop="into"] { box-shadow: none; background: transparent !important; }
  .body[drop="into"] .drop-target { background: var(--zth-accent-soft, color-mix(in srgb, AccentColor 25%, transparent)); }
`;

// (Zen has no grid or list icon: two small drawings.)
const ICONS = {
  tiles: "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><g fill='black'>" +
    "<rect x='1.5' y='1.5' width='5.5' height='5.5' rx='1.5'/><rect x='9' y='1.5' width='5.5' height='5.5' rx='1.5'/>" +
    "<rect x='1.5' y='9' width='5.5' height='5.5' rx='1.5'/><rect x='9' y='9' width='5.5' height='5.5' rx='1.5'/></g></svg>"),
  list: "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><g fill='black'>" +
    "<rect x='1.5' y='2.5' width='13' height='2' rx='1'/><rect x='1.5' y='7' width='13' height='2' rx='1'/>" +
    "<rect x='1.5' y='11.5' width='13' height='2' rx='1'/></g></svg>"),
};

class BookmarksView {
  constructor(host, { library = false } = {}) {
    this.host = host;
    this.library = library;
    this.query = "";
    this.path = []; // tiles: the folders stepped into, [{guid, title}]
    this.opened = new Set(readJSON(PREFS.open, []));
    const shadow = host.attachShadow({ mode: "open" });
    const style = make("style");
    style.textContent = STYLE;
    this.head = make("div", { class: "head" });
    this.search = make("input", { class: "search", type: "search", placeholder: "Search bookmarks", spellcheck: "false" });
    this.lookBtn = this.button("Tiles or list", ICONS.tiles, () => this.toggleLook());
    this.head.append(this.search, this.lookBtn);
    if (!library) this.head.append(this.button("Close (Ctrl+B)", "chrome://global/skin/icons/close.svg", () => Panel.hide()));
    this.crumbs = make("div", { class: "crumbs" });
    this.crumbs.hidden = true;
    this.body = make("div", { class: "body", tabindex: "-1" });
    shadow.append(style, this.head, this.crumbs, this.body);
    this.search.addEventListener("input", () => {
      this.query = this.search.value.trim();
      this.refresh();
    });
    this.search.addEventListener("keydown", e => {
      if (e.key === "Enter") this.body.querySelector("[kind='link']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.body.querySelector(".row, .tile")?.focus();
      }
    });
    this.body.addEventListener("click", e => this.onClick(e));
    this.body.addEventListener("auxclick", e => e.button === 1 && this.onClick(e));
    this.body.addEventListener("keydown", e => this.onKey(e));
    this.body.addEventListener("contextmenu", e => this.onMenu(e));
    this.body.addEventListener("dragstart", e => this.onDragStart(e));
    this.body.addEventListener("dragover", e => this.onDragOver(e));
    this.body.addEventListener("dragleave", e => {
      if (!this.body.contains(e.relatedTarget)) this.clearDrop();
    });
    this.body.addEventListener("drop", e => this.onDrop(e));
    Views.add(this);
  }

  button(title, icon, fn) {
    const b = make("button", { class: "btn", title, type: "button" });
    const i = make("span");
    i.style.setProperty("--icon", `url("${icon}")`);
    b.append(i);
    b.addEventListener("click", fn);
    return b;
  }

  get look() {
    const l = look();
    return l === "firefox" ? "list" : l;
  }

  toggleLook() {
    Services.prefs.setStringPref(PREFS.look, this.look === "tiles" ? "list" : "tiles");
  }

  focus() {
    this.search.focus();
    this.search.select();
  }

  // Only what's on screen is fetched, a moment after the last change.
  refresh() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render().catch(e => console.error("[Zenith Bookmarks]", e)), 30);
  }

  async render() {
    if (!this.host.isConnected) return;
    const tiles = this.look === "tiles";
    this.host.toggleAttribute("tiles", tiles);
    // The button shows what it switches to.
    this.lookBtn.title = tiles ? "Show as a list" : "Show as tiles";
    this.lookBtn.firstChild.style.setProperty("--icon", `url("${tiles ? ICONS.list : ICONS.tiles}")`);
    const out = [];
    if (this.query) {
      this.crumbs.hidden = true;
      const found = await Data.search(this.query);
      if (!found.length) out.push(make("div", { class: "empty" }, "No bookmarks match"));
      else out.push(...this.list(found, 0, tiles));
      this.body.replaceChildren(...out);
      return;
    }
    const data = await Data.all();
    this.data = data;
    if (tiles && this.path.length) {
      // Inside a folder: its contents, and the way back.
      const at = this.path.at(-1);
      const folder = this.find(data, at.guid);
      this.crumbs.hidden = false;
      const back = make("button", { class: "back", type: "button" }, "‹ Back");
      back.addEventListener("click", () => {
        this.path.pop();
        this.refresh();
      });
      this.crumbs.replaceChildren(back, make("span", {}, this.path.map(p => p.title).join(" › ")));
      out.push(...this.list(folder?.children ?? [], 0, true));
      if (!folder?.children?.length) out.push(make("div", { class: "empty" }, "Nothing in this folder"));
      this.body.replaceChildren(...out);
      return;
    }
    this.crumbs.hidden = true;
    if (data.space) {
      const { space, items } = data.space;
      const label = make("div", { class: "label drop-target", zone: "space" });
      if (space.icon && !/^[a-z]+:/i.test(space.icon)) label.append(make("span", { class: "emoji" }, space.icon));
      label.append(make("span", {}, space.name || "This space"));
      out.push(label);
      if (items.length) out.push(...this.list(items, 0, tiles, "space"));
      else out.push(make("div", { class: "drop-here drop-target", zone: "space" }, `Drop a tab here to keep it with ${space.name || "this space"}`));
      out.push(make("div", { class: "label" }, "Bookmarks"));
    }
    const top = data.toolbar?.children ?? [];
    out.push(...this.list(top, 0, tiles));
    if (!tiles) out.push(make("div", { class: "sep" }));
    out.push(...this.list(data.folders.filter(f => f.children?.length), 0, tiles));
    if (!top.length && !data.folders.some(f => f.children?.length) && !data.space) {
      out.push(make("div", { class: "empty" }, "No bookmarks yet. Drop a tab here to keep it."));
    }
    this.body.replaceChildren(...out);
  }

  find(data, guid) {
    const walk = items => {
      for (const i of items ?? []) {
        if (i.guid === guid) return i;
        const f = walk(i.children);
        if (f) return f;
      }
      return null;
    };
    return walk([data.toolbar, ...data.folders, ...(data.space?.items ?? [])].filter(Boolean));
  }

  // Rows (or a grid of tiles) for some items; open folders' contents follow
  // them, indented.
  list(items, depth, tiles, zone = "") {
    if (tiles) {
      const grid = make("div", { class: "tiles" });
      for (const item of items) if (item.kind !== "sep") grid.append(this.tile(item, zone));
      return grid.children.length ? [grid] : [];
    }
    const out = [];
    for (const item of items) {
      if (item.kind === "sep") {
        out.push(make("div", { class: "sep" }));
        continue;
      }
      out.push(this.row(item, depth, zone));
      if (item.kind === "folder" && this.opened.has(item.guid)) {
        out.push(...this.list(item.children ?? [], depth + 1, false, zone));
        if (!item.children?.length) {
          const empty = make("div", { class: "empty" }, "Empty");
          empty.style.paddingInlineStart = `${28 + (depth + 1) * 14}px`;
          out.push(empty);
        }
      }
    }
    return out;
  }

  icon(item) {
    const icon = make("span", { class: "icon" });
    if (item.kind === "link" && item.url) {
      const img = make("img", { src: `page-icon:${item.url}`, alt: "" });
      img.addEventListener("error", () => img.remove(), { once: true });
      icon.append(img);
    }
    return icon;
  }

  mark(node, item, zone) {
    node.dataset.guid = item.guid;
    node.dataset.parent = item.parent ?? "";
    node.dataset.index = item.index ?? -1;
    if (zone) node.setAttribute("zone", zone);
    node.setAttribute("kind", item.kind);
    node.setAttribute("tabindex", "0");
    node.setAttribute("draggable", "true");
    if (item.url) node.title = `${item.title || item.url}\n${item.url}`;
    return node;
  }

  row(item, depth, zone) {
    const row = this.mark(make("div", { class: "row" }), item, zone);
    row.style.paddingInlineStart = `${8 + depth * 14}px`;
    if (item.kind === "folder") {
      row.toggleAttribute("open", this.opened.has(item.guid));
      row.append(make("span", { class: "chev" }));
    }
    row.append(this.icon(item), make("span", { class: "text" }, item.title || this.host_(item.url) || item.url));
    if (item.kind === "folder") row.append(make("span", { class: "count" }, String(item.children?.length ?? 0)));
    else if (this.query) row.append(make("span", { class: "host" }, this.host_(item.url)));
    return row;
  }

  tile(item, zone) {
    const tile = this.mark(make("div", { class: "tile" }), item, zone);
    tile.append(this.icon(item), make("span", { class: "text" }, item.title || this.host_(item.url)));
    return tile;
  }

  host_(url) {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  itemOf(node) {
    const guid = node?.dataset?.guid;
    if (!guid) return null;
    return (this.data && this.find(this.data, guid)) ?? { guid, parent: node.dataset.parent, kind: node.getAttribute("kind"),
                                                         url: node.title?.split("\n")[1] ?? "", title: "" };
  }

  onClick(e) {
    const node = e.target.closest(".row, .tile");
    const item = this.itemOf(node);
    if (!item) return;
    if (item.kind === "folder") {
      if (this.look === "tiles" && !this.query) {
        this.path.push({ guid: item.guid, title: item.title });
      } else if (this.opened.has(item.guid)) {
        this.opened.delete(item.guid);
      } else {
        this.opened.add(item.guid);
      }
      Services.prefs.setStringPref(PREFS.open, JSON.stringify([...this.opened].slice(-200)));
      this.refresh();
      return;
    }
    if (item.url) {
      openBookmark(item.url, e);
      if (!this.library && place() === "float" && !(e.button === 1 || e.ctrlKey || e.metaKey)) Panel.hide();
    }
  }

  onKey(e) {
    const nodes = [...this.body.querySelectorAll(".row, .tile")];
    const i = nodes.indexOf(e.target);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (e.key === "ArrowUp" && i <= 0) return this.search.focus();
      nodes[Math.min(nodes.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))]?.focus();
    } else if (e.key === "Enter" && i >= 0) {
      e.preventDefault();
      e.target.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: e.ctrlKey }));
    }
  }

  onMenu(e) {
    const node = e.target.closest(".row, .tile");
    const item = this.itemOf(node);
    if (!item) return;
    e.preventDefault();
    Menu.open(e, item, this);
  }

  /* Drag and drop: tabs and links in, bookmarks moved, bookmarks out. */

  onDragStart(e) {
    const item = this.itemOf(e.target.closest?.(".row, .tile"));
    if (!item) return;
    const dt = e.dataTransfer;
    dt.setData(OURS, item.guid);
    if (item.url) {
      dt.setData("text/x-moz-url", `${item.url}\n${item.title || item.url}`);
      dt.setData("text/uri-list", item.url);
      dt.setData("text/plain", item.url);
    }
    dt.effectAllowed = "copyMove";
  }

  // What's being dragged: one of ours, a tab, or a link.
  dragged(dt) {
    if (dt.types.includes(OURS)) return { guid: dt.getData(OURS) };
    if (dt.types.includes(TAB_TYPE)) {
      const tab = dt.mozGetDataAt(TAB_TYPE, 0);
      const url = tab?.linkedBrowser?.currentURI?.spec;
      return url ? { url, title: tab.label } : null;
    }
    if (dt.types.includes("text/x-moz-url")) {
      const [url, title] = dt.getData("text/x-moz-url").split("\n");
      return url ? { url, title } : null;
    }
    if (dt.types.includes("text/uri-list")) {
      const url = dt.getData("text/uri-list").split("\n").find(l => l && !l.startsWith("#"));
      return url ? { url, title: url } : null;
    }
    return null;
  }

  canTake(dt) {
    return [OURS, TAB_TYPE, "text/x-moz-url", "text/uri-list"].some(t => dt.types.includes(t));
  }

  // Where it would go: into a folder (or this space's section), before a
  // row, or at the end of the toolbar's list.
  target(e) {
    const node = e.target.closest?.(".row, .tile, .drop-target");
    if (node?.classList.contains("drop-target")) return { node, zone: "space" };
    if (!node) return { node: this.body };
    const item = this.itemOf(node);
    if (item?.kind === "folder") {
      const r = node.getBoundingClientRect();
      const y = e.clientY - r.top;
      if (y > r.height * 0.25 && y < r.height * 0.75) return { node, into: item.guid };
    }
    return { node, before: item };
  }

  onDragOver(e) {
    if (!this.canTake(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(OURS) ? "move" : "copy";
    const t = this.target(e);
    this.clearDrop();
    t.node.setAttribute("drop", t.before ? "before" : "into");
    this.dropNode = t.node;
  }

  clearDrop() {
    this.dropNode?.removeAttribute("drop");
    this.dropNode = null;
  }

  async onDrop(e) {
    const what = this.dragged(e.dataTransfer);
    const t = this.target(e);
    this.clearDrop();
    if (!what) return;
    e.preventDefault();
    e.stopPropagation();
    const P = window.PlacesUtils;
    let parent, index;
    if (t.zone === "space" || (t.before && t.node.getAttribute("zone") === "space" && !t.before.parent)) {
      const space = Data.space();
      if (!space) return;
      parent = await Data.spaceFolder(space);
    } else if (t.into) {
      parent = t.into;
    } else if (t.before?.parent) {
      parent = t.before.parent;
      index = Number(t.before.index);
      if (what.guid) {
        // Moving down within the same folder: the gap left behind shifts it.
        const moving = await P.bookmarks.fetch(what.guid).catch(() => null);
        if (moving?.parentGuid === parent && moving.index < index) index -= 1;
      }
    } else {
      parent = this.path.at(-1)?.guid ?? P.bookmarks.toolbarGuid;
    }
    if (what.guid) {
      if (what.guid === parent) return;
      await Data.move(what.guid, parent, index);
    } else {
      await Data.add(parent, what.url, what.title, index);
    }
  }
}

// Every view on screen, refreshed when bookmarks or the space change.
const Views = new Set();
function refreshAll() {
  for (const v of Views) {
    if (!v.host.isConnected) Views.delete(v);
    else v.refresh();
  }
}

/* --- The right-click menu ------------------------------------------------------- */

const Menu = {
  build() {
    this.popup = document.createXULElement("menupopup");
    this.popup.id = "zenith-bm-menu";
    const item = (label, fn) => {
      const m = document.createXULElement("menuitem");
      m.setAttribute("label", label);
      m.addEventListener("command", () => fn(this.item, this.view));
      this.popup.append(m);
      return m;
    };
    this.items = {
      open: item("Open in a new tab", i => openTrustedLinkIn(i.url, "tab")),
      behind: item("Open behind", i => openTrustedLinkIn(i.url, "tabshifted")),
      all: item("Open all in tabs", async i => {
        const f = await Data.tree(i.guid);
        for (const c of f?.children ?? []) if (c.uri) openTrustedLinkIn(c.uri, "tabshifted");
      }),
      sep: this.popup.appendChild(document.createXULElement("menuseparator")),
      space: item("Keep with this space", async i => {
        const space = Data.space();
        if (space) await Data.move(i.guid, await Data.spaceFolder(space));
      }),
      edit: item("Edit…", i => {
        const node = Data.node(i.guid, i.parent);
        if (node) window.PlacesUIUtils.showBookmarkDialog({ action: "edit", node }, window);
      }),
      folder: item("New folder here", async i => {
        const parent = i.kind === "folder" ? i.guid : i.parent;
        await window.PlacesTransactions.NewFolder({ parentGuid: parent, title: "New folder" }).transact();
      }),
      remove: item("Delete", i => Data.remove(i.guid)),
    };
    document.getElementById("mainPopupSet").append(this.popup);
  },

  open(e, item, view) {
    if (!this.popup) this.build();
    this.item = item;
    this.view = view;
    const link = item.kind === "link";
    this.items.open.hidden = this.items.behind.hidden = !link;
    this.items.all.hidden = link;
    this.items.space.hidden = !Data.space() || !spaceFirst();
    this.popup.openPopupAtScreen(e.screenX, e.screenY, true, e);
  },
};

/* --- The panel (Ctrl+B) ----------------------------------------------------------- */

const Panel = {
  build() {
    this.node = make("div", { id: "zenith-bm-panel" });
    this.node.hidden = true;
    this.view = new BookmarksView(this.node.appendChild(make("zenith-bookmarks-host")));
    this.grip = make("div", { class: "zth-bm-grip", title: "Drag to resize" });
    this.node.append(this.grip);
    this.grip.addEventListener("pointerdown", e => this.resize(e));
    this.node.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (this.view.query) {
          this.view.search.value = "";
          this.view.query = "";
          this.view.refresh();
        } else this.hide();
      }
    });
    this.width();
    this.placeIt();
  },

  get open() {
    return !!this.node && !this.node.hidden;
  },

  // Over the page (float) or beside it (right, left): in the page's column,
  // so the sidebar and its hover stay as they are.
  placeIt() {
    const wrapper = document.getElementById("zen-tabbox-wrapper");
    if (!wrapper || !this.node) return;
    const where = place(), at = side();
    this.node.setAttribute("place", where === "float" ? "float" : at);
    this.node.setAttribute("side", at);
    if (where !== "float" && at === "left") wrapper.prepend(this.node);
    else wrapper.append(this.node);
  },

  width() {
    const w = Math.min(560, Math.max(220, Services.prefs.getIntPref(PREFS.width, 300)));
    this.node?.style.setProperty("--zth-bm-width", `${w}px`);
  },

  resize(e) {
    e.preventDefault();
    const start = e.clientX, from = this.node.getBoundingClientRect().width, left = side() === "left";
    const move = ev => {
      const w = Math.round(Math.min(560, Math.max(220, from + (left ? ev.clientX - start : start - ev.clientX))));
      this.node.style.setProperty("--zth-bm-width", `${w}px`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      Services.prefs.setIntPref(PREFS.width, Math.round(this.node.getBoundingClientRect().width));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  },

  show() {
    if (!this.node) this.build();
    this.placeIt();
    this.node.hidden = false;
    this.view.render().then(() => this.view.focus());
  },

  hide() {
    if (!this.node || this.node.hidden) return;
    this.node.hidden = true;
    if (this.node.contains(document.activeElement) || this.node.querySelector("zenith-bookmarks-host")?.shadowRoot?.activeElement) {
      gBrowser.selectedBrowser.focus();
    }
  },

  toggle() {
    if (this.open) this.hide();
    else this.show();
  },
};

// The view's element: a plain one with a shadow root of its own (so its
// styles stay inside), used both in the panel and in Zen's Library.
function defineElement() {
  if (customElements.get("zenith-bookmarks-host")) return;
  customElements.define("zenith-bookmarks-host", class extends HTMLElement {
    connectedCallback() {
      if (this.hasAttribute("library") && !this.view) this.view = new BookmarksView(this, { library: true });
      (this.view ?? Panel.view)?.refresh();
    }

    // Zen's Library tells its open section when it opens.
    onLibraryOpened() {
      this.view?.render().then(() => this.view.focus());
    }
  });
}

/* --- Ctrl+B, and Firefox's own sidebar ------------------------------------------- */

// Firefox's "Bookmarks" sidebar (Ctrl+B, menus) comes here, unless the look
// is "Firefox's tree": then it opens as it would, placed and restyled.
function hookSidebar() {
  const S = window.SidebarController;
  if (!S || S.zenithBookmarks) return;
  S.zenithBookmarks = true;
  const ours = id => id === "viewBookmarksSidebar" && look() !== "firefox";
  const toggle = S.toggle, show = S.show;
  S.toggle = function (id, ...rest) {
    if (ours(id ?? this.lastOpenedId)) return Promise.resolve(Panel.toggle());
    return toggle.call(this, id, ...rest);
  };
  S.show = function (id, ...rest) {
    if (ours(id)) return Promise.resolve(Panel.show());
    return show.call(this, id, ...rest);
  };
  window.addEventListener("unload", () => {
    S.toggle = toggle;
    S.show = show;
  }, { once: true });
  // Firefox's tree, in Zenith's colours: a sheet inside its page, with the
  // colours of the moment (variables don't reach into it).
  const browser = document.getElementById("sidebar");
  browser?.addEventListener("load", () => {
    if (look() !== "firefox") return;
    try {
      const doc = browser.contentDocument, cs = getComputedStyle(document.documentElement);
      const v = name => cs.getPropertyValue(name).trim();
      const css = `
        :root, body, #sidebar-panel-header, tree, #bookmarks-view, #historyTree { background: transparent !important; color: ${v("--zth-ink") || "inherit"} !important; }
        #sidebar-search-container { padding: 8px 10px !important; }
        #search-box { border-radius: ${v("--zth-pill-radius") || "8px"} !important; border: 1px solid ${v("--zth-hairline") || "transparent"} !important;
                      background: color-mix(in srgb, currentColor 6%, transparent) !important; }
        treechildren::-moz-tree-row { min-height: 28px !important; border-radius: 6px; }
        treechildren::-moz-tree-row(hover) { background-color: color-mix(in srgb, currentColor 8%, transparent) !important; }
        treechildren::-moz-tree-row(selected) { background-color: ${v("--zth-accent-soft") || "SelectedItem"} !important; }
        treechildren::-moz-tree-cell-text(selected) { color: inherit !important; }`;
      doc.defaultView.windowUtils.loadSheetUsingURIString(`data:text/css,${encodeURIComponent(css)}`, doc.defaultView.windowUtils.USER_SHEET);
    } catch (e) {
      console.error("[Zenith Bookmarks] Firefox's tree", e);
    }
  }, true);
}

// Changing the look while bookmarks are open opens them in the new look
// (Firefox's sidebar for "Firefox's tree", Zenith's panel otherwise).
function swapLook() {
  const S = window.SidebarController;
  const firefoxOpen = !!S?.isOpen && S.currentID === "viewBookmarksSidebar";
  if (look() === "firefox") {
    if (Panel.open) {
      Panel.hide();
      S?.show("viewBookmarksSidebar");
    }
  } else if (firefoxOpen) {
    S.hide();
    Panel.show();
  }
}

/* --- Zen's Library ----------------------------------------------------------------- */

// A "Bookmarks" section in Zen's Library (before History), showing the same
// view. It stays registered once there (the Library keeps sections it has
// shown), and is hidden with the setting off.
async function addToLibrary() {
  if (!Services.prefs.getBoolPref("zen.library.enabled", false)) return;
  await customElements.whenDefined("zen-library");
  const Lib = customElements.get("zen-library");
  if (!Lib || Lib.prototype.zenithRender) return;
  const { html } = await import("chrome://global/content/vendor/lit.all.mjs");
  const section = {
    id: "zenith-bookmarks",
    label: "sidebar-bookmarks-title", // Firefox's own "Bookmarks"
    render: () => html`<zenith-bookmarks-host library class="zen-library-section" data-section="zenith-bookmarks"></zenith-bookmarks-host>`,
  };
  const orig = (Lib.prototype.zenithRender = Lib.prototype.render);
  Lib.prototype.render = function () {
    const s = this.zenLibrarySections;
    if (s && !s[section.id]) {
      const out = {};
      for (const [k, v] of Object.entries(s)) {
        if (k === "history") out[section.id] = section;
        out[k] = v;
      }
      out[section.id] ??= section;
      this.zenLibrarySections = out;
    }
    return orig.call(this);
  };
  // A Library that's already on screen picks it up on its next drawing.
  document.querySelector("zen-library")?.requestUpdate?.();
  const follow = () => {
    const on = Services.prefs.getBoolPref(PREFS.library, true);
    document.documentElement.toggleAttribute("zenith-bm-library-off", !on);
    const lib = document.querySelector("zen-library");
    if (!on && lib?.activeTab === section.id) lib.activeTab = "history";
  };
  Services.prefs.addObserver(PREFS.library, follow);
  window.addEventListener("unload", () => Services.prefs.removeObserver(PREFS.library, follow), { once: true });
  follow();
}

/* --- The Library window ------------------------------------------------------------- */

// Firefox's Library (Manage bookmarks) has no space of its own: when it
// opens, it gets this window's Zenith colours (panels/chrome.css styles it).
const LibraryWindow = {
  VARS: ["--zth-glass-color", "--zth-accent", "--zth-accent-soft", "--zth-ink", "--zth-ink-dim", "--zth-hairline",
         "--zth-radius", "--zth-pill-radius", "--zth-font"],

  init() {
    this.observer = {
      observe: win => win.addEventListener("load", () => {
        if (win.document.documentElement.getAttribute("windowtype") === "Places:Organizer" &&
            Services.wm.getMostRecentWindow("navigator:browser") === window) this.paint(win);
      }, { once: true }),
    };
    Services.obs.addObserver(this.observer, "domwindowopened");
    window.addEventListener("unload", () => Services.obs.removeObserver(this.observer, "domwindowopened"), { once: true });
  },

  paint(win) {
    const cs = getComputedStyle(document.documentElement), root = win.document.documentElement;
    for (const v of this.VARS) {
      const value = cs.getPropertyValue(v).trim();
      if (value) root.style.setProperty(v, value);
    }
  },
};

/* --- Start --------------------------------------------------------------------------- */

function init() {
  defineElement();
  hookSidebar();
  const command = document.createXULElement("command");
  command.id = "zenith-bookmarks-toggle";
  command.addEventListener("command", () => (look() === "firefox" ? SidebarController.toggle("viewBookmarksSidebar") : Panel.toggle()));
  const set = document.createXULElement("commandset");
  set.append(command);
  document.documentElement.append(set);

  const places = ["bookmark-added", "bookmark-removed", "bookmark-moved", "bookmark-title-changed", "bookmark-url-changed"];
  const onPlaces = () => refreshAll();
  window.PlacesUtils.observers.addListener(places, onPlaces);
  const onPref = (_, __, name) => {
    if (name === PREFS.place && Panel.node) Panel.placeIt();
    if (name === PREFS.look) swapLook();
    document.documentElement.setAttribute("zenith-bm-place", place());
    document.documentElement.setAttribute("zenith-bm-side", side());
    document.documentElement.setAttribute("zenith-bm-look", look());
    refreshAll();
  };
  for (const p of [PREFS.look, PREFS.place, PREFS.spaceFirst]) Services.prefs.addObserver(p, onPref);
  onPref(null, null, "");
  // The sidebar moved sides: so does the panel.
  const onDock = () => {
    if (Panel.node) Panel.placeIt();
    document.documentElement.setAttribute("zenith-bm-side", side());
  };
  window.addEventListener("ZenithDock", onDock);
  const onSpace = () => refreshAll();
  window.addEventListener("ZenWorkspacesUIUpdate", onSpace);
  window.gZenWorkspaces?.addChangeListeners?.(onSpace);
  // Zen's per-space bookmark assignments changed (its edit dialog).
  const zenObs = { observe: () => setTimeout(refreshAll, 50) };
  Services.obs.addObserver(zenObs, "workspace-bookmarks-updated");
  window.addEventListener("unload", () => {
    window.PlacesUtils.observers.removeListener(places, onPlaces);
    for (const p of [PREFS.look, PREFS.place, PREFS.spaceFirst]) Services.prefs.removeObserver(p, onPref);
    window.removeEventListener("ZenithDock", onDock);
    window.removeEventListener("ZenWorkspacesUIUpdate", onSpace);
    window.gZenWorkspaces?.removeChangeListeners?.(onSpace);
    Services.obs.removeObserver(zenObs, "workspace-bookmarks-updated");
  }, { once: true });
  LibraryWindow.init();
  window.ZenithBookmarks = { Panel, Data, Views, BookmarksView, Menu, LibraryWindow }; // the switcher's :bookmarks, and tools/checks
  return addToLibrary();
}

start("bookmarks", init, true);
