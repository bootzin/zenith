// ==UserScript==
// @name           Zenith Plus
// @description    Zenith Plus: real load and download progress, the sidebar minimap, zoom pills, page colours, the matching sidebar colour and more.
// @include        main
// @version        0.12.0
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
    console.error(`[Zenith] ${name} failed to start`, e);
  }
  // How long each part took to start, for tools/bench_startup.py.
  (window.zenithStartup ??= []).push({ script: "plus", name, at: Math.round(t0), ms: +(performance.now() - t0).toFixed(1) });
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
          this.creeping(true);
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
    const onSelect = () => {
      this.render(true);
      this.creeping(true);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
    onUnload(() => {
      gBrowser.removeTabsProgressListener(this.listener);
      clearInterval(this.creep);
      gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
    });
  },

  // Pages rarely report their total size, so progress also creeps towards
  // 90% on its own while the tab you're on loads (the timer stops when it
  // isn't loading).
  creeping(on) {
    if (!on || this.creep) return;
    this.creep = setInterval(() => {
      const s = this.state.get(gBrowser.selectedBrowser);
      if (!s?.loading) {
        clearInterval(this.creep);
        this.creep = null;
        return;
      }
      s.value += (0.9 - s.value) * 0.05;
      this.render();
    }, 250);
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

/* --- Window paint: the space's colours, for Zenith's glass ----------------
   Zen paints a space's colours as a gradient, at the space's opacity. Core's
   glass is one colour (--zth-paint) mixed into a neutral base at a share
   (--zth-paint-share). Plus copies them from what Zen paints:
     Space colour  "Its gradient" (default): the window around the page shows
                   Zen's own gradient, each colour mixed into the base
                   (--zth-desk-paint), and panels take its most vivid colour;
                   "One tint": all of them averaged into one (0.11.0's look)
     Strength      "Zen's own": the space's opacity; "Medium" (default) and
                   "Strong": at least 45% or 70%, so a space's colours read
                   even at a low opacity. Zen's default (no colours) is left
                   as Zen sets it. */
const WindowPaint = {
  MODE: "zenith.plus.space-colour", // "" gradient · tint
  STRENGTH: "zenith.plus.colour-strength", // "" medium · zen · strong
  RGBA: /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/g,

  colours(value) {
    const found = [...value.matchAll(this.RGBA)];
    return found.map(m => {
      let a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (m[4]?.endsWith("%")) a /= 100;
      return [+m[1], +m[2], +m[3], a];
    });
  },

  init() {
    const bg = document.getElementById("zen-browser-background");
    if (!bg) return;
    this.bg = bg;
    const copy = () => this.copy();
    const mo = new MutationObserver(copy);
    mo.observe(bg, { attributes: true, attributeFilter: ["style"] });
    for (const p of [this.MODE, this.STRENGTH]) Services.prefs.addObserver(p, copy);
    onUnload(() => {
      mo.disconnect();
      for (const p of [this.MODE, this.STRENGTH]) Services.prefs.removeObserver(p, copy);
    });
    copy();
  },

  share(alpha) {
    if (root.hasAttribute("zen-default-theme")) return alpha;
    const floor = { zen: 0, strong: 0.7 }[Services.prefs.getStringPref(this.STRENGTH, "")] ?? 0.45;
    return Math.min(1, Math.max(alpha, floor));
  },

  copy() {
    const value = this.bg.style.getPropertyValue("--zen-main-browser-background");
    const colours = this.colours(value);
    if (!colours.length) {
      for (const v of ["--zth-paint", "--zth-paint-share", "--zth-desk-paint"]) root.style.removeProperty(v);
      return;
    }
    const gradient = Services.prefs.getStringPref(this.MODE, "") !== "tint";
    const avg = i => colours.reduce((n, c) => n + c[i], 0) / colours.length;
    const chroma = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);
    const paint = gradient ? colours.reduce((a, c) => (chroma(c) > chroma(a) ? c : a)) : [0, 1, 2].map(i => Math.round(avg(i)));
    const share = Math.round(this.share(avg(3)) * 100);
    root.style.setProperty("--zth-paint", `rgb(${paint.slice(0, 3).map(Math.round).join(" ")})`);
    root.style.setProperty("--zth-paint-share", `${share}%`);
    if (gradient && colours.length > 1) {
      // Zen's own gradient, each colour in the glass's recipe, over the
      // glass colour (for its transparent parts).
      const mixed = value.replace(this.RGBA, (m, r, g, b) =>
        `color-mix(in srgb, color-mix(in srgb, rgb(${r} ${g} ${b}) ${share}%, var(--zth-mica)) calc(var(--zth-desk-alpha) * 100%), transparent)`);
      root.style.setProperty("--zth-desk-paint",
        `${mixed}, color-mix(in srgb, var(--zth-glass-color) calc(var(--zth-desk-alpha) * 100%), transparent)`);
    } else {
      root.style.removeProperty("--zth-desk-paint");
    }
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
    // The minimap shows only in compact mode while the sidebar is away
    // (the CSS decides): otherwise nothing is measured, and only the tab
    // changes it shows (sound, sharing, loading, attention) count.
    const seen = () => Services.prefs.getBoolPref("zenith.plus.minimap", true) && !document.hidden &&
      root.getAttribute("zen-compact-mode") === "true" && !root.hasAttribute("zenith-sidebar-out");
    const maybe = () => seen() && schedule();
    const SHOWN = new Set(["sharing", "attention", "titlechanged", "soundplaying", "muted", "busy"]);
    const changed = e => (e.detail?.changed ?? []).some(a => SHOWN.has(a)) && maybe();
    const tabs = gBrowser.tabContainer;
    const events = ["TabSelect", "TabOpen", "TabClose", "TabMove", "TabPinned", "TabUnpinned"];
    events.forEach(e => tabs.addEventListener(e, maybe));
    tabs.addEventListener("TabAttrModified", changed);
    tabs.addEventListener("scroll", maybe, true);
    window.addEventListener("resize", maybe);
    window.addEventListener("ZenWorkspacesUIUpdate", maybe);
    // On screen again: draw.
    const shown = new MutationObserver(maybe);
    shown.observe(root, { attributeFilter: ["zen-compact-mode", "zenith-sidebar-out"] });
    // Catches folder collapses and anything else that moves tabs, while
    // it's on screen.
    this.interval = setInterval(maybe, 1500);
    onUnload(() => {
      events.forEach(e => tabs.removeEventListener(e, maybe));
      tabs.removeEventListener("TabAttrModified", changed);
      tabs.removeEventListener("scroll", maybe, true);
      window.removeEventListener("resize", maybe);
      window.removeEventListener("ZenWorkspacesUIUpdate", maybe);
      shown.disconnect();
      clearInterval(this.interval);
    });
    maybe();
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
    // Not on screen (the sidebar is shown, or the minimap is off): nothing
    // to measure.
    if (!box.height || document.hidden) return;
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
    // Reading the accent makes the window work out its styles, and a new
    // sheet for every page restyles them all: wait until the browser is idle
    // (pages keep their own selection colour until then).
    window.requestIdleCallback(() => this.refresh(), { timeout: 2000 });
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
  // The last drawing, kept in the profile: shown at once when Zen starts,
  // and checked against the desktop a moment later (redrawn only if the
  // wallpaper changed).
  CACHE: "zenith.internal.wallpaper.cache",
  get file() {
    return PathUtils.join(PathUtils.profileDir, "zenith-wallpaper.jpg");
  },

  init() {
    if (Services.appinfo.OS !== "WINNT") return;
    const refresh = () => this.refresh();
    Services.prefs.addObserver(this.PREF, refresh);
    window.addEventListener("focus", refresh);
    window.ZenithWallpaper = this; // for tools/checks
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, refresh);
      window.removeEventListener("focus", refresh);
      this.off();
    });
    this.fromCache().then(shown => {
      if (!shown) return this.refresh();
      // Shown from the cache: look at the desktop once Zen has settled.
      return new Promise(r => setTimeout(r, 1500)).then(() => window.requestIdleCallback(() => this.refresh(), { timeout: 3000 }));
    });
  },

  async fromCache() {
    if (Services.prefs.getStringPref(this.PREF, "") !== "") return false;
    try {
      const cache = JSON.parse(Services.prefs.getStringPref(this.CACHE, "") || "null");
      if (!cache?.sig) return false;
      const bytes = await IOUtils.read(this.file);
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      this.url = url;
      this.sig = cache.sig;
      this.area = cache.area;
      this.anchor = cache.anchor;
      root.style.setProperty("--zth-wall", `url("${url}")`);
      root.setAttribute("zenith-wallpaper", "true");
      this.place(true);
      this.watching(true);
      return true;
    } catch {
      return false;
    }
  },

  async keep(blob, sig, area, anchor) {
    try {
      await IOUtils.write(this.file, new Uint8Array(await blob.arrayBuffer()));
      Services.prefs.setStringPref(this.CACHE, JSON.stringify({ sig, area, anchor }));
    } catch (e) {
      console.error("[Zenith] wallpaper cache", e);
    }
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
      const t0 = performance.now();
      const src = await this.source();
      const sig = JSON.stringify(src);
      const t1 = performance.now();
      let drawn = null;
      if (sig !== this.sig) {
        drawn = await this.render(src);
        (window.zenithStartup ??= []).push({ script: "plus", name: "wallpaper: read, drew", at: Math.round(t0),
                                             ms: +(t1 - t0).toFixed(1), drew: +(performance.now() - t1).toFixed(1) });
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(drawn);
        this.sig = sig;
        root.style.setProperty("--zth-wall", `url("${this.url}")`);
        root.setAttribute("zenith-wallpaper", "true");
      }
      this.area = src.area;
      // The window's screen: where the drawing is anchored.
      const cur = src.single ? null : this.current();
      this.anchor = (cur && src.screens.find(s => s.rect.join() === cur.join())?.rect) ?? src.screens[0].rect;
      this.place(true);
      this.watching(true);
      if (drawn) this.keep(drawn, sig, this.area, this.anchor);
    } catch (e) {
      console.error("[Zenith] wallpaper", e);
      this.off();
    } finally {
      this.busy = false;
    }
  },

  // The whole desktop as one JPEG (smaller if it's very big), as a blob.
  async render(src) {
    const [L, T, R, B] = src.area;
    // Each picture file read once (IOUtils reads away from the window).
    const files = new Map();
    for (const s of src.screens) {
      if (s.file && !files.has(s.file)) files.set(s.file, await IOUtils.read(s.file));
    }
    const job = {
      area: src.area,
      k: Math.min(1, Math.sqrt(this.MAX_PIXELS / ((R - L) * (B - T)))),
      colour: `rgb(${src.colour.trim().split(/\s+/).join(" ")})`,
      fit: src.fit,
      screens: src.screens.map(s => ({ rect: s.rect, bytes: s.file ? files.get(s.file) : null })),
    };
    try {
      return await this.paintAway(job, [...files.values()].map(b => b.buffer));
    } catch (e) {
      console.warn("[Zenith] wallpaper: drawing in the window instead of a worker", e);
      return (await import(await this.painter())).paint(job);
    }
  },

  // plus/pages/wallpaper.mjs (JS/zenith-pages with the manual install).
  async painter() {
    if (this.painterUrl) return this.painterUrl;
    for (const d of ["../pages/", "zenith-pages/"]) {
      const url = new URL(`${d}wallpaper.mjs`, import.meta.url).href;
      if (await fetch(url).then(r => r.ok, () => false)) return (this.painterUrl = url);
    }
    throw new Error("plus/pages/wallpaper.mjs isn't there");
  },

  // The drawing, done by a worker on its own thread.
  async paintAway(job, transfer) {
    if (!this.worker) {
      this.worker = new Worker(await this.painter(), { type: "module" });
      this.waiting = new Map();
      this.worker.onmessage = ({ data }) => {
        const done = this.waiting.get(data.id);
        this.waiting.delete(data.id);
        if (data.error) done?.reject(new Error(data.error));
        else done?.resolve(data.blob);
      };
      this.worker.onerror = e => {
        e.preventDefault?.();
        for (const done of this.waiting.values()) done.reject(new Error(e.message || "the worker failed"));
        this.waiting.clear();
        this.worker.terminate();
        this.worker = null;
      };
      onUnload(() => this.worker?.terminate());
    }
    const id = (this.jobs = (this.jobs ?? 0) + 1);
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ ...job, id }, transfer);
    });
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

  // The window has no "moved" event: while a wallpaper is shown, its place
  // is checked a few times a second (cheap; not while it's minimised). A
  // new wallpaper shows when Zen comes back to the front, or within 15
  // seconds (a slideshow).
  watching(on) {
    if (on === !!this.timers) return;
    if (on) {
      this.timers = [setInterval(() => document.hidden || this.place(), 250),
                     setInterval(() => document.hidden || this.refresh(), 15000)];
    } else {
      this.timers.forEach(clearInterval);
      this.timers = null;
    }
  },

  off() {
    this.watching(false);
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
   headers that stay put are clear too (frosting them read as a darker
   band). Only that one page is see-through:
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
    #search-container, .sticky-container, #process-thead, .main-heading, .main-search {
      background: transparent !important;
      backdrop-filter: none !important;
      box-shadow: none !important;
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
    // (Not Zenith's own tab manager page, which reads better on its own
    // background; Zenith's start page always, it's made for the glass.)
    if (browser.isRemoteBrowser || !uri?.schemeIs("about")) return false;
    if (uri.spec.startsWith("about:zenith-start")) return true;
    return this.on && uri.spec !== "about:blank" && !uri.spec.startsWith("about:zenith-tabs");
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
window.ZenithBridge = Bridge; // Zenith's local AI turns Firefox's AI on through it

/* --- Scroll feel: one setting for how pages scroll ------------------------
   For the mouse wheel and the keyboard (arrows, Page Up/Down, Space); a
   touchpad moves the page with your fingers and isn't changed. Zen's own
   (the default) leaves it to Zen: a short glide. Instant jumps; Quick is a
   crisp, short ease; Smooth an even, slower one; macOS-like glides further
   (1.6 times the distance) and settles softly, bouncing at the ends.
   Measured with real wheel turns (tools/checks/r38): where one notch has
   got to after 50, 100, 200, 400, 800ms. Written into Firefox's scrolling
   settings through the bridge. */
const ScrollFeel = {
  PREF: "zenith.plus.scroll",
  PRESETS: {
    instant: { "general.smoothScroll": false },
    quick: {
      "general.smoothScroll": true,
      "general.smoothScroll.msdPhysics.enabled": false,
      "general.smoothScroll.mouseWheel.durationMinMS": 60,
      "general.smoothScroll.mouseWheel.durationMaxMS": 120,
    },
    smooth: {
      "general.smoothScroll": true,
      "general.smoothScroll.msdPhysics.enabled": false,
      "general.smoothScroll.mouseWheel.durationMinMS": 300,
      "general.smoothScroll.mouseWheel.durationMaxMS": 450,
    },
    glide: {
      "general.smoothScroll": true,
      "general.smoothScroll.msdPhysics.enabled": true,
      "general.smoothScroll.msdPhysics.motionBeginSpringConstant": 80,
      "general.smoothScroll.msdPhysics.regularSpringConstant": 60,
      "general.smoothScroll.msdPhysics.slowdownSpringConstant": 30,
      "mousewheel.default.delta_multiplier_y": 320,
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

/* --- Notices on top ------------------------------------------------------------
   Zen's toasts ("Copied link") live inside the page's column, under anything
   over the page (Zenith's settings panel); moved beside Zenith's own notices,
   they show over it. */
function noticesOnTop() {
  const toasts = document.getElementById("zen-toast-container");
  const wrapper = document.getElementById("zen-main-app-wrapper");
  if (toasts && wrapper && toasts.parentNode !== wrapper) wrapper.append(toasts);
}

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
   (or always, dimmed until then). The flash is the top of the page lighting
   up in the new space's colour as you arrive. That colour is the one Zen
   actually paints for the space (the most vivid of its colours, brightened
   enough to read as a light), taken as Zen paints it: a space's saved theme
   doesn't always say. */
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

  // A space's colour: its container's, when it opens tabs in one (what
  // its tabs are marked with), else its own primary gradient colour.
  colour(space) {
    return this.containerColour(space) ?? this.themeColour(space);
  },

  containerColour(space) {
    const id = space?.containerTabId;
    if (!id) return null;
    try {
      const name = ContextualIdentityService.getPublicIdentityFromId(id)?.color;
      if (!name || name === "toolbar") return null;
      // Firefox's own value for that colour, from its identity-color class.
      this.probe ??= document.documentElement.appendChild(el("span", { id: "zenith-identity-probe", hidden: "true" }));
      this.probe.className = `identity-color-${name}`;
      return getComputedStyle(this.probe).getPropertyValue("--identity-tab-color").trim() || null;
    } catch {
      return null;
    }
  },

  themeColour(space) {
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
      this.timer = setTimeout(() => this.dots.removeAttribute("show"), 1600);
    }
    // A space in a container lights up in the container's colour straight
    // away; otherwise in the colour Zen paints it.
    const container = this.containerColour(space);
    const paint = container ? fn => fn(container) : fn => this.whenPainted(fn, space);
    paint(colour => {
      const active = this.dots.querySelector(".zenith-dot[active]");
      if (colour) active?.style.setProperty("--zth-dot", colour);
      if (!Services.prefs.getBoolPref(this.FLASH, true)) return;
      if (colour) this.flash.style.setProperty("--zth-flash", colour);
      else this.flash.style.removeProperty("--zth-flash");
      this.flash.removeAttribute("go");
      void this.flash.offsetWidth; // play it again
      this.flash.setAttribute("go", "true");
    });
  },

  // The new space's colour once Zen has painted it (it does so a frame or
  // two into the switch), or after a moment if the paint didn't change.
  whenPainted(fn, space) {
    const bg = document.getElementById("zen-browser-background");
    const read = () => this.vivid(WindowPaint.colours(bg?.style.getPropertyValue("--zen-main-browser-background") ?? ""));
    this.painted?.disconnect();
    clearTimeout(this.paintTimer);
    if (!bg) return fn(this.colour(space));
    const before = bg.style.getPropertyValue("--zen-main-browser-background");
    const done = () => {
      this.painted?.disconnect();
      clearTimeout(this.paintTimer);
      fn(read() ?? this.colour(space));
    };
    this.painted = new MutationObserver(() => {
      if (bg.style.getPropertyValue("--zen-main-browser-background") !== before) done();
    });
    this.painted.observe(bg, { attributes: true, attributeFilter: ["style"] });
    this.paintTimer = setTimeout(done, 600);
  },

  // The most colourful of Zen's colours, as a light: its hue, saturated
  // and bright enough to stand out on the page's edge. Greys give nothing.
  vivid(colours) {
    let best = null, chroma = 0;
    for (const [r, g, b] of colours) {
      const c = Math.max(r, g, b) - Math.min(r, g, b);
      if (c > chroma) [best, chroma] = [[r, g, b], c];
    }
    if (!best || chroma < 12) return null;
    const [r, g, b] = best.map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const l = (max + min) / 2, s = d / (1 - Math.abs(2 * l - 1));
    return `hsl(${Math.round((h * 60 + 360) % 360)} ${Math.round(Math.max(s, 0.6) * 100)}% ${Math.round(Math.min(Math.max(l, 0.58), 0.7) * 100)}%)`;
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
/* --- Float a tab (Alt+Shift+Space) --------------------------------------------
   The tab you're on pops out into a small window of its own that stays on
   top of everything (a video call, notes, a stream), in the bottom right
   corner of the screen; the page keeps going as it was, nothing reloads.
   Alt+Shift+Space in that window (or closing it... no: closing closes the
   tab) puts the tab back where it came from. Its size follows the screen
   (half the width on small screens, 40%, a third on big ones). */
const FloatTab = {
  PREF: "zenith.plus.float-tab",

  init() {
    const commandset = document.createXULElement("commandset");
    const command = document.createXULElement("command");
    command.id = "zenith-float-command";
    command.addEventListener("command", () => this.toggle());
    commandset.append(command);
    const keyset = document.createXULElement("keyset");
    const key = document.createXULElement("key");
    key.id = "zenith-float-key";
    key.setAttribute("modifiers", "alt,shift");
    key.setAttribute("key", " ");
    key.setAttribute("reserved", "true");
    key.setAttribute("command", command.id);
    keyset.append(key);
    root.append(commandset, keyset);
    const watch = () => key.toggleAttribute("disabled", !Services.prefs.getBoolPref(this.PREF, true));
    Services.prefs.addObserver(this.PREF, watch);
    onUnload(() => Services.prefs.removeObserver(this.PREF, watch));
    watch();
    // A float window: mark it (the CSS keeps it to the page, with a strip
    // along the top to move it by), and keep it on top of other windows.
    if (window.zenithFloatFrom) {
      root.setAttribute("zenith-float", "true");
      try {
        window.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow).zLevel = Ci.nsIAppWindow.highestZ;
      } catch {}
      // Its size and corner, now that it has its plain look.
      requestAnimationFrame(() => this.place());
    }
    window.ZenithFloat = this; // for tools/checks
  },

  toggle() {
    if (window.zenithFloatFrom) return this.back();
    return this.out(gBrowser.selectedTab);
  },

  // The float's size on this screen (half the width on small screens, 40%,
  // a third on big ones; 16:10) and its place in the bottom right corner.
  box() {
    const s = screen, wide = s.availWidth, gap = 16;
    const w = Math.round(wide * (wide <= 1400 ? 0.5 : wide < 2200 ? 0.4 : 1 / 3));
    const h = Math.round(w * 0.625);
    return { w, h, x: s.availLeft + s.availWidth - w - gap, y: s.availTop + s.availHeight - h - gap };
  },

  // (Zen keeps windows at least about 500px tall: placed by the size it got.)
  place() {
    const { w, h } = this.box(), s = screen, gap = 16;
    window.resizeTo(w, h);
    requestAnimationFrame(() => window.moveTo(s.availLeft + s.availWidth - window.outerWidth - gap,
                                              Math.max(s.availTop, s.availTop + s.availHeight - window.outerHeight - gap)));
  },

  out(tab) {
    if (!tab || tab.hasAttribute("zen-empty-tab") || gBrowser.tabs.length < 2) return null;
    const { w, h, x, y } = this.box();
    const win = gBrowser.replaceTabWithWindow(tab, { popup: "yes", alwaysontop: "yes", outerWidth: w, outerHeight: h, left: x, top: y });
    if (!win) return null;
    // Only this tab: with Zen's window sync a new window would otherwise
    // take every tab (and leave this window empty).
    win._zenStartupSyncFlag = "unsynced";
    win.zenithFloatFrom = window;
    return win;
  },

  // Back to the window it came from (or the last browser window), selected.
  back() {
    const tab = gBrowser.selectedTab;
    let home = window.zenithFloatFrom;
    if (!home || home.closed) home = [...Services.wm.getEnumerator("navigator:browser")].reverse().find(w => w !== window && !w.zenithFloatFrom);
    if (!home) return null;
    const moved = home.gBrowser.adoptTab(tab, { selectTab: true });
    home.focus();
    return moved;
  },
};

/* --- Picture-in-picture: resize, edges, tucking ---------------------------------
   For Firefox's picture-in-picture window:
     - the mouse wheel over it makes it bigger or smaller (the same shape,
       growing away from the screen edge it's nearest);
     - let go of it near a screen edge and it settles against that edge (or
       corner), a small gap away;
     - drop it more than halfway past the left or right edge and it tucks
       away: only a sliver with an arrow stays on screen, the video keeps
       playing; click the sliver and it comes back.
   The window has no "moved" event, so its place is checked a few times a
   second while it's open (and only then). The front browser window looks
   after each picture-in-picture window. */
const PiPWindows = {
  PREF: "zenith.plus.pip-extras",
  GAP: 12,
  NEAR: 56,
  SLIVER: 26,

  init() {
    this.listener = {
      onOpenWindow: xulWin => {
        const win = xulWin.docShell.domWindow;
        win.addEventListener("load", () => this.attach(win), { once: true });
      },
      onCloseWindow() {},
    };
    Services.wm.addListener(this.listener);
    for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) this.attach(win);
    onUnload(() => Services.wm.removeListener(this.listener));
    window.ZenithPiP = this; // for tools/checks
  },

  on() {
    return Services.prefs.getBoolPref(this.PREF, true);
  },

  attach(win) {
    if (win.document.documentElement.getAttribute("windowtype") !== "Toolkit:PictureInPicture" || win.zenithPiP) return;
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const state = (win.zenithPiP = { at: [win.screenX, win.screenY], still: 0, tucked: null });
    const wheel = e => this.on() && !state.tucked && this.resize(win, e);
    const press = e => {
      if (!state.tucked) return;
      e.preventDefault();
      e.stopPropagation();
      this.untuck(win);
    };
    win.addEventListener("wheel", wheel, { passive: false });
    win.addEventListener("mousedown", press, true);
    const watch = win.setInterval(() => this.watch(win), 150);
    win.addEventListener("unload", () => win.clearInterval(watch), { once: true });
  },

  screen(win) {
    const s = win.screen;
    return { L: s.availLeft, T: s.availTop, R: s.availLeft + s.availWidth, B: s.availTop + s.availHeight };
  },

  // The window moved and then stayed put for a moment: it was let go.
  watch(win) {
    const state = win.zenithPiP;
    const at = [win.screenX, win.screenY];
    if (at[0] !== state.at[0] || at[1] !== state.at[1]) {
      state.at = at;
      state.still = 0;
      state.moved = !state.animating;
      return;
    }
    if (!state.moved || ++state.still < 2) return;
    state.moved = false;
    if (this.on() && !state.tucked) this.settle(win);
  },

  // Near an edge: against it. Mostly past a side edge: tucked.
  settle(win) {
    const { L, T, R, B } = this.screen(win);
    const x = win.screenX, y = win.screenY, w = win.outerWidth, h = win.outerHeight;
    if (x + w / 2 < L) return this.tuck(win, "left");
    if (x + w / 2 > R) return this.tuck(win, "right");
    let nx = x, ny = y;
    if (x - L < this.NEAR) nx = L + this.GAP;
    else if (R - (x + w) < this.NEAR) nx = R - w - this.GAP;
    if (y - T < this.NEAR) ny = T + this.GAP;
    else if (B - (y + h) < this.NEAR) ny = B - h - this.GAP;
    ny = Math.min(Math.max(ny, T), B - h);
    if (nx !== x || ny !== y) this.glide(win, nx, ny);
  },

  tuck(win, side) {
    const { L, T, R, B } = this.screen(win);
    const w = win.outerWidth, h = win.outerHeight;
    const y = Math.min(Math.max(win.screenY, T + this.GAP), B - h - this.GAP);
    win.zenithPiP.tucked = { side, y };
    win.document.documentElement.setAttribute("zenith-pip-tucked", side);
    this.glide(win, side === "left" ? L - w + this.SLIVER : R - this.SLIVER, y);
  },

  untuck(win) {
    const state = win.zenithPiP, { side, y } = state.tucked;
    const { L, R } = this.screen(win);
    state.tucked = null;
    win.document.documentElement.removeAttribute("zenith-pip-tucked");
    this.glide(win, side === "left" ? L + this.GAP : R - win.outerWidth - this.GAP, y);
  },

  // A short slide to a place (a few steps; the window can't be animated).
  glide(win, x, y) {
    const state = win.zenithPiP;
    const [x0, y0] = [win.screenX, win.screenY], steps = 6;
    state.animating = true;
    let i = 0;
    const step = () => {
      i++;
      const k = 1 - (1 - i / steps) ** 3;
      win.moveTo(Math.round(x0 + (x - x0) * k), Math.round(y0 + (y - y0) * k));
      if (i < steps) win.setTimeout(step, 16);
      else win.setTimeout(() => {
        state.at = [win.screenX, win.screenY];
        state.animating = false;
        state.moved = false;
      }, 200);
    };
    step();
  },

  // A wheel notch: 8% bigger or smaller, the same shape, growing away from
  // the nearest screen edges.
  resize(win, e) {
    e.preventDefault();
    const { L, T, R, B } = this.screen(win);
    const w = win.outerWidth, h = win.outerHeight, x = win.screenX, y = win.screenY;
    const k = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const nw = Math.round(Math.min(Math.max(w * k, 180), (R - L) * 0.9));
    const nh = Math.round((nw * h) / w);
    const right = x + w / 2 > (L + R) / 2, bottom = y + h / 2 > (T + B) / 2;
    const nx = right ? x + w - nw : x, ny = bottom ? y + h - nh : y;
    win.zenithPiP.animating = true;
    win.resizeTo(nw, nh);
    win.moveTo(Math.min(Math.max(nx, L), R - nw), Math.min(Math.max(ny, T), B - nh));
    win.setTimeout(() => {
      win.zenithPiP.at = [win.screenX, win.screenY];
      win.zenithPiP.animating = false;
    }, 120);
  },
};

/* --- Start page (about:zenith-start) -----------------------------------------
   A clock, a search box (Peek's engine) that also finds your bookmarks, and
   the bookmarks with number keys; see-through, on the window's glass. As
   the home page (Firefox's, through the bridge: yours comes back with Off),
   so the Home button and new windows that open the home page show it. The
   page lives in plus/pages; it's registered at once (its text read there
   and then), so a home page restored at start never misses it. */
const StartPage = {
  PREF: "zenith.plus.startpage",
  URL: "about:zenith-start",

  init() {
    this.register();
    const apply = () => {
      const on = !["", "off"].includes(Services.prefs.getStringPref(this.PREF, ""));
      Bridge.apply("start", { "browser.startup.homepage": on ? this.URL : null });
    };
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => Services.prefs.removeObserver(this.PREF, apply));
    apply();
  },

  register() {
    const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
    const read = url => {
      const stream = NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true }).open();
      try {
        return NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" });
      } finally {
        stream.close();
      }
    };
    for (const d of ["../pages/", "zenith-pages/"]) {
      try {
        const url = new URL(`${d}start.html`, import.meta.url).href;
        const text = read(url);
        ChromeUtils.importESModule(new URL(`${d}about.sys.mjs`, import.meta.url).href).register("zenith-start", url, text);
        return true;
      } catch {}
    }
    console.error("[Zenith] about:zenith-start: plus/pages isn't there");
    return false;
  },
};

/* --- Link hints (Alt+J) -------------------------------------------------------
   Vim-style: a few letters on every link, button and field you can see in
   the page; type them to follow it. Alt+Shift+J opens the link in a new tab
   in the background. The labels are drawn by plus/pages/link-hints.sys.mjs,
   a window actor that runs where the page runs; this registers it the first
   time it's used and sends it the accent colour. */
const LinkHints = {
  PREF: "zenith.plus.link-hints",

  init() {
    const commandset = document.createXULElement("commandset");
    const keyset = document.createXULElement("keyset");
    keyset.id = "zenith-hint-keys";
    for (const [id, modifiers, newTab] of [["zenith-hints", "alt", false], ["zenith-hints-tab", "alt,shift", true]]) {
      const command = document.createXULElement("command");
      command.id = `${id}-command`;
      command.addEventListener("command", () => this.show(newTab).catch(e => console.error("[Zenith] link hints", e)));
      const key = document.createXULElement("key");
      key.id = `${id}-key`;
      key.setAttribute("modifiers", modifiers);
      key.setAttribute("key", "J");
      key.setAttribute("reserved", "true");
      key.setAttribute("command", command.id);
      commandset.append(command);
      keyset.append(key);
    }
    root.append(commandset, keyset);
    const watch = () => {
      const on = Services.prefs.getBoolPref(this.PREF, true);
      for (const key of keyset.children) key.toggleAttribute("disabled", !on);
    };
    Services.prefs.addObserver(this.PREF, watch);
    onUnload(() => Services.prefs.removeObserver(this.PREF, watch));
    watch();
    window.ZenithHints = this; // for tools/checks
  },

  // Once per run of Zen (the actor is shared by every window).
  register() {
    return (this.ready ??= (async () => {
      let url = null;
      for (const d of ["../pages/", "zenith-pages/"]) {
        const u = new URL(`${d}link-hints.sys.mjs`, import.meta.url).href;
        if (await fetch(u).then(r => r.ok, () => false)) {
          url = u;
          break;
        }
      }
      if (!url) throw new Error("plus/pages/link-hints.sys.mjs isn't there");
      try {
        // (Safe in a web page's process: it only draws labels and clicks
        // what you pick; it takes nothing from the page to the browser.)
        ChromeUtils.registerWindowActor("ZenithHints", {
          parent: { esModuleURI: url },
          child: { esModuleURI: url },
          safeForUntrustedWebProcess: true,
        });
      } catch (e) {
        if (e.name !== "NotSupportedError") throw e; // (another window registered it)
      }
    })());
  },

  async show(newTab) {
    if (!Services.prefs.getBoolPref(this.PREF, true)) return;
    const browser = gBrowser.selectedBrowser;
    await this.register();
    const page = browser.browsingContext?.currentWindowGlobal;
    if (!page) return;
    this.probe ??= root.appendChild(el("div", { hidden: "true", style: "color: var(--zth-accent, AccentColor)" }));
    const accent = getComputedStyle(this.probe).color;
    const [r, g, b] = (accent.match(/[\d.]+/g) ?? [0, 0, 0]).map(Number);
    const ink = 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#111" : "#fff";
    browser.focus();
    page.getActor("ZenithHints").sendAsyncMessage("show", { newTab, accent, ink });
  },
};

/* --- Window state for the CSS ------------------------------------------------
   A few things Zenith's CSS reacts to live deep in the window: the selected
   tab's container, a muted selected tab, a tab using your camera, a page
   that isn't secure, the sidebar sliding out in compact mode. CSS can find
   them itself with :has(), but then the browser searches the whole window
   for them whenever anything changes (a third of every tab switch). This
   copies them onto the window's root the moment they change instead:
     zenith-container="<colour>"  the selected tab's container colour
     zenith-tab-muted             the selected tab is muted
     zenith-sharing               a tab is using the camera, mic or screen
     zenith-insecure              the page is plain HTTP (not a blank page,
                                  not while the URL bar is open)
     zenith-sidebar-out           compact mode's sidebar is out (hovered,
                                  shown, or holding a menu)
     zenith-sidebar-moving        it's flashing a popup or dragging a tab */
const WindowState = {
  TAB_ATTRS: new Set(["muted", "sharing", "usercontextid"]),
  OUT: ["zen-has-hover", "zen-user-show", "has-popup-menu", "zen-compact-mode-active"],
  MOVING: ["flash-popup", "movingtab"],

  init() {
    const tabs = gBrowser.tabContainer;
    const update = () => this.update();
    const changed = e => (e.detail?.changed ?? []).some(a => this.TAB_ATTRS.has(a)) && this.soon();
    const closed = () => this.soon();
    tabs.addEventListener("TabSelect", update);
    tabs.addEventListener("TabAttrModified", changed);
    tabs.addEventListener("TabClose", closed);
    const watcher = new MutationObserver(update);
    const watch = (node, attributeFilter) => node && watcher.observe(node, { attributes: true, attributeFilter });
    watch(document.getElementById("urlbar"), ["open", "pageproxystate"]);
    watch(document.getElementById("identity-box"), ["class"]);
    watch(gNavToolbox, [...this.OUT, ...this.MOVING]);
    onUnload(() => {
      tabs.removeEventListener("TabSelect", update);
      tabs.removeEventListener("TabAttrModified", changed);
      tabs.removeEventListener("TabClose", closed);
      watcher.disconnect();
      cancelAnimationFrame(this.frame);
    });
    this.update();
  },

  soon() {
    this.frame ||= requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  },

  // Attributes are only touched when they change: every change restyles.
  flag(name, on, value = "") {
    if (!on) {
      if (root.hasAttribute(name)) root.removeAttribute(name);
    } else if (root.getAttribute(name) !== value) {
      root.setAttribute(name, value);
    }
  },

  update() {
    const tab = gBrowser.selectedTab;
    const box = tab?.getAttribute("usercontextid");
    const colour = box && box !== "0" ? ([...tab.classList].find(c => c.startsWith("identity-color-"))?.slice(15) ?? "") : null;
    this.flag("zenith-container", colour !== null, colour ?? "");
    this.flag("zenith-tab-muted", !!tab?.hasAttribute("muted"));
    this.flag("zenith-sharing", gBrowser.tabs.some(t => t.hasAttribute("sharing")));
    const bar = document.getElementById("urlbar");
    const insecure = bar?.getAttribute("pageproxystate") === "valid" && !bar.hasAttribute("open") &&
      !!document.getElementById("identity-box")?.classList.contains("notSecure") && !tab?.hasAttribute("zen-empty-tab");
    this.flag("zenith-insecure", insecure);
    this.flag("zenith-sidebar-out", this.OUT.some(a => gNavToolbox.hasAttribute(a)));
    this.flag("zenith-sidebar-moving", this.MOVING.some(a => gNavToolbox.hasAttribute(a)));
  },
};

const SidebarWidth = {
  init() {
    const tb = gNavToolbox;
    // Zen tucks the hidden sidebar away with a translate, which the offsets
    // ignore: they give where it sits when shown.
    // Measured when the browser lays out anyway (the resize observer's
    // first call comes with the first layout, a frame for the rest): asking
    // for sizes straight away would make the window lay itself out early,
    // before its first picture.
    const measure = () => {
      const right = root.getAttribute("zen-right-side") === "true";
      const push = right ? window.innerWidth - tb.offsetLeft : tb.offsetLeft + tb.offsetWidth;
      root.style.setProperty("--zth-sidebar-push", `${Math.max(0, Math.round(push))}px`);
    };
    let frame = 0;
    const soon = () => (frame ||= requestAnimationFrame(() => {
      frame = 0;
      measure();
    }));
    const resize = new ResizeObserver(measure);
    resize.observe(tb);
    const attrs = new MutationObserver(soon);
    attrs.observe(root, { attributeFilter: ["zen-compact-mode", "zen-right-side", "zen-sidebar-expanded"] });
    window.addEventListener("resize", soon);
    onUnload(() => {
      resize.disconnect();
      attrs.disconnect();
      window.removeEventListener("resize", soon);
      cancelAnimationFrame(frame);
    });
  },
};

/* --- Ctrl+Tab like Alt+Tab ---------------------------------------------------
   "Recently used" turns on Firefox's own recently-used order for Ctrl+Tab:
   hold Ctrl and press Tab to step back through the tabs you used last, with
   a row of page pictures (Zenith styles it), and let go of Ctrl to land,
   as Alt+Tab does with windows. Zen keeps it within the space. "In order,
   with pictures" shows the same row in the sidebar's order instead. Through
   the bridge, so your own setting comes back with "In order". */
const CtrlTabOrder = {
  PREF: "zenith.plus.ctrl-tab",

  init() {
    const apply = () => this.apply();
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, apply);
      this.ownOrder(false);
      this.backwards(false);
    });
    apply();
  },

  // "order" (Zen's: no pictures), "pictures" (in order, with pictures) or
  // "recent" (recently used, with pictures). Both picture kinds are
  // Firefox's recently-used Ctrl+Tab; "pictures" hands it the tabs in their
  // order instead, starting from this one, so Ctrl+Tab steps down the list.
  // With either, Ctrl+Shift+Tab starts the row going back (Firefox would
  // open its list of all tabs instead).
  apply() {
    const mode = Services.prefs.getStringPref(this.PREF, "") || "order";
    Bridge.apply("ctrltab", { "browser.ctrlTab.sortByRecentlyUsed": mode === "order" ? null : true });
    this.ownOrder(mode === "pictures");
    this.backwards(mode !== "order");
    try {
      window.ctrlTab?.readPref?.();
    } catch {}
  },

  backwards(on) {
    const C = window.ctrlTab;
    if (!C) return;
    this.keyDown ??= C.onKeyDown;
    if (!on) {
      C.onKeyDown = this.keyDown;
      return;
    }
    const orig = this.keyDown;
    C.onKeyDown = function (event) {
      const cycle = window.ShortcutUtils?.getSystemActionForEvent?.(event) === window.ShortcutUtils?.CYCLE_TABS;
      if (!cycle || !event.shiftKey || this.isOpen || event.defaultPrevented) return orig.call(this, event);
      event.preventDefault();
      event.stopPropagation();
      document.addEventListener("keyup", this, { mozSystemGroup: true });
      const tabs = gBrowser.visibleTabs;
      if (tabs.length > 2) {
        this.open();
        // From the next one (open's choice), back past this one to the last.
        this.advanceFocus(false);
        this.advanceFocus(false);
      } else if (tabs.length === 2) {
        gBrowser.selectedTab = tabs[tabs[0].selected ? 1 : 0];
      }
    };
  },

  ownOrder(on) {
    const C = window.ctrlTab;
    if (!C) return;
    this.firefox ??= Object.getOwnPropertyDescriptor(C, "tabList");
    if (on) {
      Object.defineProperty(C, "tabList", { get: () => this.inOrder(), configurable: true, enumerable: true });
    } else if (this.firefox) {
      Object.defineProperty(C, "tabList", this.firefox);
    }
  },

  // This space's tabs (essentials and pinned first, as in the sidebar),
  // from the one you're on round to the one before it; asleep ones too.
  // With more tabs than the row holds, the ones just before this one take
  // its end, so going back (Ctrl+Shift+Tab) lands on the previous tab.
  inOrder() {
    const tabs = gBrowser.visibleTabs.filter(t => !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"));
    const i = Math.max(0, tabs.indexOf(gBrowser.selectedTab));
    const round = [...tabs.slice(i), ...tabs.slice(0, i)];
    const max = window.ctrlTab?.maxTabPreviews ?? 7;
    if (round.length <= max) return round;
    const back = Math.floor((max - 1) / 2), ahead = max - 1 - back;
    return [round[0], ...round.slice(1, 1 + ahead), ...round.slice(round.length - back)];
  },
};

/* --- Groups that don't pin --------------------------------------------------
   Zen's folders pin the tabs you put in them: they stay when closed (Ctrl+W
   puts them to sleep), and a tab that wandered off gets marked to go back to
   its first page. "Groups that don't pin" picks how to keep tabs together
   without that:
     folders  (default) Zen's own folders, which split views, dragging and
              nesting already work with. Right-click a folder › Tabs act
              unpinned: Ctrl+W closes its tabs, and a tab keeps the page it's
              on (no "back to its first page" mark). They still sit in the
              folder area, and come back at startup with pinned tabs.
     firefox  Firefox's own tab groups, under the pinned tabs (Zen turns them
              off; turned on through the bridge). Zenith keeps split views
              whole with them: splitting tabs in a group keeps the split in
              the group, adding a split tab to a group brings its split view
              along, "Remove from group" on a split tab takes the whole split
              view out, and a tab that leaves its split view any other way
              (dragged out) is taken out of the split properly.
     off      neither
   Which folders act unpinned is kept in zenith.internal.unpinned-folders
   (folder ids, which Zen keeps across sessions). */
const UnpinnedGroups = {
  PREF: "zenith.plus.unpinned-groups", // "" folders · firefox · off
  OLD: "zenith.plus.loose-groups", // (0.11.1: "on" was Firefox's groups)
  FOLDERS: "zenith.internal.unpinned-folders",

  init() {
    if (Services.prefs.getStringPref(this.OLD, "") === "on" && !Services.prefs.prefHasUserValue(this.PREF)) {
      Services.prefs.setStringPref(this.PREF, "firefox");
    }
    Services.prefs.clearUserPref(this.OLD);
    const apply = () => this.apply();
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, apply);
      this.patch(false);
    });
    this.folderMenu();
    this.folderBehaviour();
    apply();
    window.ZenithGroups = this; // the tab manager, and tools/checks
  },

  get mode() {
    return Services.prefs.getStringPref(this.PREF, "") || "folders";
  },

  apply() {
    const firefox = this.mode === "firefox";
    Bridge.apply("groups", { "browser.tabs.groups.enabled": firefox ? true : null });
    this.patch(firefox);
    this.mark();
  },

  // A group of Firefox's (not one of Zen's folders, not a split view).
  loose(g) {
    return g?.localName === "tab-group" && !g.isZenFolder && !g.hasAttribute("split-view-group");
  },

  /* Firefox's groups, with split views kept whole. */

  patch(on) {
    const B = gBrowser, S = window.gZenViewSplitter;
    if (on === !!this.saved) return;
    if (!on) {
      for (const [obj, name, fn] of this.saved) obj[name] = fn;
      this.saved = null;
      document.getElementById("tabContextMenu")?.removeEventListener("command", this.onUngroup, true);
      gBrowser.tabContainer.removeEventListener("TabUngrouped", this.onLeft);
      return;
    }
    const groups = this;
    const wrap = (obj, name, make) => {
      if (typeof obj?.[name] !== "function") return;
      const orig = obj[name];
      this.saved.push([obj, name, orig]);
      obj[name] = make(orig);
    };
    this.saved = [];
    // A split view made from tabs in a group stays in the group (Zen keeps
    // it inside only for its own folders, and pulls it out of anything else).
    wrap(B, "addTabGroup", orig => function (tabs, opts = {}) {
      const parent = opts.forSplitView ? opts.insertBefore?.group : null;
      if (!groups.loose(parent)) return orig.call(this, tabs, opts);
      Object.defineProperty(parent, "isZenFolder", { value: true, configurable: true });
      try {
        return orig.call(this, tabs, opts);
      } finally {
        delete parent.isZenFolder;
      }
    });
    // A split tab goes into a group with its whole split view.
    wrap(B, "moveTabToExistingGroup", orig => function (tab, group, opts) {
      const split = tab?.group?.hasAttribute?.("split-view-group") ? tab.group : null;
      if (split && split !== group && groups.loose(group)) {
        if (split.group === group) return undefined;
        return orig.call(this, split, group, opts);
      }
      return orig.call(this, tab, group, opts);
    });
    // Zen's own unsplitting moves tabs out of split views: not a tab leaving.
    for (const name of ["removeGroup", "removeTabFromGroup", "unsplitCurrentView"]) {
      wrap(S, name, orig => function (...args) {
        groups.unsplitting = (groups.unsplitting ?? 0) + 1;
        try {
          return orig.apply(this, args);
        } finally {
          groups.unsplitting--;
        }
      });
    }
    // "Remove from group" on a split tab: the whole split view leaves the
    // group (Firefox would take the one tab out of its split view).
    this.onUngroup = e => {
      if (e.target?.id !== "context_ungroupTab") return;
      const tabs = window.TabContextMenu?.contextTabs ?? [];
      if (!tabs.some(t => t.group?.hasAttribute("split-view-group"))) return;
      e.stopImmediatePropagation();
      const done = new Set();
      for (const t of tabs) {
        const split = t.group?.hasAttribute("split-view-group") ? t.group : null;
        if (split) {
          if (done.has(split)) continue;
          done.add(split);
          if (this.loose(split.group)) gBrowser.moveTabAfter(t, split.group);
        } else if (t.group) {
          gBrowser.ungroupTab(t);
        }
      }
    };
    document.getElementById("tabContextMenu")?.addEventListener("command", this.onUngroup, true);
    // A tab that left its split view another way (dragged out): out of the
    // split for Zen too, so the rest re-lays out (or unsplits).
    this.onLeft = e => {
      const from = e.target, tab = e.detail;
      if (this.unsplitting || !from?.hasAttribute?.("split-view-group") || !tab?.splitView || tab.group === from) return;
      setTimeout(() => {
        if (tab.isConnected && tab.splitView && tab.group !== from) window.gZenViewSplitter?.removeTabFromGroup?.(tab, undefined, { forUnsplit: true });
      }, 0);
    };
    gBrowser.tabContainer.addEventListener("TabUngrouped", this.onLeft);
  },

  /* Zen's folders that don't pin. */

  get unpinned() {
    try {
      return new Set(JSON.parse(Services.prefs.getStringPref(this.FOLDERS, "[]")));
    } catch {
      return new Set();
    }
  },

  isUnpinned(folder) {
    return this.mode === "folders" && !!folder?.id && this.unpinned.has(folder.id);
  },

  setUnpinned(folder, on) {
    const ids = this.unpinned;
    if (on) ids.add(folder.id);
    else ids.delete(folder.id);
    Services.prefs.setStringPref(this.FOLDERS, JSON.stringify([...ids]));
    this.mark();
    // Its tabs keep the page they're on from now.
    if (on) for (const tab of folder.tabs ?? []) this.keepPage(tab);
  },

  // The folder a tab is in that acts unpinned (folders can nest).
  folderOf(tab) {
    for (let g = tab?.group; g; g = g.group) if (g.isZenFolder && this.isUnpinned(g)) return g;
    return null;
  },

  mark() {
    const ids = this.mode === "folders" ? this.unpinned : new Set();
    for (const f of document.querySelectorAll("zen-folder")) f.toggleAttribute("zenith-unpinned", ids.has(f.id));
  },

  keepPage(tab) {
    if (!tab?.pinned || tab.hasAttribute("zen-essential")) return;
    try {
      window.gZenWindowSync?.setPinnedTabState?.(tab);
      window.gZenPinnedTabManager?.resetPinChangedUrl?.(tab);
    } catch {}
  },

  folderMenu() {
    const menu = document.getElementById("zenFolderActions");
    if (!menu) return;
    const item = document.createXULElement("menuitem");
    item.id = "zenith-folder-unpinned";
    item.setAttribute("type", "checkbox");
    item.setAttribute("label", "Tabs act unpinned");
    item.setAttribute("tooltiptext", "Ctrl+W closes them, and they keep the page they're on");
    menu.append(item);
    menu.addEventListener("popupshowing", e => {
      if (e.target !== menu) return;
      const node = menu.triggerNode ?? e.explicitOriginalTarget;
      this.menuFolder = node?.closest?.("zen-folder") ?? null;
      item.hidden = this.mode !== "folders" || !this.menuFolder || this.menuFolder.isLiveFolder;
      item.toggleAttribute("checked", this.isUnpinned(this.menuFolder));
    });
    item.addEventListener("command", () => {
      if (this.menuFolder) this.setUnpinned(this.menuFolder, !this.isUnpinned(this.menuFolder));
    });
  },

  folderBehaviour() {
    // A tab in such a folder that goes somewhere keeps going: its page
    // becomes the one it's on (after Zen has marked it changed).
    this.progress = {
      onLocationChange: (browser, progress) => {
        if (!progress?.isTopLevel) return;
        const tab = gBrowser.getTabForBrowser(browser);
        if (this.folderOf(tab)) setTimeout(() => this.keepPage(tab), 0);
      },
    };
    gBrowser.addTabsProgressListener(this.progress);
    // Ctrl+W closes it, before Zen's pinned-tab handling puts it to sleep.
    const close = document.getElementById("cmd_close");
    this.onClose = e => {
      const tabs = gBrowser.selectedTab?.multiselected ? gBrowser.selectedTabs : [gBrowser.selectedTab];
      if (!tabs.length || !tabs.every(t => this.folderOf(t))) return;
      e.stopImmediatePropagation();
      gBrowser.removeTabs(tabs);
    };
    close?.addEventListener("command", this.onClose, true);
    // Zen brings its folders back from the session after the window opens.
    const mark = () => this.mark();
    window.addEventListener("SSWindowRestored", mark);
    gBrowser.tabContainer.addEventListener("TabGroupCreate", mark);
    window.gZenWorkspaces?.promiseInitialized?.then(mark);
    onUnload(() => {
      gBrowser.removeTabsProgressListener(this.progress);
      close?.removeEventListener("command", this.onClose, true);
      window.removeEventListener("SSWindowRestored", mark);
      gBrowser.tabContainer.removeEventListener("TabGroupCreate", mark);
    });
  },
};

/* --- Bookmarks bar: its own strip ------------------------------------------
   Zen puts the bookmarks bar in the strip above the page that also holds
   the window buttons, and Zenith floats that strip in the top-right corner:
   so the bookmarks only showed beside the window buttons, on a corner hover.
   With the bar on (Ctrl+Shift+B), Zenith can give it its own place:
     zen     where Zen puts it, beside the window buttons (default)
     above   a slim strip across the top of the page, always there
     hover   the same strip over the top of the page, shown when the pointer
             reaches the page's top edge (or a bookmark folder is open)
   The bar itself is moved (it's the same toolbar, so customising it still
   works) and put back for "Zen's own". Firefox's "Import bookmarks…"
   button on it is hidden unless "Import bookmarks button" says Shown. */
const BookmarksBar = {
  PREF: "zenith.plus.bookmarks-bar",
  IMPORT: "zenith.plus.bookmarks-import",

  init() {
    this.bar = document.getElementById("PersonalToolbar");
    if (!this.bar) return;
    this.home = this.bar.parentNode;
    this.homeNext = this.bar.nextSibling;
    const apply = () => this.apply();
    for (const p of [this.PREF, this.IMPORT]) Services.prefs.addObserver(p, apply);
    onUnload(() => {
      for (const p of [this.PREF, this.IMPORT]) Services.prefs.removeObserver(p, apply);
    });
    apply();
  },

  apply() {
    root.toggleAttribute("zenith-import-button", Services.prefs.getStringPref(this.IMPORT, "") === "shown");
    const mode = Services.prefs.getStringPref(this.PREF, "") || "zen";
    const content = document.getElementById("zen-appcontent-wrapper");
    const page = document.getElementById("zen-tabbox-wrapper");
    if (mode === "zen" || !content || !page || page.parentNode !== content) {
      root.removeAttribute("zenith-bookmarks");
      if (this.bar.parentNode !== this.home) this.home.insertBefore(this.bar, this.homeNext?.parentNode === this.home ? this.homeNext : null);
      return;
    }
    // Above the page: just before it. Over the page: inside it, at its top.
    if (mode === "hover") {
      if (this.bar.parentNode !== page) page.prepend(this.bar);
    } else if (this.bar.nextSibling !== page) {
      content.insertBefore(this.bar, page);
    }
    root.setAttribute("zenith-bookmarks", mode);
  },
};

/* --- Colours from an image ---------------------------------------------------
   Pick a picture (or use your wallpaper): Zenith finds its colours and gives
   them to the current space, as Zen's own theme picker would. The space's
   earlier colours are kept for "undo" (":colours undo" in the switcher), and
   Zen's theme picker can change them as usual.
   How the colours are found, much as wallust and pywal find a terminal's:
   the picture is shrunk to 64×64 and its pixels grouped by k-means in OKLab
   (where distances match what the eye sees); shades of one hue are gathered
   together, and each hue is scored by how much of the picture it covers and
   how vivid its most colourful pixels are. One, two or three hues come out:
   another only when it's clearly a different hue and covers enough of the
   picture to matter (a grey picture gives one grey). Then each is made into
   a colour Zen shows well: vivid enough to read as that hue, all at one
   lightness, chosen so Zen keeps your light or dark text. */
const ImageColours = {
  init() {
    const commandset = document.createXULElement("commandset");
    for (const [id, fn] of [["zenith-colours-image", () => this.pickFile()],
                            ["zenith-colours-wallpaper", () => this.fromWallpaper()],
                            ["zenith-colours-undo", () => this.undo()]]) {
      const command = document.createXULElement("command");
      command.id = id;
      command.addEventListener("command", fn);
      commandset.append(command);
    }
    root.append(commandset);
    window.ZenithColours = this; // the switcher's :colours, and tools/checks
  },

  pickFile() {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window.browsingContext, "Colours from an image", Ci.nsIFilePicker.modeOpen);
    fp.appendFilters(Ci.nsIFilePicker.filterImages);
    fp.open(result => {
      if (result === Ci.nsIFilePicker.returnOK && fp.file) this.fromFile(fp.file.path);
    });
  },

  async fromFile(path) {
    try {
      const bitmap = await createImageBitmap(new Blob([await IOUtils.read(path)]));
      return this.apply(bitmap, PathUtils.filename(path));
    } catch (e) {
      console.error("[Zenith] colours from an image", e);
      hint("That file isn't a picture Zen can read");
      return null;
    }
  },

  async fromWallpaper() {
    if (!Wallpaper.url) {
      hint("No wallpaper to read: Window material isn't Wallpaper");
      return null;
    }
    const bitmap = await createImageBitmap(await (await fetch(Wallpaper.url)).blob());
    return this.apply(bitmap, "your wallpaper");
  },

  // sRGB (0–255) to OKLab and back (Björn Ottosson's matrices).
  lab([r, g, b]) {
    const lin = v => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  },

  // OKLCH to sRGB, with the chroma eased down until it fits.
  rgb(L, C, h) {
    const toRgb = C => {
      const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
      return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    };
    let lin = toRgb(C);
    while (C > 0 && lin.some(v => v < -0.0005 || v > 1.0005)) lin = toRgb((C = Math.max(0, C - 0.004)));
    const enc = v => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
    return lin.map(enc);
  },

  // The picture's hues, most striking first: [{L, C, h, share, score}].
  palette(bitmap) {
    const N = 64;
    const canvas = document.createElementNS(HTML_NS, "canvas");
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, N, N);
    const data = ctx.getImageData(0, 0, N, N).data;
    const px = [];
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128) px.push(this.lab([data[i], data[i + 1], data[i + 2]]));
    if (!px.length) return [];
    // k-means, started from the pixels farthest apart (so a small patch of
    // a clearly different colour gets its own group).
    const K = 8;
    const d2 = (p, c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    const near = px.map(() => Infinity);
    let centres = [[...px[Math.floor(px.length / 2)]]];
    while (centres.length < K) {
      const c = centres.at(-1);
      let far = 0;
      px.forEach((p, i) => {
        near[i] = Math.min(near[i], d2(p, c));
        if (near[i] > near[far]) far = i;
      });
      if (!near[far]) break; // fewer colours than groups
      centres.push([...px[far]]);
    }
    const owner = new Int32Array(px.length);
    let groups;
    for (let round = 0; round < 12; round++) {
      groups = centres.map(() => []);
      px.forEach((p, i) => {
        let best = 0, dist = Infinity;
        centres.forEach((c, k) => {
          const d = d2(p, c);
          if (d < dist) [best, dist] = [k, d];
        });
        owner[i] = best;
        groups[best].push(p);
      });
      centres = groups.map((g, k) => (g.length ? [0, 1, 2].map(j => g.reduce((n, p) => n + p[j], 0) / g.length) : centres[k]));
    }
    // Each group by its vivid side (the more colourful 40% of its pixels):
    // an average of a whole group is always duller than what you see.
    const found = groups.filter(g => g.length).map(g => {
      const top = g.map(p => [Math.hypot(p[1], p[2]), p]).sort((x, y) => y[0] - x[0])
        .slice(0, Math.max(1, Math.ceil(g.length * 0.4))).map(([, p]) => p);
      const [L, a, b] = [0, 1, 2].map(j => top.reduce((n, p) => n + p[j], 0) / top.length);
      return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, share: g.length / px.length };
    });
    const gap = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
    // Shades of one hue count together; the most vivid speaks for them.
    const hues = [];
    for (const f of found.filter(f => f.C >= 0.03).sort((x, y) => y.share * y.C - x.share * x.C)) {
      const same = hues.find(h => gap(h.h, f.h) < 24);
      if (!same) hues.push({ ...f });
      else {
        same.share += f.share;
        if (f.C > same.C) Object.assign(same, { L: f.L, C: f.C, h: f.h });
      }
    }
    if (!hues.length) {
      // A grey picture: one grey, as light as most of it.
      const most = found.sort((x, y) => y.share - x.share)[0];
      this.lastHues = [];
      return [{ L: most.L, C: 0, h: 0, share: 1, score: 1 }];
    }
    for (const h of hues) h.score = Math.sqrt(h.share) * (0.2 + h.C / 0.1);
    hues.sort((x, y) => y.score - x.score);
    this.lastHues = hues; // for tools/checks
    const chosen = [hues[0]];
    for (const h of hues.slice(1)) {
      if (chosen.length === 3) break;
      const enough = 0.2 * chosen[0].score;
      if (h.score >= enough && chosen.every(c => gap(c.h, h.h) >= 30)) chosen.push(h);
    }
    return chosen;
  },

  // The hues as colours for Zen: chroma lifted a quarter (0.07–0.2, so even
  // a muted picture gives a clear tint), all at one lightness, as Zen's own
  // picker does. Zen chooses light or dark text from the main colour, so the
  // lightness moves until it keeps yours.
  colours(hues) {
    const picker = window.gZenThemePicker;
    const dark = picker?.isDarkMode ?? true;
    const make = L => hues.map(f => this.rgb(L, f.C ? Math.min(0.2, Math.max(0.07, f.C * 1.25)) : 0, f.h));
    let L = dark ? 0.56 : 0.78, rgb = make(L);
    for (let i = 0; i < 12 && picker?.shouldBeDarkMode && picker.shouldBeDarkMode(rgb[0]) !== dark; i++) rgb = make((L += dark ? -0.03 : 0.03));
    return rgb;
  },

  apply(bitmap, from) {
    const hues = this.palette(bitmap);
    bitmap.close?.();
    const W = window.gZenWorkspaces, picker = window.gZenThemePicker;
    const space = W?.getActiveWorkspace?.();
    if (!hues.length || !space || !picker) {
      hint("Couldn't find colours there");
      return null;
    }
    const colours = this.colours(hues);
    this.previous = { uuid: space.uuid, theme: structuredClone(space.theme) };
    const [r, g, b] = colours[0].map(v => v / 255);
    const lightness = Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100);
    const dots = colours.map((c, i) => ({ c, isCustom: false, isPrimary: i === 0, algorithm: "floating", lightness, type: "explicit-lightness" }));
    const opacity = space.theme?.opacity ?? 0.5, texture = space.theme?.texture ?? 0;
    space.theme = picker.constructor.getTheme?.(dots, opacity, texture) ?? { type: "gradient", gradientColors: dots, opacity, texture };
    W.saveWorkspace(space);
    picker.onWorkspaceChange(space);
    hint(`Space colours from ${from}: ${colours.length === 1 ? "one colour" : `${colours.length} colours`}`);
    return colours;
  },

  // (previous: one space, or every space after a palette sync.)
  undo() {
    const W = window.gZenWorkspaces;
    const prev = [this.previous ?? []].flat().map(p => [W?.getWorkspaceFromId(p.uuid), p.theme]).filter(([s]) => s);
    if (!prev.length) return hint("Nothing to undo");
    for (const [space, theme] of prev) {
      space.theme = theme;
      W.saveWorkspace(space);
      if (W.activeWorkspace === space.uuid) gZenThemePicker.onWorkspaceChange(space);
    }
    this.previous = null;
    hint(prev.length > 1 ? "Every space's colours put back" : "Space colours put back");
  },
};

/* --- Palette sync: the spaces follow pywal or wallust ------------------------
   pywal (and winwal on Windows) writes the colours it takes from your
   wallpaper to ~/.cache/wal/colors.json; wallust can write the same file
   (a template, to ~/.cache/wallust/colors.json). With Palette sync on, every
   space takes that palette's most striking colours (one, two or three, as
   with colours from an image) the moment the file changes, and once at
   start if it changed while Zen was closed. :colours undo puts the spaces
   back as they were. */
const PaletteSync = {
  PREF: "zenith.plus.palette-sync",
  DONE: "zenith.internal.palette.applied",
  FILES: { pywal: [".cache/wal/colors.json"], wallust: [".cache/wallust/colors.json", ".config/wallust/colors.json"] },

  init() {
    let timer = null;
    const check = () => {
      const on = !["", "off"].includes(Services.prefs.getStringPref(this.PREF, ""));
      if (on && !timer) timer = setInterval(() => document.hidden || this.check(), 5000);
      if (!on && timer) timer = clearInterval(timer);
      if (on) this.check();
    };
    Services.prefs.addObserver(this.PREF, check);
    window.addEventListener("focus", check);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, check);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    });
    window.ZenithPalette = this; // for tools/checks
    check();
  },

  async file(kind) {
    // (zenith.internal.palette.home: another home folder, for tools/checks.)
    const home = Services.prefs.getStringPref("zenith.internal.palette.home", "") || Services.dirsvc.get("Home", Ci.nsIFile).path;
    for (const rel of this.FILES[kind] ?? []) {
      const path = PathUtils.join(home, ...rel.split("/"));
      if (await IOUtils.exists(path)) return path;
    }
    return null;
  },

  async check() {
    const kind = Services.prefs.getStringPref(this.PREF, "");
    if (!kind || kind === "off" || this.busy) return;
    // Only the window in front changes the spaces (they're shared).
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    this.busy = true;
    try {
      const path = await this.file(kind);
      if (!path) return;
      const text = await IOUtils.readUTF8(path);
      if (text === this.last) return;
      this.last = text;
      const sig = `${kind}:${text.length}:${[...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)}`;
      if (sig === Services.prefs.getStringPref(this.DONE, "")) return;
      if (this.apply(JSON.parse(text))) Services.prefs.setStringPref(this.DONE, sig);
    } catch (e) {
      console.error("[Zenith] palette sync", e);
    } finally {
      this.busy = false;
    }
  },

  // pywal's colors.json: colours 1–6 are the palette's accents (0 and 7
  // are its background and text, 8–15 brighter copies).
  hues(json) {
    const C = ImageColours;
    const gap = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
    const all = [1, 2, 3, 4, 5, 6].map(i => json.colors?.[`color${i}`]).filter(v => /^#[0-9a-f]{6}$/i.test(v ?? "")).map(hex => {
      const [L, a, b] = C.lab([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
      return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
    });
    const hues = all.filter(f => f.C >= 0.03).sort((x, y) => y.C - x.C);
    if (!hues.length) return all.length ? [{ ...all[0], C: 0 }] : [];
    const chosen = [hues[0]];
    for (const h of hues.slice(1)) {
      if (chosen.length === 3) break;
      if (h.C >= 0.4 * chosen[0].C && chosen.every(c => gap(c.h, h.h) >= 30)) chosen.push(h);
    }
    return chosen;
  },

  apply(json) {
    const W = window.gZenWorkspaces, picker = window.gZenThemePicker;
    const hues = this.hues(json);
    if (!hues.length || !W || !picker) return false;
    const colours = ImageColours.colours(hues);
    const [r, g, b] = colours[0].map(v => v / 255);
    const lightness = Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100);
    const dots = colours.map((c, i) => ({ c, isCustom: false, isPrimary: i === 0, algorithm: "floating", lightness, type: "explicit-lightness" }));
    const spaces = W.getWorkspaces?.() ?? [];
    ImageColours.previous = spaces.map(s => ({ uuid: s.uuid, theme: structuredClone(s.theme) }));
    for (const space of spaces) {
      const opacity = space.theme?.opacity ?? 0.5, texture = space.theme?.texture ?? 0;
      space.theme = picker.constructor.getTheme?.(structuredClone(dots), opacity, texture) ?? { type: "gradient", gradientColors: structuredClone(dots), opacity, texture };
      W.saveWorkspace(space);
    }
    const active = W.getActiveWorkspace?.();
    if (active) picker.onWorkspaceChange(active);
    hint(`Spaces follow your palette: ${colours.length === 1 ? "one colour" : `${colours.length} colours`}`);
    return true;
  },
};

/* --- Extension buttons per space ---------------------------------------------
   Right-click an extension's button: "Pinned in spaces" lists every space
   with a tick, so its button shows only in the spaces you tick ("Every
   space" puts it back everywhere). The extension itself keeps running in
   all of them (extensions are shared by the whole browser; one can't run
   separately per space): this is only about where its button is pinned.
   Kept in zenith.internal.extension-spaces as {button id: [space ids]}. */
const SpaceExtensions = {
  PREF: "zenith.internal.extension-spaces",

  get map() {
    try {
      const map = JSON.parse(Services.prefs.getStringPref(this.PREF, "{}"));
      // (0.11.0 kept one space as a string.)
      for (const [id, v] of Object.entries(map)) if (typeof v === "string") map[id] = [v];
      return map;
    } catch {
      return {};
    }
  },

  save(map) {
    Services.prefs.setStringPref(this.PREF, JSON.stringify(map));
  },

  init() {
    const menu = document.getElementById("toolbar-context-menu");
    if (menu) {
      this.sep = document.createXULElement("menuseparator");
      this.menu = document.createXULElement("menu");
      this.menu.setAttribute("label", "Pinned in spaces");
      this.popup = document.createXULElement("menupopup");
      this.menu.append(this.popup);
      this.sep.hidden = this.menu.hidden = true;
      menu.append(this.sep, this.menu);
      menu.addEventListener("popupshowing", e => {
        if (e.target !== menu) return;
        const item = menu.triggerNode?.closest?.(".unified-extensions-item, toolbaritem[data-extensionid], .webextension-browser-action");
        this.target = item?.closest?.("toolbaritem") ?? item;
        const show = !!this.target?.id && !!window.gZenWorkspaces?.workspaceEnabled && this.spaces().length > 1;
        this.sep.hidden = this.menu.hidden = !show;
        if (show) this.fill();
      });
    }
    const update = () => this.update();
    Services.prefs.addObserver(this.PREF, update);
    window.addEventListener("ZenWorkspacesUIUpdate", update);
    const marks = new MutationObserver(update);
    window.gZenWorkspaces?.promiseInitialized?.then(() => {
      const strip = gZenWorkspaces.workspaceElement(gZenWorkspaces.activeWorkspace)?.parentElement;
      if (strip) marks.observe(strip, { subtree: true, attributeFilter: ["active"] });
      update();
    });
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, update);
      window.removeEventListener("ZenWorkspacesUIUpdate", update);
      marks.disconnect();
    });
    // Zen's extensions panel lists only unpinned extensions; the ones pinned
    // only in other spaces get a short list there, to pin here too.
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

  // Ticks: "Every space", then each space (ticked where the button shows).
  // The menu stays open while you tick, like Firefox's own lists of ticks.
  fill() {
    const id = this.target.id, pinned = this.map[id];
    const row = (label, checked, fn) => {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", label);
      item.setAttribute("type", "checkbox");
      item.setAttribute("closemenu", "none");
      item.toggleAttribute("checked", checked);
      item.addEventListener("command", () => {
        fn();
        this.fill();
      });
      return item;
    };
    const items = [row("Every space", !pinned, () => this.set(id, null)), document.createXULElement("menuseparator")];
    for (const space of this.spaces()) {
      const on = !pinned || pinned.includes(space.uuid);
      items.push(row(`${space.icon && !/^[a-z]+:/i.test(space.icon) ? `${space.icon}  ` : ""}${space.name}`, on, () => this.flip(id, space.uuid)));
    }
    this.popup.replaceChildren(...items);
  },

  // Untick a space: the button leaves it (never the last one); tick every
  // space and it's back to "Every space".
  flip(id, uuid) {
    const all = this.spaces().map(s => s.uuid);
    let list = this.map[id] ?? all;
    list = list.includes(uuid) ? list.filter(u => u !== uuid) : [...list, uuid];
    if (!list.length) return;
    this.set(id, all.every(u => list.includes(u)) ? null : list);
  },

  set(id, list) {
    const map = this.map;
    if (list) map[id] = list;
    else delete map[id];
    this.save(map);
  },

  fillPanel() {
    const area = document.getElementById("unified-extensions-area");
    if (!area) return;
    let box = document.getElementById("zenith-other-space-extensions");
    if (!box) {
      box = document.createXULElement("vbox");
      box.id = "zenith-other-space-extensions";
      area.after(box);
    }
    const hidden = [...document.querySelectorAll("[zenith-other-space]")].filter(n => n.id);
    box.hidden = !hidden.length;
    const here = window.gZenWorkspaces?.activeWorkspace;
    const head = document.createXULElement("label");
    head.className = "zenith-ose-head";
    head.setAttribute("value", "Pinned in other spaces");
    const rows = hidden.map(node => {
      const button = node.querySelector("toolbarbutton") ?? node;
      const row = document.createXULElement("hbox");
      row.className = "zenith-ose-row";
      row.setAttribute("align", "center");
      const icon = document.createXULElement("image");
      icon.className = "zenith-ose-icon";
      for (const v of ["--webextension-toolbar-image", "--webextension-toolbar-image-2x", "--webextension-menupanel-image"]) {
        const value = button.style.getPropertyValue(v);
        if (value) icon.style.setProperty(v, value);
      }
      const name = document.createXULElement("label");
      name.className = "zenith-ose-name";
      name.setAttribute("value", button.getAttribute("label") || button.getAttribute("tooltiptext") || node.id);
      name.setAttribute("flex", "1");
      name.setAttribute("crop", "end");
      const pin = document.createXULElement("toolbarbutton");
      pin.className = "subviewbutton zenith-ose-pin";
      pin.setAttribute("label", "Pin here");
      pin.addEventListener("command", () => {
        if (here) this.flip(node.id, here);
        this.fillPanel();
      });
      row.append(icon, name, pin);
      return row;
    });
    box.replaceChildren(head, ...rows);
  },

  // Hide the buttons that aren't pinned in this space (only what changed,
  // so nothing in the open sidebar is touched needlessly).
  update() {
    const map = this.map, here = window.gZenWorkspaces?.activeWorkspace;
    const away = new Set(Object.entries(map).filter(([, list]) => here && !list.includes(here)).map(([id]) => id));
    for (const node of document.querySelectorAll("[zenith-other-space]")) if (!away.has(node.id)) node.removeAttribute("zenith-other-space");
    for (const id of away) {
      const node = document.getElementById(id);
      if (node && !node.hasAttribute("zenith-other-space")) node.setAttribute("zenith-other-space", "true");
    }
  },
};

/* --- Links from other apps: ask where they go --------------------------------
   With "Links from other apps" on Ask, a link from another app (mail, chat,
   a login) that none of Zen's Space routing rules sends somewhere stops at
   a small card: pick the space (and so its container) it opens in, with
   "always open <site> there" to turn the choice into a Space routing rule.
   Escape opens it as Zen would have. Rules you already have still apply
   without asking. Firefox hands such links to the window's browserDOMWindow
   (OPEN_EXTERNAL); Zenith waits there for your answer.
   Zen's Space routing dialog gains "Ask me each time" in each rule's list of
   spaces (that rule then asks) and in the default for other links (the same
   as this setting; the two follow each other). Zen reads "Ask me each time"
   as no space, so without Zenith such links simply open where you are. */
const ExternalLinks = {
  PREF: "zenith.plus.external-links",
  ASK: "zenith-ask",
  SAVED: "zenith.internal.links.default",

  init() {
    const hook = () => {
      // window.browserDOMWindow hands back an XPCOM wrapper; the method
      // Firefox calls lives on the script object inside it.
      const bdw = window.browserDOMWindow?.wrappedJSObject ?? window.browserDOMWindow;
      if (!bdw?.openURI || bdw.zenithAsks) return;
      const orig = bdw.openURI;
      bdw.zenithAsks = true;
      bdw.openURI = (...args) => {
        const [uri, , , context] = args;
        if (context === Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL && this.wanted(uri)) {
          this.ask(uri, () => orig.apply(bdw, args));
          return null;
        }
        return orig.apply(bdw, args);
      };
      onUnload(() => {
        bdw.openURI = orig;
        delete bdw.zenithAsks;
      });
    };
    if (window.browserDOMWindow) hook();
    else window.delayedStartupPromise?.then(hook);
    this.patchDialog();
    const follow = () => this.followSetting();
    Services.prefs.addObserver(this.PREF, follow);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, follow);
      this.unpatchDialog();
    });
    window.ZenithLinks = this; // for tools/checks
  },

  routing() {
    return window.gZenSpaceRoutingManager ?? null;
  },

  // The setting and Zen's default for links no rule matches follow each
  // other: "Ask each time" here is "Ask me each time" there, and back.
  followSetting() {
    const R = this.routing();
    if (!R?.getDefaultExternalRoute) return;
    const ask = Services.prefs.getStringPref(this.PREF, "") === "ask";
    try {
      const now = R.getDefaultExternalRoute();
      if (ask && now !== this.ASK) {
        Services.prefs.setStringPref(this.SAVED, now);
        R.setDefaultExternalRoute(this.ASK);
        R.saveRoutes();
      } else if (!ask && now === this.ASK) {
        R.setDefaultExternalRoute(Services.prefs.getStringPref(this.SAVED, "") || "most-recent-space");
        R.saveRoutes();
      }
    } catch (e) {
      console.error("[Zenith] links: Space routing default", e);
    }
  },

  // Zen's dialog builds each list of spaces with createOpenInList; Zenith's
  // choice goes in after "Most recent space". The dialog's code is shared by
  // every window, so one window patches it and hands over when it closes.
  patchDialog() {
    let proto;
    try {
      proto = ChromeUtils.importESModule("resource:///modules/zen/spacerouting/ZenSpaceRoutingDialog.mjs")
        .nsZenSpaceRoutingDialog.prototype;
    } catch {
      return;
    }
    if (proto.zenithOrig) return;
    const orig = (proto.zenithOrig = proto.createOpenInList);
    const links = this;
    proto.createOpenInList = async function (select, value) {
      await orig.call(this, select, value);
      const popup = select.querySelector("menupopup") ?? select;
      const item = this.doc.createXULElement("menuitem");
      item.setAttribute("label", "Ask me each time");
      item.setAttribute("value", links.ASK);
      item.className = "zenith-route-ask";
      const recent = popup.querySelector('menuitem[value="most-recent-space"]');
      if (recent) recent.after(item);
      else popup.append(item);
      const isDefault = select.id === "sr-default-external-open-in";
      const asking = value === links.ASK || (isDefault && Services.prefs.getStringPref(links.PREF, "") === "ask");
      if (asking) select.value = links.ASK;
      if (isDefault) {
        if (value !== links.ASK) Services.prefs.setStringPref(links.SAVED, value);
        select.addEventListener("command", () => {
          if (select.value === links.ASK) Services.prefs.setStringPref(links.PREF, "ask");
          else Services.prefs.clearUserPref(links.PREF);
        });
      }
    };
    this.patched = proto;
  },

  unpatchDialog() {
    const proto = this.patched;
    if (!proto?.zenithOrig) return;
    proto.createOpenInList = proto.zenithOrig;
    delete proto.zenithOrig;
    this.patched = null;
    for (const w of Services.wm.getEnumerator("navigator:browser")) {
      if (w !== window && !w.closed && w.ZenithLinks) {
        w.ZenithLinks.patchDialog();
        break;
      }
    }
  },

  spaces() {
    try {
      return gZenWorkspaces.workspaceEnabled ? gZenWorkspaces.getWorkspaces() ?? [] : [];
    } catch {
      return [];
    }
  },

  // Ask only for web links, with more than one space: when the first rule
  // that matches says "Ask me each time", or when none matches and the
  // default is to ask.
  wanted(uri) {
    if (!/^https?$/.test(uri?.scheme ?? "") || this.spaces().length < 2) return false;
    const route = this.rule(uri);
    if (route) return route.openIn === this.ASK;
    return Services.prefs.getStringPref(this.PREF, "") === "ask" || this.routing()?.getDefaultExternalRoute?.() === this.ASK;
  },

  rule(uri) {
    const R = this.routing();
    try {
      return R?.getAllRoutes().find(route => R.isRouteMatching(uri.spec, route)) ?? null;
    } catch {
      return null;
    }
  },

  ask(uri, open) {
    this.pending?.cancel();
    const host = uri.host.replace(/^www\./, "");
    const card = el("div", { id: "zenith-linkask" });
    const box = el("div", { id: "zenith-linkask-box" });
    const head = el("div", { class: "zth-la-head" });
    head.textContent = "Open a link from another app";
    const site = el("div", { class: "zth-la-site" });
    site.textContent = uri.spec.length > 90 ? uri.spec.slice(0, 90) + "…" : uri.spec;
    const list = el("div", { class: "zth-la-list" });
    const always = el("label", { class: "zth-la-always" });
    const tick = el("input", { type: "checkbox" });
    always.append(tick, document.createTextNode(` Always open ${host} there (a Space routing rule)`));
    const foot = el("div", { class: "zth-la-foot" });
    foot.textContent = "↑↓ or 1–9 choose · Enter opens · Esc opens it as usual";
    const done = () => {
      card.remove();
      this.pending = null;
    };
    const asked = this.rule(uri);
    const choose = async space => {
      done();
      if (tick.checked) this.remember(host, space.uuid, !!asked);
      if (gZenWorkspaces.activeWorkspace !== space.uuid) await gZenWorkspaces.changeWorkspaceWithID(space.uuid);
      open();
    };
    const spaces = this.spaces();
    let selected = Math.max(0, spaces.findIndex(s => s.uuid === gZenWorkspaces.activeWorkspace));
    const rows = spaces.map((space, i) => {
      const row = el("button", { class: "zth-la-row", type: "button" });
      const name = el("span", { class: "zth-la-name" });
      name.textContent = `${i + 1}  ${space.name}`;
      const box2 = el("span", { class: "zth-la-container" });
      let container = "";
      try {
        if (space.containerTabId) container = ContextualIdentityService.getUserContextLabel(space.containerTabId);
      } catch {}
      box2.textContent = [container && `container: ${container}`, space.uuid === gZenWorkspaces.activeWorkspace && "here"].filter(Boolean).join(" · ");
      row.append(name, box2);
      row.addEventListener("click", () => choose(space));
      list.append(row);
      return row;
    });
    const mark = () => rows.forEach((r, i) => r.toggleAttribute("selected", i === selected));
    mark();
    box.append(head, site, list, always, foot);
    card.append(box);
    card.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        e.preventDefault();
        done();
        open();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        selected = (selected + (e.key === "ArrowDown" ? 1 : spaces.length - 1)) % spaces.length;
        mark();
      } else if (e.key === "Enter" && e.target !== tick) {
        e.preventDefault();
        choose(spaces[selected]);
      } else if (/^[1-9]$/.test(e.key) && spaces[+e.key - 1]) {
        e.preventDefault();
        choose(spaces[+e.key - 1]);
      }
    });
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(card);
    window.focus();
    rows[selected]?.focus();
    this.pending = { cancel: () => { done(); open(); }, choose, spaces, tick };
  },

  // "Always open <site> there": a Space routing rule, as Zen's own dialog
  // would make (contains <site> → that space). When an "ask" rule asked, the
  // new one goes first, or the asking rule would still win.
  remember(host, spaceId, first = false) {
    const R = this.routing();
    if (!R?.createNewRoute) return;
    const route = R.createNewRoute();
    route.reference = host;
    route.matchType = "contains";
    route.openIn = spaceId;
    R.updateRoute(route);
    if (first) {
      // Zen keeps rules in a list and finds them by id; moving every rule's
      // contents down one place puts the new rule at the top.
      const all = R.getAllRoutes();
      const wanted = [all.at(-1), ...all.slice(0, -1)];
      all.forEach((slot, i) => R.updateRoute({ ...wanted[i], id: slot.id }));
    }
    R.saveRoutes();
  },
};

/* --- Blend with the page -------------------------------------------------------
   With "Blend with the page" on, the glass (sidebar, the window around the
   page, panels) takes the colour along the top of the page you're on, so
   the frame runs into the page, as the Blended Addressbar mod does. A thin
   strip at the top of the page is drawn small (drawSnapshot) and averaged
   when you switch tabs, when a page has loaded, and every couple of seconds
   while the window is in front (pages change colour as you scroll). Core
   mixes it in at 30%, enough to read and not so much that text on the
   glass gets hard to read. */
const PageBlend = {
  PREF: "zenith.plus.blend",

  get on() {
    return Services.prefs.getStringPref(this.PREF, "") === "on";
  },

  init() {
    const update = () => this.update();
    const soon = () => this.sampleSoon();
    Services.prefs.addObserver(this.PREF, update);
    gBrowser.tabContainer.addEventListener("TabSelect", soon);
    this.listener = {
      onStateChange: (browser, webProgress, request, flags) => {
        if (browser === gBrowser.selectedBrowser && webProgress.isTopLevel && flags & Ci.nsIWebProgressListener.STATE_STOP) soon();
      },
    };
    gBrowser.addTabsProgressListener(this.listener);
    onUnload(() => {
      Services.prefs.removeObserver(this.PREF, update);
      gBrowser.tabContainer.removeEventListener("TabSelect", soon);
      gBrowser.removeTabsProgressListener(this.listener);
      clearInterval(this.timer);
    });
    window.ZenithBlend = this; // for tools/checks
    update();
  },

  update() {
    clearInterval(this.timer);
    if (!this.on) {
      root.removeAttribute("zenith-blend");
      root.style.removeProperty("--zth-page-tint");
      return;
    }
    root.setAttribute("zenith-blend", "on");
    this.timer = setInterval(() => {
      if (document.hasFocus()) this.sample();
    }, 2000);
    this.sample();
  },

  sampleSoon() {
    if (!this.on) return;
    clearTimeout(this.soonTimer);
    this.soonTimer = setTimeout(() => this.sample(), 120);
  },

  async sample() {
    const b = gBrowser.selectedBrowser;
    const w = Math.max(1, Math.round(b?.clientWidth ?? 0));
    if (!b || w < 10 || !this.on) return;
    try {
      const bitmap = await b.drawSnapshot(0, 0, w, 8, 0.2, "white");
      const c = document.createElementNS(HTML_NS, "canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let r = 0, g = 0, bl = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        bl += d[i + 2];
        n++;
      }
      if (!n || !this.on || b !== gBrowser.selectedBrowser) return;
      const tint = `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(bl / n)})`;
      if (tint !== this.tint) {
        this.tint = tint;
        root.style.setProperty("--zth-page-tint", tint);
      }
    } catch (e) {
      // Pages that can't be drawn (some internal ones) keep the last colour.
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
 "zenith.tabs.pin-mark": "Zenith Tabs",
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
 "zenith.panels.menu-icons": "Zenith Panels",
 "zenith.panels.tab-preview": "Zenith Panels",
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
}, true);
start("motion bridge", () => MotionBridge.init(), true);
start("window state", () => WindowState.init(), true);
start("link hints", () => LinkHints.init(), true);
start("start page", () => StartPage.init(), true);
start("picture-in-picture", () => PiPWindows.init());
start("float a tab", () => FloatTab.init(), true);
start("window paint", () => WindowPaint.init(), true);
start("ctrl hold", () => CtrlHold.init());
start("load edge", () => LoadEdge.init());
start("not-secure hint", () => InsecureHint.init());
start("download edge", () => DownloadEdge.init().catch(e => console.error("[Zenith] download edge", e)));
start("minimap", () => Minimap.init());
start("page accent", () => PageAccent.init());
start("zoom pills", () => ZoomPills.init());
start("media art", () => MediaArt.init());
start("window material", () => WindowMaterial.init(), true);
start("live settings", () => LiveSettings.init());
start("glass light", () => GlassLight.init());
start("wallpaper", () => Wallpaper.init(), true);
start("see-through pages", () => SeeThroughPages.init(), true);
start("scroll feel", () => ScrollFeel.init(), true);
start("focus mode", () => FocusMode.init(), true);
start("workspace dots", () => Spaces.init());
start("more menus", () => MoreMenus.init());
start("key switch flash", () => KeySwitchFlash.init());
start("ready pulse", () => ReadyPulse.init());
start("sidebar width", () => SidebarWidth.init(), true);
start("ctrl+tab order", () => CtrlTabOrder.init(), true);
start("groups that don't pin", () => UnpinnedGroups.init(), true);
start("bookmarks bar", () => BookmarksBar.init(), true);
start("colours from an image", () => ImageColours.init());
start("palette sync", () => PaletteSync.init());
start("extensions per space", () => SpaceExtensions.init(), true);
start("links from other apps", () => ExternalLinks.init(), true);
start("blend with the page", () => PageBlend.init());
start("notices on top", noticesOnTop, true);
start("core check", checkCore);
