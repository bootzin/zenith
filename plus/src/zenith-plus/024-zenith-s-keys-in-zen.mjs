/* --- Zenith's keys in Zen's Keyboard shortcuts ---------------------------------
   Every Zenith key is added to Zen's own shortcut list (Settings › Keyboard
   shortcuts, under Other, labelled "Zenith: …"), so you can change or clear
   it there like any of Zen's. Zen saves the list and turns it into keys in
   every window, pointed at Zenith's commands; Zenith's own keys step aside
   once Zen has them. A feature switched off disables its command, so its
   key does nothing. Added once: a key you changed or cleared stays as you
   left it. */
const ZenithKeys = {
  // id in Zen's list · key · modifiers · Zenith's command · label · the
  // setting that switches it off · Zenith's own key element
  LIST: [
    ["zenith-key-switcher", "w", { alt: true }, "zenith-switcher-command", "Switcher", "zenith.plus.switcher", "zenith-switcher-key"],
    ["zenith-key-peek", "q", { alt: true }, "zenith-peek-command", "Peek", "zenith.peek.enabled", "zenith-peek-key"],
    ["zenith-key-focus", "z", { alt: true }, "zenith-focus-command", "Focus mode", "zenith.plus.focus-key", "zenith-focus-key"],
    ["zenith-key-tabs", "t", { alt: true, shift: true }, "zenith-tabs-command", "Tab manager", "zenith.plus.tab-manager", "zenith-tabs-key"],
    ["zenith-key-live", "z", { alt: true, shift: true }, "zenith-live-command", "Settings over the page", null, "zenith-live-key"],
    ["zenith-key-float", "f", { alt: true, shift: true }, "zenith-float-command", "Float a tab", "zenith.plus.float-tab", "zenith-float-key"],
  ],

  init() {
    window.ZenithKeys = this; // the settings page's labels, and tools/checks
    const M = window.gZenKeyboardShortcutsManager;
    if (!M) return;
    const ready = () => this.adopt(M).catch(e => console.error("[Zenith] keys in Zen's shortcuts", e));
    if (M._currentShortcutList) ready();
    else window.addEventListener("ZenKeyboardShortcutsReady", ready, { once: true });
    const enable = () => this.enable();
    for (const pref of new Set(this.LIST.map(k => k[5]).filter(Boolean))) Services.prefs.addObserver(pref, enable);
    onUnload(() => {
      for (const pref of new Set(this.LIST.map(k => k[5]).filter(Boolean))) Services.prefs.removeObserver(pref, enable);
    });
    enable();
  },

  async adopt(M) {
    const list = M._currentShortcutList;
    const Shortcut = list?.[0]?.constructor;
    if (!Shortcut?.parseFromSaved) return;
    // (0.12.1 floated tabs on Alt+Shift+Space, which Windows keeps for the
    // window menu: still on it, it moves to Alt+Shift+F.)
    const old = list.findIndex(s => s.getID() === "zenith-key-float" && s.getKeyName?.() === " " && s.getModifiers?.().alt && s.getModifiers?.().shift);
    if (old >= 0) list.splice(old, 1);
    // (0.13.0: link hints moved to the Shell's keys, Alt+; by where the key
    // is, so they leave Zen's list, which matches by letter.)
    let moved = false;
    for (let i = list.length - 1; i >= 0; i--) {
      if (/^zenith-key-hints(-tab)?$/.test(list[i].getID())) {
        list.splice(i, 1);
        moved = true;
      }
    }
    const have = new Set(list.map(s => s.getID()));
    const missing = this.LIST.filter(([id]) => !have.has(id));
    if (moved && !missing.length) {
      await M._saveShortcuts();
      M.triggerShortcutRebuild();
    }
    if (missing.length) {
      const fresh = Shortcut.parseFromSaved(missing.map(([id, key, mods, command]) => ({
        id, key, keycode: "", group: "zen-other", l10nId: null, action: command,
        modifiers: { control: false, alt: !!mods.alt, shift: !!mods.shift, meta: false, accel: !!mods.accel },
        disabled: false, reserved: true, internal: false,
      })));
      list.push(...fresh);
      await M._saveShortcuts();
      M.triggerShortcutRebuild();
    }
    // Zen has them now: Zenith's own keys step aside, now and as they
    // turn up (Zenith's scripts start one by one, each adding its keys at
    // the top of the window).
    this.adopted = true;
    this.stepAside();
    this.watcher ??= new MutationObserver(() => this.stepAside());
    this.watcher.observe(document.documentElement, { childList: true });
    onUnload(() => this.watcher.disconnect());
  },

  stepAside() {
    for (const [, , , , , , own] of this.LIST) document.getElementById(own)?.remove();
  },

  // A feature that's off: its command (and so its key) does nothing.
  enable() {
    for (const [, , , command, , pref] of this.LIST) {
      if (!pref) continue;
      const on = Services.prefs.getBoolPref(pref, true);
      document.getElementById(command)?.toggleAttribute("disabled", !on);
    }
  },
};

