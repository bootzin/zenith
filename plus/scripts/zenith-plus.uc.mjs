// ==UserScript==
// @name           Zenith Plus
// @description    Zenith Plus: real load and download progress, the sidebar minimap, zoom pills, page colours, the matching sidebar colour and more.
// @include        main
// @version        0.10.0
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

/* --- Glass light: liquid glass lights up under the pointer -----------------
   With Glass edge on Liquid, a tab, an essential, the media card, the Peek
   prompt, a notice or a card in the live panel glows softly under the
   pointer while you hover it, and brighter while you press it: the light
   follows the pointer, rises quickly and fades after you leave or let go
   (inspired by Zia). Zenith Core draws it from --zth-press (0 to 1); this
   sets it each frame, because a mod stylesheet can't register the property
   that a CSS animation of it would need. */
const GlassLight = {
  // [what the pointer is over, the part that's painted (null: itself)]
  SURFACES: [[".tabbrowser-tab", ".tab-background"], [".zen-media-card", null], ["#zenith-peek-box", null],
             [".zenith-toast", null], ["#zenith-live .zp-card", null], ["#zenith-live .zp-chip", null]],
  HOVER: 0.45, // hover strength; a press is 1
  RISE: 90,    // ms from nothing to full
  FADE: 320,   // ms from full to nothing
  HOLD: 140,   // ms a press stays full at least, for a quick click

  init() {
    this.lights = new Map(); // glass -> { level, x, y }
    const watch = () => (this.on = Services.prefs.getStringPref("zenith.core.glass-edge", "") === "liquid");
    watch();
    Services.prefs.addObserver("zenith.core.glass-edge", watch);
    const handlers = {
      pointermove: e => this.move(e),
      pointerdown: e => this.press(e),
      pointerup: () => this.release(),
      pointercancel: () => this.release(),
    };
    for (const [type, fn] of Object.entries(handlers)) window.addEventListener(type, fn, true);
    const leave = e => { if (!e.relatedTarget) this.point(null); };
    const blur = () => { this.release(); this.point(null); };
    document.addEventListener("mouseout", leave);
    window.addEventListener("blur", blur);
    onUnload(() => {
      Services.prefs.removeObserver("zenith.core.glass-edge", watch);
      for (const [type, fn] of Object.entries(handlers)) window.removeEventListener(type, fn, true);
      document.removeEventListener("mouseout", leave);
      window.removeEventListener("blur", blur);
      for (const glass of this.lights.keys()) this.clear(glass);
    });
  },

  surface(target) {
    for (const [hit, part] of this.SURFACES) {
      const host = target?.closest?.(hit);
      if (host) return part ? host.querySelector(part) : host;
    }
    return null;
  },

  // The surface under the pointer (or none), and where on it.
  point(glass, e) {
    if (glass !== this.hovered) this.hovered = glass;
    if (glass && e) {
      const box = glass.getBoundingClientRect();
      glass.style.setProperty("--zth-press-x", `${Math.round(e.clientX - box.left)}px`);
      glass.style.setProperty("--zth-press-y", `${Math.round(e.clientY - box.top)}px`);
      if (!this.lights.has(glass)) {
        this.lights.set(glass, { level: 0 });
        glass.setAttribute("zenith-press", "true");
      }
    }
    this.run();
  },

  move(e) {
    if (!this.on && !this.lights.size) return;
    this.point(this.on ? this.surface(e.target) : null, e);
  },

  press(e) {
    if (!this.on || e.button !== 0) return;
    const glass = this.surface(e.target);
    if (!glass) return;
    this.pressed = glass;
    this.held = true;
    this.until = performance.now() + this.HOLD;
    this.point(glass, e);
  },

  release() {
    this.held = false;
  },

  // Where each light is heading: full while pressed (and for a moment
  // after), the hover strength under the pointer, otherwise nothing.
  target(glass, now) {
    if (glass === this.pressed && (this.held || now < this.until)) return 1;
    if (glass === this.pressed && !this.held && now >= this.until) this.pressed = null;
    return glass === this.hovered ? this.HOVER : 0;
  },

  run() {
    if (this.frame) return;
    let last = performance.now();
    const step = now => {
      this.frame = null;
      const dt = now - last;
      last = now;
      for (const [glass, light] of this.lights) {
        if (!glass.isConnected) {
          this.clear(glass);
          continue;
        }
        const goal = this.target(glass, now);
        if (light.level < goal) light.level = Math.min(goal, light.level + dt / this.RISE);
        else if (light.level > goal) light.level = Math.max(goal, light.level - dt / this.FADE);
        if (light.level <= 0 && goal === 0) {
          this.clear(glass);
          continue;
        }
        // An eased curve, so it starts and ends softly.
        glass.style.setProperty("--zth-press", (light.level * light.level * (3 - 2 * light.level)).toFixed(3));
      }
      if (this.lights.size) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  },

  clear(glass) {
    glass.removeAttribute("zenith-press");
    for (const p of ["--zth-press", "--zth-press-x", "--zth-press-y"]) glass.style.removeProperty(p);
    this.lights.delete(glass);
    if (this.hovered === glass) this.hovered = null;
    if (this.pressed === glass) this.pressed = null;
  },
};

/* --- Wallpaper (Windows): the desktop behind the window, drawn by Zenith ----
   Around the page (the docked sidebar, the gap round a rounded page) the
   desktop shows through, and Windows blurs it at one fixed strength. With
   Window material on Wallpaper (the default), Zenith draws your desktop
   wallpaper there itself, exactly where it sits on the screen, and Core
   blurs it by Frost and tints it like every other glass surface: so the
   docked sidebar looks like the floating one. Windows behind Zen don't show
   through; the wallpaper does (as with Mica, which is Windows' own blurred
   wallpaper).
   Every screen's own wallpaper comes from Windows' wallpaper service
   (IDesktopWallpaper, through js-ctypes), with where each screen is: all of
   them are drawn into one picture of the whole desktop, so a window on any
   screen, or across two, shows what's behind it. Without that service, the
   one picture in the registry is drawn for the window's screen. Pictures
   are fitted as Windows fits them (fill, fit, stretch, centre, tile, span),
   kept as one JPEG, and drawn again when a wallpaper (its file or its
   date), the screens or their scale change. */
const Desktop = {
  open() {
    if (this.lib !== undefined) return this.lib;
    this.lib = null;
    try {
      const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
      const ole32 = ctypes.open("ole32.dll");
      const user32 = ctypes.open("user32.dll");
      const P = ctypes.voidptr_t, HR = ctypes.int32_t, U32 = ctypes.uint32_t, WSTR = ctypes.char16_t.ptr;
      const GUID = new ctypes.StructType("GUID", [{ a: U32 }, { b: ctypes.uint16_t }, { c: ctypes.uint16_t }, { d: ctypes.uint8_t.array(8) }]);
      const RECT = new ctypes.StructType("RECT", [{ left: ctypes.int32_t }, { top: ctypes.int32_t }, { right: ctypes.int32_t }, { bottom: ctypes.int32_t }]);
      const INFO = new ctypes.StructType("MONITORINFO", [{ cbSize: U32 }, { monitor: RECT }, { work: RECT }, { flags: U32 }]);
      const guid = text => {
        const h = text.replace(/-/g, "");
        const g = new GUID();
        g.a = parseInt(h.slice(0, 8), 16);
        g.b = parseInt(h.slice(8, 12), 16);
        g.c = parseInt(h.slice(12, 16), 16);
        for (let i = 0; i < 8; i++) g.d[i] = parseInt(h.slice(16 + 2 * i, 18 + 2 * i), 16);
        return g;
      };
      this.lib = {
        ctypes, P, RECT, INFO,
        clsid: guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD"),
        iid: guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"),
        create: ole32.declare("CoCreateInstance", ctypes.winapi_abi, HR, GUID.ptr, P, U32, GUID.ptr, P.ptr),
        free: ole32.declare("CoTaskMemFree", ctypes.winapi_abi, ctypes.void_t, P),
        monitorOf: user32.declare("MonitorFromWindow", ctypes.winapi_abi, P, P, U32),
        info: user32.declare("GetMonitorInfoW", ctypes.winapi_abi, ctypes.int32_t, P, INFO.ptr),
        // IDesktopWallpaper's methods: [place in its table, result, arguments].
        methods: {
          release: [2, U32, []],
          wallpaper: [4, HR, [WSTR, WSTR.ptr]],
          monitorAt: [5, HR, [U32, WSTR.ptr]],
          count: [6, HR, [U32.ptr]],
          rect: [7, HR, [WSTR, RECT.ptr]],
          colour: [9, HR, [U32.ptr]],
          position: [11, HR, [ctypes.int32_t.ptr]],
        },
      };
      onUnload(() => {
        ole32.close();
        user32.close();
      });
    } catch (e) {
      console.warn("[Zenith] wallpaper: Windows' wallpaper service isn't available", e);
    }
    return this.lib;
  },

  // Every attached screen: its wallpaper and where it is (device pixels).
  screens() {
    const L = this.open();
    if (!L) return null;
    const { ctypes } = L;
    const obj = L.P();
    if (L.create(L.clsid.address(), null, 0x17, L.iid.address(), obj.address()) < 0 || obj.isNull()) return null;
    const table = ctypes.cast(ctypes.cast(obj, L.P.ptr).contents, L.P.array(20).ptr).contents;
    const call = (name, ...args) => {
      const [slot, result, params] = L.methods[name];
      return ctypes.cast(table[slot], ctypes.FunctionType(ctypes.winapi_abi, result, [L.P, ...params]).ptr)(obj, ...args);
    };
    const text = out => {
      if (out.isNull()) return "";
      const s = out.readString();
      L.free(out);
      return s;
    };
    try {
      const count = ctypes.uint32_t(0);
      if (call("count", count.address()) < 0) return null;
      const list = [];
      for (let i = 0; i < count.value; i++) {
        const idOut = ctypes.char16_t.ptr();
        if (call("monitorAt", i, idOut.address()) < 0) continue;
        const id = text(idOut);
        const r = new L.RECT();
        if (call("rect", id, r.address()) !== 0) continue; // not attached
        const fileOut = ctypes.char16_t.ptr();
        const file = call("wallpaper", id, fileOut.address()) < 0 ? "" : text(fileOut);
        list.push({ file, rect: [r.left, r.top, r.right, r.bottom] });
      }
      const position = ctypes.int32_t(4), colour = ctypes.uint32_t(0);
      call("position", position.address());
      call("colour", colour.address());
      const c = colour.value;
      return {
        list,
        fit: ["center", "tile", "stretch", "fit", "fill", "span"][position.value] ?? "fill",
        colour: `${c & 255} ${(c >> 8) & 255} ${(c >> 16) & 255}`,
      };
    } finally {
      call("release");
    }
  },

  // The screen a window is on (device pixels).
  screenOf(win) {
    const L = this.open();
    if (!L) return null;
    try {
      const handle = win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle;
      const monitor = L.monitorOf(L.P(L.ctypes.UInt64(handle)), 2 /* nearest */);
      const info = new L.INFO();
      info.cbSize = L.INFO.size;
      if (!L.info(monitor, info.address())) return null;
      const m = info.monitor;
      return [m.left, m.top, m.right, m.bottom];
    } catch {
      return null;
    }
  },
};

const Wallpaper = {
  PREF: "zenith.plus.material-windows",
  DESKTOP: "Control Panel\\Desktop",
  MAX_PIXELS: 24e6, // a bigger desktop is drawn smaller (it's blurred anyway)

  init() {
    if (Services.appinfo.OS !== "WINNT") return;
    const refresh = () => this.refresh();
    Services.prefs.addObserver(this.PREF, refresh);
    window.addEventListener("focus", refresh);
    // The window has no "moved" event: check its place a few times a second
    // (cheap). A new wallpaper shows when Zen comes back to the front, or
    // within 15 seconds (a slideshow).
    const place = setInterval(() => this.place(), 250);
    const check = setInterval(refresh, 15000);
    window.ZenithWallpaper = this; // for tools/checks
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, refresh);
      window.removeEventListener("focus", refresh);
      clearInterval(place);
      clearInterval(check);
      this.off();
    });
    this.refresh();
  },

  read(path, name) {
    const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
    try {
      key.open(key.ROOT_KEY_CURRENT_USER, path, key.ACCESS_READ);
      try {
        return key.hasValue(name) ? key.readStringValue(name) : "";
      } finally {
        key.close();
      }
    } catch {
      return "";
    }
  },

  // Each screen's wallpaper from Windows' service (null without it).
  desktop() {
    return Desktop.screens();
  },

  // The screen this window is on, in device pixels.
  current() {
    return Desktop.screenOf(window);
  },

  // What to draw: every screen's picture and place, how pictures are fitted,
  // the colour around them, and the whole desktop's bounds (device pixels).
  async source() {
    const themes = PathUtils.join(Services.dirsvc.get("AppData", Ci.nsIFile).path, "Microsoft", "Windows", "Themes");
    const found = async (...files) => {
      for (const file of files) {
        if (!file) continue;
        try {
          const info = await IOUtils.stat(file);
          if (info.type === "regular") return { file, time: info.lastModified };
        } catch {}
      }
      return { file: null, time: 0 };
    };
    const shared = PathUtils.join(themes, "TranscodedWallpaper");
    const desk = this.desktop();
    if (desk?.list.length) {
      const screens = [];
      for (const [i, s] of desk.list.entries()) {
        const own = PathUtils.join(themes, `Transcoded_${String(i).padStart(3, "0")}`);
        screens.push({ ...(await found(s.file, own, shared)), rect: s.rect });
      }
      const area = screens.reduce((a, s) => [Math.min(a[0], s.rect[0]), Math.min(a[1], s.rect[1]),
                                             Math.max(a[2], s.rect[2]), Math.max(a[3], s.rect[3])],
                                  [Infinity, Infinity, -Infinity, -Infinity]);
      return { screens, area, fit: desk.fit, colour: desk.colour, scale: devicePixelRatio };
    }
    // The registry's one picture, for the window's screen.
    const W = Math.round(screen.width * devicePixelRatio), H = Math.round(screen.height * devicePixelRatio);
    const fit = this.read(this.DESKTOP, "TileWallpaper") === "1" ? "tile"
      : { 0: "center", 2: "stretch", 6: "fit", 10: "fill", 22: "span" }[this.read(this.DESKTOP, "WallpaperStyle")] ?? "fill";
    return {
      screens: [{ ...(await found(this.read(this.DESKTOP, "WallPaper"), shared)), rect: [0, 0, W, H] }],
      area: [0, 0, W, H], fit, colour: this.read("Control Panel\\Colors", "Background") || "0 0 0",
      scale: devicePixelRatio, single: true,
    };
  },

  async refresh() {
    if (Services.prefs.getStringPref(this.PREF, "") !== "") return this.off();
    if (this.busy) return;
    this.busy = true;
    try {
      const src = await this.source();
      const sig = JSON.stringify(src);
      if (sig !== this.sig) {
        const url = await this.render(src);
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = url;
        this.sig = sig;
        root.style.setProperty("--zth-wall", `url("${url}")`);
        root.setAttribute("zenith-wallpaper", "true");
      }
      this.area = src.area;
      // The window's screen: where the drawing is anchored.
      const cur = src.single ? null : this.current();
      this.anchor = (cur && src.screens.find(s => s.rect.join() === cur.join())?.rect) ?? src.screens[0].rect;
      this.place(true);
    } catch (e) {
      console.error("[Zenith] wallpaper", e);
      this.off();
    } finally {
      this.busy = false;
    }
  },

  // The whole desktop as one JPEG (smaller if it's very big).
  async render(src) {
    const [L, T, R, B] = src.area;
    const k = Math.min(1, Math.sqrt(this.MAX_PIXELS / ((R - L) * (B - T))));
    const canvas = document.createElementNS(HTML_NS, "canvas");
    canvas.width = Math.round((R - L) * k);
    canvas.height = Math.round((B - T) * k);
    const ctx = canvas.getContext("2d");
    ctx.scale(k, k);
    ctx.translate(-L, -T);
    ctx.fillStyle = `rgb(${src.colour.trim().split(/\s+/).join(" ")})`;
    ctx.fillRect(L, T, R - L, B - T);
    ctx.imageSmoothingQuality = "high";
    const pictures = new Map();
    const picture = file => {
      if (!pictures.has(file)) pictures.set(file, IOUtils.read(file).then(b => createImageBitmap(new Blob([b]))));
      return pictures.get(file);
    };
    // One picture fitted into a box, as Windows fits it.
    const draw = (img, [x0, y0, x1, y1], fit) => {
      const W = x1 - x0, H = y1 - y0, { width: iw, height: ih } = img;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, W, H);
      ctx.clip();
      if (fit === "tile") {
        ctx.translate(x0, y0);
        ctx.fillStyle = ctx.createPattern(img, "repeat");
        ctx.fillRect(0, 0, W, H);
      } else {
        const s = fit === "fit" ? Math.min(W / iw, H / ih) : fit === "center" ? 1 : Math.max(W / iw, H / ih);
        const [w, h] = fit === "stretch" ? [W, H] : [iw * s, ih * s];
        ctx.drawImage(img, x0 + (W - w) / 2, y0 + (H - h) / 2, w, h);
      }
      ctx.restore();
    };
    if (src.fit === "span") {
      // One picture across every screen.
      const first = src.screens.find(s => s.file);
      if (first) draw(await picture(first.file), src.area, "fill");
    } else {
      for (const s of src.screens) if (s.file) draw(await picture(s.file), s.rect, src.fit);
    }
    for (const p of pictures.values()) (await p).close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return URL.createObjectURL(blob);
  },

  // Where the desktop's top-left corner is, from the window's, in CSS
  // pixels: the window's screen is where screen.left/top say, and the rest
  // of the desktop is placed around it.
  place(force = false) {
    if (!this.url) return;
    const dpr = devicePixelRatio;
    const here = [screen.left, screen.top, screen.width, screen.height, dpr].join();
    // Another screen (or scale): which screen, and maybe the drawing, again.
    if (this.here && here !== this.here) {
      this.here = here;
      this.refresh();
      return;
    }
    this.here = here;
    const [L, T, R, B] = this.area, a = this.anchor;
    const at = [screen.left - mozInnerScreenX + (L - a[0]) / dpr, screen.top - mozInnerScreenY + (T - a[1]) / dpr,
                (R - L) / dpr, (B - T) / dpr].map(v => Math.round(v * 100) / 100);
    const key = at.join();
    if (!force && key === this.at) return;
    this.at = key;
    ["x", "y", "w", "h"].forEach((n, i) => root.style.setProperty(`--zth-wall-${n}`, `${at[i]}px`));
  },

  off() {
    root.removeAttribute("zenith-wallpaper");
    for (const n of ["", "-x", "-y", "-w", "-h"]) root.style.removeProperty(`--zth-wall${n}`);
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = this.sig = this.at = this.here = null;
  },
};

/* --- See-through Zen pages ------------------------------------------------
   With "See-through Zen pages" on, Zen's own pages (Settings, Add-ons,
   about:config, Downloads and the other about: pages that run inside Zen
   itself) show the window's glass behind them, like the docked sidebar:
   their page colour goes, boxes and cards turn half see-through, and
   headers that stay put are frosted. Only that one page is see-through:
   its <browser> gets Firefox's "transparent" attribute, which Firefox
   checks as it paints pages that run inside it. Web pages run in other
   processes and decide on it when they're created, so the attribute goes
   before a tab switches to one (otherwise a page without a background of
   its own would be see-through too, which is what the global
   browser.tabs.allow_transparent_browser does; Zenith leaves that alone). */
const SeeThroughPages = {
  PREF: "zenith.plus.see-through-pages",
  GLOBAL: "browser.tabs.allow_transparent_browser",
  SHEET: "data:text/css," + encodeURIComponent(`
    :root {
      background: transparent !important;
      --zth-canvas: var(--background-color-canvas);
      --zth-box: var(--background-color-box);
    }
    :root > * {
      --background-color-canvas: transparent !important;
      --background-color-box: color-mix(in srgb, var(--zth-box) 70%, transparent) !important;
      --in-content-box-background: color-mix(in srgb, var(--zth-box) 70%, transparent) !important;
      --card-background-color: color-mix(in srgb, var(--zth-box) 70%, transparent) !important;
      --table-row-background-color: transparent !important;
      --table-row-background-color-alternate: color-mix(in srgb, var(--zth-box) 45%, transparent) !important;
    }
    #search-container, .sticky-container, #process-thead {
      background-color: color-mix(in srgb, var(--zth-canvas) 20%, transparent) !important;
      backdrop-filter: blur(14px) !important;
    }`),

  init() {
    const apply = () => {
      this.on = Services.prefs.getBoolPref(this.PREF, false);
      for (const b of gBrowser.browsers) this.update(b);
    };
    this.listener = {
      onLocationChange: (browser, webProgress) => {
        if (webProgress.isTopLevel) this.update(browser);
      },
    };
    // Before a tab's page moves to another process (a web page): no
    // longer see-through.
    const before = e => this.clear(e.target.linkedBrowser ?? e.target);
    gBrowser.addTabsProgressListener(this.listener);
    window.addEventListener("BeforeTabRemotenessChange", before, true);
    window.addEventListener("WillChangeBrowserRemoteness", before, true);
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => {
      gBrowser.removeTabsProgressListener(this.listener);
      window.removeEventListener("BeforeTabRemotenessChange", before, true);
      window.removeEventListener("WillChangeBrowserRemoteness", before, true);
      Services.prefs.removeObserver(this.PREF, apply);
    });
    apply();
  },

  wanted(browser) {
    const uri = browser.currentURI;
    return this.on && !browser.isRemoteBrowser && !!uri?.schemeIs("about") && uri.spec !== "about:blank";
  },

  update(browser) {
    if (!this.wanted(browser)) return this.clear(browser);
    if (!Services.prefs.getBoolPref(this.GLOBAL, false)) browser.setAttribute("transparent", "true");
    browser.setAttribute("zenith-see-through", "true");
    const utils = browser.contentWindow?.windowUtils;
    if (!utils) return;
    try {
      utils.removeSheetUsingURIString(this.SHEET, utils.USER_SHEET);
    } catch {}
    utils.loadSheetUsingURIString(this.SHEET, utils.USER_SHEET);
  },

  clear(browser) {
    if (!browser?.hasAttribute?.("zenith-see-through")) return;
    if (!Services.prefs.getBoolPref(this.GLOBAL, false)) browser.removeAttribute("transparent");
    browser.removeAttribute("zenith-see-through");
    try {
      const utils = browser.contentWindow?.windowUtils;
      utils?.removeSheetUsingURIString(this.SHEET, utils.USER_SHEET);
    } catch {}
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
        // "" is Wallpaper (Zenith draws it; see Wallpaper below) and "zen"
        // Zen's own: both leave Windows' backdrop to Zen.
        const v = s("zenith.plus.material-windows");
        const own = v === "" || v === "zen";
        return {
          "widget.windows.mica": own ? null : v !== "off",
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
    Bridge.apply("material", this.wanted());
  },
};

/* --- Bridge: Zen and Firefox settings that Zenith sets for you ------------
   Window material and scroll feel are made of Zen's and Firefox's own
   settings, which a mod's settings can't hold. The first time Zenith
   changes one, your own value (or that you had none) is kept under
   zenith.internal.<kind>.<setting>; when Zenith's setting goes back to
   "Zen's own", that value is put back. */
const Bridge = {
  // wanted: { setting: value, or null for "give it back" }
  apply(kind, wanted) {
    const P = Services.prefs;
    for (const [pref, value] of Object.entries(wanted)) {
      const owned = `zenith.internal.${kind}.${pref}`;
      if (value === null) {
        if (!P.prefHasUserValue(owned)) continue;
        const saved = P.getStringPref(owned, "");
        if (saved === "") P.clearUserPref(pref);
        else this.set(pref, JSON.parse(saved));
        P.clearUserPref(owned);
        continue;
      }
      if (!P.prefHasUserValue(owned)) P.setStringPref(owned, P.prefHasUserValue(pref) ? JSON.stringify(this.get(pref)) : "");
      if (this.get(pref) !== value) this.set(pref, value);
    }
  },

  get(pref) {
    const P = Services.prefs;
    switch (P.getPrefType(pref)) {
      case P.PREF_BOOL: return P.getBoolPref(pref);
      case P.PREF_INT: return P.getIntPref(pref);
      case P.PREF_STRING: return P.getStringPref(pref);
      default: return undefined;
    }
  },

  set(pref, value) {
    const P = Services.prefs;
    if (typeof value === "boolean") P.setBoolPref(pref, value);
    else if (typeof value === "number") P.setIntPref(pref, value);
    else P.setStringPref(pref, value);
  },
};

/* --- Scroll feel: one setting for how pages scroll ------------------------
   Zen's own (the default) leaves scrolling to Zen: a smooth glide. Instant
   jumps a step at a time, Smooth is Firefox's classic short ease, and
   macOS-like glides further and settles softly, with a bounce at the ends.
   Written into Firefox's scrolling settings through the bridge. */
const ScrollFeel = {
  PREF: "zenith.plus.scroll",
  PRESETS: {
    instant: { "general.smoothScroll": false },
    smooth: {
      "general.smoothScroll": true,
      "general.smoothScroll.msdPhysics.enabled": false,
      "general.smoothScroll.mouseWheel.durationMinMS": 150,
      "general.smoothScroll.mouseWheel.durationMaxMS": 300,
    },
    glide: {
      "general.smoothScroll": true,
      "general.smoothScroll.msdPhysics.enabled": true,
      "general.smoothScroll.msdPhysics.motionBeginSpringConstant": 300,
      "general.smoothScroll.msdPhysics.regularSpringConstant": 250,
      "general.smoothScroll.msdPhysics.slowdownSpringConstant": 120,
      "general.smoothScroll.currentVelocityWeighting": "0.4",
      "general.smoothScroll.stopDecelerationWeighting": "0.4",
      "apz.overscroll.enabled": true,
    },
  },

  wanted() {
    const chosen = this.PRESETS[Services.prefs.getStringPref(this.PREF, "")] ?? {};
    const all = new Set(Object.values(this.PRESETS).flatMap(Object.keys));
    return Object.fromEntries([...all].map(pref => [pref, chosen[pref] ?? null]));
  },

  init() {
    const apply = () => Bridge.apply("scroll", this.wanted());
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => Services.prefs.removeObserver(this.PREF, apply));
    apply();
  },
};

/* --- A short note at the foot of the page (focus mode) -------------------- */

function hint(text) {
  let pill = document.getElementById("zenith-hint");
  if (!pill) {
    pill = el("div", { id: "zenith-hint" });
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(pill);
  }
  pill.textContent = text;
  pill.removeAttribute("show");
  void pill.offsetWidth; // start the fade again
  pill.setAttribute("show", "true");
  clearTimeout(hint.timer);
  hint.timer = setTimeout(() => pill.removeAttribute("show"), 1600);
}

/* --- Focus mode: Alt+Z hides even the hairlines -----------------------------
   For reading or video: the sidebar hides (compact mode, if it wasn't
   already), and so do the edges, the minimap, pills, the workspace dots and
   the link address at the bottom. The sharing alarm still shows. Alt+Z
   again brings everything back (and leaves compact mode if focus mode
   turned it on). */
const FocusMode = {
  PREF: "zenith.plus.focus-key",

  get on() {
    return root.hasAttribute("zenith-focus");
  },

  toggle(want = !this.on) {
    if (want === this.on) return;
    const compact = window.gZenCompactModeManager;
    if (want) {
      this.madeCompact = !!compact && !compact.preference;
      if (this.madeCompact) compact.preference = true;
      root.setAttribute("zenith-focus", "true");
      hint(Services.prefs.getBoolPref(this.PREF, true) ? "Focus mode · Alt+Z to leave" : "Focus mode");
    } else {
      root.removeAttribute("zenith-focus");
      if (this.madeCompact && compact?.preference) compact.preference = false;
      this.madeCompact = false;
    }
  },

  init() {
    const commandset = document.createXULElement("commandset");
    const command = document.createXULElement("command");
    command.id = "zenith-focus-command";
    command.addEventListener("command", () => this.toggle());
    commandset.append(command);
    const keyset = document.createXULElement("keyset");
    keyset.id = "zenith-focus-keys";
    const key = document.createXULElement("key");
    key.id = "zenith-focus-key";
    key.setAttribute("modifiers", "alt");
    key.setAttribute("key", "Z");
    key.setAttribute("reserved", "true");
    key.setAttribute("command", "zenith-focus-command");
    keyset.append(key);
    root.append(commandset, keyset);
    const watch = () => {
      const on = Services.prefs.getBoolPref(this.PREF, true);
      key.toggleAttribute("disabled", !on);
      if (!on) this.toggle(false);
    };
    Services.prefs.addObserver(this.PREF, watch);
    onUnload(() => Services.prefs.removeObserver(this.PREF, watch));
    watch();
    window.ZenithFocus = this; // the switcher's :focus
  },
};

/* --- Workspace dots and flash ----------------------------------------------
   Waybar-style dots at the top of the page, one per space, the current one
   long and in its colour, with its name: shown for a moment when you switch
   (or always, dimmed until then). The flash is the top edge lighting up in
   the new space's colour as you arrive. */
const Spaces = {
  DOTS: "zenith.plus.workspace-dots",
  FLASH: "zenith.plus.workspace-flash",

  init() {
    const W = window.gZenWorkspaces;
    if (!W?.addChangeListeners) return;
    const box = document.getElementById("tabbrowser-tabbox");
    this.dots = el("div", { id: "zenith-dots" });
    this.dots.hidden = true;
    this.flash = el("div", { id: "zenith-space-flash" });
    box.append(this.dots, this.flash);
    // Zen tells listeners about a switch once its animation is over; the
    // space's own element is marked active as the switch starts, so that's
    // what's watched (the listener stays for the first drawing).
    this.last = W.activeWorkspace;
    const switched = () => {
      const now = W.activeWorkspace;
      if (!now || now === this.last) return;
      this.last = now;
      this.arrived(W.getWorkspaceFromId(now));
    };
    this.onChange = ({ onInit }) => (onInit ? this.render() : switched());
    W.addChangeListeners(this.onChange);
    const marks = new MutationObserver(switched);
    W.promiseInitialized?.then(() => {
      const strip = W.workspaceElement(W.activeWorkspace)?.parentElement;
      if (strip) marks.observe(strip, { subtree: true, attributeFilter: ["active"] });
    });
    onUnload(() => marks.disconnect());
    const render = () => this.render();
    for (const p of [this.DOTS, this.FLASH]) Services.prefs.addObserver(p, render);
    window.addEventListener("ZenWorkspaceDataChanged", render);
    window.addEventListener("ZenWorkspacesUIUpdate", render);
    onUnload(() => {
      W.removeChangeListeners(this.onChange);
      for (const p of [this.DOTS, this.FLASH]) Services.prefs.removeObserver(p, render);
      window.removeEventListener("ZenWorkspaceDataChanged", render);
      window.removeEventListener("ZenWorkspacesUIUpdate", render);
    });
    W.promiseInitialized?.then(render);
    render();
    window.ZenithSpaces = this; // for tools/checks
  },

  // A space's own colour (its primary gradient colour), if it has one.
  colour(space) {
    const colours = space?.theme?.gradientColors ?? [];
    const c = (colours.find(x => x?.isPrimary) ?? colours[0])?.c;
    if (!c) return null;
    return Array.isArray(c) ? `rgb(${c.slice(0, 3).join(" ")})` : String(c);
  },

  get mode() {
    return Services.prefs.getStringPref(this.DOTS, "") || "switch";
  },

  render() {
    const W = window.gZenWorkspaces;
    let spaces = [];
    try {
      spaces = W.getWorkspaces() ?? [];
    } catch {}
    const mode = this.mode;
    this.dots.hidden = mode === "off" || spaces.length < 2 || !W.workspaceEnabled;
    this.dots.setAttribute("mode", mode);
    if (this.dots.hidden) return;
    const active = W.activeWorkspace;
    const row = [];
    for (const space of spaces) {
      const dot = el("span", { class: "zenith-dot" });
      if (space.uuid === active) dot.setAttribute("active", "true");
      const colour = this.colour(space);
      if (colour) dot.style.setProperty("--zth-dot", colour);
      row.push(dot);
    }
    const current = spaces.find(s => s.uuid === active);
    const name = el("span", { class: "zenith-dot-name" });
    name.textContent = current?.name ?? "";
    this.dots.replaceChildren(...row, name);
  },

  arrived(space) {
    this.render();
    if (!this.dots.hidden) {
      this.dots.setAttribute("show", "true");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.dots.removeAttribute("show"), 1400);
    }
    if (Services.prefs.getBoolPref(this.FLASH, true)) {
      const colour = this.colour(space);
      if (colour) this.flash.style.setProperty("--zth-flash", colour);
      else this.flash.style.removeProperty("--zth-flash");
      this.flash.removeAttribute("go");
      void this.flash.offsetWidth; // play it again
      this.flash.setAttribute("go", "true");
    }
  },
};

/* --- Hover cards: a tab's full title and site ------------------------------
   Rest the pointer on a tab (an essential, a pinned tab, any tab) for half a
   second: a small glass card beside the sidebar shows its whole title, its
   site, its container and whether it's playing, muted or asleep. Moving to
   the next tab moves the card at once. Firefox's plain tooltip steps aside
   meanwhile. */
const HoverCards = {
  PREF: "zenith.plus.hover-cards",
  DELAY: 500,

  get on() {
    return Services.prefs.getBoolPref(this.PREF, true);
  },

  init() {
    this.card = el("div", { id: "zenith-hover-card" });
    this.card.hidden = true;
    this.title = el("div", { class: "zenith-hover-title" });
    this.site = el("div", { class: "zenith-hover-site" });
    this.meta = el("div", { class: "zenith-hover-meta" });
    this.card.append(this.title, this.site, this.meta);
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(this.card);
    const over = e => this.over(e);
    const out = e => this.out(e);
    const away = () => this.hide();
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    window.addEventListener("mousedown", away, true);
    window.addEventListener("wheel", away, true);
    window.addEventListener("blur", away);
    gBrowser.tabContainer.addEventListener("TabClose", away);
    // Firefox's own tab tooltip says less; it waits while the card shows.
    const tip = document.getElementById("tabbrowser-tab-tooltip");
    const quiet = e => {
      if (e.target === tip && this.on) e.preventDefault();
    };
    tip?.addEventListener("popupshowing", quiet);
    onUnload(() => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      window.removeEventListener("mousedown", away, true);
      window.removeEventListener("wheel", away, true);
      window.removeEventListener("blur", away);
      tip?.removeEventListener("popupshowing", quiet);
    });
  },

  over(e) {
    const tab = e.target?.closest?.(".tabbrowser-tab");
    if (!tab || !this.on) return;
    clearTimeout(this.leaving);
    if (tab === this.tab) return;
    this.tab = tab;
    clearTimeout(this.waiting);
    if (!this.card.hidden) this.show(tab);
    else this.waiting = setTimeout(() => this.tab === tab && this.show(tab), this.DELAY);
  },

  out(e) {
    if (!this.tab) return;
    if (e.relatedTarget?.closest?.(".tabbrowser-tab")) return; // over() takes it from here
    clearTimeout(this.leaving);
    this.leaving = setTimeout(() => this.hide(), 80);
  },

  hide() {
    clearTimeout(this.waiting);
    this.tab = null;
    this.card.hidden = true;
  },

  // What the card says about a tab.
  describe(tab) {
    const uri = tab.linkedBrowser?.currentURI;
    let site = "";
    if (uri) {
      if (/^https?$/.test(uri.scheme)) site = uri.host.replace(/^www\./, "");
      else if (uri.spec !== "about:blank") site = uri.scheme === "about" ? `Zen page · ${uri.spec}` : uri.spec.slice(0, 80);
    }
    const meta = [];
    const container = tab.userContextId;
    if (container) {
      try {
        meta.push(ContextualIdentityService.getUserContextLabel(container));
      } catch {}
    }
    if (tab.hasAttribute("soundplaying")) meta.push(tab.hasAttribute("muted") ? "Playing, muted" : "Playing");
    else if (tab.hasAttribute("muted")) meta.push("Muted");
    if (tab.hasAttribute("busy")) meta.push("Loading");
    else if (tab.hasAttribute("pending") || tab.hasAttribute("discarded")) meta.push("Sleeping");
    return { title: tab.label || site || "New tab", site, meta: meta.join(" · ") };
  },

  show(tab) {
    if (!tab.isConnected) return this.hide();
    const { title, site, meta } = this.describe(tab);
    this.title.textContent = title;
    this.site.textContent = site;
    this.site.hidden = !site;
    this.meta.textContent = meta;
    this.meta.hidden = !meta;
    const colour = tab.userContextId ? getComputedStyle(tab).getPropertyValue("--identity-tab-color") : "";
    if (colour) this.card.style.setProperty("--zth-card-dot", colour);
    else this.card.style.removeProperty("--zth-card-dot");
    this.card.hidden = false;
    // Beside the sidebar, level with the tab, inside the window.
    const t = tab.getBoundingClientRect(), side = gNavToolbox.getBoundingClientRect(), c = this.card.getBoundingClientRect();
    const right = root.getAttribute("zen-right-side") === "true";
    const x = right ? Math.min(t.left, side.left) - c.width - 8 : Math.max(t.right, side.right) + 8;
    const y = Math.min(Math.max(8, t.top + t.height / 2 - c.height / 2), window.innerHeight - c.height - 8);
    this.card.style.left = `${Math.round(Math.max(8, x))}px`;
    this.card.style.top = `${Math.round(y)}px`;
  },
};

/* --- More: rare menu items in a submenu --------------------------------------
   The page's and the tab's right-click menus keep what you use; the rest
   (view source, send to device, set as desktop background, ask an AI…)
   moves into a "More" submenu at the end. Nothing is removed, and each item
   still appears only when Firefox would show it. Separators that end up
   doubled or at an edge are hidden. Turning the setting off puts every
   item back where it was. */
const MoreMenus = {
  PREF: "zenith.plus.more-menu",
  MENUS: {
    contentAreaContextMenu: [
      "context-openlinkincurrent", "context-openlinkprivate", "context-openlinksmartwindow", "context-previewlink",
      "context-bookmarklink", "context-savelink", "context-stripOnShareLink", "context-sendlinktodevice",
      "context-media-playbackrate", "context-media-loop", "context-media-hidecontrols", "context-media-showcontrols",
      "context-viewvideo", "context-copyvideourl", "context-copyaudiourl", "context-video-saveimage",
      "context-reloadimage", "context-sendimage", "context-sendvideo", "context-sendaudio", "context-viewimageinfo",
      "context-viewimagedesc", "context-setDesktopBackground", "context-savepage", "context-paste-no-formatting",
      "context-print-selection", "context-copy-link-to-highlight", "context-copy-clean-link-to-highlight",
      "context-remove-highlight", "context-use-mini-window", "context-add-engine", "context-searchselect-private",
      "context-ask-chat", "context-create-aitab", "frame", "spell-check-enabled", "spell-add-dictionaries-main",
      "spell-dictionaries", "context-bidi-text-direction-toggle", "context-bidi-page-direction-toggle",
      "context-viewpartialsource-selection", "context-viewsource", "context-inspect-a11y", "context-sendpagetodevice",
      "context-media-eme-learnmore",
    ],
    tabContextMenu: [
      "context_selectAllTabs", "context_bookmarkTab", "context_bookmarkSelectedTabs", "context_askChat",
      "context_askChatSummarize", "context_createAITab", "context_addNote", "context_editNote", "context_sendTabToDevice", "context_shareSelectedTabs", "context_closeDuplicateTabs",
      "context_fullscreenAutohide", "context_fullscreenExit", "context_zen-add-domain-to-routing",
      "context_zen-edit-tab-icon",
    ],
  },

  init() {
    this.handlers = [];
    for (const [id, items] of Object.entries(this.MENUS)) {
      const popup = document.getElementById(id);
      if (!popup) continue;
      // After Firefox's own handler, which decides what shows this time.
      const fn = e => {
        if (e.target === popup) this.arrange(popup, new Set(items));
      };
      popup.addEventListener("popupshowing", fn);
      this.handlers.push([popup, fn]);
    }
    const watch = () => {
      if (!Services.prefs.getBoolPref(this.PREF, true)) for (const [popup] of this.handlers) this.restore(popup);
    };
    Services.prefs.addObserver(this.PREF, watch);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, watch);
      for (const [popup, fn] of this.handlers) popup.removeEventListener("popupshowing", fn);
    });
  },

  shown(node) {
    return !node.hidden && !node.collapsed && getComputedStyle(node).display !== "none";
  },

  arrange(popup, items) {
    if (!Services.prefs.getBoolPref(this.PREF, true)) return this.restore(popup);
    let more = popup.querySelector(":scope > .zenith-more");
    if (!more) {
      more = document.createXULElement("menu");
      more.className = "zenith-more";
      more.id = `${popup.id}-zenith-more`;
      more.setAttribute("label", "More");
      more.append(document.createXULElement("menupopup"));
      popup.append(more);
    }
    const inner = more.menupopup ?? more.firstElementChild;
    // Move listed items over, leaving a hidden marker where each lived.
    let group = 0;
    for (const node of [...popup.children]) {
      if (node.localName === "menuseparator") group++;
      else if (node.id && items.has(node.id)) {
        const home = document.createXULElement("box");
        home.className = "zenith-more-home";
        home.hidden = true;
        home.dataset.item = node.id;
        node.replaceWith(home);
        node.dataset.zenithGroup = group;
        inner.append(node);
      }
    }
    // Inside More: a separator between items that were apart in the menu.
    for (const sep of inner.querySelectorAll(":scope > .zenith-more-sep")) sep.remove();
    let last = null;
    for (const node of [...inner.children]) {
      if (!this.shown(node)) continue;
      if (last !== null && node.dataset.zenithGroup !== last) {
        const sep = document.createXULElement("menuseparator");
        sep.className = "zenith-more-sep";
        node.before(sep);
      }
      last = node.dataset.zenithGroup;
    }
    more.hidden = last === null;
    this.tidy(popup);
  },

  // Hide separators that lead, trail or follow another separator.
  tidy(popup) {
    const nodes = [...popup.children];
    for (const n of nodes) n.removeAttribute("zenith-collapse");
    let before = false, pending = null;
    for (const n of nodes) {
      if (n.localName === "menuseparator") {
        if (!this.shown(n)) continue;
        if (!before || pending) n.setAttribute("zenith-collapse", "true");
        else pending = n;
      } else if (this.shown(n)) {
        before = true;
        pending = null;
      }
    }
    pending?.setAttribute("zenith-collapse", "true");
  },

  restore(popup) {
    const more = popup.querySelector(":scope > .zenith-more");
    if (!more) return;
    for (const home of popup.querySelectorAll(":scope > .zenith-more-home")) {
      const node = document.getElementById(home.dataset.item);
      if (node) home.replaceWith(node);
      else home.remove();
    }
    more.remove();
    for (const n of popup.children) n.removeAttribute("zenith-collapse");
  },
};

/* --- Flash on key switch: the hidden sidebar shows the new tab -------------
   In compact mode, switching tabs from the keyboard (Ctrl+Tab, Ctrl+1–9,
   Ctrl+Page Up/Down…) shows the sidebar for a moment, so you see where you
   landed. */
const KeySwitchFlash = {
  PREF: "zenith.plus.key-switch-flash",

  init() {
    this.at = 0;
    const key = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Control" || e.key === "Meta") this.at = performance.now();
    };
    const pointer = () => (this.at = 0);
    const select = () => {
      const compact = window.gZenCompactModeManager;
      if (!Services.prefs.getBoolPref(this.PREF, false) || !compact?.preference) return;
      if (performance.now() - this.at < 1500) compact.flashSidebar(800);
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    window.addEventListener("pointerdown", pointer, true);
    gBrowser.tabContainer.addEventListener("TabSelect", select);
    onUnload(() => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      window.removeEventListener("pointerdown", pointer, true);
      gBrowser.tabContainer.removeEventListener("TabSelect", select);
    });
  },
};

/* --- Background tab ready: a pulse when a tab you're not on has loaded -----
   A tab opened in the background (a middle click, say) finishes loading: the
   page's left edge (the sidebar's side) glows once in the accent colour.
   Not for the tabs Zen restores as it starts. */
const ReadyPulse = {
  PREF: "zenith.plus.ready-pulse",

  init() {
    this.since = performance.now();
    this.edge = el("div", { id: "zenith-ready" });
    document.getElementById("tabbrowser-tabbox").append(this.edge);
    this.listener = {
      onStateChange: (browser, webProgress, request, flags, status) => {
        const NL = Ci.nsIWebProgressListener;
        if (!webProgress.isTopLevel || !(flags & NL.STATE_STOP) || !(flags & NL.STATE_IS_NETWORK)) return;
        if (browser === gBrowser.selectedBrowser || !Components.isSuccessCode(status)) return;
        if (!Services.prefs.getBoolPref(this.PREF, false) || performance.now() - this.since < 8000) return;
        const tab = gBrowser.getTabForBrowser(browser);
        if (!tab || tab.hidden && !tab.pinned) return; // another space's tab
        this.pulse();
      },
    };
    gBrowser.addTabsProgressListener(this.listener);
    onUnload(() => gBrowser.removeTabsProgressListener(this.listener));
    window.ZenithReady = this; // for tools/checks
  },

  pulse() {
    this.edge.removeAttribute("go");
    void this.edge.offsetWidth;
    this.edge.setAttribute("go", "true");
  },
};

/* --- The sidebar's real width, for "push the page" ------------------------
   With Revealed sidebar on Push, the page moves aside by exactly as much as
   the sidebar covers when it slides out (its width plus its gap), wherever
   Zen puts it and however wide you've made it. */
const SidebarWidth = {
  init() {
    const tb = gNavToolbox;
    // Zen tucks the hidden sidebar away with a translate, which the offsets
    // ignore: they give where it sits when shown.
    const measure = () => {
      const right = root.getAttribute("zen-right-side") === "true";
      const push = right ? window.innerWidth - tb.offsetLeft : tb.offsetLeft + tb.offsetWidth;
      root.style.setProperty("--zth-sidebar-push", `${Math.max(0, Math.round(push))}px`);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(tb);
    const attrs = new MutationObserver(measure);
    attrs.observe(root, { attributeFilter: ["zen-compact-mode", "zen-right-side", "zen-sidebar-expanded"] });
    window.addEventListener("resize", measure);
    onUnload(() => {
      resize.disconnect();
      attrs.disconnect();
      window.removeEventListener("resize", measure);
    });
    measure();
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
 "zenith.tabs.badge-only": "Zenith Tabs",
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
start("glass light", () => GlassLight.init());
start("wallpaper", () => Wallpaper.init());
start("see-through pages", () => SeeThroughPages.init());
start("scroll feel", () => ScrollFeel.init());
start("focus mode", () => FocusMode.init());
start("workspace dots", () => Spaces.init());
start("hover cards", () => HoverCards.init());
start("more menus", () => MoreMenus.init());
start("key switch flash", () => KeySwitchFlash.init());
start("ready pulse", () => ReadyPulse.init());
start("sidebar width", () => SidebarWidth.init());
start("core check", checkCore);
