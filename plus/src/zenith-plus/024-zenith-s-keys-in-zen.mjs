/* --- Zenith's keys in about:keyboard ----------------------------------------
   Zen 1.24 moved its shortcuts to Firefox's Keyboard shortcuts
   (about:keyboard), where each key is a <key> element and a change is kept
   in customKeys.json by Firefox's CustomKeys. Zenith's keys join it, in
   groups of their own ("Zenith", "Zenith: tiles"…), to change, clear or
   reset there:
   - Zenith's own keys (the switcher, Peek, focus mode…) are <key> elements,
     changed there like Firefox's.
   - The Shell's keys go by where a key is (Alt+; on any layout) and stay
     Zenith's to press. Each has a stand-in <key> (disabled) that the page
     lists and changes: a change there becomes the Shell's binding
     (zenith.shell.bindings, which Settings › Tiling and keys and the rice
     file also write), and a binding changed there shows on the page. On
     start the binding wins: the rice file may have changed it.
   A feature switched off disables its command, so its key does nothing. */
const ZenithKeys = {
  // Zenith's own keys: the <key> id · label · the setting that switches it off · its command
  OWN: [
    ["zenith-switcher-key", "Switcher", "zenith.plus.switcher", "zenith-switcher-command"],
    ["zenith-peek-key", "Peek", "zenith.peek.enabled", "zenith-peek-command"],
    ["zenith-focus-key", "Focus mode", "zenith.plus.focus-key", "zenith-focus-command"],
    ["zenith-tabs-key", "Tab manager", "zenith.plus.tab-manager", "zenith-tabs-command"],
    ["zenith-live-key", "Settings over the page", null, "zenith-live-command"],
    ["zenith-float-key", "Float a tab", "zenith.plus.float-tab", "zenith-float-command"],
    ["zenith-split-solo-key", "The tile you're on fills the split, and back", null, "zenith-split-solo-command"],
  ],
  // The Shell's groups, as about:keyboard titles them.
  GROUPS: { Zenith: "Zenith", Tiles: "Zenith: tiles", Tabs: "Zenith: tabs", Spaces: "Zenith: spaces", Pages: "Zenith: pages" },
  STANDIN: "zenith-shell-key-",
  MAC: Services.appinfo.OS === "Darwin",

  init() {
    window.ZenithKeys = this; // the settings page, KeySheet, and tools/checks
    this.CK = ChromeUtils.importESModule("moz-src:///browser/components/customkeys/CustomKeys.sys.mjs").CustomKeys;
    this.SU = ChromeUtils.importESModule("resource://gre/modules/ShortcutUtils.sys.mjs").ShortcutUtils;
    this.patchPage();
    // Zenith's keysets go in the body, where CustomKeys watches for them
    // (it applies a change to a keyset as it arrives); Zenith's scripts
    // start one by one, each adding its keys at the top of the window.
    const move = () => {
      for (const set of document.documentElement.querySelectorAll(":scope > keyset[id^='zenith-']")) document.body.append(set);
    };
    move();
    this.standIns();
    this.watcher = new MutationObserver(list => {
      move();
      // (A key changed in about:keyboard: CustomKeys re-adds its keyset.)
      if (list.some(m => [...m.addedNodes].includes(this.set))) this.adoptSoon();
    });
    this.watcher.observe(document.documentElement, { childList: true });
    this.watcher.observe(document.body, { childList: true });
    const enable = () => this.enable();
    const mirror = () => this.ready && this.mirror();
    const prefs = [...new Set(this.OWN.map(k => k[2]).filter(Boolean))];
    for (const p of prefs) Services.prefs.addObserver(p, enable);
    Services.prefs.addObserver(SHELL.BINDINGS, mirror);
    onUnload(() => {
      this.watcher.disconnect();
      for (const p of prefs) Services.prefs.removeObserver(p, enable);
      Services.prefs.removeObserver(SHELL.BINDINGS, mirror);
    });
    enable();
    // (CustomKeys reads its file as the window opens; once it has, the
    // Shell's bindings go to it.)
    let tries = 0;
    const start = () => {
      try {
        this.mirror();
        this.ready = true;
      } catch (e) {
        if (++tries < 20) setTimeout(start, 500);
        else console.error("[Zenith] keys in about:keyboard", e);
      }
    };
    (window.delayedStartupPromise ?? Promise.resolve()).then(() => setTimeout(start, 0));
  },

  // about:keyboard asks Zen for its groups; Zenith's join them. (The module
  // is shared by every window: the window the page is in answers.)
  patchPage() {
    let M;
    try {
      M = ChromeUtils.importESModule("resource:///modules/zen/kbs/ZenKeyboardShortcuts.sys.mjs").ZenKeyboardShortcuts;
    } catch {
      return;
    }
    if (!M?.addKeys || M.zenithAddKeys) return;
    const orig = (M.zenithAddKeys = M.addKeys);
    M.addKeys = async function (actor, keys) {
      const out = await orig.call(this, actor, keys);
      try {
        actor.browsingContext.topChromeWindow?.ZenithKeys?.list(actor, out);
      } catch (e) {
        console.error("[Zenith] keys in about:keyboard", e);
      }
      return out;
    };
  },

  list(actor, keys) {
    const add = (group, id, title) => {
      const data = actor.getKeyData(id);
      if (!data) return;
      data.title = title;
      (keys[group] ??= {})[id] = data;
    };
    for (const [id, label] of this.OWN) add(this.GROUPS.Zenith, id, label);
    for (const [name, , label, group] of ShellKeys.LIST) add(this.GROUPS[group] ?? this.GROUPS.Zenith, this.STANDIN + name, label);
    return keys;
  },

  // One stand-in <key> per Shell key, never pressed (disabled): the page
  // shows and changes it.
  standIns() {
    this.set = document.createXULElement("keyset");
    this.set.id = "zenith-shell-keys";
    for (const [name, combo] of ShellKeys.LIST) {
      const key = document.createXULElement("key");
      key.id = this.STANDIN + name;
      key.setAttribute("disabled", "true");
      for (const [attr, value] of Object.entries(this.toAttrs(combo))) key.setAttribute(attr, value);
      this.set.append(key);
    }
    document.body.append(this.set);
  },

  // "Alt+Shift+KeyY" ⇄ { modifiers: "alt,shift", key: "Y" } (or keycode).
  CHARS: { Semicolon: ";", Backquote: "`", Minus: "-", Equal: "=", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
           Quote: "'", Comma: ",", Period: ".", Space: " " },
  SHIFTED: { "!": "Digit1", "@": "Digit2", "#": "Digit3", $: "Digit4", "%": "Digit5", "^": "Digit6", "&": "Digit7", "*": "Digit8",
             "(": "Digit9", ")": "Digit0", ":": "Semicolon", "~": "Backquote", _: "Minus", "+": "Equal", "?": "Slash", "|": "Backslash",
             "{": "BracketLeft", "}": "BracketRight", '"': "Quote", "<": "Comma", ">": "Period" },
  CODES: { Enter: "VK_RETURN", Tab: "VK_TAB", Escape: "VK_ESCAPE", Backspace: "VK_BACK", Delete: "VK_DELETE", Insert: "VK_INSERT",
           Home: "VK_HOME", End: "VK_END", PageUp: "VK_PAGE_UP", PageDown: "VK_PAGE_DOWN", ArrowLeft: "VK_LEFT", ArrowRight: "VK_RIGHT",
           ArrowUp: "VK_UP", ArrowDown: "VK_DOWN" },

  toAttrs(combo) {
    if (!combo) return {};
    const parts = combo.split("+"), code = parts.pop();
    const MODS = { Ctrl: this.MAC ? "control" : "accel", Alt: "alt", Shift: "shift", Meta: this.MAC ? "accel" : "meta" };
    const out = { modifiers: parts.map(p => MODS[p]).filter(Boolean).sort().join(",") };
    if (/^Key[A-Z]$/.test(code)) out.key = code.slice(3);
    else if (/^(Digit|Numpad)\d$/.test(code)) out.key = code.slice(-1);
    else if (this.CHARS[code]) out.key = this.CHARS[code];
    else if (this.CODES[code]) out.keycode = this.CODES[code];
    else if (/^F\d{1,2}$/.test(code)) out.keycode = `VK_${code}`;
    else if (code.startsWith("Char:")) out.key = code.slice(5);
    else out.key = code;
    if (!out.modifiers) delete out.modifiers;
    return out;
  },

  fromAttrs(key) {
    const k = key.getAttribute("key"), kc = key.getAttribute("keycode");
    if (!k && !kc) return "";
    const MODS = { accel: this.MAC ? "Meta" : "Ctrl", control: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" };
    const mods = new Set((key.getAttribute("modifiers") ?? "").split(/[\s,]+/).map(m => MODS[m]).filter(Boolean));
    let code;
    if (kc) {
      code = Object.keys(this.CODES).find(c => this.CODES[c] === kc) ?? (/^VK_F\d{1,2}$/.test(kc) ? kc.slice(3) : kc.replace(/^VK_/, ""));
    } else {
      const up = k.toUpperCase();
      if (/^[A-Z]$/.test(up)) code = `Key${up}`;
      else if (/^\d$/.test(up)) code = `Digit${up}`;
      else if (this.SHIFTED[k]) {
        code = this.SHIFTED[k];
        mods.add("Shift");
      } else code = Object.keys(this.CHARS).find(c => this.CHARS[c] === k) ?? `Char:${up}`;
    }
    return [...["Ctrl", "Alt", "Shift", "Meta"].filter(m => mods.has(m)), code].join("+");
  },

  same(key, attrs) {
    return ["modifiers", "key", "keycode"].every(a => (key.getAttribute(a) || "") === (attrs[a] || ""));
  },

  // The Shell's bindings → about:keyboard.
  mirror() {
    ShellKeys.read();
    for (const [name, def] of ShellKeys.LIST) {
      const id = this.STANDIN + name, key = document.getElementById(id);
      if (!key) continue;
      const want = ShellKeys.combos.get(name) ?? def, custom = !!this.CK.getDefaultKey(id);
      if (want === def) {
        if (custom) this.CK.resetKey(id);
        continue;
      }
      const attrs = this.toAttrs(want);
      if (!custom || !this.same(key, attrs)) this.CK.changeKey(id, attrs);
    }
  },

  adoptSoon() {
    if (this.adopting || !this.ready) return;
    this.adopting = true;
    setTimeout(() => {
      this.adopting = false;
      this.adopt();
    }, 0);
  },

  // about:keyboard → the Shell's bindings (only what differs from Zenith's).
  adopt() {
    const changed = new Map();
    for (const [name, def] of ShellKeys.LIST) {
      const id = this.STANDIN + name, key = document.getElementById(id);
      if (!key || !this.CK.getDefaultKey(id)) continue;
      const combo = this.fromAttrs(key);
      if (combo !== def) changed.set(name, combo);
    }
    const now = new Map(Services.prefs.getStringPref(SHELL.BINDINGS, "").split(",").map(x => x.trim()).filter(x => x.includes("="))
      .map(x => [x.slice(0, x.indexOf("=")).trim(), x.slice(x.indexOf("=") + 1).trim()]));
    const same = now.size === changed.size && [...changed].every(([n, c]) => now.get(n) === c);
    if (!same) Services.prefs.setStringPref(SHELL.BINDINGS, [...changed].map(([n, c]) => `${n}=${c}`).join(", "));
  },

  // What a key is set to, as about:keyboard shows it ("" without one).
  shown(id) {
    const key = document.getElementById(id);
    return key && (key.hasAttribute("key") || key.hasAttribute("keycode")) ? this.SU.prettifyShortcut(key) : "";
  },

  // A feature that's off: its command (and so its key) does nothing.
  enable() {
    for (const [, , pref, command] of this.OWN) {
      if (!pref) continue;
      document.getElementById(command)?.toggleAttribute("disabled", !Services.prefs.getBoolPref(pref, true));
    }
  },
};

