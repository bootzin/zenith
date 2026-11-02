/* --- Extensions per space ----------------------------------------------------
   Right-click an extension (its button, or its line in the extensions
   panel) for two lists of spaces, each with a tick per space and "Every
   space":
     - Pinned in spaces: where its button is pinned. Unticking it from the
       last space unpins it, as Firefox's "Pin to Toolbar" does (it's then
       in the extensions panel, in every space); ticking a space for one in
       the panel pins it there.
     - Runs in spaces: where the extension runs at all. In the other spaces
       Zenith turns it off, and on again as you come back (as if you
       switched it off and on in Add-ons). For two of a kind, say a work
       and a personal password manager, each in its own spaces. Firefox
       runs extensions for the whole browser (no container or space of
       their own, and Zen's profiles can't follow a space), so this is the
       closest there is. An extension starts afresh each time it comes back
       (a password manager asks to be unlocked again), its open pages in
       other spaces lose it while it's off, and with windows on different
       spaces the window you're in decides. Only what Zenith turned off is
       turned back on: an extension you switched off yourself stays off.
       While any extension has spaces, Firefox Sync is asked not to copy
       this on and off to your other devices.
   The extensions panel lists the buttons pinned only in other spaces (Pin
   here) and the extensions resting in this space (Run here too).
   Kept in zenith.internal.extension-spaces ({button id: [space ids]}),
   zenith.internal.extension-runs ({extension id: [space ids]}) and
   zenith.internal.extension-resting (the extensions Zenith turned off). */
const SpaceExtensions = {
  PREF: "zenith.internal.extension-spaces",
  RUNS: "zenith.internal.extension-runs",
  RESTING: "zenith.internal.extension-resting",

  read(pref, fallback) {
    try {
      return JSON.parse(Services.prefs.getStringPref(pref, "")) ?? fallback;
    } catch {
      return fallback;
    }
  },

  get map() {
    const map = this.read(this.PREF, {});
    // (0.11.0 kept one space as a string.)
    for (const [id, v] of Object.entries(map)) if (typeof v === "string") map[id] = [v];
    return map;
  },

  save(map) {
    Services.prefs.setStringPref(this.PREF, JSON.stringify(map));
  },

  get runs() {
    return this.read(this.RUNS, {});
  },

  get resting() {
    return new Set(this.read(this.RESTING, []));
  },

  init() {
    for (const id of ["toolbar-context-menu", "unified-extensions-context-menu"]) this.addMenus(document.getElementById(id));
    const update = () => this.update();
    const runs = () => this.runSoon();
    Services.prefs.addObserver(this.PREF, update);
    Services.prefs.addObserver(this.RUNS, runs);
    const moved = { onWidgetAfterDOMChange: update };
    window.CustomizableUI?.addListener(moved);
    onUnload(() => window.CustomizableUI?.removeListener(moved));
    window.addEventListener("ZenWorkspacesUIUpdate", update);
    window.addEventListener("activate", runs);
    const marks = new MutationObserver(() => {
      update();
      runs();
    });
    window.gZenWorkspaces?.promiseInitialized?.then(() => {
      const strip = gZenWorkspaces.workspaceElement(gZenWorkspaces.activeWorkspace)?.parentElement;
      if (strip) marks.observe(strip, { subtree: true, attributeFilter: ["active"] });
      update();
      runs();
    });
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, update);
      Services.prefs.removeObserver(this.RUNS, runs);
      window.removeEventListener("ZenWorkspacesUIUpdate", update);
      window.removeEventListener("activate", runs);
      marks.disconnect();
    });
    document.getElementById("unified-extensions-view")?.addEventListener("ViewShowing", () => this.fillPanel());
    window.ZenithSpaceExtensions = this; // for tools/checks
  },

  spaces() {
    try {
      return gZenWorkspaces.getWorkspaces() ?? [];
    } catch {
      return [];
    }
  },

  spaceLabel: s => `${s.icon && !/^[a-z]+:/i.test(s.icon) ? `${s.icon}  ` : ""}${s.name}`,

  // The two lists, at the foot of a right-click menu.
  addMenus(menu) {
    if (!menu) return;
    const sep = document.createXULElement("menuseparator");
    const make = label => {
      const m = document.createXULElement("menu");
      m.setAttribute("label", label);
      m.append(document.createXULElement("menupopup"));
      return m;
    };
    const pinned = make("Pinned in spaces"), runs = make("Runs in spaces");
    sep.hidden = pinned.hidden = runs.hidden = true;
    menu.append(sep, pinned, runs);
    // (Extension copies, when they're on.)
    const copies = [];
    menu.addEventListener("popupshowing", e => {
      if (e.target !== menu) return;
      const item = menu.triggerNode?.closest?.(".unified-extensions-item, toolbaritem[data-extensionid], .webextension-browser-action");
      const node = item?.closest?.("toolbaritem") ?? item;
      const ext = node?.getAttribute?.("data-extensionid") || item?.getAttribute?.("data-extensionid") || item?.addon?.id || item?.extension?.id || "";
      const many = !!window.gZenWorkspaces?.workspaceEnabled && this.spaces().length > 1;
      const widget = node?.id && window.CustomizableUI?.getPlacementOfWidget?.(node.id) ? node.id : null;
      pinned.hidden = !(many && widget);
      runs.hidden = !(many && ext);
      sep.hidden = pinned.hidden && runs.hidden;
      if (!pinned.hidden) this.fillPinned(pinned.menupopup, widget);
      if (!runs.hidden) this.fillRuns(runs.menupopup, ext);
      for (const c of copies.splice(0)) c.remove();
      ExtensionCopies.items(ext).then(items => {
        for (const [label, run] of items) {
          const mi = document.createXULElement("menuitem");
          mi.setAttribute("label", label);
          mi.addEventListener("command", run);
          (copies.at(-1) ?? runs).after(mi);
          copies.push(mi);
        }
        if (items.length) sep.hidden = false;
      });
    });
  },

  // A list of ticks: "Every space", then each space. It stays open while
  // you tick, like Firefox's own lists of ticks.
  ticks(popup, every, isOn, onEvery, onSpace, refill) {
    const row = (label, checked, fn) => {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", label);
      item.setAttribute("type", "checkbox");
      item.setAttribute("closemenu", "none");
      item.toggleAttribute("checked", checked);
      item.addEventListener("command", () => Promise.resolve(fn()).then(refill));
      return item;
    };
    popup.replaceChildren(row("Every space", every, onEvery), document.createXULElement("menuseparator"),
                          ...this.spaces().map(s => row(this.spaceLabel(s), isOn(s.uuid), () => onSpace(s.uuid))));
  },

  /* Pinned in spaces */

  // Pinned to the toolbar (rather than in the extensions panel).
  onToolbar(id) {
    const area = window.CustomizableUI?.getPlacementOfWidget?.(id)?.area;
    return !!area && area !== window.CustomizableUI.AREA_ADDONS;
  },

  // (Firefox's own pinning finishes a moment later.)
  async pin(id, on) {
    if (this.onToolbar(id) === on) return;
    if (window.gUnifiedExtensions?.pinToToolbar) await gUnifiedExtensions.pinToToolbar(id, on);
    else CustomizableUI.addWidgetToArea(id, on ? CustomizableUI.AREA_NAVBAR : CustomizableUI.AREA_ADDONS, on ? undefined : 0);
  },

  fillPinned(popup, id) {
    const toolbar = this.onToolbar(id), list = this.map[id];
    this.ticks(popup, toolbar && !list, uuid => toolbar && (!list || list.includes(uuid)),
               () => {
                 this.set(id, null);
                 return this.pin(id, true);
               },
               uuid => this.flip(id, uuid),
               () => this.fillPinned(popup, id));
  },

  // Untick a space: the button leaves it (from the last one, it's unpinned);
  // tick one for a button in the panel and it's pinned there; every space
  // ticked is "Every space" again.
  async flip(id, uuid) {
    const all = this.spaces().map(s => s.uuid);
    if (!this.onToolbar(id)) {
      await this.pin(id, true);
      this.set(id, all.length > 1 ? [uuid] : null);
      return;
    }
    let list = this.map[id] ?? all;
    list = list.includes(uuid) ? list.filter(u => u !== uuid) : [...list, uuid];
    if (!list.length) {
      this.set(id, null);
      await this.pin(id, false);
      return;
    }
    this.set(id, all.every(u => list.includes(u)) ? null : list);
  },

  set(id, list) {
    const map = this.map;
    if (list) map[id] = list;
    else delete map[id];
    this.save(map);
  },

  /* Runs in spaces */

  fillRuns(popup, ext) {
    const list = this.runs[ext];
    this.ticks(popup, !list, uuid => !list || list.includes(uuid),
               () => this.setRuns(ext, null),
               uuid => {
                 const all = this.spaces().map(s => s.uuid);
                 let now = this.runs[ext] ?? all;
                 now = now.includes(uuid) ? now.filter(u => u !== uuid) : [...now, uuid];
                 // (Running nowhere is switching it off: that's in Add-ons.)
                 if (now.length) this.setRuns(ext, all.every(u => now.includes(u)) ? null : now);
               },
               () => this.fillRuns(popup, ext));
  },

  setRuns(ext, list) {
    const runs = this.runs;
    if (list) runs[ext] = list;
    else delete runs[ext];
    Services.prefs.setStringPref(this.RUNS, JSON.stringify(runs));
  },

  // After a switch settles; one change at a time.
  runSoon() {
    clearTimeout(this.runTimer);
    this.runTimer = setTimeout(() => {
      this.running = (this.running ?? Promise.resolve()).then(() => this.applyRuns()).catch(e => console.error("[Zenith] extensions per space", e));
    }, 250);
  },

  // Each extension with spaces: off where it doesn't run, on where it does.
  // The window you're in decides (its space).
  async applyRuns() {
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const here = window.gZenWorkspaces?.activeWorkspace;
    const runs = this.runs, resting = this.resting;
    if (!here && !resting.size) return;
    // Sync leaves this on and off alone (before the first change).
    const sync = on => Bridge.apply("extension-runs", { "services.sync.addons.ignoreUserEnabledChanges": on ? true : null });
    if (Object.keys(runs).length) sync(true);
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const on = [], off = [];
    for (const id of new Set([...Object.keys(runs), ...resting])) {
      const addon = await AddonManager.getAddonByID(id);
      if (!addon) {
        resting.delete(id);
        continue;
      }
      const wanted = !runs[id] || runs[id].includes(here);
      if (!wanted && !resting.has(id) && !addon.userDisabled) {
        await addon.disable();
        resting.add(id);
        off.push(addon.name);
      } else if (wanted && resting.has(id)) {
        if (addon.userDisabled) await addon.enable();
        resting.delete(id);
        on.push(addon.name);
      }
    }
    Services.prefs.setStringPref(this.RESTING, JSON.stringify([...resting]));
    if (!Object.keys(runs).length && !resting.size) sync(false);
    if (on.length || off.length) {
      hint([on.length ? `${on.join(", ")} on` : "", off.length ? `${off.join(", ")} resting here` : ""].filter(Boolean).join(" · "));
    }
  },

  /* The extensions panel */

  fillPanel() {
    const area = document.getElementById("unified-extensions-area");
    if (!area) return;
    let box = document.getElementById("zenith-other-space-extensions");
    if (!box) {
      box = document.createXULElement("vbox");
      box.id = "zenith-other-space-extensions";
      area.after(box);
    }
    const here = window.gZenWorkspaces?.activeWorkspace;
    const head = text => {
      const label = document.createXULElement("label");
      label.className = "zenith-ose-head";
      label.setAttribute("value", text);
      return label;
    };
    const row = (icon, text, action, run) => {
      const r = document.createXULElement("hbox");
      r.className = "zenith-ose-row";
      r.setAttribute("align", "center");
      const name = document.createXULElement("label");
      name.className = "zenith-ose-name";
      name.setAttribute("value", text);
      name.setAttribute("flex", "1");
      name.setAttribute("crop", "end");
      const b = document.createXULElement("toolbarbutton");
      b.className = "subviewbutton zenith-ose-pin";
      b.setAttribute("label", action);
      b.addEventListener("command", () => {
        run();
        setTimeout(() => this.fillPanel(), 400);
      });
      r.append(icon, name, b);
      return r;
    };
    const pinnedAway = [...document.querySelectorAll("[zenith-other-space]")].filter(n => n.id).map(node => {
      const button = node.querySelector("toolbarbutton") ?? node;
      const icon = document.createXULElement("image");
      icon.className = "zenith-ose-icon";
      for (const v of ["--webextension-toolbar-image", "--webextension-toolbar-image-2x", "--webextension-menupanel-image"]) {
        const value = button.style.getPropertyValue(v);
        if (value) icon.style.setProperty(v, value);
      }
      return row(icon, button.getAttribute("label") || button.getAttribute("tooltiptext") || node.id, "Pin here", () => here && this.flip(node.id, here));
    });
    box.replaceChildren(...(pinnedAway.length ? [head("Pinned in other spaces"), ...pinnedAway] : []));
    box.hidden = !pinnedAway.length;
    // Resting here (their buttons are gone while they're off).
    const resting = [...this.resting];
    if (!resting.length) return;
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    Promise.all(resting.map(id => AddonManager.getAddonByID(id))).then(addons => {
      const rows = addons.filter(Boolean).map(addon => {
        const icon = document.createXULElement("image");
        icon.className = "zenith-ose-icon";
        if (addon.iconURL) icon.style.listStyleImage = `url("${addon.iconURL}")`;
        return row(icon, addon.name, "Run here too", () => {
          const list = this.runs[addon.id];
          if (list && here && !list.includes(here)) this.setRuns(addon.id, [...list, here]);
        });
      });
      if (!rows.length) return;
      box.append(head("Resting in this space"), ...rows);
      box.hidden = false;
    });
  },

  // Hide the buttons that aren't pinned in this space (only what changed,
  // so nothing in the open sidebar is touched needlessly).
  update() {
    const map = this.map, here = window.gZenWorkspaces?.activeWorkspace;
    // Unpinned since (Firefox's "Pin to Toolbar"): its spaces are forgotten,
    // so pinning it again pins it everywhere.
    const CUI = window.CustomizableUI;
    const gone = Object.keys(map).filter(id => CUI && CUI.getPlacementOfWidget(id)?.area === CUI.AREA_ADDONS);
    if (gone.length) {
      for (const id of gone) delete map[id];
      this.save(map);
      return;
    }
    const away = new Set(Object.entries(map).filter(([, list]) => here && !list.includes(here)).map(([id]) => id));
    for (const node of document.querySelectorAll("[zenith-other-space]")) if (!away.has(node.id)) node.removeAttribute("zenith-other-space");
    for (const id of away) {
      const node = document.getElementById(id);
      if (node && !node.hasAttribute("zenith-other-space")) node.setAttribute("zenith-other-space", "true");
    }
  },
};

