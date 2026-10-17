// ==UserScript==
// @name           Zenith Plus
// @description    Zenith Plus: real load and download progress, the sidebar minimap, zoom pills, page colours, the matching sidebar colour and more.
// @include        main
// @version        0.9.0
// ==/UserScript==

// Loaded into every browser window by the script loader (fx-autoconfig, or
// Sine's, which is built on it). Zenith Plus's own stylesheet (plus/chrome.css,
// installed as the "Zenith Plus" mod) decides what is shown and how; this
// script feeds it live data through attributes and CSS variables, and adds
// a few small elements:
//   #zenith-load-edge       inside the loading tab's panel
//   #zenith-insecure-hint   hover strip for the not-secure edge
//   #zenith-download-edge   at the bottom of the page area
//   #zenith-minimap         at the window edge, for the hidden sidebar
//   .zenith-zoom-pill       in any pane whose zoom isn't 100%
// and gives Zenith's glass the workspace colour Zen paints (--zth-paint).
// Settings live in Settings > Zen Mods > Zenith Plus. Zenith's six CSS mods
// work without any of this. Peek has its own script, zenith-peek.uc.mjs.

const HTML_NS = "http://www.w3.org/1999/xhtml";
const root = document.documentElement;
root.setAttribute("zenith-script", "1");

const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");

function el(tag, attrs = {}) {
  const node = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Run each feature on its own, so one failure can't take the others down.
// Start once per window, even if two copies of Zenith are installed for a
// moment (say the old seven Sine mods and the new one, while moving over).
const FIRST = !window.zenithPlusStarted;
window.zenithPlusStarted = true;

function start(name, fn) {
  if (!FIRST) return;
  try {
    fn();
  } catch (e) {
    console.error(`[Zenith] ${name} failed to start`, e);
  }
}

function onUnload(fn) {
  window.addEventListener("unload", fn, { once: true });
}

/* --- Load edge: real page-load progress ---------------------------------- */

const LoadEdge = {
  edge: null,
  state: new WeakMap(), // browser -> { value, loading }
  creep: null,

  init() {
    this.edge = el("div", { id: "zenith-load-edge", state: "idle" });
    this.listener = {
      onStateChange: (browser, webProgress, request, flags) => {
        if (!webProgress.isTopLevel || !(flags & Ci.nsIWebProgressListener.STATE_IS_NETWORK)) {
          return;
        }
        if (flags & Ci.nsIWebProgressListener.STATE_START) {
          this.state.set(browser, { value: 0.06, loading: true });
        } else if (flags & Ci.nsIWebProgressListener.STATE_STOP) {
          this.state.set(browser, { value: 1, loading: false });
        }
        if (browser === gBrowser.selectedBrowser) this.render();
      },
      onProgressChange: (browser, webProgress, request, curSelf, maxSelf, curTotal, maxTotal) => {
        const s = this.state.get(browser);
        if (!s?.loading || maxTotal <= 0) return;
        s.value = Math.max(s.value, 0.1 + 0.85 * Math.min(1, curTotal / maxTotal));
        if (browser === gBrowser.selectedBrowser) this.render();
      },
    };
    gBrowser.addTabsProgressListener(this.listener);
    // Pages rarely report their total size, so progress also creeps towards
    // 90% on its own while loading.
    this.creep = setInterval(() => {
      const s = this.state.get(gBrowser.selectedBrowser);
      if (s?.loading) {
        s.value += (0.9 - s.value) * 0.05;
        this.render();
      }
    }, 250);
    const onSelect = () => this.render(true);
    gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
    onUnload(() => {
      gBrowser.removeTabsProgressListener(this.listener);
      clearInterval(this.creep);
      gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
    });
  },

  render(jump = false) {
    const browser = gBrowser.selectedBrowser;
    const panel = document.getElementById(gBrowser.selectedTab.linkedPanel);
    if (panel && this.edge.parentNode !== panel) {
      panel.prepend(this.edge);
      jump = true;
    }
    const s = this.state.get(browser) ?? { value: 0, loading: browser.webProgress?.isLoadingDocument };
    this.edge.toggleAttribute("jump", jump);
    this.edge.style.setProperty("--zth-load-progress", s.value.toFixed(3));
    const next = s.loading ? "loading" : s.value >= 1 ? "done" : "idle";
    this.edge.setAttribute("state", next);
    if (next === "done") {
      clearTimeout(this.doneTimer);
      this.doneTimer = setTimeout(() => {
        if (this.state.get(browser)?.loading === false) {
          this.state.set(browser, { value: 0, loading: false });
          if (browser === gBrowser.selectedBrowser) this.edge.setAttribute("state", "idle");
        }
      }, 500);
    }
  },
};

/* --- Not-secure hint: a hover strip along the amber edge ------------------
   The amber edge itself is CSS; this only adds a thin strip at the top of
   the current tab's pane so hovering the edge can show a label. The CSS
   shows the strip only while the edge is on. */

const InsecureHint = {
  init() {
    this.hint = el("div", { id: "zenith-insecure-hint" });
    const place = () => {
      const panel = document.getElementById(gBrowser.selectedTab.linkedPanel);
      if (panel && this.hint.parentNode !== panel) panel.append(this.hint);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", place);
    onUnload(() => gBrowser.tabContainer.removeEventListener("TabSelect", place));
    place();
  },
};

/* --- Window paint: the workspace colour, for Zenith's glass ----------------
   Zen keeps the window's workspace colour only on #zen-browser-background
   (one colour, or a gradient of up to three, each with Zen's opacity), so
   nothing else can read it. Every Zenith glass surface uses one colour made
   from it: this averages Zen's colours and hands Core the result and its
   strength (--zth-paint, --zth-paint-share) whenever Zen changes them. */

const WindowPaint = {
  colours(value) {
    const found = [...value.matchAll(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/g)];
    return found.map(m => {
      let a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (m[4]?.endsWith("%")) a /= 100;
      return [+m[1], +m[2], +m[3], a];
    });
  },

  init() {
    const bg = document.getElementById("zen-browser-background");
    if (!bg) return;
    const copy = () => {
      const colours = this.colours(bg.style.getPropertyValue("--zen-main-browser-background"));
      if (!colours.length) {
        root.style.removeProperty("--zth-paint");
        root.style.removeProperty("--zth-paint-share");
        return;
      }
      const avg = i => colours.reduce((n, c) => n + c[i], 0) / colours.length;
      root.style.setProperty("--zth-paint", `rgb(${[0, 1, 2].map(i => Math.round(avg(i))).join(" ")})`);
      root.style.setProperty("--zth-paint-share", `${Math.round(avg(3) * 100)}%`);
    };
    const mo = new MutationObserver(copy);
    mo.observe(bg, { attributes: true, attributeFilter: ["style"] });
    onUnload(() => mo.disconnect());
    copy();
  },
};

/* --- Ctrl hold: numbered tabs on demand -----------------------------------
   With Zenith Tabs > Numbered tabs on "While holding Ctrl", holding Ctrl on
   its own for a moment sets [zenith-ctrl-held] (the CSS shows the numbers)
   and opens the compact sidebar, so Ctrl+number can be aimed. Any other key
   (except a digit), a click or a scroll means Ctrl is part of a shortcut,
   so nothing shows; releasing Ctrl or leaving the window hides it again.
   On macOS tabs are Cmd+1-9, so there it's Cmd that's held. */

const CtrlHold = {
  DELAY: 280,
  PREF: "zenith.tabs.numbers",
  KEY: Services.appinfo.OS === "Darwin" ? "Meta" : "Control",

  init() {
    let timer = null;
    let shown = false;
    const show = on => {
      shown = on;
      root.toggleAttribute("zenith-ctrl-held", on);
      if (!gZenCompactModeManager?.preference) return;
      // Zen's own "flash" keeps the compact sidebar out; 0ms ends it.
      gZenCompactModeManager.flashElement(gNavToolbox, on ? 60000 : 0, "zenith-ctrl-hold");
    };
    const stop = () => {
      clearTimeout(timer);
      timer = null;
      if (shown) show(false);
    };
    const onDown = e => {
      if (e.key === this.KEY) {
        const other = this.KEY === "Meta" ? e.ctrlKey : e.metaKey;
        if (e.repeat || e.altKey || e.shiftKey || other) return;
        if (Services.prefs.getStringPref(this.PREF, "") !== "ctrl") return;
        clearTimeout(timer);
        timer = setTimeout(() => show(true), this.DELAY);
      } else if (!(shown && /^[1-9]$/.test(e.key))) {
        stop();
      }
    };
    const onUp = e => {
      if (e.key === this.KEY) stop();
    };
    const listeners = [["keydown", onDown], ["keyup", onUp], ["mousedown", stop], ["wheel", stop], ["blur", stop]];
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
    onUnload(() => {
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    });
  },
};

/* --- Download edge: real download progress -------------------------------- */

const DownloadEdge = {
  async init() {
    this.edge = el("div", { id: "zenith-download-edge" });
    document.getElementById("zen-tabbox-wrapper")?.append(this.edge);
    this.list = await Downloads.getList(Downloads.ALL);
    this.view = {
      onDownloadAdded: d => this.update(d),
      onDownloadChanged: d => this.update(d),
      onDownloadRemoved: () => this.update(),
    };
    await this.list.addView(this.view);
    onUnload(() => this.list.removeView(this.view));
  },

  async update(changed) {
    const all = await this.list.getAll();
    const running = all.filter(d => !d.stopped);
    if (changed?.succeeded && !this.flashed?.has(changed)) {
      (this.flashed ??= new WeakSet()).add(changed);
      root.setAttribute("zenith-download-done", "true");
      clearTimeout(this.doneTimer);
      this.doneTimer = setTimeout(() => root.removeAttribute("zenith-download-done"), 1600);
    }
    if (!running.length) {
      root.removeAttribute("zenith-downloading");
      return;
    }
    const sized = running.filter(d => d.hasProgress && d.totalBytes > 0);
    const total = sized.reduce((n, d) => n + d.totalBytes, 0);
    const done = sized.reduce((n, d) => n + d.currentBytes, 0);
    root.setAttribute("zenith-downloading", sized.length ? "sized" : "unsized");
    this.edge.style.setProperty("--zth-download-progress", total ? (done / total).toFixed(3) : "0");
    this.edge.setAttribute("count", String(running.length));
  },
};

/* --- Minimap: ticks for tabs that need you, while the sidebar is hidden --- */

const Minimap = {
  init() {
    this.strip = el("div", { id: "zenith-minimap" });
    document.getElementById("zen-tabbox-wrapper")?.append(this.strip);
    const schedule = () => {
      if (!this.pending) {
        this.pending = true;
        requestAnimationFrame(() => {
          this.pending = false;
          this.draw();
        });
      }
    };
    const tabs = gBrowser.tabContainer;
    const events = ["TabAttrModified", "TabSelect", "TabOpen", "TabClose", "TabMove", "TabPinned", "TabUnpinned"];
    events.forEach(e => tabs.addEventListener(e, schedule));
    tabs.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);
    this.interval = setInterval(schedule, 1500); // catches folder collapses and anything else that moves tabs
    onUnload(() => {
      events.forEach(e => tabs.removeEventListener(e, schedule));
      tabs.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      clearInterval(this.interval);
    });
    schedule();
  },

  kind(tab) {
    if (tab.hasAttribute("sharing")) return "sharing";
    if (tab.hasAttribute("attention") || tab.hasAttribute("titlechanged")) return "attention";
    if (tab.hasAttribute("soundplaying") && !tab.hasAttribute("muted")) return "playing";
    if (tab.hasAttribute("busy")) return "loading";
    return null;
  },

  draw() {
    const box = this.strip.getBoundingClientRect();
    const list = document.querySelector("zen-workspace[active] .workspace-arrowscrollbox") ?? gBrowser.tabContainer;
    const view = list.getBoundingClientRect();
    const ticks = [];
    for (const tab of gBrowser.tabs) {
      const kind = this.kind(tab);
      if (!kind || tab.hasAttribute("zen-glance-tab")) continue;
      // Only the current space (and Essentials) is on screen.
      if (!tab.hasAttribute("zen-essential") && !tab.closest("zen-workspace")?.hasAttribute("active")) continue;
      const r = tab.getBoundingClientRect();
      if (!r.height) continue; // inside a collapsed folder
      let y = r.top + r.height / 2;
      let clamp = "";
      if (y < view.top) [y, clamp] = [view.top + 4, "above"];
      else if (y > view.bottom) [y, clamp] = [view.bottom - 4, "below"];
      ticks.push({ kind, y: y - box.top, h: tab.hasAttribute("zen-essential") ? 6 : Math.max(8, r.height - 12), clamp });
    }
    this.strip.replaceChildren(
      ...ticks.map(t => {
        const tick = el("div", { class: "zenith-tick", kind: t.kind });
        if (t.clamp) tick.setAttribute("clamp", t.clamp);
        tick.style.setProperty("--y", `${Math.round(t.y)}px`);
        tick.style.setProperty("--h", `${Math.round(t.h)}px`);
        return tick;
      })
    );
    this.strip.toggleAttribute("empty", !ticks.length);
  },
};

/* --- Page accent: selection (and optional scrollbars) inside web pages -----
   Web pages can't see the workspace colour, so the script registers a small
   stylesheet with the current accent and refreshes it when it changes.
   It must be an AUTHOR sheet: Firefox ignores ::selection in user and agent
   sheets (measured: selection stayed at the default blue with a USER_SHEET,
   and took the accent with an AUTHOR_SHEET). Rules use low specificity, so
   sites that style their own selection or scrollbars keep their look. */

const PageAccent = {
  sss: Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService),
  prefs: ["zenith.page.selection", "zenith.page.thin-scrollbars", "zenith.core.accent"],

  init() {
    this.probe = el("div", { hidden: "true" });
    this.probe.style.color = "var(--zth-accent)";
    document.body.append(this.probe);
    const refresh = () => this.refreshSoon();
    this.prefs.forEach(p => Services.prefs.addObserver(p, refresh));
    window.addEventListener("activate", refresh);
    window.addEventListener("ZenWorkspacesUIUpdate", refresh);
    const mo = new MutationObserver(refresh);
    mo.observe(root, { attributes: true, attributeFilter: ["style"] });
    onUnload(() => {
      this.prefs.forEach(p => Services.prefs.removeObserver(p, refresh));
      mo.disconnect();
    });
    this.refresh();
  },

  refreshSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 150);
  },

  refresh() {
    // Only the focused window decides the colour for all pages.
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const accent = getComputedStyle(this.probe).color;
    const rules = [];
    if (Services.prefs.getBoolPref("zenith.page.selection", true)) {
      // A tint of the accent; the text keeps its own colour.
      rules.push(`::selection { background-color: color-mix(in srgb, ${accent} 55%, transparent); }`);
    }
    if (Services.prefs.getBoolPref("zenith.page.thin-scrollbars", false)) {
      rules.push(`:where(:root) { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, ${accent} 70%, transparent) transparent; }`);
    }
    const spec = rules.length ? "data:text/css;charset=utf-8," + encodeURIComponent(rules.join("\n")) : "";
    // Every window runs its own copy of this script, so the registered sheet
    // is remembered in a hidden pref that all windows share.
    const old = Services.prefs.getStringPref(this.SHEET_PREF, "");
    const { AUTHOR_SHEET, USER_SHEET } = this.sss;
    if (old && old !== spec) {
      const oldURI = Services.io.newURI(old);
      // USER_SHEET: what versions before round 4 registered.
      for (const type of [AUTHOR_SHEET, USER_SHEET]) {
        if (this.sss.sheetRegistered(oldURI, type)) this.sss.unregisterSheet(oldURI, type);
      }
    }
    // After a restart the pref survives but the sheet doesn't, so check.
    if (spec) {
      const uri = Services.io.newURI(spec);
      if (this.sss.sheetRegistered(uri, USER_SHEET)) this.sss.unregisterSheet(uri, USER_SHEET);
      if (!this.sss.sheetRegistered(uri, AUTHOR_SHEET)) this.sss.loadAndRegisterSheet(uri, AUTHOR_SHEET);
    }
    Services.prefs.setStringPref(this.SHEET_PREF, spec);
  },

  SHEET_PREF: "zenith.internal.page-sheet",
};

/* --- Zoom pills: one per pane whose zoom isn't 100% ------------------------ */

const ZoomPills = {
  init() {
    const update = () => requestAnimationFrame(() => this.update());
    ["FullZoomChange", "TextZoomChange"].forEach(e => window.addEventListener(e, update, true));
    gBrowser.tabContainer.addEventListener("TabSelect", update);
    window.addEventListener("ZenViewSplitter:SplitViewActivated", update);
    window.addEventListener("ZenViewSplitter:SplitViewDeactivated", update);
    this.listener = { onLocationChange: () => setTimeout(update, 300) };
    gBrowser.addTabsProgressListener(this.listener);
    onUnload(() => gBrowser.removeTabsProgressListener(this.listener));
    update();
  },

  update() {
    const panes = document.querySelectorAll("#tabbrowser-tabpanels > .browserSidebarContainer");
    for (const pane of panes) {
      const browser = pane.querySelector("browser[type='content']");
      const container = pane.querySelector(".browserContainer");
      let pill = container?.querySelector(":scope > .zenith-zoom-pill");
      const visible = pane.classList.contains("deck-selected") || pane.getAttribute("zen-split") === "true";
      const zoom = browser && visible ? Math.round(ZoomManager.getZoomForBrowser(browser) * 100) : 100;
      if (zoom === 100 || !container) {
        pill?.remove();
        continue;
      }
      if (!pill) {
        pill = el("button", { class: "zenith-zoom-pill", title: "Reset zoom" });
        pill.addEventListener("click", () => {
          FullZoom.reset(browser);
          setTimeout(() => this.update(), 50);
        });
        container.append(pill);
      }
      pill.textContent = `${zoom}%`;
    }
  },
};

/* --- Motion bridge: let Zen animate when Windows animation effects are off -
   Windows "Animation effects" off makes Firefox report reduced motion, so
   Zen skips many of its own animations. With "Let Zen animate too" on (the
   default), this tells Zen alone that motion is fine, through Firefox's
   ui.prefersReducedMotion setting. Windows itself is never changed, and
   turning it off (or Zenith Motion's "Follow Windows") hands control back. */

const MotionBridge = {
  PREFS: ["zenith.plus.animate-zen"],
  OWN: "zenith.internal.motion-override",
  SYSTEM: "ui.prefersReducedMotion",

  init() {
    const apply = () => this.apply();
    this.PREFS.forEach(p => Services.prefs.addObserver(p, apply));
    onUnload(() => this.PREFS.forEach(p => Services.prefs.removeObserver(p, apply)));
    this.apply();
  },

  apply() {
    // This makes Firefox report "no reduced motion" everywhere, so while it's
    // on, Zenith Motion's "Follow Windows" has nothing to follow (the
    // settings page greys it out).
    const animate = Services.prefs.getBoolPref("zenith.plus.animate-zen", true);
    if (animate) {
      if (Services.prefs.getIntPref(this.SYSTEM, -1) !== 0) Services.prefs.setIntPref(this.SYSTEM, 0);
      Services.prefs.setBoolPref(this.OWN, true);
    } else if (Services.prefs.getBoolPref(this.OWN, false)) {
      // Only undo what Zenith itself set.
      Services.prefs.clearUserPref(this.SYSTEM);
      Services.prefs.setBoolPref(this.OWN, false);
    }
  },
};

/* --- Press light: liquid glass lights up where you press ------------------
   With Glass edge on Liquid, pressing a tab, an essential, the media card,
   the Peek prompt, a notice or a card in the live panel lights that glass
   up under the pointer: it brightens quickly, follows the pointer while you
   hold, and fades after you let go (inspired by Zia). Zenith Core draws it
   from --zth-press; this sets it each frame, because a mod stylesheet can't
   register the property that a CSS animation of it would need. */
const PressLight = {
  // [what you press, the part that's painted (null: itself)]
  SURFACES: [[".tabbrowser-tab", ".tab-background"], [".zen-media-card", null], ["#zenith-peek-box", null],
             [".zenith-toast", null], ["#zenith-live .zp-card", null], ["#zenith-live .zp-chip", null]],
  RISE: 90,    // ms to full light
  HOLD: 140,   // ms it stays at least, for a quick click
  FADE: 320,   // ms to fade after you let go

  init() {
    const onDown = e => this.press(e);
    const onMove = e => this.follow(e);
    const onUp = () => this.release();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("blur", onUp);
    onUnload(() => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("blur", onUp);
    });
  },

  surface(target) {
    for (const [hit, part] of this.SURFACES) {
      const host = target.closest?.(hit);
      if (host) return part ? host.querySelector(part) : host;
    }
    return null;
  },

  place(glass, e) {
    const box = glass.getBoundingClientRect();
    glass.style.setProperty("--zth-press-x", `${Math.round(e.clientX - box.left)}px`);
    glass.style.setProperty("--zth-press-y", `${Math.round(e.clientY - box.top)}px`);
  },

  press(e) {
    if (Services.prefs.getStringPref("zenith.core.glass-edge", "") !== "liquid" || e.button !== 0) return;
    const glass = this.surface(e.target);
    if (!glass) return;
    if (this.glass && this.glass !== glass) this.clear(this.glass);
    this.glass = glass;
    this.down = performance.now();
    this.held = true;
    this.from = this.level(glass);
    this.place(glass, e);
    glass.setAttribute("zenith-press", "true");
    this.run();
  },

  follow(e) {
    if (this.held && this.glass?.isConnected) this.place(this.glass, e);
  },

  release() {
    if (!this.held) return;
    this.held = false;
    this.up = Math.max(performance.now(), this.down + this.HOLD);
    this.run();
  },

  level(glass) {
    return parseFloat(glass.style.getPropertyValue("--zth-press")) || 0;
  },

  // One animation frame loop: rise while held, then fade.
  run() {
    if (this.frame) return;
    const step = now => {
      this.frame = null;
      const glass = this.glass;
      if (!glass?.isConnected) return this.clear(glass);
      let level;
      if (this.held || now < this.up) {
        const t = Math.min(1, (now - this.down) / this.RISE);
        level = this.from + (1 - this.from) * (1 - (1 - t) ** 2);
      } else {
        const t = Math.min(1, (now - this.up) / this.FADE);
        level = (1 - t) ** 2;
        if (t >= 1) return this.clear(glass);
      }
      glass.style.setProperty("--zth-press", level.toFixed(3));
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  },

  clear(glass) {
    if (!glass) return;
    glass.removeAttribute("zenith-press");
    for (const p of ["--zth-press", "--zth-press-x", "--zth-press-y"]) glass.style.removeProperty(p);
    if (glass === this.glass) {
      this.glass = null;
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  },
};

/* --- Window material: Windows' backdrop, macOS vibrancy, Linux see-through -
   Zen draws its window over the system's own material, set by a few number
   and switch settings Zen's mod settings can't hold. The Plus settings for
   each platform write them ("Zen default" hands them back). Windows and
   macOS switch at once; Linux needs a restart. A value you had set yourself
   before Zenith took over is kept and put back. */
const WindowMaterial = {
  PREFS: ["zenith.plus.material-windows", "zenith.plus.material-macos", "zenith.plus.material-linux"],

  // The platform's settings and the values Zenith wants (null: Zen's own).
  wanted() {
    const s = name => Services.prefs.getStringPref(name, "");
    switch (Services.appinfo.OS) {
      case "WINNT": {
        const v = s("zenith.plus.material-windows");
        return {
          "widget.windows.mica": v ? v !== "off" : null,
          "widget.windows.mica.toplevel-backdrop": { auto: 0, mica: 1, acrylic: 2, "mica-alt": 3 }[v] ?? null,
        };
      }
      case "Darwin": {
        const v = s("zenith.plus.material-macos");
        const material = { hud: 1, fullscreen: 2, popover: 3, menu: 4, tooltip: 5, header: 6, under: 7 }[v];
        return { "zen.widget.macos.window-vibrancy": v ? v !== "off" : null, "zen.widget.macos.window-material": material ?? null };
      }
      default: {
        const v = s("zenith.plus.material-linux");
        return { "zen.widget.linux.transparency": v ? v === "on" : null };
      }
    }
  },

  init() {
    const apply = () => this.apply();
    this.PREFS.forEach(p => Services.prefs.addObserver(p, apply));
    onUnload(() => this.PREFS.forEach(p => Services.prefs.removeObserver(p, apply)));
    this.apply();
  },

  apply() {
    const P = Services.prefs;
    for (const [pref, value] of Object.entries(this.wanted())) {
      const owned = `zenith.internal.material.${pref}`;
      if (value === null) {
        // Hand it back: your own earlier value, or Zen's default.
        if (!P.prefHasUserValue(owned)) continue;
        const saved = P.getStringPref(owned, "");
        if (saved === "") P.clearUserPref(pref);
        else if (typeof JSON.parse(saved) === "boolean") P.setBoolPref(pref, JSON.parse(saved));
        else P.setIntPref(pref, JSON.parse(saved));
        P.clearUserPref(owned);
        continue;
      }
      if (!P.prefHasUserValue(owned)) {
        const type = P.getPrefType(pref);
        const mine = P.prefHasUserValue(pref)
          ? JSON.stringify(type === P.PREF_BOOL ? P.getBoolPref(pref) : P.getIntPref(pref))
          : "";
        P.setStringPref(owned, mine);
      }
      if (typeof value === "boolean") {
        if (P.getBoolPref(pref, !value) !== value) P.setBoolPref(pref, value);
      } else if (P.getIntPref(pref, -1) !== value) {
        P.setIntPref(pref, value);
      }
    }
  },
};

/* --- Media art: the cover of what's playing, behind its media card -------
   Most music and video sites give the browser cover art (Media Session
   metadata); Firefox uses it for the system's media controls. Zen's media
   cards at the foot of the sidebar show only the title and buttons, so the
   art is read from the playing tab and set as --zth-media-art on its card,
   with its average colour as --zth-media-tint. Cards don't say which tab
   they belong to, so a card is matched by the title and artist it shows.
   The image is fetched without cookies and shown from a local copy. */
const MediaArt = {
  PREF: "zenith.plus.media-art",
  copies: new Map(), // art address -> Promise<{ url, tint }>

  init() {
    const bar = document.getElementById("zen-media-controls-toolbar");
    if (!bar) return;
    const schedule = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.update(bar), 250);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["value"] });
    Services.prefs.addObserver(this.PREF, schedule);
    onUnload(() => {
      mo.disconnect();
      Services.prefs.removeObserver(this.PREF, schedule);
      for (const copy of this.copies.values()) copy.then(c => c && URL.revokeObjectURL(c.url));
    });
    schedule();
  },

  async update(bar) {
    const on = Services.prefs.getBoolPref(this.PREF, true);
    for (const card of bar.querySelectorAll(".zen-media-card")) {
      const src = on ? this.artFor(card) : null;
      if (src === card.zenithArtSrc) continue;
      card.zenithArtSrc = src;
      const copy = src ? await this.copy(src) : null;
      if (card.zenithArtSrc !== src) continue; // changed while loading
      if (copy) {
        card.style.setProperty("--zth-media-art", `url("${copy.url}")`);
        if (copy.tint) card.style.setProperty("--zth-media-tint", copy.tint);
        card.setAttribute("zenith-art", "true");
      } else {
        card.removeAttribute("zenith-art");
        card.style.removeProperty("--zth-media-art");
        card.style.removeProperty("--zth-media-tint");
      }
    }
  },

  text(card, cls) {
    const label = card.querySelector(cls);
    return (label?.value || label?.textContent || "").trim();
  },

  // The biggest artwork of the playing tab whose title and artist the card shows.
  artFor(card) {
    const title = this.text(card, ".zen-media-title");
    const artist = this.text(card, ".zen-media-artist");
    if (!title) return null;
    const area = a => a.sizes?.split(/\s+/).map(s => s.split("x").reduce((x, y) => x * y, 1)).reduce((x, y) => Math.max(x, y), 0) || 0;
    for (const tab of gBrowser.tabs) {
      const controller = tab.linkedBrowser?.browsingContext?.mediaController;
      if (!controller?.isActive) continue;
      let meta;
      try {
        meta = controller.getMetadata();
      } catch {
        continue; // no metadata
      }
      if (meta.title !== title || (artist && meta.artist !== artist)) continue;
      const art = [...(meta.artwork ?? [])].filter(a => /^(https?|data|blob):/.test(a.src ?? "")).sort((a, b) => area(b) - area(a))[0];
      return art?.src ?? null;
    }
    return null;
  },

  copy(src) {
    if (!this.copies.has(src)) {
      this.copies.set(src, (async () => {
        try {
          const res = await fetch(src, { credentials: "omit" });
          if (!res.ok) return null;
          const blob = await res.blob();
          if (!blob.type.startsWith("image/")) return null;
          const url = URL.createObjectURL(blob);
          return { url, tint: await this.tint(url) };
        } catch (e) {
          console.warn("[Zenith] media art", e);
          return null;
        }
      })());
    }
    return this.copies.get(src);
  },

  // The image's average colour (ignoring transparent pixels).
  tint(url) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = el("canvas");
          canvas.width = canvas.height = 6;
          const g = canvas.getContext("2d");
          g.drawImage(img, 0, 0, 6, 6);
          const d = g.getImageData(0, 0, 6, 6).data;
          let r = 0, gr = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            r += d[i];
            gr += d[i + 1];
            b += d[i + 2];
            n++;
          }
          resolve(n ? `rgb(${Math.round(r / n)} ${Math.round(gr / n)} ${Math.round(b / n)})` : null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  },
};

/* --- Zenith check: Plus needs Zenith Core --------------------------------
   Plus leans on Core's colours, sizes and glass. With Core missing or
   switched off it would just look broken, so it says so once instead (an
   idea from Natsumi, which checks that its styles loaded). */
function toast(title, body) {
  let stack = document.getElementById("zenith-toasts");
  if (!stack) {
    stack = el("div", { id: "zenith-toasts" });
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(stack);
  }
  const card = el("div", { class: "zenith-toast" });
  const head = el("div", { class: "zenith-toast-title" });
  const text = el("div", { class: "zenith-toast-body" });
  head.textContent = title;
  text.textContent = body;
  card.append(head, text);
  card.addEventListener("click", () => card.remove());
  stack.append(card);
}

function checkCore() {
  // Mod styles arrive a moment after the window opens.
  setTimeout(() => {
    if (getComputedStyle(root).getPropertyValue("--zth-ink").trim()) return;
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    toast("Zenith Plus needs Zenith Core", "Zenith Core is missing or switched off. Install it, or switch it on in Settings › Sine Mods.");
  }, 6000);
}

/* --- Live settings: each dropdown straight onto the settings element -----
   Zen and Sine hand each mod's dropdown settings to the CSS as attributes on
   a hidden element (#theme-Zenith-Core and so on, or #theme-Zenith for the
   one Sine mod), but only when they build it; Sine refreshes it only when
   its own settings page changes something. Zenith's settings page changes
   the preferences directly, so this copies every change onto that element
   at once, whichever of them is in charge. */
// --- dropdowns: generated by tools/build_prefs.py ---
const DROPDOWNS = {
 "zenith.core.density": "Zenith Core",
 "zenith.core.scale": "Zenith Core",
 "zenith.core.accent": "Zenith Core",
 "zenith.core.corners": "Zenith Core",
 "zenith.core.pills": "Zenith Core",
 "zenith.core.glass": "Zenith Core",
 "zenith.core.glass-edge": "Zenith Core",
 "zenith.core.window-transparency": "Zenith Core",
 "zenith.core.floating-sidebar": "Zenith Core",
 "zenith.core.page": "Zenith Core",
 "zenith.edges.preset": "Zenith Edges",
 "zenith.edges.thickness": "Zenith Edges",
 "zenith.edges.load": "Zenith Edges",
 "zenith.edges.download": "Zenith Edges",
 "zenith.edges.container": "Zenith Edges",
 "zenith.edges.container-style": "Zenith Edges",
 "zenith.edges.sharing": "Zenith Edges",
 "zenith.edges.private": "Zenith Edges",
 "zenith.edges.private-colour": "Zenith Edges",
 "zenith.edges.unfocused": "Zenith Edges",
 "zenith.edges.muted": "Zenith Edges",
 "zenith.edges.insecure": "Zenith Edges",
 "zenith.edges.focus-border": "Zenith Edges",
 "zenith.tabs.preset": "Zenith Tabs",
 "zenith.tabs.reveal": "Zenith Tabs",
 "zenith.tabs.close-hover": "Zenith Tabs",
 "zenith.tabs.unloaded": "Zenith Tabs",
 "zenith.tabs.attention": "Zenith Tabs",
 "zenith.tabs.folder-activity": "Zenith Tabs",
 "zenith.tabs.container": "Zenith Tabs",
 "zenith.tabs.split-vertical": "Zenith Tabs",
 "zenith.tabs.audio-wave": "Zenith Tabs",
 "zenith.tabs.mini-player": "Zenith Tabs",
 "zenith.tabs.reveal-delay": "Zenith Tabs",
 "zenith.tabs.hover-mute": "Zenith Tabs",
 "zenith.tabs.pinned-drift": "Zenith Tabs",
 "zenith.tabs.numbers": "Zenith Tabs",
 "zenith.tabs.lowercase": "Zenith Tabs",
 "zenith.urlbar.preset": "Zenith URL bar",
 "zenith.urlbar.results": "Zenith URL bar",
 "zenith.urlbar.mono": "Zenith URL bar",
 "zenith.panels.preset": "Zenith Panels",
 "zenith.panels.findbar": "Zenith Panels",
 "zenith.panels.history": "Zenith Panels",
 "zenith.panels.pip": "Zenith Panels",
 "zenith.panels.status-delay": "Zenith Panels",
 "zenith.panels.glance": "Zenith Panels",
 "zenith.panels.split": "Zenith Panels",
 "zenith.panels.gap": "Zenith Panels",
 "zenith.panels.notifications": "Zenith Panels",
 "zenith.panels.compact-menus": "Zenith Panels",
 "zenith.motion.preset": "Zenith Motion",
 "zenith.motion.reduced": "Zenith Motion",
 "zenith.motion.tab-switch": "Zenith Motion",
 "zenith.motion.swipe": "Zenith Motion",
 "zenith.motion.swipe-round": "Zenith Motion"
};
// --- end of generated dropdowns ---
const LiveSettings = {
  host(mod) {
    return document.getElementById("theme-Zenith") ?? document.getElementById(`theme-${mod.replace(/\s/g, "-")}`);
  },

  apply(prop) {
    const host = this.host(DROPDOWNS[prop]);
    if (!host) return;
    const value = Services.prefs.getStringPref(prop, "");
    const attr = prop.replaceAll(".", "-");
    if (host.getAttribute(attr) !== value) host.setAttribute(attr, value);
  },

  init() {
    const observer = (_, __, prop) => {
      if (Object.hasOwn(DROPDOWNS, prop)) this.apply(prop);
    };
    Services.prefs.addObserver("zenith.", observer);
    onUnload(() => Services.prefs.removeObserver("zenith.", observer));
  },
};

/* --- Settings housekeeping ----------------------------------------------- */

// Real progress on the edges: Zenith's own CSS sweeps step aside for the
// live edges while this attribute is set (whenever Plus runs).
function watchRealProgress() {
  root.setAttribute("zenith-real-progress", "true");
}

// Settings that moved from Zenith to Zenith Plus in 0.6.0 (once per profile).
function migrateSettings() {
  const DONE = "zenith.internal.migrated-0.6";
  if (Services.prefs.getBoolPref(DONE, false)) return;
  const str = name => Services.prefs.getStringPref(name, "");
  if (str("zenith.motion.reduced") === "all") Services.prefs.setStringPref("zenith.motion.reduced", "");
  if (str("zenith.edges.minimap") === "off") Services.prefs.setBoolPref("zenith.plus.minimap", false);
  if (str("zenith.panels.zoom-pill") === "off") Services.prefs.setBoolPref("zenith.plus.zoom-pill", false);
  Services.prefs.setBoolPref(DONE, true);
}

// 0.8.0: the "Glass edge shine" tick box became "Glass edge" (None, Shine,
// Liquid); a ticked box becomes Shine.
function migrateGlassEdge() {
  const OLD = "zenith.core.glass-shine";
  if (!Services.prefs.prefHasUserValue(OLD)) return;
  if (Services.prefs.getBoolPref(OLD, false) && !Services.prefs.getStringPref("zenith.core.glass-edge", "")) {
    Services.prefs.setStringPref("zenith.core.glass-edge", "shine");
  }
  Services.prefs.clearUserPref(OLD);
}

// 0.6.3: "Numbered tabs only while holding Ctrl" moved into Zenith Tabs'
// Numbered tabs setting.
function migrateCtrlNumbers() {
  const OLD = "zenith.plus.numbers-on-ctrl";
  if (!Services.prefs.prefHasUserValue(OLD)) return;
  if (Services.prefs.getBoolPref(OLD, false)) Services.prefs.setStringPref("zenith.tabs.numbers", "ctrl");
  Services.prefs.clearUserPref(OLD);
}

start("settings", () => {
  migrateSettings();
  migrateCtrlNumbers();
  migrateGlassEdge();
  watchRealProgress();
});
start("motion bridge", () => MotionBridge.init());
start("window paint", () => WindowPaint.init());
start("ctrl hold", () => CtrlHold.init());
start("load edge", () => LoadEdge.init());
start("not-secure hint", () => InsecureHint.init());
start("download edge", () => DownloadEdge.init().catch(e => console.error("[Zenith] download edge", e)));
start("minimap", () => Minimap.init());
start("page accent", () => PageAccent.init());
start("zoom pills", () => ZoomPills.init());
start("media art", () => MediaArt.init());
start("window material", () => WindowMaterial.init());
start("live settings", () => LiveSettings.init());
start("press light", () => PressLight.init());
start("core check", checkCore);
