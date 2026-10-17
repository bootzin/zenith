// ==UserScript==
// @name           Zenith Switcher
// @description    Zenith Plus: jump to any tab, folder or space by typing (Alt+W); ":" runs Zenith's commands.
// @include        main
// @version        0.10.0
// ==/UserScript==

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

function start(name, fn) {
  if (!FIRST) return;
  try {
    fn();
  } catch (e) {
    console.error(`[Zenith Switcher] ${name} failed to start`, e);
  }
}

function make(tag, attrs = {}, text = "") {
  const node = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

const PREF = "zenith.plus.switcher";
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

  host(tab) {
    const uri = tab.linkedBrowser?.currentURI;
    if (!uri || uri.spec === "about:blank") return "";
    return /^https?$/.test(uri.scheme) ? uri.host.replace(/^www\./, "") : uri.spec.slice(0, 60);
  },

  all() {
    const active = gZenWorkspaces?.activeWorkspace;
    const out = [];
    for (const tab of gBrowser.tabs) {
      if (tab.hasAttribute("zen-empty-tab") || tab.hasAttribute("zen-glance-tab") || tab.closing) continue;
      const space = tab.getAttribute("zen-workspace-id");
      const elsewhere = space && space !== active && !tab.hasAttribute("zen-essential");
      out.push({
        kind: "tab", tab, title: tab.label || this.host(tab) || "New tab", sub: this.host(tab),
        space: elsewhere ? this.spaceName(space) : "", icon: tab.getAttribute("image") || "",
        recent: tab.lastAccessed || 0, current: tab.selected,
      });
    }
    const folders = gBrowser.tabGroups ?? [...document.querySelectorAll("zen-folder, tab-group")];
    for (const folder of folders) {
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
    const essential = item.kind === "tab" && item.tab.hasAttribute("zen-essential");
    if (W?.workspaceEnabled && target && target !== W.activeWorkspace && !essential) await W.changeWorkspaceWithID(target);
    if (item.kind === "tab") {
      gBrowser.selectedTab = item.tab;
    } else if (item.kind === "folder") {
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

/* --- The list ------------------------------------------------------------------ */

const Switcher = {
  build() {
    this.host = make("div", { id: "zenith-switcher" });
    this.host.hidden = true;
    const box = make("div", { id: "zenith-switcher-box" });
    this.input = make("input", {
      id: "zenith-switcher-input", spellcheck: "false",
      placeholder: "Go to a tab, folder or space · : for commands",
    });
    this.list = make("div", { id: "zenith-switcher-list", role: "listbox" });
    this.foot = make("div", { id: "zenith-switcher-foot" }, "↑↓ choose · Enter goes · Esc closes");
    box.append(this.input, this.list, this.foot);
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

  show(text = "") {
    if (!this.host) this.build();
    this.host.hidden = false;
    this.input.value = text;
    this.update();
    this.input.focus();
  },

  hide() {
    if (this.host) this.host.hidden = true;
  },

  toggle() {
    if (this.open) this.hide();
    else this.show();
  },

  update() {
    const text = this.input.value;
    this.items = text.trimStart().startsWith(":") ? Commands.find(text.trimStart()) : Items.find(text);
    this.selected = 0;
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
      if (item.icon && /^(https?|data|chrome|moz-|page-icon|cached-favicon|blob):/.test(item.icon)) {
        icon.append(make("img", { src: item.icon, alt: "" }));
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
    this.list.children[this.selected]?.scrollIntoView({ block: "nearest" });
  },

  move(by) {
    if (!this.items.length) return;
    this.selected = (this.selected + by + this.items.length) % this.items.length;
    this.render();
  },

  async choose() {
    const item = this.items[this.selected];
    if (!item) return;
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
    await Items.go(item);
  },

  onKey(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      e.preventDefault();
      this.hide();
    } else if (e.key === "ArrowDown" || (ctrl && e.key === "n") || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      this.move(1);
    } else if (e.key === "ArrowUp" || (ctrl && e.key === "p") || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      this.move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
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
  window.ZenithSwitcher = Switcher; // for tools/checks
}

start("hotkey", addKeys);
