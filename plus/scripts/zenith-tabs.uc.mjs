// ==UserScript==
// @name           Zenith Tab manager
// @description    Zenith Plus: see every tab at a glance and tidy up: duplicates, tabs you haven't used, awake tabs, busy sites.
// @include        main
// @version        0.11.0
// ==/UserScript==

// The tab manager (the "tab report" in DESIGN.md): Alt+Shift+T, or ":tabs"
// in the switcher, opens a frosted card over the page with
//   - every space: how many tabs, how many awake;
//   - duplicates: the same page open more than once;
//   - tabs you haven't used for a few days (3, 7, 14 or 30);
//   - tabs that are awake (using memory) besides the one you're on;
//   - busy sites: one site with many loose tabs, which could be a folder.
// Nothing happens on its own: each suggestion lists its tabs, ticked, and
// you untick any you want to keep before pressing its button. Closed tabs
// come back with Undo (or Zen's own reopen closed tabs). Essentials and
// pinned tabs are never closed, only put to sleep if you ask.
// Settings: Zenith › Keys. Styles: plus/chrome.css.

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
                                         !t.hasAttribute("zen-glance-tab") && t.linkedBrowser?.currentURI?.spec !== "about:blank");
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
  command.addEventListener("command", () => Manager.toggle());
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
  window.ZenithTabs = Manager; // the switcher's :tabs, and tools/checks
  Manager.Look = Look;
  Manager.Act = Act;
}

start("hotkey", addKeys);
