// ==UserScript==
// @name           Zenith Tab manager
// @description    Zenith Plus: every tab of every space on one page (about:zenith-tabs), tidying up, and rules for grouping, sleeping and closing.
// @include        main
// @version        0.11.2
// ==/UserScript==

// The tab manager (the "tab report" in DESIGN.md). Alt+Shift+T, or ":tabs"
// in the switcher, opens about:zenith-tabs (or, with "Opens as" set to a
// card, the small card over the page):
//   - every space as a column of its tabs (pinned and folders first), to
//     pick tabs and move them to a space, into a folder or group, put them
//     to sleep, wake them or close them (with Undo); drag to move;
//   - tidying up: duplicates, tabs not used for days, awake tabs, busy
//     sites; each picks its tabs for you to look over first;
//   - rules, which act on their own only once you set them:
//       grouping   a site, address or title goes into a folder (an existing
//                  one you link it to, or one it makes) or an unpinned group
//       sleep      tabs you haven't used for a while go to sleep
//       close      loose tabs you haven't used for days close (listed on
//                  the page to bring back)
// The page lives in plus/pages; this script is what keeps running in the
// window: the rules, the timers, and what the page asks it to do.
// Settings: Zenith › Keys. Styles: plus/chrome.css (the card) and
// plus/pages/tab-manager.css.

const HTML_NS = "http://www.w3.org/1999/xhtml";

const FIRST = !window.zenithTabsStarted;
window.zenithTabsStarted = true;

function start(name, fn) {
  if (!FIRST) return;
  try {
    fn();
  } catch (e) {
    console.error(`[Zenith Tab manager] ${name} failed to start`, e);
  }
}

function make(tag, attrs = {}, text = "") {
  const node = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

const PREF = "zenith.plus.tab-manager";
const VIEW_PREF = "zenith.plus.tab-manager-view"; // "" the page · "card"
const DAYS_PREF = "zenith.internal.tabs.days";
const DAY = 24 * 60 * 60 * 1000;
const BUSY = 4; // loose tabs from one site before it counts as busy

/* --- Looking at the tabs ------------------------------------------------------ */

const Look = {
  spaces() {
    try {
      return gZenWorkspaces.workspaceEnabled ? gZenWorkspaces.getWorkspaces() ?? [] : [];
    } catch {
      return [];
    }
  },

  // Every real tab, in every space.
  tabs() {
    const all = window.gZenWorkspaces?.allStoredTabs ?? gBrowser.tabs;
    return [...new Set(all)].filter(t => t.isConnected && !t.closing && !t.hasAttribute("zen-empty-tab") &&
                                         !t.hasAttribute("zen-glance-tab") &&
                                         !["about:blank", "about:zenith-tabs"].includes(t.linkedBrowser?.currentURI?.spec));
  },

  site(tab) {
    const uri = tab.linkedBrowser?.currentURI;
    try {
      if (/^https?$/.test(uri.scheme)) return uri.host.replace(/^www\./, "");
      return uri.scheme === "about" ? uri.spec.split(/[?#]/)[0] : uri.scheme;
    } catch {
      return "";
    }
  },

  // The same page: the address without what follows a #.
  page(tab) {
    return tab.linkedBrowser?.currentURI?.specIgnoringRef ?? "";
  },

  awake(tab) {
    return !!tab.linkedPanel && !tab.hasAttribute("pending") && !tab.hasAttribute("discarded");
  },

  kept(tab) {
    return tab.pinned || tab.hasAttribute("zen-essential");
  },

  space(tab) {
    return tab.getAttribute("zen-workspace-id") || "";
  },

  spaceName(id) {
    return this.spaces().find(s => s.uuid === id)?.name ?? "";
  },

  // The folder or group a tab is in (through a split view it's in).
  ownGroup(tab) {
    let g = tab?.group;
    if (g?.hasAttribute("split-view-group")) g = g.group;
    return g ?? null;
  },

  splitOf(tab) {
    return tab?.group?.hasAttribute("split-view-group") ? tab.group : null;
  },

  // Where an essential shows: every space, or (with Zen's essentials per
  // container) the spaces using its container.
  essentialSpaces(tab) {
    const all = this.spaces();
    if (!Services.prefs.getBoolPref("zen.workspaces.container-specific-essentials-enabled", false)) return all;
    const c = parseInt(tab.getAttribute("usercontextid") || "0", 10);
    return all.filter(s => (s.containerTabId || 0) === c);
  },

  // Memory and CPU per awake tab, from Firefox's process list: a process
  // shared by several tabs (the same site) is shared out between them; CPU
  // is the share of one core since the last call.
  lastCpu: new Map(),
  async usage() {
    const info = await ChromeUtils.requestProcInfo();
    const now = performance.now();
    const byWindow = new Map(), tabsIn = new Map();
    for (const child of info.children ?? []) for (const w of child.windows ?? []) byWindow.set(w.outerWindowId, child);
    const awake = this.tabs().filter(t => this.awake(t));
    for (const t of awake) {
      const proc = byWindow.get(t.linkedBrowser?.outerWindowID);
      if (proc) tabsIn.set(proc.pid, (tabsIn.get(proc.pid) ?? 0) + 1);
    }
    const out = new Map();
    const cpuOf = new Map();
    for (const child of info.children ?? []) {
      const last = this.lastCpu.get(child.pid);
      if (last) cpuOf.set(child.pid, Math.max(0, (child.cpuTime - last.cpu) / 1e6 / Math.max(1, now - last.at)));
      this.lastCpu.set(child.pid, { cpu: child.cpuTime, at: now });
    }
    for (const t of awake) {
      const proc = byWindow.get(t.linkedBrowser?.outerWindowID);
      if (!proc) continue;
      const n = tabsIn.get(proc.pid) || 1;
      out.set(t, { memory: (proc.memory ?? 0) / n, cpu: cpuOf.has(proc.pid) ? cpuOf.get(proc.pid) / n : null, shared: n > 1 });
    }
    return out;
  },

  report(days) {
    const tabs = this.tabs();
    const now = Date.now();
    const report = { tabs, days };
    report.spaces = this.spaces().map(s => {
      const here = tabs.filter(t => this.space(t) === s.uuid && !t.hasAttribute("zen-essential"));
      return { space: s, count: here.length, awake: here.filter(t => this.awake(t)).length };
    });
    report.essentials = tabs.filter(t => t.hasAttribute("zen-essential")).length;
    // Duplicates: keep the one used last (or the pinned one); offer the rest.
    const byPage = new Map();
    for (const t of tabs) {
      const page = this.page(t);
      if (!page) continue;
      if (!byPage.has(page)) byPage.set(page, []);
      byPage.get(page).push(t);
    }
    report.duplicates = [];
    for (const group of byPage.values()) {
      if (group.length < 2) continue;
      const keep = group.find(t => this.kept(t)) ?? [...group].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      report.duplicates.push(...group.filter(t => t !== keep && !this.kept(t)));
    }
    report.stale = tabs.filter(t => !t.selected && !this.kept(t) && t.lastAccessed && now - t.lastAccessed > days * DAY)
      .sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
    report.awake = tabs.filter(t => !t.selected && this.awake(t) && !t.hasAttribute("soundplaying"));
    // Busy sites: loose (not in a folder) tabs of one site in one space.
    const bySite = new Map();
    for (const t of tabs) {
      if (this.kept(t) || t.group) continue;
      const key = `${this.space(t)}|${this.site(t)}`;
      if (!this.site(t)) continue;
      if (!bySite.has(key)) bySite.set(key, []);
      bySite.get(key).push(t);
    }
    report.busy = [...bySite.entries()].filter(([, g]) => g.length >= BUSY)
      .map(([key, group]) => ({ site: key.split("|")[1], space: key.split("|")[0], tabs: group }))
      .sort((a, b) => b.tabs.length - a.tabs.length);
    return report;
  },
};

/* --- Acting on them ------------------------------------------------------------ */

const Act = {
  closed: 0, // how many tabs the last close took, for the card's Undo
  history: [], // what Undo puts back, newest last: { label, undo }

  remember(label, undo) {
    this.history.push({ label, undo });
    if (this.history.length > 20) this.history.shift();
  },

  // Undo the last thing done here (close, move, folder…).
  undoLast() {
    const last = this.history.pop();
    if (!last) return null;
    try {
      last.undo();
    } catch (e) {
      console.error("[Zenith Tab manager] undo", e);
    }
    return last.label;
  },

  // Where tabs are, to put them back: space, pinned, folder or group.
  snapshot(tabs) {
    return tabs.map(tab => ({ tab, space: Look.space(tab), pinned: tab.pinned, group: Look.ownGroup(tab) }));
  },

  restore(states) {
    for (const s of states) {
      const tab = s.tab;
      if (!tab.isConnected || tab.hasAttribute("zen-essential")) continue;
      const now = Look.ownGroup(tab);
      if (now && now !== s.group) this.outOf(tab);
      if (s.space && Look.space(tab) !== s.space) gZenWorkspaces?.moveTabsToWorkspace?.([Look.splitOf(tab)?.tabs ?? tab].flat(), s.space);
      if (!s.group && tab.pinned !== s.pinned) (s.pinned ? gBrowser.pinTab(tab) : gBrowser.unpinTab(tab));
      if (s.group?.isConnected && Look.ownGroup(tab) !== s.group) {
        const space = s.group.getAttribute("zen-workspace-id");
        if (space && Look.space(tab) !== space) gZenWorkspaces.moveTabsToWorkspace([tab], space);
        s.group.addTabs([tab]);
      }
    }
  },

  // Out of its folder or group (a split view comes out whole).
  outOf(tab) {
    const g = Look.ownGroup(tab);
    if (!g) return;
    const split = Look.splitOf(tab);
    if (split) gBrowser.moveTabAfter(tab, g);
    else gBrowser.ungroupTab(tab);
  },

  close(tabs) {
    tabs = tabs.filter(t => t.isConnected && !Look.kept(t));
    return this.closePicked(tabs);
  },

  // Closing what you picked on the page: anything but essentials.
  closePicked(tabs) {
    tabs = tabs.filter(t => t.isConnected && !t.hasAttribute("zen-essential"));
    if (!tabs.length) return 0;
    gBrowser.removeTabs(tabs, { animate: false, suppressWarnAboutClosingWindow: true });
    const n = tabs.length;
    this.closed = n;
    this.remember(`Closed ${n} tab${n === 1 ? "" : "s"}`, () => this.reopen(n));
    return n;
  },

  // Reopen the last n closed tabs, staying on the tab you're on (the
  // manager's page, say).
  reopen(n) {
    const stay = gBrowser.selectedTab;
    for (let i = 0; i < n; i++) {
      try {
        SessionStore.undoCloseTab(window, 0);
      } catch (e) {
        console.error("[Zenith Tab manager] reopen", e);
        break;
      }
    }
    if (stay?.isConnected) gBrowser.selectedTab = stay;
    return n;
  },

  undo() {
    const n = this.closed;
    this.closed = 0;
    return this.reopen(n);
  },

  sleep(tabs) {
    tabs = tabs.filter(t => t.isConnected && !t.selected && Look.awake(t));
    if (!tabs.length) return 0;
    if (typeof gBrowser.explicitUnloadTabs === "function") gBrowser.explicitUnloadTabs(tabs);
    else for (const t of tabs) gBrowser.discardBrowser(t, true);
    return tabs.length;
  },

  wake(tabs) {
    tabs = tabs.filter(t => t.isConnected && !Look.awake(t));
    for (const t of tabs) {
      try {
        gBrowser.getBrowserForTab(t)?.reload?.();
        if (t.hasAttribute("pending")) SessionStore.restoreTabContent?.(t) ?? gBrowser._insertBrowser?.(t);
      } catch {}
    }
    return tabs.length;
  },

  // A new folder: Zen's (its tabs pinned), or one that doesn't pin.
  folder(name, space, tabs, { unpinned = false } = {}) {
    if (!window.gZenFolders?.createFolder || !tabs.length) return null;
    const folder = gZenFolders.createFolder(tabs, { label: name, workspaceId: space || undefined, collapsed: false });
    if (unpinned && folder) window.ZenithGroups?.setUnpinned(folder, true);
    return folder;
  },

  // Take tabs out of their folders or groups, as ordinary tabs again.
  takeOut(tabs) {
    tabs = tabs.filter(t => t.isConnected && Look.ownGroup(t) && !t.hasAttribute("zen-essential"));
    if (!tabs.length) return 0;
    const before = this.snapshot(tabs);
    for (const t of tabs) {
      const fromFolder = Look.ownGroup(t)?.isZenFolder;
      this.outOf(t);
      if (fromFolder && t.pinned) gBrowser.unpinTab(t);
    }
    this.remember(`Took ${tabs.length} out`, () => this.restore(before));
    return tabs.length;
  },

  // To another space, keeping what they are: pinned stays pinned, a tab
  // leaves its folder or group (which stays where it is), and a split view
  // moves whole.
  move(tabs, space) {
    tabs = tabs.filter(t => t.isConnected && !t.hasAttribute("zen-essential") && Look.space(t) !== space);
    if (!tabs.length || !window.gZenWorkspaces?.moveTabsToWorkspace) return 0;
    const all = [...new Set(tabs.flatMap(t => Look.splitOf(t)?.tabs ?? [t]))];
    const before = this.snapshot(all);
    for (const t of all) {
      const g = Look.ownGroup(t);
      if (g && g.getAttribute("zen-workspace-id") !== space) {
        const pinned = t.pinned;
        this.outOf(t);
        if (pinned && !t.pinned) gBrowser.pinTab(t);
      }
    }
    gZenWorkspaces.moveTabsToWorkspace(all, space);
    this.remember(`Moved ${all.length} to ${Look.spaceName(space)}`, () => this.restore(before));
    return all.length;
  },

  // A whole folder (or group) to another space.
  moveFolder(folder, space) {
    const from = folder.getAttribute("zen-workspace-id");
    if (!folder?.isConnected || from === space) return false;
    if (folder.isZenFolder && window.gZenFolders?.changeFolderToSpace) {
      gZenFolders.changeFolderToSpace(folder, space);
    } else {
      gZenWorkspaces.moveTabsToWorkspace(folder.tabs, space);
    }
    this.remember(`Moved ${folder.label || "a folder"}`, () => this.moveFolder(folder, from));
    return true;
  },

  // Into a folder or group: an existing one (in its space), or a new one,
  // "folder" (Zen's, pinned) or "group" (one that doesn't pin: a folder set
  // to act unpinned, or Firefox's group, as "Groups that don't pin" says).
  into(tabs, target) {
    tabs = tabs.filter(t => t.isConnected && !t.hasAttribute("zen-essential"));
    if (!tabs.length) return 0;
    const before = this.snapshot(tabs);
    const done = this.place(tabs, target);
    if (done) this.remember(`Put ${tabs.length} in ${target.folder?.label || target.name || "a folder"}`, () => this.restore(before));
    return done;
  },

  place(tabs, target) {
    if (target.folder) {
      const folder = target.folder, space = folder.getAttribute("zen-workspace-id");
      if (space) for (const t of tabs) if (Look.space(t) !== space) gZenWorkspaces.moveTabsToWorkspace([t], space);
      const firefoxGroup = !folder.isZenFolder;
      for (const t of tabs) if (firefoxGroup && t.pinned) gBrowser.unpinTab(t);
      folder.addTabs(tabs.filter(t => Look.ownGroup(t) !== folder));
      return tabs.length;
    }
    const space = target.space || Look.space(tabs[0]);
    for (const t of tabs) if (space && Look.space(t) !== space) gZenWorkspaces.moveTabsToWorkspace([t], space);
    const mode = window.ZenithGroups?.mode ?? "off";
    if (target.kind === "group" && mode === "firefox" && gBrowser.addTabGroup) {
      for (const t of tabs) {
        if (Look.ownGroup(t)) this.outOf(t);
        if (t.pinned) gBrowser.unpinTab(t);
      }
      gBrowser.addTabGroup(tabs, { label: target.name || "Group", insertBefore: tabs[0] });
      return tabs.length;
    }
    for (const t of tabs) if (Look.ownGroup(t)) this.outOf(t);
    return this.folder(target.name || "Folder", space, tabs, { unpinned: target.kind === "group" && mode === "folders" }) ? tabs.length : 0;
  },

  go(tab) {
    const space = Look.space(tab);
    const W = window.gZenWorkspaces;
    const switched = space && !tab.hasAttribute("zen-essential") && space !== W?.activeWorkspace ? W.changeWorkspaceWithID(space) : null;
    Promise.resolve(switched).then(() => (gBrowser.selectedTab = tab));
  },

  // Every folder and group in every space (Zen's folders, Firefox's groups;
  // not split views or live folders).
  folders() {
    const all = [...(window.gZenWorkspaces?.allTabGroups ?? []), ...document.querySelectorAll("zen-folder, tab-group")];
    return [...new Set(all)].filter(g => g.isConnected && !g.isLiveFolder && !g.hasAttribute("split-view-group"));
  },
};

/* --- Rules: grouping, sleeping, closing -------------------------------------------
   Nothing here runs until you set it up on the page.
   Grouping rules (zenith.internal.tabs.rules, a list): when a tab arrives
   at a page whose site is, address contains or title contains what a rule
   says (in any space, or one space), it goes into the rule's folder: the
   one it's linked to (wherever that is), or one with its name in the tab's
   space (made if needed), or an unpinned group. A tab already in a folder
   or group is left alone, and so is one you moved out after a rule put it
   in, until it goes to another site. */
const Rules = {
  PREF: "zenith.internal.tabs.rules",

  get list() {
    try {
      return JSON.parse(Services.prefs.getStringPref(this.PREF, "[]"));
    } catch {
      return [];
    }
  },

  save(list) {
    Services.prefs.setStringPref(this.PREF, JSON.stringify(list));
  },

  matches(rule, tab) {
    const value = (rule.value || "").trim().toLowerCase();
    if (!rule.on || !value) return false;
    if (rule.space && Look.space(tab) !== rule.space) return false;
    const uri = tab.linkedBrowser?.currentURI;
    if (!uri || !/^https?$/.test(uri.scheme)) return false;
    if (rule.match === "url") return uri.spec.toLowerCase().includes(value);
    if (rule.match === "title") return (tab.label || "").toLowerCase().includes(value);
    const host = uri.host.replace(/^www\./, "").toLowerCase();
    const site = value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    return host === site || host.endsWith(`.${site}`);
  },

  // The folder a rule points at, if it's there.
  folderOf(rule, tab) {
    const folders = Act.folders();
    if (rule.folder) {
      const linked = folders.find(f => f.id === rule.folder);
      if (linked) return linked;
    }
    // One with the rule's name in the tab's space, of the rule's kind: a
    // folder (pinned) or a group (a folder that doesn't pin, or Firefox's).
    const space = Look.space(tab);
    const loose = f => !f.isZenFolder || f.hasAttribute("zenith-unpinned");
    return folders.find(f => (f.label || "") === (rule.name || "") && f.getAttribute("zen-workspace-id") === space &&
                             (rule.kind === "group" ? loose(f) : !loose(f))) ?? null;
  },

  done: new WeakMap(), // tab → the site a rule last acted on

  apply(tab, rules = this.list) {
    if (!tab?.isConnected || tab.closing || Look.ownGroup(tab) || tab.hasAttribute("zen-essential") || tab.hasAttribute("zen-glance-tab") ||
        tab.hasAttribute("zen-empty-tab")) return false;
    const site = Look.site(tab);
    if (this.done.get(tab) === site) return false;
    const rule = rules.find(r => this.matches(r, tab));
    if (!rule) return false;
    this.done.set(tab, site);
    const folder = this.folderOf(rule, tab);
    const wasSelected = tab.selected;
    Act.place([tab], folder ? { folder } : { name: rule.name || site, kind: rule.kind === "group" ? "group" : "folder", space: Look.space(tab) });
    // A tab you were looking at goes with you to its new space.
    const space = Look.space(tab);
    if (wasSelected && space && space !== window.gZenWorkspaces?.activeWorkspace) Act.go(tab);
    return true;
  },

  applyAll() {
    const rules = this.list;
    let n = 0;
    for (const tab of Look.tabs()) if (this.apply(tab, rules)) n++;
    return n;
  },

  init() {
    // A tab's page changing (a link, a load) is when its rules are checked.
    this.listener = {
      onLocationChange: (browser, progress) => {
        if (!progress?.isTopLevel || !this.list.length) return;
        const tab = gBrowser.getTabForBrowser(browser);
        if (tab) setTimeout(() => this.apply(tab), 400);
      },
    };
    gBrowser.addTabsProgressListener(this.listener);
    window.addEventListener("unload", () => gBrowser.removeTabsProgressListener(this.listener), { once: true });
  },
};

/* --- Sleeping and closing on their own (only when set) ------------------------------
   zenith.plus.tabs-auto-sleep: minutes ("" never). Tabs you haven't been
   to for that long go to sleep (not the one you're on, nor ones playing
   or sharing your camera or screen).
   zenith.plus.tabs-auto-close: days ("" never). Loose tabs (not pinned, not
   essentials, not in a folder or group, not playing) you haven't been to
   for that long close; the page lists the last 50 to bring back. */
const Auto = {
  SLEEP: "zenith.plus.tabs-auto-sleep",
  CLOSE: "zenith.plus.tabs-auto-close",
  CLOSED: "zenith.internal.tabs.auto-closed",

  minutes(pref) {
    return parseInt(Services.prefs.getStringPref(pref, ""), 10) || 0;
  },

  busy(tab) {
    return tab.selected || tab.hasAttribute("soundplaying") || tab.hasAttribute("sharing") || tab.hasAttribute("busy");
  },

  sleep() {
    const m = this.minutes(this.SLEEP);
    if (!m) return 0;
    const now = Date.now();
    return Act.sleep(Look.tabs().filter(t => Look.awake(t) && !this.busy(t) && t.lastAccessed && now - t.lastAccessed > m * 60000));
  },

  close() {
    const d = this.minutes(this.CLOSE);
    if (!d) return 0;
    const now = Date.now();
    const tabs = Look.tabs().filter(t => !Look.kept(t) && !t.group && !this.busy(t) && t.lastAccessed && now - t.lastAccessed > d * DAY);
    if (!tabs.length) return 0;
    const record = tabs.map(t => ({ url: t.linkedBrowser.currentURI.spec, title: t.label, space: Look.space(t), at: now }));
    this.remember(record);
    gBrowser.removeTabs(tabs, { animate: false, suppressWarnAboutClosingWindow: true });
    return tabs.length;
  },

  get closedList() {
    try {
      return JSON.parse(Services.prefs.getStringPref(this.CLOSED, "[]"));
    } catch {
      return [];
    }
  },

  remember(items) {
    Services.prefs.setStringPref(this.CLOSED, JSON.stringify([...items, ...this.closedList].slice(0, 50)));
  },

  reopen(item) {
    const W = window.gZenWorkspaces;
    const tab = gBrowser.addTrustedTab(item.url, { inBackground: true });
    if (item.space && W?.getWorkspaceFromId?.(item.space)) W.moveTabToWorkspace(tab, item.space);
    Services.prefs.setStringPref(this.CLOSED, JSON.stringify(this.closedList.filter(i => !(i.url === item.url && i.at === item.at))));
    return tab;
  },

  init() {
    // Once a minute for sleeping, once an hour (and soon after starting)
    // for closing. Only the most recent window does it, so two windows
    // don't both act.
    const mine = () => Services.wm.getMostRecentWindow("navigator:browser") === window;
    const tick = setInterval(() => mine() && this.sleep(), 60000);
    const hourly = setInterval(() => mine() && this.close(), 3600000);
    const first = setTimeout(() => mine() && this.close(), 60000);
    window.addEventListener("unload", () => {
      clearInterval(tick);
      clearInterval(hourly);
      clearTimeout(first);
    }, { once: true });
  },
};

/* --- The page ----------------------------------------------------------------------- */

// about:zenith-tabs, a page from this mod (plus/pages/tab-manager.html).
const Page = {
  URL: "about:zenith-tabs",

  // (The page's text is read here, where the mod's folder is known: beside
  // the scripts in plus/pages with Sine, or in JS/zenith-pages with the
  // manual install.)
  async register() {
    try {
      const here = new URL(import.meta.url);
      let dir = null, text = null;
      for (const d of ["../pages/", "zenith-pages/"]) {
        const page = new URL(`${d}tab-manager.html`, here).href;
        text = await fetch(page).then(r => (r.ok ? r.text() : null)).catch(() => null);
        if (text) {
          dir = d;
          break;
        }
      }
      if (!text) throw new Error("plus/pages isn't there");
      const page = new URL(`${dir}tab-manager.html`, here).href;
      const about = ChromeUtils.importESModule(new URL(`${dir}about.sys.mjs`, here).href);
      about.register("zenith-tabs", page, text);
      return true;
    } catch (e) {
      console.error("[Zenith Tab manager] about:zenith-tabs", e);
      return false;
    }
  },

  // Go to the page if it's open in this space, else open it.
  async open() {
    if (!(await (this.ready ??= this.register()))) return;
    const tab = gBrowser.visibleTabs.find(t => t.linkedBrowser?.currentURI?.spec === this.URL);
    if (tab) gBrowser.selectedTab = tab;
    else openTrustedLinkIn(this.URL, "tab");
  },
};



/* --- The card ---------------------------------------------------------------------
   "Opens as: a card over the page" shows the same page (about:zenith-tabs,
   with ?compact) in a frosted card: one list by space, tidying folded away,
   the same actions. Esc or a click outside closes it. */
const Manager = {
  build() {
    this.host = make("div", { id: "zenith-tabs" });
    this.host.hidden = true;
    this.card = make("div", { id: "zenith-tabs-card" });
    this.frame = make("iframe", { id: "zenith-tabs-frame" });
    this.card.append(this.frame);
    this.host.append(this.card);
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(this.host);
    this.host.addEventListener("mousedown", e => {
      if (e.target === this.host) this.hide();
    });
  },

  get open() {
    return !!this.host && !this.host.hidden;
  },

  async show() {
    if (!(await (Page.ready ??= Page.register()))) return;
    if (!this.host) this.build();
    this.host.hidden = false;
    // A fresh look each time it opens.
    this.frame.src = "about:zenith-tabs?compact";
    this.frame.addEventListener("load", () => this.frame.contentWindow?.focus(), { once: true });
  },

  hide() {
    if (!this.host || this.host.hidden) return;
    this.host.hidden = true;
    this.frame.src = "about:blank";
    gBrowser.selectedBrowser.focus();
  },

  toggle() {
    if (this.open) this.hide();
    else this.show();
  },
};

/* --- The key -------------------------------------------------------------------- */

function addKeys() {
  const commandset = document.createXULElement("commandset");
  const command = document.createXULElement("command");
  command.id = "zenith-tabs-command";
  command.addEventListener("command", () => show());
  commandset.append(command);
  const keyset = document.createXULElement("keyset");
  keyset.id = "zenith-tabs-keys";
  const key = document.createXULElement("key");
  key.id = "zenith-tabs-key";
  key.setAttribute("modifiers", "alt,shift");
  key.setAttribute("key", "T");
  key.setAttribute("reserved", "true");
  key.setAttribute("command", "zenith-tabs-command");
  keyset.append(key);
  document.documentElement.append(commandset, keyset);
  const watch = () => {
    const on = Services.prefs.getBoolPref(PREF, true);
    key.toggleAttribute("disabled", !on);
    if (!on) Manager.hide();
  };
  Services.prefs.addObserver(PREF, watch);
  window.addEventListener("unload", () => Services.prefs.removeObserver(PREF, watch), { once: true });
  watch();
  // The switcher's :tabs, the page, and tools/checks.
  window.ZenithTabs = { show, hide: () => Manager.hide(), Manager, Look, Act, Rules, Auto, Page };
}

// The page (the default) or the card over the page.
function show() {
  if (Services.prefs.getStringPref(VIEW_PREF, "") === "card") Manager.toggle();
  else Page.open();
}

start("hotkey", addKeys);
start("about page", () => (Page.ready = Page.register()));
start("rules", () => Rules.init());
start("sleep and close on their own", () => Auto.init());
