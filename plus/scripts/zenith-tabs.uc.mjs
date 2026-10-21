// ==UserScript==
// @name           Zenith Tab manager
// @description    Zenith Plus: every tab of every space on one page (about:zenith-tabs), tidying up, and rules for grouping, sleeping and closing.
// @include        main
// @version        0.12.13
// ==/UserScript==

// The tab manager (the "tab report" in DESIGN.md). Alt+Shift+T, or ":tabs"
// in the switcher, opens about:zenith-tabs:
//   - all tabs: where the memory and CPU go, and every tab in a table to
//     sort and filter;
//   - every space as a column of its tabs (essentials, pinned and folders
//     first), to pick tabs and move them to a space, into a folder, put them
//     to sleep, wake them or close them (with Undo); drag to move;
//   - tidying up: duplicates, tabs not used for days, awake tabs, busy
//     sites, by topic; each picks its tabs for you to look over first;
//   - rules, which act on their own only once you set them:
//       grouping   a site, address or title goes into a folder (an existing
//                  one you link it to, or one it makes, pinned or not)
//       sleep      tabs you haven't used for a while go to sleep
//       close      loose tabs you haven't used for days close (listed on
//                  the page to bring back)
// The page lives in plus/pages; this script is what keeps running in the
// window: the rules, the timers, and what the page asks it to do.
// Settings: Zenith › Keys. Styles: plus/pages/tab-manager.css.

const HTML_NS = "http://www.w3.org/1999/xhtml";

const FIRST = !window.zenithTabsStarted;
window.zenithTabsStarted = true;

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
    fn();
  } catch (e) {
    console.error(`[Zenith Tab manager] ${name} failed to start`, e);
  }
  // How long each part took to start, for tools/bench_startup.py.
  (window.zenithStartup ??= []).push({ script: "tabs", name, at: Math.round(t0), ms: +(performance.now() - t0).toFixed(1) });
}

function make(tag, attrs = {}, text = "") {
  const node = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

const PREF = "zenith.plus.tab-manager";
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
                                         t.linkedBrowser?.currentURI?.spec !== "about:blank");
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
    // Zen keeps essentials per container ("separate essentials", on by
    // default): one shows in the spaces whose container is its own.
    const separate = window.gZenWorkspaces?.containerSpecificEssentials ?? Services.prefs.getBoolPref("zen.workspaces.separate-essentials", false);
    if (!separate) return all;
    const c = parseInt(tab.getAttribute("usercontextid") || "0", 10);
    return all.filter(s => (s.containerTabId || 0) === c);
  },

  // Memory and CPU per awake tab, from Firefox's process list: a process
  // shared by several tabs (the same site) is shared out between them; CPU
  // is the share of one core since the last call. Memory as the system
  // counts it (on Windows, Task Manager's: the private working set; what
  // Firefox reports there is the commit charge, often twice as much).
  // The map's `all` is every process of Zen's together.
  lastCpu: new Map(),
  async usage() {
    const info = await ChromeUtils.requestProcInfo();
    const now = performance.now();
    const own = this.privateSet();
    const memOf = p => (own && own(p.pid)) ?? p.memory ?? 0;
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
      out.set(t, { memory: memOf(proc) / n, cpu: cpuOf.has(proc.pid) ? cpuOf.get(proc.pid) / n : null, shared: n > 1 });
    }
    out.all = [info, ...(info.children ?? [])].reduce((total, p) => total + memOf(p), 0);
    return out;
  },

  // Windows: a process's private working set, by its pid (null if it can't
  // be read); elsewhere none (Firefox's own number is used).
  privateSet() {
    if (this.pws !== undefined) return this.pws;
    this.pws = null;
    if (Services.appinfo.OS !== "WINNT") return null;
    try {
      const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
      const k32 = ctypes.open("kernel32.dll");
      const DW = ctypes.uint32_t, SZ = ctypes.size_t;
      const Counters = new ctypes.StructType("PROCESS_MEMORY_COUNTERS_EX2", [
        { cb: DW }, { PageFaultCount: DW }, { PeakWorkingSetSize: SZ }, { WorkingSetSize: SZ }, { QuotaPeakPagedPoolUsage: SZ },
        { QuotaPagedPoolUsage: SZ }, { QuotaPeakNonPagedPoolUsage: SZ }, { QuotaNonPagedPoolUsage: SZ }, { PagefileUsage: SZ },
        { PeakPagefileUsage: SZ }, { PrivateUsage: SZ }, { PrivateWorkingSetSize: ctypes.uint64_t }, { SharedCommitUsage: ctypes.uint64_t }]);
      const open = k32.declare("OpenProcess", ctypes.winapi_abi, ctypes.voidptr_t, DW, ctypes.int32_t, DW);
      const close = k32.declare("CloseHandle", ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t);
      const read = k32.declare("K32GetProcessMemoryInfo", ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t, Counters.ptr, DW);
      window.addEventListener("unload", () => k32.close(), { once: true });
      this.pws = pid => {
        const h = open(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, 0, pid);
        if (h.isNull()) return null;
        try {
          const c = new Counters();
          c.cb = Counters.size;
          return read(h, c.address(), Counters.size) ? Number(c.PrivateWorkingSetSize.toString()) : null;
        } finally {
          close(h);
        }
      };
    } catch (e) {
      console.error("[Zenith Tab manager] memory as Windows counts it", e);
    }
    return this.pws;
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
  history: [], // what Undo puts back, newest last: { label, at, undo }

  remember(label, undo) {
    this.history.push({ label, at: Date.now(), undo });
    if (this.history.length > 30) this.history.shift();
  },

  // Undo the last thing done here (close, move, folder, sleep…): its label
  // and how many tabs it actually put back (none when they'd already gone
  // back another way, or are gone).
  undoLast() {
    const last = this.history.pop();
    if (!last) return null;
    let n = 0;
    try {
      const r = last.undo();
      n = typeof r === "number" ? r : r ? 1 : 0;
    } catch (e) {
      console.error("[Zenith Tab manager] undo", e);
    }
    return { label: last.label, n };
  },

  // Undo back to (and including) an entry of the history, newest first.
  undoTo(index) {
    const done = [];
    while (this.history.length > index) done.push(this.undoLast());
    return done;
  },

  // Where tabs are, to put them back: space, pinned, folder or group.
  snapshot(tabs) {
    return tabs.map(tab => ({ tab, space: Look.space(tab), pinned: tab.pinned, group: Look.ownGroup(tab) }));
  },

  // (How many tabs it changed.)
  restore(states) {
    let n = 0;
    for (const s of states) {
      const tab = s.tab;
      if (!tab.isConnected || tab.hasAttribute("zen-essential")) continue;
      if (Look.space(tab) === s.space && tab.pinned === s.pinned && Look.ownGroup(tab) === s.group) continue;
      n++;
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
    return n;
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
    let done = 0;
    for (let i = 0; i < n; i++) {
      try {
        if ((SessionStore.getClosedTabCountForWindow?.(window) ?? 1) === 0) break;
        if (SessionStore.undoCloseTab(window, 0)) done++;
      } catch (e) {
        console.error("[Zenith Tab manager] reopen", e);
        break;
      }
    }
    if (stay?.isConnected) gBrowser.selectedTab = stay;
    return done;
  },

  undo() {
    const n = this.closed;
    this.closed = 0;
    return this.reopen(n);
  },

  // Asleep; from the page, Undo wakes them (rules and auto-sleep don't
  // remember).
  sleep(tabs, remember = false) {
    tabs = tabs.filter(t => t.isConnected && !t.selected && Look.awake(t));
    if (!tabs.length) return 0;
    // Zen's own pages (Settings, this manager) run in the browser itself,
    // which Firefox won't unload the usual way: they're reset to a sleeping
    // tab where they are (same tab, space and folder).
    const own = tabs.filter(t => !t.linkedBrowser?.isRemoteBrowser);
    const web = tabs.filter(t => !own.includes(t));
    if (web.length) {
      if (typeof gBrowser.explicitUnloadTabs === "function") gBrowser.explicitUnloadTabs(web);
      else for (const t of web) gBrowser.discardBrowser(t, true);
    }
    for (const t of own) {
      try {
        SessionStore.resetBrowserToLazyState(t);
      } catch (e) {
        console.error("[Zenith Tab manager] sleeping a page of Zen's", e);
      }
    }
    const asleep = tabs;
    if (remember) this.remember(`Put ${tabs.length} to sleep`, () => this.wake(asleep));
    return tabs.length;
  },

  wake(tabs, remember = false) {
    tabs = tabs.filter(t => t.isConnected && !Look.awake(t));
    for (const t of tabs) {
      try {
        gBrowser.getBrowserForTab(t)?.reload?.();
        if (t.hasAttribute("pending")) SessionStore.restoreTabContent?.(t) ?? gBrowser._insertBrowser?.(t);
      } catch {}
    }
    if (remember && tabs.length) this.remember(`Woke ${tabs.length}`, () => this.sleep(tabs));
    return tabs.length;
  },

  // A new folder: Zen's (its tabs pinned), or one that doesn't pin.
  folder(name, space, tabs, { unpinned = false } = {}) {
    if (!window.gZenFolders?.createFolder || !tabs.length) return null;
    const folder = gZenFolders.createFolder(tabs, { label: name, workspaceId: space || undefined, collapsed: false });
    if (unpinned && folder) window.ZenithGroups?.setUnpinned(folder, true);
    this.made = folder;
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
  // "folder" (Zen's, pinned) or "group" (a folder whose tabs act unpinned).
  // Undo puts the tabs back, and takes away a folder it made.
  into(tabs, target) {
    const essentials = tabs.filter(t => t.hasAttribute("zen-essential")).length;
    if (essentials) this.note = `${essentials === 1 ? "An essential stays" : `${essentials} essentials stay`} where ${essentials === 1 ? "it is" : "they are"}: essentials don't go into folders`;
    tabs = tabs.filter(t => t.isConnected && !t.hasAttribute("zen-essential"));
    if (!tabs.length) return 0;
    const before = this.snapshot(tabs);
    this.made = null;
    const done = this.place(tabs, target);
    const made = target.folder ? null : this.made;
    if (done) {
      this.remember(`Put ${tabs.length} in ${target.folder?.label || target.name || "a folder"}`, () => {
        const n = this.restore(before);
        if (made?.isConnected && ![...(made.tabs ?? [])].some(t => !t.hasAttribute("zen-empty-tab"))) made.delete?.();
        return n;
      });
    }
    return done;
  },

  place(tabs, target) {
    if (target.folder) {
      const folder = target.folder, space = folder.getAttribute("zen-workspace-id");
      if (space) for (const t of tabs) if (Look.space(t) !== space) gZenWorkspaces.moveTabsToWorkspace([t], space);
      folder.addTabs(tabs.filter(t => Look.ownGroup(t) !== folder));
      return tabs.length;
    }
    const space = target.space || Look.space(tabs[0]);
    for (const t of tabs) if (space && Look.space(t) !== space) gZenWorkspaces.moveTabsToWorkspace([t], space);
    for (const t of tabs) if (Look.ownGroup(t)) this.outOf(t);
    const unpinned = target.kind === "group" && window.ZenithGroups?.mode === "folders";
    return this.folder(target.name || "Folder", space, tabs, { unpinned }) ? tabs.length : 0;
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
   one it's linked to (wherever that is), or one with its name (or the
   site's) in the tab's space, made if needed (again if you deleted it),
   pinned or not as the rule says. A tab already in a folder is left alone,
   and so is one you moved out after a rule put it in, until it goes to
   another site. */
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
    // folder (pinned) or a group (a folder whose tabs act unpinned).
    const space = Look.space(tab);
    const loose = f => f.hasAttribute("zenith-unpinned");
    // (A rule without a name makes its folder with the site's.)
    const name = rule.name || Look.site(tab);
    return folders.find(f => (f.label || "") === name && f.getAttribute("zen-workspace-id") === space &&
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
  // Registered at once (its text read there and then), so a tab restored
  // at startup never meets an unknown page; one that did is reloaded.
  register() {
    const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
    const read = url => {
      const stream = NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true }).open();
      try {
        return NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" });
      } finally {
        stream.close();
      }
    };
    for (const d of ["../pages/", "zenith-pages/"]) {
      try {
        const page = new URL(`${d}tab-manager.html`, import.meta.url).href;
        const text = read(page);
        const about = ChromeUtils.importESModule(new URL(`${d}about.sys.mjs`, import.meta.url).href);
        about.register("zenith-tabs", page, text);
        about.revive("zenith-tabs");
        // (Again once the session is back, for a tab restored meanwhile.)
        SessionStore.promiseAllWindowsRestored?.then(() => about.revive("zenith-tabs"));
        return true;
      } catch {}
    }
    console.error("[Zenith Tab manager] about:zenith-tabs: plus/pages isn't there");
    return false;
  },

  // Go to the page if it's open in this space, else open it.
  open() {
    if (!(this.ready ??= this.register())) return;
    const tab = gBrowser.visibleTabs.find(t => t.linkedBrowser?.currentURI?.spec === this.URL);
    if (tab) gBrowser.selectedTab = tab;
    else openTrustedLinkIn(this.URL, "tab");
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
  };
  Services.prefs.addObserver(PREF, watch);
  window.addEventListener("unload", () => Services.prefs.removeObserver(PREF, watch), { once: true });
  watch();
  // The switcher's :tabs, the page, and tools/checks.
  window.ZenithTabs = { show, Look, Act, Rules, Auto, Page };
}

// The page. (0.11.2's card over the page was taken out in 0.12.1: the
// manager outgrew it.)
function show() {
  // Fast start: the rules and the rest start now if they haven't yet.
  window.zenithLater?.now();
  Page.open();
}

start("hotkey", addKeys, true);
start("about page", () => (Page.ready = Page.register()), true);
start("rules", () => Rules.init());
start("sleep and close on their own", () => Auto.init());
