// ==UserScript==
// @name           Zenith Tab manager
// @description    Zenith Plus: every tab of every space on one page (about:zenith-tabs), tidying up, and rules for grouping, sleeping and closing.
// @include        main
// @version        0.11.1
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
  closed: 0, // how many tabs the last close took, for Undo

  close(tabs) {
    tabs = tabs.filter(t => t.isConnected && !Look.kept(t));
    if (!tabs.length) return 0;
    gBrowser.removeTabs(tabs, { animate: false, suppressWarnAboutClosingWindow: true });
    this.closed = tabs.length;
    return tabs.length;
  },

  undo() {
    const n = this.closed;
    this.closed = 0;
    for (let i = 0; i < n; i++) {
      try {
        SessionStore.undoCloseTab(window, 0);
      } catch (e) {
        console.error("[Zenith Tab manager] undo", e);
        break;
      }
    }
    return n;
  },

  sleep(tabs) {
    tabs = tabs.filter(t => t.isConnected && !t.selected && Look.awake(t));
    if (!tabs.length) return 0;
    if (typeof gBrowser.explicitUnloadTabs === "function") gBrowser.explicitUnloadTabs(tabs);
    else for (const t of tabs) gBrowser.discardBrowser(t, true);
    return tabs.length;
  },

  folder(site, space, tabs) {
    if (!window.gZenFolders?.createFolder || !tabs.length) return 0;
    gZenFolders.createFolder(tabs, { label: site, workspaceId: space || undefined, collapsed: true });
    return tabs.length;
  },

  // Closing what you picked on the page: anything but essentials.
  closePicked(tabs) {
    tabs = tabs.filter(t => t.isConnected && !t.hasAttribute("zen-essential"));
    if (!tabs.length) return 0;
    gBrowser.removeTabs(tabs, { animate: false, suppressWarnAboutClosingWindow: true });
    this.closed = tabs.length;
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

  move(tabs, space) {
    tabs = tabs.filter(t => t.isConnected && !t.hasAttribute("zen-essential") && Look.space(t) !== space);
    if (!tabs.length || !window.gZenWorkspaces?.moveTabsToWorkspace) return 0;
    gZenWorkspaces.moveTabsToWorkspace(tabs, space);
    return tabs.length;
  },

  // Into a folder: an existing one (Zen's or a group), in its space, or a
  // new one in the first tab's space.
  into(tabs, target) {
    tabs = tabs.filter(t => t.isConnected && !t.hasAttribute("zen-essential"));
    if (!tabs.length) return 0;
    if (target.folder) {
      const folder = target.folder, space = folder.getAttribute("zen-workspace-id");
      if (space) this.move(tabs, space);
      folder.addTabs(tabs.filter(t => t.group !== folder));
      return tabs.length;
    }
    const space = target.space || Look.space(tabs[0]);
    if (space) this.move(tabs, space);
    if (target.group && gBrowser.addTabGroup && Services.prefs.getBoolPref("browser.tabs.groups.enabled", false)) {
      gBrowser.addTabGroup(tabs, { label: target.name || "Group", insertBefore: tabs[0] });
      return tabs.length;
    }
    return this.folder(target.name || "Folder", space, tabs);
  },

  go(tab) {
    const space = Look.space(tab);
    const W = window.gZenWorkspaces;
    const switched = space && !tab.hasAttribute("zen-essential") && space !== W?.activeWorkspace ? W.changeWorkspaceWithID(space) : null;
    Promise.resolve(switched).then(() => (gBrowser.selectedTab = tab));
  },

  // Every folder and group, for "into a folder" lists: Zen's folders (and
  // groups, when they're on), with the space they're in.
  folders() {
    const all = window.gZenWorkspaces?.allTabGroups ?? gBrowser.tabGroups ?? [];
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
    const space = Look.space(tab);
    return folders.find(f => (f.label || "") === (rule.name || "") && f.getAttribute("zen-workspace-id") === space &&
                             (rule.kind === "group" ? !f.isZenFolder : f.isZenFolder)) ?? null;
  },

  done: new WeakMap(), // tab → the site a rule last acted on

  apply(tab, rules = this.list) {
    if (!tab?.isConnected || tab.closing || tab.group || tab.hasAttribute("zen-essential") || tab.hasAttribute("zen-glance-tab") ||
        tab.hasAttribute("zen-empty-tab")) return false;
    const site = Look.site(tab);
    if (this.done.get(tab) === site) return false;
    const rule = rules.find(r => this.matches(r, tab));
    if (!rule) return false;
    this.done.set(tab, site);
    const folder = this.folderOf(rule, tab);
    const wasSelected = tab.selected;
    Act.into([tab], folder ? { folder } : { name: rule.name || site, group: rule.kind === "group", space: Look.space(tab) });
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



/* --- The card ---------------------------------------------------------------------- */

const Manager = {
  build() {
    this.host = make("div", { id: "zenith-tabs" });
    this.host.hidden = true;
    this.card = make("div", { id: "zenith-tabs-card", tabindex: "-1" });
    this.host.append(this.card);
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(this.host);
    this.host.addEventListener("mousedown", e => {
      if (e.target === this.host) this.hide();
    });
    this.card.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.hide();
      }
    });
  },

  get open() {
    return !!this.host && !this.host.hidden;
  },

  show() {
    if (!this.host) this.build();
    this.host.hidden = false;
    this.render();
    this.card.focus();
  },

  hide() {
    if (this.host) this.host.hidden = true;
  },

  toggle() {
    if (this.open) this.hide();
    else this.show();
  },

  get days() {
    return Services.prefs.getIntPref(DAYS_PREF, 7);
  },

  // A short note at the foot ("Closed 3 tabs"), with Undo after closing.
  say(text, undo = false) {
    this.note = { text, undo };
    this.render();
  },

  render() {
    const r = Look.report(this.days);
    this.report = r;
    const awakeCount = r.tabs.filter(t => Look.awake(t)).length;
    const head = make("div", { class: "zth-tm-head" });
    head.append(make("h2", {}, "Tabs"),
                make("span", { class: "zth-tm-sum" },
                     `${r.tabs.length} tab${r.tabs.length === 1 ? "" : "s"} · ${awakeCount} awake · ${r.spaces.length || 1} space${r.spaces.length === 1 ? "" : "s"}`));
    const close = make("button", { class: "zth-tm-x", type: "button", title: "Close (Esc)" }, "×");
    close.addEventListener("click", () => this.hide());
    head.append(close);
    const body = make("div", { class: "zth-tm-body" });

    // Spaces
    if (r.spaces.length) {
      const list = make("div", { class: "zth-tm-spaces" });
      for (const s of r.spaces) {
        const chip = make("button", { class: "zth-tm-space", type: "button" });
        chip.append(make("span", { class: "zth-tm-space-name" }, s.space.name || "Space"),
                    make("span", { class: "zth-tm-space-n" }, `${s.count} · ${s.awake} awake`));
        if (s.space.uuid === gZenWorkspaces.activeWorkspace) chip.setAttribute("here", "true");
        chip.addEventListener("click", () => {
          this.hide();
          gZenWorkspaces.changeWorkspaceWithID(s.space.uuid);
        });
        list.append(chip);
      }
      if (r.essentials) list.append(make("span", { class: "zth-tm-ess" }, `${r.essentials} essential${r.essentials === 1 ? "" : "s"}`));
      body.append(list);
    }

    body.append(this.section("dupes", "Duplicates", "The same page open more than once. The one you used last stays.",
                             r.duplicates, [["Close them", tabs => this.say(`Closed ${Act.close(tabs)} duplicate${tabs.length === 1 ? "" : "s"}`, true)]]));
    const stale = this.section("stale", `Not used in ${this.days} days`, "Tabs you haven't been to for a while.",
                               r.stale, [["Put to sleep", tabs => this.say(`Put ${Act.sleep(tabs)} to sleep`)],
                                         ["Close them", tabs => this.say(`Closed ${Act.close(tabs)} tab${tabs.length === 1 ? "" : "s"}`, true)]]);
    const choose = make("span", { class: "zth-tm-days" });
    for (const d of [3, 7, 14, 30]) {
      const b = make("button", { type: "button" }, `${d}d`);
      if (d === this.days) b.setAttribute("selected", "true");
      b.addEventListener("click", () => {
        Services.prefs.setIntPref(DAYS_PREF, d);
        this.render();
      });
      choose.append(b);
    }
    stale.querySelector(".zth-tm-section-head").append(choose);
    body.append(stale);
    body.append(this.section("awake", "Awake", "Loaded and using memory, besides the tab you're on (playing tabs stay awake).",
                             r.awake, [["Put to sleep", tabs => this.say(`Put ${Act.sleep(tabs)} to sleep`)]]));

    // Busy sites
    const busy = make("section", { class: "zth-tm-section", "data-kind": "busy" });
    const bhead = make("div", { class: "zth-tm-section-head" });
    bhead.append(make("h3", {}, "Busy sites"), make("span", { class: "zth-tm-count" }, String(r.busy.length)));
    busy.append(bhead, make("p", { class: "zth-tm-why" }, `One site with ${BUSY} or more loose tabs in a space: a folder keeps them together.`));
    if (!r.busy.length) busy.append(make("p", { class: "zth-tm-none" }, "None"));
    for (const b of r.busy) {
      const row = make("div", { class: "zth-tm-busy" });
      row.append(make("span", { class: "zth-tm-title" }, b.site),
                 make("span", { class: "zth-tm-site" }, `${b.tabs.length} tabs${Look.spaceName(b.space) ? ` · ${Look.spaceName(b.space)}` : ""}`));
      const go = make("button", { type: "button", class: "zth-tm-act" }, "Make a folder");
      go.addEventListener("click", () => this.say(`Put ${Act.folder(b.site, b.space, b.tabs)} tabs in a folder “${b.site}”`));
      if (!window.gZenFolders?.createFolder) go.disabled = true;
      row.append(go);
      busy.append(row);
    }
    body.append(busy);

    const foot = make("div", { class: "zth-tm-foot" });
    if (this.note) {
      foot.append(make("span", {}, this.note.text));
      if (this.note.undo && Act.closed) {
        const undo = make("button", { type: "button", class: "zth-tm-act" }, "Undo");
        undo.addEventListener("click", () => {
          const n = Act.undo();
          this.say(`Reopened ${n} tab${n === 1 ? "" : "s"}`);
        });
        foot.append(undo);
      }
      this.note = null;
    } else {
      foot.append(make("span", {}, "Untick what you want to keep, then press a button. Esc closes."));
    }
    this.card.replaceChildren(head, body, foot);
  },

  // A suggestion: its tabs, ticked, and its buttons (each acts on the
  // ticked ones).
  section(kind, title, why, tabs, actions) {
    const box = make("section", { class: "zth-tm-section", "data-kind": kind });
    const head = make("div", { class: "zth-tm-section-head" });
    head.append(make("h3", {}, title), make("span", { class: "zth-tm-count" }, String(tabs.length)));
    box.append(head, make("p", { class: "zth-tm-why" }, why));
    if (!tabs.length) {
      box.append(make("p", { class: "zth-tm-none" }, "None"));
      return box;
    }
    const list = make("div", { class: "zth-tm-list" });
    const ticks = [];
    const now = Date.now();
    for (const t of tabs.slice(0, 50)) {
      const row = make("label", { class: "zth-tm-row" });
      const tick = make("input", { type: "checkbox", checked: "checked" });
      ticks.push([tick, t]);
      const icon = make("span", { class: "zth-tm-icon" });
      const img = t.getAttribute("image");
      if (img) icon.append(make("img", { src: img, alt: "" }));
      const text = make("span", { class: "zth-tm-text" });
      text.append(make("span", { class: "zth-tm-title" }, t.label || Look.site(t)));
      const where = [Look.site(t), Look.space(t) !== gZenWorkspaces?.activeWorkspace ? Look.spaceName(Look.space(t)) : "",
                     kind === "stale" ? `${Math.floor((now - t.lastAccessed) / DAY)} days ago` : ""].filter(Boolean).join(" · ");
      text.append(make("span", { class: "zth-tm-site" }, where));
      row.append(tick, icon, text);
      list.append(row);
    }
    if (tabs.length > 50) list.append(make("p", { class: "zth-tm-none" }, `and ${tabs.length - 50} more (they're included)`));
    box.append(list);
    const buttons = make("div", { class: "zth-tm-actions" });
    for (const [label, fn] of actions) {
      const b = make("button", { type: "button", class: "zth-tm-act" }, label);
      b.addEventListener("click", () => {
        const chosen = ticks.filter(([tick]) => tick.checked).map(([, t]) => t).concat(tabs.slice(50));
        if (chosen.length) fn(chosen);
      });
      buttons.append(b);
    }
    box.append(buttons);
    return box;
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
