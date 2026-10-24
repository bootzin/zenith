// ==UserScript==
// @name           Zenith Switcher
// @description    Zenith Plus: jump to any tab, folder or space by typing (Alt+W); ":" runs Zenith's commands.
// @include        main
// @version        0.16.2
// ==/UserScript==
// SPDX-License-Identifier: GPL-3.0-or-later

// A rofi-style list over the page. Alt+W opens it; type a few letters of a
// tab's title or site, a folder's name or a space's name (in any order, with
// gaps: "gh zen" finds "GitHub · zen-browser"), then Enter goes there,
// switching space if it has to. With nothing typed, the tabs you used last
// come first. ":" lists Zenith's commands (":focus", ":timer 10m tea",
// ":set frost"…). Arrows or Ctrl+N/P choose, Escape closes.
// Settings: Zenith › Keys. Styles: plus/chrome.css.

const HTML_NS = "http://www.w3.org/1999/xhtml";

// Start once per window, even if two copies of Zenith are installed for a
// moment.
const FIRST = !window.zenithSwitcherStarted;
window.zenithSwitcherStarted = true;

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
    console.error(`[Zenith Switcher] ${name} failed to start`, e);
  }
  // How long each part took to start, for tools/bench_startup.py.
  (window.zenithStartup ??= []).push({ script: "switcher", name, at: Math.round(t0), ms: +(performance.now() - t0).toFixed(1) });
}

function make(tag, attrs = {}, text = "") {
  const node = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

const PREF = "zenith.plus.switcher";
const SCOPE = "zenith.plus.switcher-scope"; // "" every space, "here" this space only
const MAX = 9;

/* --- Matching ---------------------------------------------------------------- */

// How well a word matches a text: every letter in order, gaps allowed;
// letters in a row and at the start of words count more. -1: no match.
function score(word, text) {
  const t = text.toLowerCase();
  let at = 0, total = 0, run = 0, first = -1;
  for (const ch of word) {
    const i = t.indexOf(ch, at);
    if (i < 0) return -1;
    if (first < 0) first = i;
    run = i === at && at > 0 ? run + 1 : 0;
    const wordStart = i === 0 || /[\s\-_./:·|]/.test(t[i - 1]);
    total += 1 + run * 2 + (wordStart ? 3 : 0);
    at = i + 1;
  }
  return total - first * 0.05;
}

// Every word must match the item's name, or (counting less) its details.
function rank(words, item) {
  let total = 0;
  for (const w of words) {
    const best = Math.max(score(w, item.title), score(w, item.sub) * 0.6, score(w, item.space ?? "") * 0.5);
    if (best < 0) return -1;
    total += best;
  }
  return total;
}

/* --- What can be found --------------------------------------------------------- */

const Items = {
  spaces() {
    try {
      return gZenWorkspaces.workspaceEnabled ? gZenWorkspaces.getWorkspaces() ?? [] : [];
    } catch {
      return [];
    }
  },

  spaceName(id) {
    return this.spaces().find(s => s.uuid === id)?.name ?? "";
  },

  // Where a tab is, short enough to read: the site for web pages, the
  // file's name, "about:config", never a whole address.
  site(tab) {
    const uri = tab.linkedBrowser?.currentURI;
    if (!uri || uri.spec === "about:blank") return "";
    try {
      if (/^https?$/.test(uri.scheme)) return uri.host.replace(/^www\./, "");
      if (uri.scheme === "file") return decodeURIComponent(uri.spec.split(/[\\/]/).filter(Boolean).pop() ?? "File");
      if (uri.scheme === "about") return uri.spec.split(/[?#]/)[0];
      if (uri.scheme === "moz-extension") return "Extension page";
      if (/^(data|blob|javascript)$/.test(uri.scheme)) return uri.scheme;
      return uri.host || uri.scheme;
    } catch {
      return uri.scheme;
    }
  },

  // Every tab, in every space: Zen keeps other spaces' tabs out of
  // gBrowser.tabs. With "This space only", just this space's (and the
  // essentials).
  tabs() {
    const all = window.gZenWorkspaces?.allStoredTabs ?? gBrowser.tabs;
    const here = Services.prefs.getStringPref(SCOPE, "") === "here";
    return [...new Set(all)].filter(tab => !here || (window.ZenithSpaceTabs?.shows(tab) ?? true));
  },

  folders() {
    const all = window.gZenWorkspaces?.allTabGroups ?? gBrowser.tabGroups ?? [...document.querySelectorAll("zen-folder, tab-group")];
    const active = gZenWorkspaces?.activeWorkspace;
    const here = Services.prefs.getStringPref(SCOPE, "") === "here";
    return [...new Set(all)].filter(f => !here || !f.getAttribute("zen-workspace-id") || f.getAttribute("zen-workspace-id") === active);
  },

  all() {
    const active = gZenWorkspaces?.activeWorkspace;
    const out = [];
    for (const tab of this.tabs()) {
      if (!tab.isConnected || tab.hasAttribute("zen-empty-tab") || tab.hasAttribute("zen-glance-tab") || tab.closing) continue;
      // (Another space's tab, or an essential of another container: that
      // space's name beside it.)
      const home = window.ZenithSpaceTabs?.home(tab);
      const site = this.site(tab);
      // A page without a title shows its address as one: the site reads better.
      const untitled = !tab.label || /^[a-z-]+:\/\//i.test(tab.label);
      out.push({
        kind: "tab", tab, title: untitled ? site || "New tab" : tab.label, sub: untitled ? "" : site,
        space: home ? home.name || this.spaceName(home.uuid) : "", icon: tab.getAttribute("image") || "",
        recent: tab.lastAccessed || 0, current: tab.selected,
      });
    }
    for (const folder of this.folders()) {
      const space = folder.getAttribute("zen-workspace-id");
      const count = folder.tabs?.length ?? 0;
      out.push({
        kind: "folder", folder, title: folder.label || "Folder", sub: `Folder · ${count} tab${count === 1 ? "" : "s"}`,
        space: space && space !== active ? this.spaceName(space) : "", recent: 0,
      });
    }
    for (const space of this.spaces()) {
      out.push({ kind: "space", space: "", ws: space, title: space.name, sub: space.uuid === active ? "Space · here" : "Space",
                 icon: space.icon || "", recent: 0, current: space.uuid === active });
    }
    return out;
  },

  find(query) {
    const all = this.all();
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) {
      // The tabs you used last (not this one), then the other spaces.
      const tabs = all.filter(i => i.kind === "tab" && !i.current).sort((a, b) => b.recent - a.recent);
      return [...tabs.slice(0, MAX - 2), ...all.filter(i => i.kind === "space" && !i.current)].slice(0, MAX);
    }
    return all.map(i => [rank(words, i) - (i.current ? 2 : 0), i]).filter(([s]) => s >= 0)
      .sort((a, b) => b[0] - a[0] || b[1].recent - a[1].recent).slice(0, MAX).map(([, i]) => i);
  },

  async go(item) {
    const W = window.gZenWorkspaces;
    const target = item.kind === "tab" ? item.tab.getAttribute("zen-workspace-id")
      : item.kind === "folder" ? item.folder.getAttribute("zen-workspace-id")
      : item.ws.uuid;
    if (item.kind === "tab") {
      // (Its space first, an essential's too: Zen undoes a tab selected
      // where it doesn't show. A tab with a glance open: its glance, as a
      // click on it would.)
      if (window.ZenithSpaceTabs) await window.ZenithSpaceTabs.go(item.tab);
      else if (W?.workspaceEnabled && target && target !== W.activeWorkspace) await W.changeWorkspaceWithID(target);
      gBrowser.selectedTab = item.tab.glanceTab ?? item.tab;
      return;
    }
    if (W?.workspaceEnabled && target && target !== W.activeWorkspace) await W.changeWorkspaceWithID(target);
    if (item.kind === "folder") {
      item.folder.collapsed = false;
      const first = item.folder.tabs?.find(t => !t.hasAttribute("zen-empty-tab"));
      if (first) gBrowser.selectedTab = first;
      item.folder.scrollIntoView?.({ block: "nearest" });
    }
  },
};

/* --- Commands (":") ----------------------------------------------------------- */

const peek = () => window.ZenithPeek ?? null;

const COMMANDS = [
  { name: "help", arg: "a topic: tiles, keys, bar…", text: "Zenith's help: what it can do, and how", ok: () => !!window.ZenithHelp,
    run: a => window.ZenithHelp.open(a) },
  { name: "appearance", arg: "dark, light or auto", text: "How pages look: dark, light or automatic", ok: () => !!window.ZenithAppearance,
    run: a => (/^d/i.test(a) ? window.ZenithAppearance.set("dark") : /^l/i.test(a) ? window.ZenithAppearance.set("light")
             : /^a/i.test(a) ? window.ZenithAppearance.set("auto") : window.ZenithAppearance.toggle()) },
  { name: "fetch", text: "Your setup at a glance, as fastfetch prints a system's", ok: () => !!window.ZenithFetch, run: () => window.ZenithFetch.open() },
  { name: "overview", text: "Every tab as a picture (Alt+O)", ok: () => !!window.ZenithOverview, run: () => window.ZenithOverview.toggle() },
  { name: "layout", arg: "dwindle, master, scroller or monocle", text: "This space's layout (Alt+Y: the next)", ok: () => !!window.ZenithLayouts,
    run: a => (a ? window.ZenithLayouts.set(window.ZenithLayouts.ALL.find(x => x.startsWith(a.toLowerCase())) ?? "") : window.ZenithLayouts.cycle()) },
  { name: "rice", text: "Read ~/.config/zenith/zenith.conf again (Alt+Shift+C)", ok: () => !!window.ZenithRice, run: () => window.ZenithRice.reload(true) },
  { name: "dash", text: "The Dash: calendar, weather, media, timers, toggles (Alt+N)", ok: () => !!window.ZenithDash, run: () => window.ZenithDash.toggle() },
  { name: "focus", text: "Focus mode on or off (Alt+Z)", ok: () => !!window.ZenithFocus, run: () => window.ZenithFocus.toggle() },
  { name: "compact", text: "Compact mode on or off", ok: () => !!window.gZenCompactModeManager,
    run: () => (gZenCompactModeManager.preference = !gZenCompactModeManager.preference) },
  { name: "settings", text: "Zenith's settings over the page (Alt+Shift+Z)", ok: () => !!window.ZenithLive, run: () => window.ZenithLive.toggle() },
  { name: "set", arg: "a setting's name", text: "Find a setting and change it", ok: () => !!peek(), run: a => peek().prompt(`set ${a}`.trim()) },
  { name: "timer", arg: "how long and a name: 10m tea", text: "A countdown on the page's edge", ok: () => !!peek() && !!window.ZenithTimers,
    preview: a => (a ? peek().command(`timer ${a}`) : null), run: a => (a ? null : peek().prompt("timer")) },
  { name: "pomo", arg: "", text: "A pomodoro (pomo 25 5 4)", ok: () => !!peek() && !!window.ZenithTimers,
    preview: a => peek().command(`pomo ${a}`.trim()) },
  { name: "peek", arg: "what to look up", text: "Look it up in a Peek", ok: () => !!peek(), run: a => (a ? peek().lookup(a) : peek().prompt("")) },
  { name: "tabs", text: "The tab manager: duplicates, unused and awake tabs (Alt+Shift+T)", ok: () => !!window.ZenithTabs,
    run: () => window.ZenithTabs.show() },
  { name: "bookmarks", text: "Your bookmarks (Ctrl+B)", ok: () => !!document.getElementById("zenith-bookmarks-toggle"),
    run: () => document.getElementById("zenith-bookmarks-toggle").doCommand() },
  { name: "colours", arg: "", text: "This space's colours from an image (:colours wallpaper, :colours undo)", ok: () => !!window.ZenithColours,
    run: a => (/^wall/i.test(a) ? window.ZenithColours.fromWallpaper() : /^undo/i.test(a) ? window.ZenithColours.undo() : window.ZenithColours.pickFile()) },
  { name: "cookies", text: "Cookies: banners, rules, and each site's cookies", ok: () => !!document.getElementById("zenith-cookies-command"),
    run: () => document.getElementById("zenith-cookies-command").doCommand() },
  { name: "routing", text: "Links from other apps: Zen's space routing", ok: () => !!document.getElementById("cmd_zenOpenSpaceRoutingSettings"),
    run: () => document.getElementById("cmd_zenOpenSpaceRoutingSettings").doCommand() },
];

const Commands = {
  // ":" then a name, maybe followed by what it needs.
  find(text) {
    const m = text.match(/^:\s*(\S*)\s*(.*)$/);
    const name = m[1].toLowerCase(), arg = m[2].trim();
    const usable = COMMANDS.filter(c => c.ok());
    const exact = usable.find(c => c.name === name);
    if (exact && (arg || text.endsWith(" "))) return [this.item(exact, arg, true)];
    return usable.map(c => [name ? score(name, c.name) : 1, c]).filter(([s]) => s >= 0)
      .sort((a, b) => b[0] - a[0]).map(([, c]) => this.item(c, "", false));
  },

  // typed: the name was typed in full (and a space), so Enter runs it.
  item(c, arg, typed) {
    const shown = typed ? c.preview?.(arg) : null;
    if (shown) {
      return { kind: "command", title: `:${c.name}`, sub: [shown.label, shown.text].filter(Boolean).join(" · "),
               hint: shown.hint, command: c, arg, typed, run: shown.run ?? null };
    }
    return { kind: "command", title: `:${c.name}${c.arg ? ` ${arg || c.arg}` : ""}`, sub: c.text, command: c, arg, typed,
             run: c.run ? () => c.run(arg) : c.preview ? () => c.preview(arg)?.run?.() : null };
  },
};

/* --- The launcher's other modes (Alt+D opens "open"; Ctrl+Tab steps) ----------------
   As rofi's: tabs (the switcher as it was), open (a site, a search with your
   engine, your bookmarks, a tab you have open), spaces, commands (":"), calc
   ("=", Firefox's own calculator and converters, through Peek) and emoji
   (Zen's own list; Enter copies one). */
const MODES = [
  ["tabs", "Tabs", "Go to a tab, folder or space · : for commands · :help"],
  ["open", "Open", "A site, a search or a bookmark (Enter: a new tab · Shift+Enter: this one)"],
  ["spaces", "Spaces", "Go to a space"],
  ["commands", "Commands", "Run a command (help shows what Zenith can do)"],
  ["calc", "Calc", "2+2*3 · 10 km to mi · 30 usd to eur (Enter copies)"],
  ["emoji", "Emoji", "Find an emoji by name (Enter copies it)"],
];

function copy(text) {
  try {
    Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text);
    window.ZenithHint?.(`Copied ${text}`);
  } catch {}
}

function searchService() {
  if (Services.search) return Services.search;
  try {
    return ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService;
  } catch {
    return null;
  }
}

const Open = {
  url(text) {
    const t = text.trim();
    if (!t || /\s/.test(t)) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#]\S*)?$/i.test(t)) return null;
    try {
      return Services.uriFixup.getFixupURIInfo(t, Ci.nsIURIFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS).preferredURI?.spec ?? null;
    } catch {
      return null;
    }
  },

  // What it can say at once: the address, a search, open tabs.
  find(text) {
    const q = text.trim(), out = [];
    if (!q) return Items.find("").slice(0, 6);
    const url = this.url(q);
    if (url) out.push({ kind: "open", title: url, sub: "Open this site", url, icon: `page-icon:${url}` });
    out.push({ kind: "search", title: q, sub: `Search with ${searchService()?.defaultEngine?.name ?? "your search engine"}`, text: q });
    out.push(...Items.find(q).filter(i => i.kind === "tab").slice(0, 3).map(i => ({ ...i, sub: `${i.sub ? `${i.sub} · ` : ""}an open tab` })));
    return out;
  },

  // Bookmarks, which take a moment (Firefox's own search of them).
  async bookmarks(text) {
    try {
      const found = await PlacesUtils.bookmarks.search({ query: text.trim() });
      return found.filter(b => b.url).slice(0, 6).map(b => ({ kind: "open", title: b.title || b.url.href, sub: `Bookmark · ${b.url.host || b.url.href}`,
                                                             url: b.url.href, icon: `page-icon:${b.url.href}` }));
    } catch {
      return [];
    }
  },

  async go(item, here) {
    let url = item.url;
    if (item.kind === "search") {
      const S = searchService(), engine = S?.getDefault ? await S.getDefault() : S?.defaultEngine;
      if (!engine) return;
      url = engine.getSubmission(item.text).uri.spec;
    }
    if (url) openTrustedLinkIn(url, here ? "current" : "tab");
  },
};

const Emoji = {
  list() {
    if (this.data) return this.data;
    let data = window.ZenEmojisData;
    if (!data) {
      try {
        const scope = {};
        Services.scriptloader.loadSubScript("chrome://browser/content/zen-components/ZenEmojisData.min.mjs", scope);
        data = scope.ZenEmojisData;
      } catch {}
    }
    return (this.data = Array.isArray(data) ? data : []);
  },

  find(text) {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean), all = this.list();
    // (A word that's one of few tags counts more: 🎉 before a face that's also "party".)
    const pick = words.length ? all.map(e => [words.every(w => e.tags.some(t => t.startsWith(w))) ? words.reduce((a, w) => a + (e.tags.includes(w) ? 2 : 1), 0) - e.tags.length * 0.05 : -1, e])
      .filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || a[1].order - b[1].order).map(([, e]) => e) : all.slice(0, 40);
    return pick.slice(0, MAX).map(e => ({ kind: "emoji", title: `${e.emoji}  ${e.tags.slice(0, 4).join(", ")}`, sub: "", text: e.emoji }));
  },
};

/* --- The list ------------------------------------------------------------------ */

const Switcher = {
  build() {
    this.host = make("div", { id: "zenith-switcher" });
    this.host.hidden = true;
    const box = make("div", { id: "zenith-switcher-box" });
    this.input = make("input", {
      id: "zenith-switcher-input", spellcheck: "false",
      placeholder: "Go to a tab, folder or space · : for commands · :help",
    });
    this.list = make("div", { id: "zenith-switcher-list", role: "listbox" });
    this.foot = make("div", { id: "zenith-switcher-foot" }, "↑↓ choose · Enter goes · Esc closes");
    // The modes, as rofi's (a click, or Ctrl+Tab and Ctrl+Shift+Tab).
    this.modes = make("div", { id: "zenith-switcher-modes", role: "tablist" });
    for (const [id, label] of MODES) {
      const b = make("button", { type: "button", class: "zenith-switch-mode", "data-mode": id, role: "tab" }, label);
      b.addEventListener("mousedown", e => {
        e.preventDefault();
        this.setMode(id);
      });
      this.modes.append(b);
    }
    box.append(this.modes, this.input, this.list, this.foot);
    this.host.append(box);
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(this.host);
    this.input.addEventListener("input", () => this.update());
    this.input.addEventListener("keydown", e => this.onKey(e));
    this.host.addEventListener("mousedown", e => {
      if (e.target === this.host) this.hide();
    });
    this.host.addEventListener("focusout", () => setTimeout(() => {
      if (!this.host.hidden && !this.host.contains(document.activeElement)) this.hide();
    }, 120));
  },

  get open() {
    return !!this.host && !this.host.hidden;
  },

  show(text = "", mode = "tabs") {
    // Fast start: whatever hasn't started yet starts now (a command may need it).
    window.zenithLater?.now();
    if (!this.host) this.build();
    this.look = Services.prefs.getStringPref("zenith.launcher.look", "") || "centred";
    this.host.setAttribute("look", this.look);
    this.host.hidden = false;
    this.input.value = text;
    this.setMode(mode, false);
    this.update();
    this.input.focus();
  },

  setMode(mode, update = true) {
    this.mode = MODES.some(m => m[0] === mode) ? mode : "tabs";
    for (const b of this.modes.children) b.toggleAttribute("current", b.dataset.mode === this.mode);
    this.input.placeholder = MODES.find(m => m[0] === this.mode)[2];
    if (update) {
      this.update();
      this.input.focus();
    }
  },

  stepMode(by) {
    const i = MODES.findIndex(m => m[0] === this.mode);
    this.setMode(MODES[(i + by + MODES.length) % MODES.length][0]);
  },

  hide() {
    if (this.host) this.host.hidden = true;
  },

  toggle() {
    if (this.open) this.hide();
    else this.show();
  },

  update() {
    const text = this.input.value, mode = this.mode ?? "tabs", lead = text.trimStart();
    const asked = (this.asked = (this.asked ?? 0) + 1);
    if (lead.startsWith(":")) this.items = Commands.find(lead);
    else if (mode === "commands") this.items = Commands.find(`:${lead}`);
    else if (mode === "calc" || lead.startsWith("=")) {
      const sum = lead.replace(/^=\s*/, ""), answer = sum ? window.ZenithPeek?.answer?.(sum) : null;
      this.items = answer ? [{ kind: "calc", title: answer, sub: `${sum} · Enter copies it`, text: answer }]
        : [{ kind: "calc", title: sum ? "No answer yet" : "Type a sum or a conversion", sub: "2+2*3 · 10 km to mi", text: "" }];
      this.select(0);
      return;
    } else if (mode === "emoji") this.items = Emoji.find(text);
    else if (mode === "spaces") this.items = Items.find(text).filter(i => i.kind === "space");
    else if (mode === "open") {
      this.items = Open.find(text);
      // (Bookmarks a moment later, if what's typed hasn't changed.)
      if (text.trim()) {
        Open.bookmarks(text).then(found => {
          if (asked !== this.asked || !found.length) return;
          const urls = new Set(this.items.map(i => i.url).filter(Boolean));
          this.items.push(...found.filter(b => !urls.has(b.url)));
          this.render();
        });
      }
      this.select(0);
      return;
    } else this.items = Items.find(text);
    // Peek, last (first when nothing else matches): what you typed, looked
    // up without leaving the page (Keys › Switcher › Peek in the switcher).
    const q = text.trim();
    if (q && !q.startsWith(":") && mode === "tabs" && Services.prefs.getStringPref("zenith.plus.switcher-peek", "") !== "off" && window.ZenithPeek) {
      this.items.push({ kind: "peek", title: `Peek: ${q}`, sub: "Look it up without leaving the page", text: q, icon: "" });
    }
    this.select(0);
  },

  select(i) {
    this.selected = i;
    this.render();
  },

  render() {
    this.list.replaceChildren();
    if (!this.items.length) {
      this.list.append(make("div", { class: "zenith-switch-empty" }, "Nothing matches"));
      return;
    }
    this.items.forEach((item, i) => {
      const row = make("div", { class: "zenith-switch-row", kind: item.kind, role: "option" });
      if (i === this.selected) row.setAttribute("selected", "true");
      const icon = make("span", { class: "zenith-switch-icon" });
      // Any address is a picture (moz-remote-image://, page-icon:, data:…);
      // only a space's emoji is text. A picture that won't load leaves the
      // plain globe.
      if (item.icon && /^[a-z][a-z0-9+.-]*:/i.test(item.icon)) {
        const img = make("img", { src: item.icon, alt: "" });
        img.addEventListener("error", () => img.remove(), { once: true });
        icon.append(img);
      } else if (item.icon) {
        icon.textContent = item.icon; // a space's emoji
      }
      const text = make("span", { class: "zenith-switch-text" });
      text.append(make("span", { class: "zenith-switch-title" }, item.title));
      if (item.sub) text.append(make("span", { class: "zenith-switch-sub" }, item.sub));
      row.append(icon, text);
      if (item.space) row.append(make("span", { class: "zenith-switch-space" }, item.space));
      if (item.hint) row.append(make("span", { class: "zenith-switch-space" }, item.hint));
      row.addEventListener("mousedown", e => {
        e.preventDefault();
        this.selected = i;
        this.choose();
      });
      this.list.append(row);
    });
    this.list.children[this.selected]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  },

  // How many tiles a row of the grid holds.
  across() {
    const rows = [...this.list.children];
    return rows.filter(r => Math.abs(r.offsetTop - rows[0]?.offsetTop) < 4).length || 1;
  },

  move(by) {
    if (!this.items.length) return;
    // (The grid's up and down stop at its first and last rows.)
    if (this.look === "grid" && Math.abs(by) > 1) {
      const to = this.selected + by;
      if (to < 0 || to >= this.items.length) return;
    }
    this.selected = (this.selected + by + this.items.length) % this.items.length;
    this.render();
  },

  async choose() {
    const item = this.items[this.selected];
    if (!item) return;
    if (item.kind === "calc" || item.kind === "emoji") {
      if (!item.text) return;
      this.hide();
      return copy(item.text);
    }
    if (item.kind === "open" || item.kind === "search") {
      this.hide();
      return Open.go(item, this.here);
    }
    if (item.kind === "command") {
      // Picked from the list, a command that takes more (":timer 10m tea")
      // gets its name filled in first.
      if (item.command?.arg && !item.typed) {
        this.input.value = `:${item.command.name} `;
        this.update();
        return;
      }
      if (!item.run) return;
      this.hide();
      item.run();
      return;
    }
    this.hide();
    if (item.kind === "peek") return window.ZenithPeek?.lookup(item.text);
    await Items.go(item);
  },

  onKey(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      e.preventDefault();
      this.hide();
    } else if (e.key === "Tab" && ctrl) {
      e.preventDefault();
      this.stepMode(e.shiftKey ? -1 : 1);
    } else if (this.look === "grid" && (e.key === "ArrowRight" || e.key === "ArrowLeft") && this.input.selectionStart === this.input.value.length) {
      // (In the grid: left and right along a row, up and down a row at a time.)
      e.preventDefault();
      this.move(e.key === "ArrowRight" ? 1 : -1);
    } else if (this.look === "dmenu" && (e.key === "ArrowRight" || e.key === "ArrowLeft") && this.input.selectionStart === this.input.value.length) {
      e.preventDefault();
      this.move(e.key === "ArrowRight" ? 1 : -1);
    } else if (e.key === "ArrowDown" || (ctrl && e.key === "n") || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      this.move(this.look === "grid" && e.key === "ArrowDown" ? this.across() : 1);
    } else if (e.key === "ArrowUp" || (ctrl && e.key === "p") || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      this.move(this.look === "grid" && e.key === "ArrowUp" ? -this.across() : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      // (Shift+Enter: a site or search opens in this tab.)
      this.here = e.shiftKey;
      this.choose();
    }
  },
};

/* --- The key ------------------------------------------------------------------ */

function addKeys() {
  // A command and keyset of our own (like Peek's), "reserved" so pages
  // don't swallow Alt+W.
  const commandset = document.createXULElement("commandset");
  const command = document.createXULElement("command");
  command.id = "zenith-switcher-command";
  command.addEventListener("command", () => Switcher.toggle());
  commandset.append(command);
  const keyset = document.createXULElement("keyset");
  keyset.id = "zenith-switcher-keys";
  const key = document.createXULElement("key");
  key.id = "zenith-switcher-key";
  key.setAttribute("modifiers", "alt");
  key.setAttribute("key", "W");
  key.setAttribute("reserved", "true");
  key.setAttribute("command", "zenith-switcher-command");
  keyset.append(key);
  document.documentElement.append(commandset, keyset);
  const watch = () => {
    const on = Services.prefs.getBoolPref(PREF, true);
    key.toggleAttribute("disabled", !on);
    if (!on) Switcher.hide();
  };
  Services.prefs.addObserver(PREF, watch);
  window.addEventListener("unload", () => Services.prefs.removeObserver(PREF, watch), { once: true });
  watch();
  // ":" anywhere you aren't typing: the switcher, ready for a command.
  // (Typing anywhere, in the page or Zen, the system's input is on.)
  const colon = e => {
    if (e.charCode !== 58 || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented || !Services.prefs.getBoolPref(PREF, true)) return;
    if (Services.prefs.getBoolPref("zenith.plus.switcher-colon", true) === false) return;
    if (window.windowUtils.IMEStatus === Ci.nsIDOMWindowUtils.IME_STATUS_ENABLED || Switcher.open) return;
    e.preventDefault();
    e.stopPropagation();
    Switcher.show(":");
  };
  window.addEventListener("keypress", colon, { mozSystemGroup: true });
  window.addEventListener("unload", () => window.removeEventListener("keypress", colon, { mozSystemGroup: true }), { once: true });
  window.ZenithSwitcher = Switcher; // for tools/checks
  Switcher.go = item => Items.go(item);
  Switcher.Items = Items;
}

start("hotkey", addKeys, true);
