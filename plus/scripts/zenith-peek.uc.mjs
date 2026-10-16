// ==UserScript==
// @name           Zenith Peek
// @description    Zenith Plus: quick, disposable lookups in a floating Glance that leaves nothing behind.
// @include        main
// @version        0.6.3
// ==/UserScript==

// Peek opens a lookup in Zen's detached Glance: a floating page that isn't
// a tab and isn't saved to history. Ways in:
//   Alt+Q               looks up the selected text, or opens the Peek prompt
//   Shift+Enter         in the URL bar, peeks what you typed (or the
//                       highlighted result) instead of navigating
//   Alt+click a link    Zen's own Glance, unchanged
// Inside a Peek: Escape closes it, Ctrl+Enter keeps it as a real tab.
// The prompt shows instant answers (maths, units, time zones) computed by
// Firefox's own calculator and converters, offline; Enter copies them.
// Typing "?" in the prompt lists the prefixes, where they can be edited.
// Settings: Settings > Zen Mods > Zenith Plus. Styles: plus/chrome.css.

const HTML_NS = "http://www.w3.org/1999/xhtml";

function start(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`[Zenith Peek] ${name} failed to start`, e);
  }
}

const prefs = {
  bool: (name, fallback) => Services.prefs.getBoolPref(name, fallback),
  str: name => Services.prefs.getStringPref(name, "").trim(),
};

function make(tag, attrs = {}, text = "") {
  const node = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/* --- Where a lookup goes ----------------------------------------------------- */

const ENGINES = {
  google: ["Google", "https://www.google.com/search?q=%s"],
  "google-ai": ["AI Mode", "https://www.google.com/search?udm=50&q=%s"],
  "google-web": ["Google", "https://www.google.com/search?udm=14&q=%s"],
  duckduckgo: ["DuckDuckGo", "https://duckduckgo.com/?q=%s"],
  kagi: ["Kagi", "https://kagi.com/search?q=%s"],
  bing: ["Bing", "https://www.bing.com/search?q=%s"],
};

const LANG = (Services.locale.appLocaleAsBCP47 || "en").split("-")[0];

const DEFAULT_PREFIXES = [
  { key: "m", name: "Maps", url: "https://www.google.com/maps/search/%s" },
  { key: "w", name: "Wikipedia", url: `https://${LANG}.wikipedia.org/wiki/Special:Search?search=%s` },
  { key: "d", name: "Define", url: "https://www.google.com/search?q=define+%s" },
  { key: "t", name: "Translate", url: `https://translate.google.com/?sl=auto&tl=${LANG}&text=%s&op=translate` },
  { key: "wt", name: "Weather", url: "https://wttr.in/%s" },
  { key: "y", name: "YouTube", url: "https://www.youtube.com/results?search_query=%s" },
  { key: "ai", name: "AI Mode", url: "https://www.google.com/search?udm=50&q=%s" },
  { key: "$", name: "Currency", url: "https://www.google.com/search?q=%s" },
  { key: "gh", name: "GitHub", url: "https://github.com/search?q=%s&type=repositories" },
  { key: "r", name: "Reddit", url: "https://www.reddit.com/search/?q=%s" },
];

const PREFIX_PREF = "zenith.peek.prefix-list";

const Lookup = {
  engine() {
    // A filled-in custom search URL wins over the engine list.
    const custom = prefs.str("zenith.peek.custom-engine");
    if (/^https?:\/\/\S*%s/i.test(custom)) return [this.label(custom), custom];
    return ENGINES[prefs.str("zenith.peek.engine")] ?? ENGINES.google;
  },

  // The editable list, saved as JSON; empty means the defaults.
  prefixList() {
    try {
      const list = JSON.parse(prefs.str(PREFIX_PREF) || "null");
      if (Array.isArray(list)) return list.filter(p => p?.key && p?.url);
    } catch {}
    return DEFAULT_PREFIXES.map(p => ({ ...p }));
  },

  savePrefixes(list) {
    Services.prefs.setStringPref(PREFIX_PREF, JSON.stringify(list));
  },

  resetPrefixes() {
    Services.prefs.clearUserPref(PREFIX_PREF);
  },

  findPrefix(key) {
    return this.prefixList().find(p => p.key.toLowerCase() === key.toLowerCase());
  },

  label(url) {
    try {
      return new URL(url.replace("%s", "x")).hostname.replace(/^www\./, "");
    } catch {
      return "Search";
    }
  },

  // "https://www.google.com/search?q=define+%s" -> "google.com/search?q=define+…"
  shortUrl(url) {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace("%s", "…");
  },

  fill(template, query) {
    return template.replace("%s", encodeURIComponent(query));
  },

  // Only web addresses open directly; anything else is searched.
  asUrl(text) {
    if (/^https?:\/\/\S+$/i.test(text)) return text;
    if (/^(localhost|[\w-]+(\.[\w-]+)*\.[a-z]{2,})(:\d+)?([/?#]\S*)?$/i.test(text)) return "https://" + text;
    return null;
  },

  // text -> { label, url, query } describing where Enter goes
  resolve(raw) {
    const text = raw.trim();
    if (!text) return null;
    const m = text.match(/^(\S+)\s+(.+)$/);
    if (m) {
      const prefix = this.findPrefix(m[1]);
      if (prefix) return { label: prefix.name || this.label(prefix.url), url: this.fill(prefix.url, m[2]), query: m[2] };
    }
    const url = this.asUrl(text);
    if (url) return { label: "Open", url, query: url };
    const [label, template] = this.engine();
    return { label, url: this.fill(template, text), query: text };
  },
};

/* --- Instant answers: Firefox's own calculator and converters, offline ---- */

const Instant = {
  load() {
    if (this.loaded) return;
    this.loaded = true;
    const base = "moz-src:///browser/components/urlbar/";
    try {
      this.calculator = ChromeUtils.importESModule(base + "UrlbarProviderCalculator.sys.mjs").Calculator;
    } catch (e) {
      console.warn("[Zenith Peek] calculator unavailable", e);
    }
    this.converters = [];
    for (const name of ["UnitConverterSimple", "UnitConverterTemperature", "UnitConverterTimezone"]) {
      try {
        this.converters.push(new (ChromeUtils.importESModule(`${base}unitconverters/${name}.sys.mjs`)[name])());
      } catch (e) {
        console.warn(`[Zenith Peek] ${name} unavailable`, e);
      }
    }
  },

  // "2+2*3" -> "8", "10 km to mi" -> "6.2137 mi"; null when there's no answer
  answer(text) {
    if (!prefs.bool("zenith.peek.instant", true) || !text.trim()) return null;
    this.load();
    if (this.calculator && /[\d)]\s*[-+*/^×÷]|[-+*/^×÷]\s*[\d(]/.test(text)) {
      try {
        const postfix = this.calculator.infix2postfix(text);
        if (postfix.length >= 3) {
          const value = this.calculator.evaluatePostfix(postfix);
          if (value !== "undefined") return String(value);
        }
      } catch {}
    }
    for (const converter of this.converters) {
      try {
        const result = converter.convert(text);
        if (result) return this.tidy(String(result));
      } catch {}
    }
    return null;
  },

  // "6.2137119224 mi" -> "6.2137 mi"
  tidy(text) {
    return text.replace(/-?\d+\.\d{5,}/g, n => String(Number(Number(n).toFixed(4))));
  },
};

/* --- The Peek window (Zen's detached Glance) ------------------------------- */

const Peek = {
  get open() {
    return !!gZenGlanceManager.detachedBrowser;
  },

  async show(target, origin) {
    if (!target || !prefs.bool("zenith.peek.enabled", true)) return;
    if (this.open) await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true });
    const userContextId = gBrowser.selectedTab.userContextId || 0;
    const point = origin ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.2 };
    const result = await gZenGlanceManager.openDetachedGlance({
      url: target.url,
      // Peeks load like a link from nowhere: no special privileges.
      triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({ userContextId }),
      clientX: point.x,
      clientY: point.y,
      userContextId,
    });
    if (!result) return;
    document.documentElement.setAttribute("zenith-peek-open", "true");
    result.closed.then(() => document.documentElement.removeAttribute("zenith-peek-open"));
    result.browser.focus();
  },

  close() {
    if (this.open) gZenGlanceManager.closeDetachedGlance();
  },

  // Ctrl+Enter: keep what's in the Peek as a normal tab.
  async keep() {
    const browser = gZenGlanceManager.detachedBrowser;
    if (!browser) return;
    const url = browser.currentURI?.spec;
    const userContextId = gBrowser.selectedTab.userContextId || 0;
    await gZenGlanceManager.closeDetachedGlance({ skipPermitUnload: true });
    if (url && !url.startsWith("about:blank")) {
      gBrowser.selectedTab = gBrowser.addTab(url, {
        triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({ userContextId }),
        userContextId,
      });
    }
  },
};

/* --- The prompt (Alt+Q with nothing selected) -------------------------------- */

const Prompt = {
  build() {
    this.host = make("div", { id: "zenith-peek" });
    this.host.hidden = true;
    const box = make("div", { id: "zenith-peek-box" });
    this.input = make("input", {
      id: "zenith-peek-input",
      spellcheck: "false",
      placeholder: "Peek: search, an address, maths, or a prefix (? lists them)",
    });
    this.row = make("div", { id: "zenith-peek-row" });
    this.tag = make("span", { id: "zenith-peek-tag" });
    this.text = make("span", { id: "zenith-peek-text" });
    this.hint = make("span", { id: "zenith-peek-hint" });
    this.row.append(this.tag, this.text, this.hint);
    this.list = make("div", { id: "zenith-peek-list" });
    this.list.hidden = true;
    box.append(this.input, this.row, this.list);
    this.host.append(box);
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(this.host);

    this.input.addEventListener("input", () => this.update());
    this.input.addEventListener("keydown", e => this.onKey(e));
    this.host.addEventListener("mousedown", e => {
      if (e.target === this.host) this.hide();
    });
    // Leaving the prompt (not just moving into one of its own fields) closes it.
    this.host.addEventListener("focusout", () => setTimeout(() => {
      if (!this.host.hidden && !this.host.contains(document.activeElement)) this.hide();
    }, 120));
  },

  show(text = "") {
    if (!this.host) this.build();
    this.host.hidden = false;
    this.input.value = text;
    this.update();
    this.input.focus();
    this.input.select();
  },

  hide() {
    if (this.host) this.host.hidden = true;
  },

  get listing() {
    return this.input.value.trim() === "?";
  },

  update() {
    if (this.listing) {
      this.row.hidden = true;
      this.renderList();
      return;
    }
    this.list.hidden = true;
    this.editing = null;
    const text = this.input.value;
    this.answer = Instant.answer(text);
    this.target = Lookup.resolve(text);
    const typedPrefix = /^\S+$/.test(text.trim()) ? Lookup.findPrefix(text.trim()) : null;
    this.row.toggleAttribute("answer", !!this.answer);
    if (this.answer) {
      this.tag.textContent = "=";
      this.text.textContent = this.answer;
      this.hint.textContent = "Enter copies · Shift+Enter searches";
    } else if (typedPrefix) {
      this.tag.textContent = typedPrefix.name || Lookup.label(typedPrefix.url);
      this.text.textContent = "type a space, then what to look up";
      this.hint.textContent = "";
    } else if (this.target) {
      this.tag.textContent = this.target.label;
      this.text.textContent = this.target.query;
      this.hint.textContent = "Enter to peek";
    }
    this.row.hidden = !this.answer && !this.target && !typedPrefix;
  },

  onKey(e) {
    if (this.listing && this.onListKey(e)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.hide();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (this.answer && !e.shiftKey) {
        Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(this.answer);
        this.hint.textContent = "Copied";
        setTimeout(() => this.hide(), 450);
        return;
      }
      const target = this.target;
      if (!target) return;
      const box = this.host.firstElementChild.getBoundingClientRect();
      this.hide();
      Peek.show(target, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
    }
  },

  /* --- "?": the prefix list and editor --------------------------------------- */

  renderList() {
    const list = Lookup.prefixList();
    this.selected = Math.min(this.selected ?? 0, list.length);
    this.list.hidden = false;
    this.list.replaceChildren();
    list.forEach((prefix, i) => {
      this.list.append(this.editing === i ? this.editor(prefix, i) : this.item(prefix, i));
    });
    if (this.editing === list.length) {
      this.list.append(this.editor({ key: "", name: "", url: "" }, list.length));
    } else {
      const add = make("div", { class: "zenith-peek-item zenith-peek-add" }, "+ Add a prefix");
      if (this.selected === list.length) add.setAttribute("selected", "true");
      add.addEventListener("mousedown", e => {
        e.preventDefault();
        this.edit(list.length);
      });
      this.list.append(add);
    }
    const foot = make("div", { class: "zenith-peek-foot" });
    foot.append(make("span", {}, "↑↓ choose · Enter edits · Delete removes · Esc back"));
    const reset = make("button", { class: "zenith-peek-reset" }, "Reset to defaults");
    reset.addEventListener("mousedown", e => {
      e.preventDefault();
      Lookup.resetPrefixes();
      this.editing = null;
      this.renderList();
    });
    foot.append(reset);
    this.list.append(foot);
  },

  item(prefix, i) {
    const row = make("div", { class: "zenith-peek-item" });
    if (i === this.selected) row.setAttribute("selected", "true");
    row.append(
      make("span", { class: "zenith-peek-key" }, prefix.key),
      make("span", { class: "zenith-peek-name" }, prefix.name || Lookup.label(prefix.url)),
      make("span", { class: "zenith-peek-url" }, Lookup.shortUrl(prefix.url))
    );
    const remove = make("button", { class: "zenith-peek-remove", title: "Remove" }, "×");
    remove.addEventListener("mousedown", e => {
      e.preventDefault();
      e.stopPropagation();
      this.remove(i);
    });
    row.append(remove);
    row.addEventListener("mousedown", e => {
      e.preventDefault();
      this.edit(i);
    });
    return row;
  },

  editor(prefix, i) {
    const row = make("div", { class: "zenith-peek-item", editing: "true" });
    const key = make("input", { class: "zenith-peek-field zenith-peek-field-key", placeholder: "key", spellcheck: "false" });
    const name = make("input", { class: "zenith-peek-field zenith-peek-field-name", placeholder: "Name", spellcheck: "false" });
    const url = make("input", { class: "zenith-peek-field zenith-peek-field-url", placeholder: "https://example.com/search?q=%s", spellcheck: "false" });
    key.value = prefix.key;
    name.value = prefix.name;
    url.value = prefix.url;
    const error = make("span", { class: "zenith-peek-error" });
    row.append(key, name, url, error);
    const save = () => {
      const k = key.value.trim();
      const u = url.value.trim();
      const list = Lookup.prefixList();
      if (!/^\S{1,8}$/.test(k)) return (error.textContent = "The key is one short word, no spaces");
      if (list.some((p, j) => j !== i && p.key.toLowerCase() === k.toLowerCase())) return (error.textContent = `"${k}" is taken`);
      if (!/^https?:\/\/\S*%s/i.test(u)) return (error.textContent = "The address needs %s where the search goes");
      list[i] = { key: k, name: name.value.trim() || Lookup.label(u), url: u };
      Lookup.savePrefixes(list);
      this.editing = null;
      this.selected = i;
      this.renderList();
      this.input.focus();
      return null;
    };
    for (const field of [key, name, url]) {
      field.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.editing = null;
          this.renderList();
          this.input.focus();
        }
      });
      field.addEventListener("input", () => (error.textContent = ""));
    }
    setTimeout(() => (prefix.key ? url : key).focus(), 0);
    return row;
  },

  edit(i) {
    this.editing = i;
    this.selected = i;
    this.renderList();
  },

  remove(i) {
    const list = Lookup.prefixList();
    list.splice(i, 1);
    Lookup.savePrefixes(list);
    this.renderList();
  },

  // Keys while the list shows; true when handled.
  onListKey(e) {
    const count = Lookup.prefixList().length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      this.selected = (this.selected + (e.key === "ArrowDown" ? 1 : count)) % (count + 1);
      this.renderList();
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      this.edit(this.selected);
      return true;
    }
    if (e.key === "Delete" && this.selected < count) {
      e.preventDefault();
      this.remove(this.selected);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.input.value = "";
      this.update();
      return true;
    }
    return false;
  },
};

/* --- Ways in ---------------------------------------------------------------------- */

// The selected text in a page, via the find bar's own helper.
function selectedText(browser) {
  return new Promise(resolve => {
    const finder = browser?.finder;
    if (!finder) {
      resolve("");
      return;
    }
    let done = false;
    const finish = text => {
      if (done) return;
      done = true;
      finder.removeResultListener(listener);
      resolve((text || "").trim());
    };
    const listener = {
      onCurrentSelection: text => finish(text),
      onFindResult() {},
      onMatchesCountResult() {},
      onHighlightFinished() {},
    };
    finder.addResultListener(listener);
    finder.getInitialSelection();
    setTimeout(() => finish(""), 500);
  });
}

async function onHotkey() {
  if (!prefs.bool("zenith.peek.enabled", true)) return;
  // Typing in the URL bar: peek that.
  if (gURLBar.focused && gURLBar.value.trim()) {
    peekFromUrlbar();
    return;
  }
  const browser = gZenGlanceManager.detachedBrowser ?? gBrowser.selectedBrowser;
  const text = await selectedText(browser);
  if (text && text.length < 500) {
    Peek.show(Lookup.resolve(text));
  } else {
    Prompt.show();
  }
}

function peekFromUrlbar() {
  const result = gURLBar.view.isOpen ? gURLBar.view.selectedResult : null;
  const url = result?.payload?.url;
  const target = url && /^https?:/i.test(url) && !result.payload.query
    ? { label: "Open", url, query: url }
    : Lookup.resolve(gURLBar.value);
  gURLBar.handleRevert();
  gURLBar.view.close();
  gURLBar.blur();
  Peek.show(target);
}

function addKeys() {
  // A command and keyset of our own, so Zen's shortcut manager doesn't
  // rewrite them (and no inline handler, which the window's policy blocks).
  // "reserved" keeps pages from swallowing Alt+Q.
  const commandset = document.createXULElement("commandset");
  const command = document.createXULElement("command");
  command.id = "zenith-peek-command";
  command.addEventListener("command", () => onHotkey());
  commandset.append(command);
  const keyset = document.createXULElement("keyset");
  keyset.id = "zenith-peek-keys";
  const key = document.createXULElement("key");
  key.id = "zenith-peek-key";
  key.setAttribute("modifiers", "alt");
  key.setAttribute("key", "Q");
  key.setAttribute("reserved", "true");
  key.setAttribute("command", "zenith-peek-command");
  keyset.append(key);
  document.documentElement.append(commandset, keyset);
}

function watchUrlbar() {
  // Capture phase on the URL bar runs before Firefox's own Enter handling.
  const onKey = e => {
    if (e.key !== "Enter" || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!prefs.bool("zenith.peek.enabled", true) || !gURLBar.value.trim()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    peekFromUrlbar();
  };
  gURLBar.addEventListener("keydown", onKey, true);
}

function watchPeekKeys() {
  // Keys pressed inside the Peek reach the window after the page sees them.
  const onKey = e => {
    if (!Peek.open || e.defaultPrevented) return;
    if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      Peek.close();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      Peek.keep();
    }
  };
  window.addEventListener("keydown", onKey, true);
}

// The old "key=URL; key=URL" text setting (0.6.0) becomes the editable list.
function migratePrefixes() {
  const old = prefs.str("zenith.peek.prefixes");
  if (!old || prefs.str(PREFIX_PREF)) return;
  const list = Lookup.prefixList();
  for (const part of old.split(/[;\n]+/)) {
    const m = part.trim().match(/^(\S+?)\s*=\s*(\S*)$/);
    if (!m) continue;
    const i = list.findIndex(p => p.key.toLowerCase() === m[1].toLowerCase());
    if (!m[2]) {
      if (i >= 0) list.splice(i, 1);
    } else if (/^https?:\/\/\S*%s/i.test(m[2])) {
      const entry = { key: m[1], name: Lookup.label(m[2]), url: m[2] };
      if (i >= 0) list[i] = entry;
      else list.push(entry);
    }
  }
  Lookup.savePrefixes(list);
  Services.prefs.clearUserPref("zenith.peek.prefixes");
}

start("prefixes", migratePrefixes);
start("hotkey", addKeys);
start("url bar", watchUrlbar);
start("peek keys", watchPeekKeys);
