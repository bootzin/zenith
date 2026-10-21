// ==UserScript==
// @name           Zenith Plus
// @description    Zenith Plus: real load and download progress, the sidebar minimap, zoom pills, page colours, the matching sidebar colour and more.
// @include        main
// @version        0.12.12
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

// Firefox's session start (where it lives moved between Firefox versions).
function sessionStartup() {
  if (window.SessionStartup) return window.SessionStartup;
  for (const url of ["moz-src:///browser/components/sessionstore/SessionStartup.sys.mjs", "resource:///modules/sessionstore/SessionStartup.sys.mjs"]) {
    try {
      return ChromeUtils.importESModule(url).SessionStartup;
    } catch {}
  }
  return null;
}

function PrivateBrowsingUtilsOf(win) {
  return ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs").PrivateBrowsingUtils.isWindowPrivate(win);
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
    window.ZenithMinimap = this; // for tools/checks
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

  // As the tabs show it: no attention dots, no attention ticks; a title
  // that changed counts only if it gets a dot (Tabs › Attention dots).
  attentionOn() {
    const P = Services.prefs, v = P.getStringPref("zenith.tabs.attention", "");
    return v ? v === "on" : (P.getStringPref("zenith.tabs.preset", "") || "informative") !== "plain";
  },

  kind(tab) {
    if (tab.hasAttribute("sharing")) return "sharing";
    if (this.attentionOn() && (tab.hasAttribute("attention") ||
        (tab.hasAttribute("titlechanged") && Services.prefs.getStringPref("zenith.tabs.attention-for", "") !== "alerts"))) return "attention";
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

/* --- Focus mode: Alt+Z puts everything away ----------------------------------
   For reading or watching: the sidebar hides (compact mode, if it wasn't
   already), the top toolbar too (Zen's own "hide the toolbar" for the
   while), and so do the edges, the minimap, pills, the workspace dots,
   the bookmarks bar and the link address at the bottom; whatever was open
   closes (Firefox's sidebar, Zenith's bookmarks, Zen's Library, the
   settings panel, the switcher, the find bar, menus). You can open any of
   them again while focused. The sharing alarm still shows.
   The page too (see plus/pages/focus-page.sys.mjs), the tab you're on and
   any you switch to: a video site becomes a place to watch (Focus mode ›
   Video sites), an article gets a reading view over the page, and any
   other page that's mostly reading is tidied (Focus mode › Pages). One
   pill says focus mode is on, then what was done, with "Show the page"
   (this tab, now) and "Not on <site>" (added to the sites focus mode
   leaves alone, Focus mode › Sites left alone).
   Alt+Z again brings everything back: compact mode and the toolbar as they
   were, what was open opens again, pages as they were (nothing reloads).
   Focus mode is for the site you're on (Focus mode › On for): its tabs,
   and pages on it you go to; on another site's tab the browser is as it
   was, and back on the site it's focused again. Or for every site. */
const FocusMode = {
  PREF: "zenith.plus.focus-key",
  PAGES: "zenith.plus.focus-pages", // "" reading view, tidy · reader (no tidy) · off
  SKIP: "zenith.plus.focus-skip", // sites left alone: "example.com, news.site"
  VIDEO: "zenith.plus.focus-video", // video sites, a place to watch; its parts: focus-video-<part>
  SCOPE: "zenith.plus.focus-scope", // "" the site you're on · all: every site
  PARTS: { search: true, description: true, playlist: true, comments: false, subscriptions: false },

  // (The browser's part: focused for the tab you're on.)
  get on() {
    return root.hasAttribute("zenith-focus");
  },

  get scope() {
    return Services.prefs.getStringPref(this.SCOPE, "") === "all" ? "all" : "site";
  },

  // A tab's site, as focus mode counts them (example.com for
  // news.example.com too).
  siteOf(tab) {
    const uri = tab?.linkedBrowser?.currentURI;
    if (!uri) return "";
    try {
      return Services.eTLD.getBaseDomain(uri);
    } catch {
      return uri.asciiHost || uri.spec;
    }
  },

  focused(tab) {
    return !!this.everywhere || !!this.sites?.has(this.siteOf(tab));
  },

  get pages() {
    return Services.prefs.getStringPref(this.PAGES, "") || "tidy";
  },

  get skipped() {
    return Services.prefs.getStringPref(this.SKIP, "").split(/[\s,]+/).map(s => s.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);
  },

  skips(host) {
    host = (host || "").toLowerCase().replace(/^www\./, "");
    return !!host && this.skipped.some(s => host === s || host.endsWith(`.${s}`));
  },

  // Alt+Z: on or off for the site you're on (or every site).
  toggle(want) {
    const tab = gBrowser.selectedTab, site = this.siteOf(tab);
    this.sites ??= new Set();
    want ??= !this.focused(tab);
    if (want === this.focused(tab)) return;
    this.changed ??= new Map(); // tab → what was done to its page
    if (want && this.scope === "all") this.everywhere = true;
    else if (want) this.sites.add(site);
    else if (this.everywhere || this.scope === "all") return this.off();
    else {
      this.sites.delete(site);
      this.restorePages(t => this.siteOf(t) === site);
    }
    this.follow(this.everywhere || this.sites.size > 0);
    this.browser(this.focused(tab), true);
    if (want) this.page(tab);
  },

  // Off everywhere.
  off() {
    this.everywhere = false;
    this.sites?.clear();
    this.follow(false);
    this.restorePages();
    this.browser(false, true);
  },

  // The browser around the page: away (compact, no toolbar, what's open
  // closed) or back as it was.
  browser(want, told) {
    if (want === this.on) return;
    const compact = window.gZenCompactModeManager;
    if (want) {
      this.madeCompact = !!compact && !compact.preference;
      if (this.madeCompact) compact.preference = true;
      root.setAttribute("zenith-focus", "true");
      // (The top toolbar, when Zen shows one: hidden as compact mode can.)
      if (!Services.prefs.getBoolPref("zen.view.use-single-toolbar", true)) Bridge.apply("focus", { "zen.view.compact.hide-toolbar": true });
      this.putAway();
      if (told) {
        const where = this.everywhere ? "Focus mode" : `Focus mode on ${this.siteOf(gBrowser.selectedTab)}`;
        this.say(null, Services.prefs.getBoolPref(this.PREF, true) ? `${where} · Alt+Z to leave` : where);
      }
    } else {
      root.removeAttribute("zenith-focus");
      if (this.madeCompact && compact?.preference) compact.preference = false;
      this.madeCompact = false;
      Bridge.apply("focus", { "zen.view.compact.hide-toolbar": null });
      this.bringBack();
      this.pill?.removeAttribute("show");
    }
  },

  // The tab you're on now: focused or not, as its site is.
  onTab() {
    const tab = gBrowser.selectedTab, on = this.focused(tab);
    this.browser(on, false);
    if (on) this.page(tab);
  },

  // Whatever's open closes as focus mode starts; what it was is kept, to
  // open again as focus mode ends.
  putAway() {
    const quietly = fn => {
      try {
        return fn();
      } catch {
        return null;
      }
    };
    const was = (this.was = {});
    quietly(() => {
      if (window.SidebarController?.isOpen) {
        was.sidebar = window.SidebarController.currentID;
        window.SidebarController.hide();
      }
    });
    quietly(() => {
      const P = window.ZenithBookmarks?.Panel;
      if (P?.node && !P.node.hidden) {
        was.bookmarks = true;
        P.hide();
      }
    });
    quietly(() => {
      const L = window.ZenithLive;
      if (L?.host && !L.host.hidden) {
        was.live = true;
        L.close();
      }
    });
    quietly(() => window.ZenithSwitcher?.hide?.());
    quietly(() => {
      const bar = gBrowser.getCachedFindBar?.();
      if (bar && !bar.hidden) {
        was.find = gBrowser.selectedTab;
        bar.close();
      }
    });
    quietly(() => {
      const lib = document.querySelector("zen-library");
      if (lib && (lib.hasAttribute("open") || !lib.isHidden?.())) {
        was.library = lib.activeTab || true;
        lib.onKeyDown?.({ key: "Escape", keyCode: 27, preventDefault() {}, stopPropagation() {}, target: lib });
      }
    });
    for (const p of document.querySelectorAll("panel[panelopen='true'], menupopup[open]")) quietly(() => p.hidePopup());
  },

  bringBack() {
    const was = this.was ?? {};
    this.was = null;
    const quietly = fn => {
      try {
        fn();
      } catch (e) {
        console.error("[Zenith] focus mode: opening again", e);
      }
    };
    if (was.sidebar) quietly(() => window.SidebarController?.show(was.sidebar));
    if (was.bookmarks) quietly(() => window.ZenithBookmarks?.Panel?.show());
    if (was.live) quietly(() => window.ZenithLive?.open());
    if (was.find?.isConnected && was.find.selected) quietly(() => gBrowser.getFindBar(was.find).then(bar => bar.open()));
    if (was.library) {
      quietly(() => {
        const lib = document.querySelector("zen-library");
        const open = lib && (lib.hasAttribute("open") || !lib.isHidden?.());
        if (!open) document.getElementById("cmd_zenToggleLibrary")?.doCommand();
        if (typeof was.library === "string" && lib) lib.activeTab = was.library;
      });
    }
  },

  // While focused: the tab you switch to, and pages loading in it.
  follow(on) {
    if (on && this.onSelect) return;
    if (on) {
      this.onSelect = () => this.onTab();
      this.progress = {
        onStateChange: (browser, webProgress, request, flags) => {
          const done = flags & Ci.nsIWebProgressListener.STATE_STOP && flags & Ci.nsIWebProgressListener.STATE_IS_WINDOW;
          if (done && webProgress?.isTopLevel && browser === gBrowser.selectedBrowser) this.onTab();
        },
      };
      gBrowser.tabContainer.addEventListener("TabSelect", this.onSelect);
      gBrowser.addTabsProgressListener(this.progress);
    } else if (this.onSelect) {
      gBrowser.tabContainer.removeEventListener("TabSelect", this.onSelect);
      gBrowser.removeTabsProgressListener(this.progress);
      this.onSelect = this.progress = null;
    }
  },

  actor(browser) {
    return PageActors.in(browser, "ZenithFocus", "focus-page.sys.mjs");
  },

  // What to keep on video sites (each its own setting).
  get keep() {
    return Object.fromEntries(Object.entries(this.PARTS).map(([part, on]) => [part, Services.prefs.getBoolPref(`${this.VIDEO}-${part}`, on)]));
  },

  // The page you're on: a place to watch on a video site, a reading view
  // for an article, or tidied; each only once per page.
  async page(tab) {
    const mode = this.pages, video = Services.prefs.getBoolPref(this.VIDEO, true), browser = tab?.linkedBrowser;
    if ((mode === "off" && !video) || !browser || !this.focused(tab)) return;
    const uri = browser.currentURI;
    if (!/^https?$/.test(uri?.scheme ?? "") || this.skips(uri.host)) return;
    // (Firefox works out whether it's an article a moment after it loads.)
    for (let i = 0; i < 12 && !browser.isArticle && browser.webProgress?.isLoadingDocument; i++) await new Promise(r => setTimeout(r, 250));
    await new Promise(r => setTimeout(r, 300));
    if (!this.focused(tab) || tab !== gBrowser.selectedTab || this.changed?.get(tab)?.spec === uri.spec) return;
    const actor = await this.actor(browser);
    if (!actor) return;
    const ask = (name, data) => actor.sendQuery(name, data).catch(() => false);
    const kind = (await ask("kind")) || {};
    // (An article with a video in it is still an article; the reading view
    // only for what Firefox itself takes for an article.)
    let done = null;
    if (video && (kind.site || (kind.video && !browser.isArticle)) && (await ask("watch", this.keep))) done = "watch";
    else if (mode !== "off" && browser.isArticle && (await ask("read"))) done = "read";
    else if (mode === "tidy" && kind.reading && (await ask("tidy"))) done = "tidy";
    if (!done) return;
    this.changed?.set(tab, { spec: uri.spec, done });
    this.say(tab, done);
  },

  // Each page as it was (those that pass which()).
  async restorePages(which = () => true) {
    for (const tab of [...(this.changed?.keys() ?? [])]) {
      if (!tab.isConnected || !which(tab)) continue;
      this.changed.delete(tab);
      const actor = await this.actor(tab.linkedBrowser);
      actor?.sendAsyncMessage("undo");
    }
  },

  // The pill: focus mode is on (no tab), then what was done to the page,
  // and two ways out.
  say(tab, done) {
    if (!this.pill) {
      const pill = (this.pill = el("div", { id: "zenith-focus-pill" }));
      const text = el("span", { class: "what" });
      const page = el("button", { type: "button" });
      const site = el("button", { type: "button" });
      page.textContent = "Show the page";
      pill.append(text, page, site);
      (document.getElementById("zen-main-app-wrapper") ?? document.body).append(pill);
      page.addEventListener("click", () => this.leaveAlone(this.pillTab, false));
      site.addEventListener("click", () => this.leaveAlone(this.pillTab, true));
      pill.addEventListener("mouseenter", () => clearTimeout(this.pillTimer));
      pill.addEventListener("mouseleave", () => this.hidePillSoon());
      this.pillParts = { text, site };
    }
    this.pillTab = tab;
    this.pill.toggleAttribute("buttons", !!tab);
    if (tab) {
      const host = tab.linkedBrowser.currentURI?.host?.replace(/^www\./, "") ?? "";
      this.pillParts.text.textContent = {
        read: "Reading view",
        watch: "A place to watch: recommendations, Shorts and autoplay are gone",
        tidy: "Tidied: banners and clutter hidden",
      }[done];
      this.pillParts.site.textContent = `Not on ${host}`;
    } else {
      this.pillParts.text.textContent = done;
    }
    this.pill.removeAttribute("show");
    void this.pill.offsetWidth; // (the same pill again: it comes up again)
    this.pill.setAttribute("show", "true");
    this.hidePillSoon(tab ? 6000 : 1800);
  },

  hidePillSoon(ms = 6000) {
    clearTimeout(this.pillTimer);
    this.pillTimer = setTimeout(() => this.pill?.removeAttribute("show"), ms);
  },

  // "Show the page": as it is, for this page; "Not on <site>": and never
  // again on this site.
  async leaveAlone(tab, site) {
    this.pill?.removeAttribute("show");
    if (!tab?.isConnected) return;
    if (site) {
      const host = tab.linkedBrowser.currentURI?.host?.replace(/^www\./, "");
      if (host && !this.skips(host)) Services.prefs.setStringPref(this.SKIP, [...this.skipped, host].join(", "));
      this.say(null, `Focus mode leaves ${host} alone (Zenith › Keys › Focus mode › Sites left alone)`);
    }
    const actor = await this.actor(tab.linkedBrowser);
    actor?.sendAsyncMessage("undo");
    // (This page stays as it is until it changes.)
    this.changed?.set(tab, { spec: tab.linkedBrowser.currentURI?.spec, done: null });
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
      if (!on) this.off();
    };
    Services.prefs.addObserver(this.PREF, watch);
    onUnload(() => Services.prefs.removeObserver(this.PREF, watch));
    watch();
    // On YouTube, always: no picture-in-picture for the previews that play
    // as the pointer passes over a video (Firefox's button on them broke
    // the preview and the page).
    PageActors.child("ZenithYouTube", "focus-page.sys.mjs", { loadstart: { capture: true }, play: { capture: true } },
                     ["*://*.youtube.com/*", "*://youtube.com/*"]);
    // (Zen quit while focused: its toolbar setting back as it was.)
    if (!this.on && Services.prefs.prefHasUserValue("zenith.internal.focus.zen.view.compact.hide-toolbar") &&
        Services.wm.getMostRecentWindow("navigator:browser") === window) Bridge.apply("focus", { "zen.view.compact.hide-toolbar": null });
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
    ["zenith-key-hints", "j", { alt: true }, "zenith-hints-command", "Link hints", "zenith.plus.link-hints", "zenith-hints-key"],
    ["zenith-key-hints-tab", "j", { alt: true, shift: true }, "zenith-hints-tab-command", "Link hints, new tab", "zenith.plus.link-hints", "zenith-hints-tab-key"],
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
    const have = new Set(list.map(s => s.getID()));
    const missing = this.LIST.filter(([id]) => !have.has(id));
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

/* --- Float a tab (Alt+Shift+F) --------------------------------------------------
   The tab you're on (or the one you right-click › Float this tab) moves into
   a small window of its own, its page carrying on as it was (nothing
   reloads). The window has the focus once it opens, so Alt+Shift+F again
   puts the tab back. It stays on top (Keys › Float a tab › Stays above):
     zen  above its Zen window only, not other apps (the default); it closes
          with that window (Ctrl+Shift+T brings it back floating, or the next start does);
     all  above every app (a call or a stream while you work elsewhere).
   Its bar: the page's title (click it, or Ctrl+L, Alt+D or F4, to type
   another address), a pin (pinned, the bar stays above the page; unpinned,
   it slides down when the pointer comes into the window or to its top
   edge), back into the window, minimise (above every app), and
   close (Ctrl+Shift+T brings it back,
   floating). Drag the bar to move it (it settles against an edge it's let
   go near; double-click for its corner). A floating tab is kept with the
   session: as Zen quits it goes back into its window, marked, and floats
   again as Zen starts. */
const FloatTab = {
  PREF: "zenith.plus.float-tab",
  ABOVE: "zenith.plus.float-above", // zen · all
  PINNED: "zenith.internal.float.bar-pinned",
  MARK: "zenithFloat", // a tab to float again once it's back (session)
  KEPT: "zenith.internal.float.kept", // floats kept as Zen closed its last window: [{ state, essential }]
  GAP: 16,
  NEAR: 48,

  get above() {
    return Services.prefs.getStringPref(this.ABOVE, "zen") === "all" ? "all" : "zen";
  },

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
    key.setAttribute("key", "F");
    key.setAttribute("reserved", "true");
    key.setAttribute("command", command.id);
    keyset.append(key);
    root.append(commandset, keyset);
    this.menu();
    const watch = () => {
      const on = Services.prefs.getBoolPref(this.PREF, true);
      key.toggleAttribute("disabled", !on);
      if (this.item) this.item.hidden = !on;
    };
    Services.prefs.addObserver(this.PREF, watch);
    onUnload(() => Services.prefs.removeObserver(this.PREF, watch));
    watch();
    if (window.zenithFloatFrom) this.asWindow();
    else this.asHome();
    window.ZenithFloat = this; // for tools/checks
  },

  // The tab's right-click menu, beside Pin, Unload and Duplicate: Float
  // this tab (or, in a float window, Put back in the window).
  menu() {
    const menu = document.getElementById("tabContextMenu");
    if (!menu) return;
    const item = (this.item = document.createXULElement("menuitem"));
    item.id = "zenith-float-tab";
    item.setAttribute("key", "zenith-float-key");
    const after = document.getElementById("context_duplicateTabs") ?? document.getElementById("context_duplicateTab");
    if (after) after.after(item);
    else menu.append(item);
    menu.addEventListener("popupshowing", e => {
      if (e.target !== menu) return;
      const tab = window.TabContextMenu?.contextTab;
      item.setAttribute("label", window.zenithFloatFrom ? "Put back in the window" : "Float this tab");
      item.disabled = !tab || tab.hasAttribute("zen-empty-tab") || (tab.hasAttribute("zen-essential") && !window.zenithFloatFrom);
    });
    item.addEventListener("command", () => {
      const tab = window.TabContextMenu?.contextTab;
      if (window.zenithFloatFrom) this.back(tab);
      else this.float(tab);
    });
  },

  toggle() {
    if (window.zenithFloatFrom) return this.back();
    return this.float(gBrowser.selectedTab);
  },

  // The tab itself when a glance is open in it (the glance closed first).
  own(tab = gBrowser.selectedTab) {
    const parent = window.gZenGlanceManager?.getTabOrGlanceParent?.(tab) ?? tab;
    if (parent !== tab) {
      try {
        window.gZenGlanceManager.quickCloseGlance?.();
      } catch {}
    }
    return parent;
  },

  floating(tab) {
    return !!tab && !tab.hasAttribute("zen-empty-tab");
  },

  /* In a main window */

  // Tabs marked to float again (closed from a float, or brought home as Zen
  // quit or their window closed) float once they're back; above Zen, its
  // floats come home with this window as it closes.
  asHome() {
    const restoring = e => {
      const tab = e.target;
      if (!SessionStore.getCustomTabValue(tab, this.MARK)) return;
      SessionStore.promiseAllWindowsRestored.then(() => setTimeout(() => {
        if (tab.isConnected && Services.prefs.getBoolPref(this.PREF, true)) this.float(tab, { focus: Services.focus.activeWindow === window });
      }, 400));
    };
    gBrowser.tabContainer.addEventListener("SSTabRestoring", restoring);
    // As Zen starts: marked tabs come back asleep, which says nothing; they
    // float once the session is back. So do the floats kept as Zen closed
    // its last window.
    SessionStore.promiseAllWindowsRestored.then(() => setTimeout(() => {
      if (!Services.prefs.getBoolPref(this.PREF, true)) return;
      if (Services.prefs.prefHasUserValue(this.KEPT) && Services.wm.getMostRecentWindow("navigator:browser") === window) {
        let kept = [];
        try {
          kept = JSON.parse(Services.prefs.getStringPref(this.KEPT, "[]"));
        } catch {}
        Services.prefs.clearUserPref(this.KEPT);
        for (const { state, essential } of kept) {
          // (The session may have brought it back as a plain sleeping tab.)
          let url = null;
          try {
            const st = typeof state === "string" ? JSON.parse(state) : state;
            url = st?.entries?.at((st.index ?? st.entries.length) - 1)?.url ?? null;
          } catch {}
          const twin = gBrowser.tabs.find(t => t.hasAttribute("pending") && !SessionStore.getCustomTabValue(t, this.MARK) &&
                                              (SessionStore.getLazyTabValue(t, "url") || t.linkedBrowser?.currentURI?.spec) === url);
          if (twin) gBrowser.removeTab(twin, { animate: false });
          // (Opened afresh at its page: a restored sleeping tab can't be
          // woken here without taking the selection.)
          if (!url) continue;
          const tab = gBrowser.addTrustedTab(url, { inBackground: true });
          if (essential) SessionStore.setCustomTabValue(tab, this.MARK, "essential");
          setTimeout(() => this.float(tab, { focus: false }), 1200);
        }
      }
      for (const tab of gBrowser.tabs) {
        if (!tab.isConnected || !SessionStore.getCustomTabValue(tab, this.MARK)) continue;
        this.float(tab, { focus: false });
      }
    }, 800));
    // This window closing: its floats above Zen close with it. Their tabs
    // go to another Zen window's recently closed tabs (Ctrl+Shift+T there
    // floats them again: Zen keeps no closed windows to bring back), or,
    // with no other window (Zen is quitting), home, to float again next time.
    const closing = () => {
      window.zenithClosing = true;
      const other = [...Services.wm.getEnumerator("navigator:browser")].reverse()
        .find(w => w !== window && !w.zenithFloatFrom && !w.closed && !w.closing);
      // (The last window: Zen is closing; each float's kept state brings
      // it back at the next start.)
      if (!other) return;
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        if (win.zenithFloatFrom !== window || win.closed || win.ZenithFloat?.mode !== "zen") continue;
        const moved = win.ZenithFloat.comeHome(other);
        if (moved) other.gBrowser.removeTab(moved, { animate: false });
      }
    };
    window.addEventListener("SSWindowClosing", closing);
    onUnload(() => {
      gBrowser.tabContainer.removeEventListener("SSTabRestoring", restoring);
      window.removeEventListener("SSWindowClosing", closing);
    });
  },

  float(tab, { focus = true } = {}) {
    tab = tab && this.own(tab);
    if (!this.floating(tab)) return null;
    // Your only tab: a new one keeps this window (Firefox closes a window
    // whose last tab leaves, and Zen's empty tab doesn't count).
    if (!gBrowser.tabs.some(t => t !== tab && !t.closing && !t.hasAttribute("zen-empty-tab"))) {
      gBrowser.addTrustedTab(window.BROWSER_NEW_TAB_URL || "about:newtab", { inBackground: true });
    }
    // Asleep (as it comes back at start): woken first, the way Firefox wakes
    // a tab, by selecting it, so the window gets the page and not a blank;
    // then the tab you were on is selected again.
    if (!tab.linkedPanel || tab.hasAttribute("pending")) {
      const was = gBrowser.selectedTab;
      const woke = new Promise(resolve => {
        tab.addEventListener("SSTabRestored", resolve, { once: true });
        setTimeout(resolve, 5000);
      });
      gBrowser.selectedTab = tab;
      return woke.then(() => {
        if (!tab.isConnected) return null;
        const win = this.float(tab, { focus });
        if (was?.isConnected && was !== tab) gBrowser.selectedTab = was;
        return win;
      });
    }
    // In a split: back into it when it comes back (its partners, its place).
    const split = tab.group?.hasAttribute?.("split-view-group") ? tab.group : null;
    const splitInfo = split ? { partners: split.tabs.filter(t => t !== tab), index: split.tabs.indexOf(tab) } : null;
    // An essential floats too, and is an essential again when it's back.
    const essential = tab.hasAttribute("zen-essential") || SessionStore.getCustomTabValue(tab, this.MARK) === "essential";
    SessionStore.deleteCustomTabValue(tab, this.MARK);
    const { w, h, x, y } = this.box(), mode = this.above;
    // Above Zen: a window owned by this one (the system keeps it above this
    // window only, minimises it with it, and closes it with it).
    const features = { popup: "yes", resizable: "yes", outerWidth: w, outerHeight: h, left: x, top: y,
                       ...(mode === "zen" ? { dependent: "yes" } : { alwaysontop: "yes" }) };
    // Zen's own pages (Settings, the tab manager, the start page) run in the
    // browser itself and come out blank when moved: they open there afresh.
    let win;
    if (!tab.linkedBrowser?.isRemoteBrowser) {
      const url = tab.linkedBrowser?.currentURI?.spec ?? "about:blank";
      win = window.openDialog(AppConstants.BROWSER_CHROME_URL, "_blank",
                              "chrome,dialog=no,all," + Object.entries(features).map(([k, v]) => `${k}=${v}`).join(","), url);
      win?.addEventListener("load", () => gBrowser.removeTab(tab, { animate: false }), { once: true });
    } else {
      win = gBrowser.replaceTabWithWindow(tab, features);
    }
    if (!win) return null;
    // Only this tab: with Zen's window sync a new window would otherwise
    // take every tab (and leave this window empty).
    win._zenStartupSyncFlag = "unsynced";
    win.zenithFloatFrom = window;
    win.zenithFloatMode = mode;
    win.zenithFloatEssential = essential;
    win.zenithFloatSplit = splitInfo;
    if (focus) win.addEventListener("load", () => win.setTimeout(() => win.focus(), 0), { once: true });
    return win;
  },

  // The float window's size on this screen (half the width on small
  // screens, 40%, a third on big ones; 16:10) in the bottom right corner.
  box() {
    const s = screen, wide = s.availWidth;
    const w = Math.round(wide * (wide <= 1400 ? 0.42 : wide < 2200 ? 0.34 : 0.28));
    const h = Math.round(w * 0.625);
    return { w, h, x: s.availLeft + s.availWidth - w - this.GAP, y: s.availTop + s.availHeight - h - this.GAP };
  },

  /* In the float window itself */

  asWindow() {
    this.mode = window.zenithFloatMode ?? this.above;
    root.setAttribute("zenith-float", this.mode);
    if (this.mode === "all") {
      try {
        window.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow).zLevel = Ci.nsIAppWindow.highestZ;
      } catch {}
    }
    this.buildBar();
    const pinned = () => root.toggleAttribute("zenith-float-pinned", Services.prefs.getBoolPref(this.PINNED, true));
    Services.prefs.addObserver(this.PINNED, pinned);
    onUnload(() => Services.prefs.removeObserver(this.PINNED, pinned));
    pinned();
    // Ctrl+L, Alt+D, F4: type an address (the window has no address bar).
    window.addEventListener("keydown", e => {
      const k = e.key.toLowerCase();
      if (!((e.ctrlKey && !e.altKey && !e.shiftKey && k === "l") || (e.altKey && !e.ctrlKey && !e.shiftKey && k === "d") || (e.key === "F4" && !e.altKey && !e.ctrlKey))) return;
      e.preventDefault();
      e.stopPropagation();
      this.edit();
    }, true);
    // Ctrl+W, or the window closing any other way: the tab closes in the
    // main window, so Ctrl+Shift+T there brings it back (floating).
    document.getElementById("cmd_close")?.addEventListener("command", e => {
      e.stopImmediatePropagation();
      this.closeFromWindow();
    }, true);
    window.addEventListener("close", e => {
      if (this.closing) return;
      e.preventDefault();
      this.closeFromWindow();
    });
    // Its tab as it is, kept up to date while it floats: if Zen closes
    // without taking it home (its last window closed), it floats again at
    // the next start. Put back or closed, it's forgotten.
    this.keepId = `${Date.now()}-${Math.random()}`;
    const keep = () => {
      clearTimeout(this.keepTimer);
      this.keepTimer = setTimeout(() => this.keep(), 500);
    };
    gBrowser.addTabsProgressListener({ onLocationChange: keep });
    keep();
    // Zen quitting: the tab goes home first, marked, so it floats again
    // when Zen starts.
    const quitting = () => !this.closing && this.comeHome();
    Services.obs.addObserver(quitting, "quit-application-requested");
    onUnload(() => Services.obs.removeObserver(quitting, "quit-application-requested"));
    requestAnimationFrame(() => this.place());
  },

  buildBar() {
    const holder = document.getElementById("zen-appcontent-wrapper") ?? document.body;
    const bar = (this.bar = el("div", { class: "zenith-float-bar" }));
    const title = (this.title = el("span", { class: "zenith-float-title", title: "Type an address (Ctrl+L)" }));
    const button = (kind, tip, fn) => {
      const b = el("button", { class: "zenith-float-button", kind, title: tip });
      b.addEventListener("click", e => {
        e.stopPropagation();
        fn();
      });
      return b;
    };
    const pin = button("pin", "", () => Services.prefs.setBoolPref(this.PINNED, !Services.prefs.getBoolPref(this.PINNED, true)));
    const tipPin = () => pin.setAttribute("title", Services.prefs.getBoolPref(this.PINNED, true) ? "Unpin the bar: it shows when the pointer comes in" : "Pin the bar above the page");
    Services.prefs.addObserver(this.PINNED, tipPin);
    onUnload(() => Services.prefs.removeObserver(this.PINNED, tipPin));
    tipPin();
    bar.append(title, pin,
      button("back", "Put back in the window (Alt+Shift+F)", () => this.back()),
      ...(this.mode === "all" ? [button("minimise", "Minimise", () => window.minimize())] : []),
      button("close", "Close the tab (Ctrl+Shift+T brings it back)", () => this.closeFromWindow()));
    // (Unpinned: a strip along the top edge to bring it down.)
    const edge = el("div", { class: "zenith-float-edge" });
    holder.append(edge, bar);
    const name = () => {
      if (!bar.hasAttribute("editing")) title.textContent = gBrowser.selectedTab?.label ?? "";
    };
    gBrowser.tabContainer.addEventListener("TabAttrModified", name);
    name();
    // Unpinned, the bar comes down for a moment when the pointer comes into
    // the window, and while it's on the top edge or the bar.
    const peek = ms => {
      root.setAttribute("zenith-float-peek", "true");
      clearTimeout(this.peekTimer);
      this.peekTimer = setTimeout(() => !bar.matches(":hover") && root.removeAttribute("zenith-float-peek"), ms);
    };
    edge.addEventListener("mouseenter", () => peek(1200));
    bar.addEventListener("mouseleave", () => peek(400));
    document.addEventListener("mouseover", e => !e.relatedTarget && peek(1500));
    this.draggable(bar, () => [window.screenX, window.screenY],
      ([x0, y0], dx, dy) => window.moveTo(Math.round(x0 + dx), Math.round(y0 + dy)),
      moved => {
        if (!moved) return;
        const s = screen;
        const [x, y] = this.settle(window.screenX, window.screenY, window.outerWidth, window.outerHeight,
                                   s.availLeft, s.availTop, s.availLeft + s.availWidth, s.availTop + s.availHeight);
        window.moveTo(x, y);
      },
      target => target === title && this.edit());
    bar.addEventListener("dblclick", e => !e.target.closest("button, input") && this.place());
  },

  // Dragging the bar moves the float: move(from, dx, dy); done(moved) once
  // let go; clicked(target) if it was let go where it was pressed.
  draggable(bar, start, move, done, clicked) {
    bar.addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest("button, input")) return;
      e.preventDefault();
      const from = start(), sx = e.screenX, sy = e.screenY, target = e.target;
      let moved = false;
      bar.setPointerCapture(e.pointerId);
      const onMove = m => {
        if (!moved && Math.abs(m.screenX - sx) + Math.abs(m.screenY - sy) < 4) return;
        moved = true;
        bar.setAttribute("moving", "true");
        move(from, m.screenX - sx, m.screenY - sy);
      };
      const up = () => {
        bar.removeEventListener("pointermove", onMove);
        bar.removeEventListener("lostpointercapture", up);
        bar.removeAttribute("moving");
        done(moved);
        if (!moved) clicked(target);
      };
      bar.addEventListener("pointermove", onMove);
      bar.addEventListener("lostpointercapture", up, { once: true });
    });
  },

  // Near an edge: against it, a small gap away; at least part of it stays
  // within reach.
  settle(x, y, w, h, L, T, R, B) {
    if (x - L < this.NEAR) x = L + this.GAP;
    else if (R - (x + w) < this.NEAR) x = R - w - this.GAP;
    if (y - T < this.NEAR) y = T + this.GAP;
    else if (B - (y + h) < this.NEAR) y = B - h - this.GAP;
    return [Math.min(Math.max(x, L - w + 80), R - 80), Math.min(Math.max(y, T), B - 40)];
  },

  // (Zen keeps windows fairly tall unless told otherwise: placed by the
  // size it got.)
  place() {
    const { w, h } = this.box(), s = screen;
    window.resizeTo(w, h);
    requestAnimationFrame(() => window.moveTo(s.availLeft + s.availWidth - window.outerWidth - this.GAP,
                                              Math.max(s.availTop, s.availTop + s.availHeight - window.outerHeight - this.GAP)));
  },

  // The title becomes an address field: Enter goes there (an address, or a
  // search with your engine), Escape or clicking away leaves it be.
  edit() {
    const bar = this.bar;
    if (!bar || bar.hasAttribute("editing")) return bar?.querySelector("input")?.select();
    bar.setAttribute("editing", "true");
    const input = el("input", { class: "zenith-float-address", type: "text", spellcheck: "false" });
    input.value = gBrowser.selectedBrowser.currentURI?.displaySpec ?? "";
    this.title.after(input);
    const finish = go => {
      if (!input.isConnected) return;
      const text = input.value.trim();
      input.remove();
      bar.removeAttribute("editing");
      this.title.textContent = gBrowser.selectedTab?.label ?? "";
      if (!go || !text) return gBrowser.selectedBrowser.focus();
      let flags = Ci.nsIURIFixup.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP | Ci.nsIURIFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS;
      if (ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs").PrivateBrowsingUtils.isWindowPrivate(window)) flags |= Ci.nsIURIFixup.FIXUP_FLAG_PRIVATE_CONTEXT;
      try {
        const uri = Services.uriFixup.getFixupURIInfo(text, flags).preferredURI;
        if (uri) gBrowser.selectedBrowser.loadURI(uri, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      } catch (e) {
        console.error("[Zenith] float address", e);
      }
      gBrowser.selectedBrowser.focus();
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    input.addEventListener("blur", () => finish(false));
    input.focus();
    input.select();
  },

  // The window it came from (else the last browser window); none while
  // that's closing (its floats go with it, kept for the next start).
  home() {
    const closing = w => !w || w.closed || w.zenithClosing || w.gBrowser?._windowIsClosing;
    let home = window.zenithFloatFrom;
    if (closing(home) && home && !home.closed) return null;
    if (!home || home.closed) home = [...Services.wm.getEnumerator("navigator:browser")].reverse().find(w => w !== window && !w.zenithFloatFrom && !w.closed);
    return home ?? null;
  },

  // Back to the window it came from (or the last browser window), selected.
  keep(forget = false) {
    let kept = [];
    try {
      kept = JSON.parse(Services.prefs.getStringPref(FloatTab.KEPT, "[]")).filter(k => k.id !== this.keepId);
    } catch {}
    const tab = !forget && !this.closing && gBrowser.selectedTab;
    if (tab && !PrivateBrowsingUtilsOf(window)) {
      try {
        kept.push({ id: this.keepId, state: SessionStore.getTabState(tab), essential: !!window.zenithFloatEssential });
      } catch {}
    }
    if (kept.length) Services.prefs.setStringPref(FloatTab.KEPT, JSON.stringify(kept));
    else Services.prefs.clearUserPref(FloatTab.KEPT);
  },

  // Into the home window: moved (nothing reloads), or, for Zen's own pages,
  // opened there afresh (this window, with nothing left, closes).
  moveTo(home, tab, select) {
    clearTimeout(this.keepTimer);
    this.keep(true);
    // (Whatever's left, a closed glance say, doesn't keep this window open.)
    setTimeout(() => !window.closed && window.close(), 100);
    let moved;
    if (tab.linkedBrowser?.isRemoteBrowser) {
      moved = home.gBrowser.adoptTab(tab, { selectTab: select });
    } else {
      moved = home.gBrowser.addTrustedTab(tab.linkedBrowser?.currentURI?.spec ?? "about:blank", { inBackground: !select });
      if (select) home.gBrowser.selectedTab = moved;
    }
    if (moved && window.zenithFloatSplit) home.ZenithFloat?.joinSplit(moved, window.zenithFloatSplit, select);
    return moved;
  },

  back(tab = gBrowser.selectedTab) {
    const home = this.home();
    tab = tab && this.own(tab);
    if (!home || !tab) return null;
    this.closing = true;
    const moved = this.moveTo(home, tab, true);
    this.essentialAgain(home, moved);
    home.focus();
    return moved;
  },

  // Run by the home window's own Zenith (this window is closing: what it
  // schedules wouldn't run).
  essentialAgain(home, tab) {
    if (tab && window.zenithFloatEssential) home.ZenithFloat?.makeEssential(tab);
  },

  // Back into the split it floated out of (run by the home window's own
  // Zenith): beside its partners, in its place.
  joinSplit(tab, info, select) {
    setTimeout(() => {
      try {
        const S = window.gZenViewSplitter, partners = info.partners.filter(t => t.isConnected && !t.closing);
        if (!S || !tab.isConnected || !partners.length) return;
        const into = partners.find(t => t.group?.hasAttribute("split-view-group"));
        if (into) {
          S.splitTabs([into, tab], undefined, -1, { activate: !!select });
          // (Joined at the end: moved back to its place.)
          setTimeout(() => {
            const tabs = () => tab.group?.tabs ?? [];
            for (let i = tabs().indexOf(tab); i > info.index && i > 0; i = tabs().indexOf(tab)) {
              if (!SplitReorder.swap(tab, tabs()[i - 1])) break;
            }
          }, 300);
        } else {
          S.splitTabs([...partners.slice(0, info.index), tab, ...partners.slice(info.index)], undefined, info.index, { activate: !!select });
        }
        if (select) gBrowser.selectedTab = tab;
      } catch (e) {
        console.error("[Zenith] float: back into its split", e);
      }
    }, 400);
  },

  makeEssential(tab) {
    setTimeout(() => {
      try {
        if (tab.isConnected && !tab.hasAttribute("zen-essential")) gZenPinnedTabManager?.addToEssentials?.(tab);
      } catch (e) {
        console.error("[Zenith] float: essential again", e);
      }
    }, 300);
  },


  // Home (marked, not selected) without a fuss: Zen quitting, or the window
  // it floats above closing (that window: `to`).
  comeHome(to = this.home()) {
    const tab = this.own();
    if (!to || !tab || this.closing) return null;
    this.closing = true;
    const moved = this.moveTo(to, tab, false);
    if (moved) to.SessionStore.setCustomTabValue(moved, this.MARK, window.zenithFloatEssential ? "essential" : "1");
    return moved;
  },

  // Closed from the float window: back to the main window first, closed
  // there (so it's among that window's closed tabs, marked to float).
  closeFromWindow() {
    const home = this.home(), tab = this.own();
    this.closing = true;
    if (!home || !tab) return window.close();
    const moved = this.moveTo(home, tab, false);
    if (moved) {
      home.SessionStore.setCustomTabValue(moved, this.MARK, window.zenithFloatEssential ? "essential" : "1");
      home.gBrowser.removeTab(moved, { animate: false });
    }
    return moved;
  },
};

/* --- Windows' own: the pointer, a window's owner and corners ---------------------
   For picture-in-picture: where the pointer is and whether its button is
   down (even over other apps), a window kept above one Zen window only,
   and its corners as Look › Corners says. Windows only; elsewhere these do
   nothing and say nothing. */
const Win32 = {
  load() {
    if (this.api !== undefined) return this.api;
    this.api = null;
    if (Services.appinfo.OS !== "WINNT") return null;
    try {
      const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
      const u32 = ctypes.open("user32.dll");
      let dwm = null;
      try {
        dwm = ctypes.open("dwmapi.dll");
      } catch {}
      const POINT = new ctypes.StructType("POINT", [{ x: ctypes.int32_t }, { y: ctypes.int32_t }]);
      const api = {
        ctypes, POINT,
        getCursorPos: u32.declare("GetCursorPos", ctypes.winapi_abi, ctypes.int32_t, POINT.ptr),
        keyState: u32.declare("GetAsyncKeyState", ctypes.winapi_abi, ctypes.int16_t, ctypes.int32_t),
        setPos: u32.declare("SetWindowPos", ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t, ctypes.intptr_t, ctypes.int32_t, ctypes.int32_t, ctypes.int32_t, ctypes.int32_t, ctypes.uint32_t),
        getWindow: u32.declare("GetWindow", ctypes.winapi_abi, ctypes.voidptr_t, ctypes.voidptr_t, ctypes.uint32_t),
        setLong: u32.declare(ctypes.size_t.size === 8 ? "SetWindowLongPtrW" : "SetWindowLongW", ctypes.winapi_abi, ctypes.intptr_t, ctypes.voidptr_t, ctypes.int32_t, ctypes.intptr_t),
        dwmSet: dwm?.declare("DwmSetWindowAttribute", ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t, ctypes.uint32_t, ctypes.voidptr_t, ctypes.uint32_t) ?? null,
      };
      window.addEventListener("unload", () => {
        u32.close();
        dwm?.close();
      }, { once: true });
      this.api = api;
    } catch (e) {
      console.error("[Zenith] Windows' own", e);
    }
    return this.api;
  },

  hwnd(win) {
    const api = this.load();
    return api ? api.ctypes.voidptr_t(api.ctypes.UInt64(win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle)) : null;
  },

  // The pointer, in device pixels, and whether the left button is down.
  pointer() {
    const api = this.load();
    if (!api) return null;
    const pt = new api.POINT();
    if (!api.getCursorPos(pt.address())) return null;
    // (Down now, or pressed since the last look: a quick click counts.)
    return { x: pt.x, y: pt.y, down: (api.keyState(0x01) & 0x8001) !== 0 };
  },

  // Owned by another window: above it only, minimised and closed with it.
  // (Once owned, left alone: something resets it now and then, so it's
  // looked at again.)
  own(win, owner) {
    const api = this.load();
    if (!api) return false;
    const now = api.ctypes.cast(api.getWindow(this.hwnd(win), 4 /* GW_OWNER */), api.ctypes.uintptr_t).value.toString();
    if (owner && now === api.ctypes.cast(this.hwnd(owner), api.ctypes.uintptr_t).value.toString()) return true;
    api.setLong(this.hwnd(win), -8 /* GWLP_HWNDPARENT */, owner ? api.ctypes.cast(this.hwnd(owner), api.ctypes.intptr_t) : 0);
    // (Above its owner only: not on top of other apps.)
    if (owner) api.setPos(this.hwnd(win), -2 /* HWND_NOTOPMOST */, 0, 0, 0, 0, 0x0013 /* NOSIZE | NOMOVE | NOACTIVATE */);
    return true;
  },

  // Windows 11's corners: square, small round or round.
  corners(win, kind) {
    const api = this.load();
    if (!api?.dwmSet) return;
    const v = new (api.ctypes.ArrayType(api.ctypes.uint32_t, 1))([{ square: 1, soft: 3, round: 2 }[kind] ?? 3]);
    api.dwmSet(this.hwnd(win), 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, v.address(), 4);
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
       playing. Rest the pointer on the sliver for half a second (or click
       it) and it comes out, its controls working; it goes back once you
       click anywhere else. Drag it away from the edge to keep it out.
   Nothing moves while the pointer merely passes by: the window only moves
   on a rest, a click or a drag. The window has no "moved" event, so its
   place is checked a few times a second while it's open (and only then).
   The front browser window looks after each picture-in-picture window. */
const PiPWindows = {
  PREF: "zenith.plus.pip-extras",
  GAP: 12,
  NEAR: 56,
  SLIVER: 40, // (the outer 14px are the window's resize edge, which the pointer can't hover)
  REST: 300,
  AWAY: 2500, // out for a visit, the pointer away this long: back it goes
  WITHIN: "zenith.plus.pip-within", // "" the screen · zen: inside the Zen window

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
    // A click in any Zen window is a click elsewhere: a picture-in-picture
    // that came out for a visit goes back.
    const elsewhere = () => {
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) win.zenithPiP?.owner.tuckBack(win);
    };
    window.addEventListener("mousedown", elsewhere, true);
    // The pointer over this window: away from any picture-in-picture that's
    // out for a visit (it goes back after a while).
    const over = e => {
      if (this.lastOver && e.timeStamp - this.lastOver < 250) return;
      this.lastOver = e.timeStamp;
      for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) win.zenithPiP?.away?.(e);
    };
    window.addEventListener("mousemove", over, true);
    onUnload(() => {
      Services.wm.removeListener(this.listener);
      window.removeEventListener("mousedown", elsewhere, true);
      window.removeEventListener("mousemove", over, true);
    });
    window.ZenithPiP = this; // for tools/checks
    window.ZenithWin32 = Win32; // for tools/checks
  },

  on() {
    return Services.prefs.getBoolPref(this.PREF, true);
  },

  attach(win) {
    if (win.document.documentElement.getAttribute("windowtype") !== "Toolkit:PictureInPicture" || win.zenithPiP) return;
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
    const state = (win.zenithPiP = { owner: this, at: [win.screenX, win.screenY], still: 0, tucked: null, visiting: null, calmUntil: 0 });
    // Its window's corners as Look › Corners says (Windows 11); inside Zen,
    // above this Zen window only (not other apps) and kept inside it.
    if (Services.prefs.getStringPref(this.WITHIN, "") === "zen") {
      // (Once the window is up: Firefox sets it on top of everything as it
      // shows it.)
      const inside = () => {
        state.inside = (state.inside ?? 0) + 1;
        state.ticks ??= 0;
        try {
          win.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow).zLevel = Ci.nsIAppWindow.normalZ;
          Win32.own(win, window);
        } catch (e) {
          console.error("[Zenith] picture-in-picture: inside Zen", e);
        }
      };
      for (const ms of [300, 1200]) win.setTimeout(inside, ms);
      win.setTimeout(() => this.settle(win, true), 400);
    }
    try {
      Win32.corners(win, Services.prefs.getStringPref("zenith.core.corners", "") || "soft");
    } catch (e) {
      console.error("[Zenith] picture-in-picture: corners", e);
    }
    const wheel = e => this.on() && !state.tucked && this.resize(win, e);
    // Tucked, the pointer over the video would be the page's (another
    // process): a clear cover in the controls' layer catches it.
    const doc = win.document;
    const cover = (state.cover = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"));
    cover.id = "zenith-pip-cover";
    cover.hidden = true;
    (doc.getElementById("controls") ?? doc.body ?? doc.documentElement).append(cover);
    const cancel = () => {
      win.clearTimeout(state.restTimer);
      state.restTimer = null;
    };
    cover.addEventListener("mousedown", e => {
      if (!state.tucked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
      this.visit(win);
    });
    // A rest: the pointer moved onto the sliver and stayed on it. (Right
    // after tucking, a pointer already there doesn't count until it moves.)
    const rest = () => {
      if (!state.tucked || state.animating || state.restTimer || Date.now() < state.calmUntil) return;
      state.restTimer = win.setTimeout(() => {
        state.restTimer = null;
        if (state.tucked && !state.animating) this.visit(win);
      }, this.REST);
    };
    cover.addEventListener("mousemove", rest);
    cover.addEventListener("mouseenter", rest);
    cover.addEventListener("mouseleave", cancel);
    // Out for a visit: clicking anywhere else puts it back (another app
    // included, once the window has had the focus), and so does the
    // pointer staying away a while. (Away means outside the window: the
    // system reports a leave when the window moves under a still pointer.)
    win.addEventListener("deactivate", () => this.tuckBack(win));
    const layer = doc.getElementById("controls") ?? doc.documentElement;
    const stay = () => {
      win.clearTimeout(state.awayTimer);
      state.awayTimer = null;
    };
    layer.addEventListener("mousemove", stay);
    layer.addEventListener("mouseenter", stay);
    state.away = e => {
      const inside = e.screenX >= win.screenX && e.screenX < win.screenX + win.outerWidth && e.screenY >= win.screenY && e.screenY < win.screenY + win.outerHeight;
      if (!state.visiting || inside || state.awayTimer) return;
      state.awayTimer = win.setTimeout(() => {
        state.awayTimer = null;
        this.tuckBack(win);
      }, this.AWAY);
    };
    layer.addEventListener("mouseleave", state.away);
    win.addEventListener("mouseout", e => !e.relatedTarget && state.away(e));
    win.addEventListener("wheel", wheel, { passive: false });
    const watch = win.setInterval(() => this.watch(win), 150);
    win.addEventListener("unload", () => win.clearInterval(watch), { once: true });
  },

  // Where it lives: the screen, or (Panels › Media › Within) the Zen
  // window it came from, like a float.
  screen(win) {
    if (Services.prefs.getStringPref(this.WITHIN, "") === "zen" && !window.closed && window.windowState !== window.STATE_MINIMIZED) {
      return { L: window.screenX, T: window.screenY, R: window.screenX + window.outerWidth, B: window.screenY + window.outerHeight };
    }
    const s = win.screen;
    return { L: s.availLeft, T: s.availTop, R: s.availLeft + s.availWidth, B: s.availTop + s.availHeight };
  },

  // The window moved and then stayed put for a moment: it was let go (and
  // a visit became its place).
  watch(win) {
    const state = win.zenithPiP;
    // Fullscreen: its own business (moving it would undo it).
    if (this.full(win)) {
      state.at = [win.screenX, win.screenY];
      state.moved = false;
      state.visiting = null;
      state.awaySince = null;
      return;
    }
    if (state.visiting) this.away(win);
    if (state.inside && ++state.ticks % 7 === 0) {
      try {
        Win32.own(win, window);
      } catch {}
    }
    // Inside the Zen window: when the window moves or changes size, it
    // keeps to it.
    if (Services.prefs.getStringPref(this.WITHIN, "") === "zen" && !state.animating) {
      const box = [window.screenX, window.screenY, window.outerWidth, window.outerHeight].join();
      if (state.box && state.box !== box) {
        state.box = box;
        if (state.tucked) this.tuck(win, state.tucked.side);
        else this.settle(win, true);
        return;
      }
      state.box = box;
    }
    const at = [win.screenX, win.screenY];
    if (at[0] !== state.at[0] || at[1] !== state.at[1]) {
      state.at = at;
      state.still = 0;
      state.moved = !state.animating;
      return;
    }
    if (!state.moved || ++state.still < 2) return;
    state.moved = false;
    state.visiting = null;
    if (this.on() && !state.tucked) this.settle(win);
  },

  // Near an edge: against it. Mostly past a side edge: tucked. (Inside
  // the Zen window, never past its edges.)
  settle(win, keep = false) {
    const { L, T, R, B } = this.screen(win);
    const x = win.screenX, y = win.screenY, w = win.outerWidth, h = win.outerHeight;
    if (!keep && x + w / 2 < L) return this.tuck(win, "left");
    if (!keep && x + w / 2 > R) return this.tuck(win, "right");
    let nx = x, ny = y;
    if (x - L < this.NEAR) nx = L + this.GAP;
    else if (R - (x + w) < this.NEAR) nx = R - w - this.GAP;
    if (y - T < this.NEAR) ny = T + this.GAP;
    else if (B - (y + h) < this.NEAR) ny = B - h - this.GAP;
    ny = Math.min(Math.max(ny, T), B - h);
    if (Services.prefs.getStringPref(this.WITHIN, "") === "zen") nx = Math.min(Math.max(nx, L + this.GAP), R - w - this.GAP);
    if (nx !== x || ny !== y) this.glide(win, nx, ny);
  },

  tuck(win, side) {
    const state = win.zenithPiP;
    const { L, T, R, B } = this.screen(win);
    const w = win.outerWidth, h = win.outerHeight;
    const y = Math.min(Math.max(win.screenY, T + this.GAP), B - h - this.GAP);
    state.tucked = { side, y };
    state.visiting = null;
    state.awaySince = null;
    win.clearTimeout(state.awayTimer);
    state.awayTimer = null;
    state.cover.hidden = false;
    win.document.documentElement.setAttribute("zenith-pip-tucked", side);
    this.glide(win, side === "left" ? L - w + this.SLIVER : R - this.SLIVER, y, () => (state.calmUntil = Date.now() + 400));
  },

  // Out for a visit: the whole window by its edge, its controls working
  // (the cover goes), and the focus, so a click elsewhere is noticed.
  visit(win) {
    const state = win.zenithPiP, { side, y } = state.tucked;
    const { L, R } = this.screen(win);
    state.visiting = state.tucked;
    state.tucked = null;
    state.cover.hidden = true;
    win.document.documentElement.removeAttribute("zenith-pip-tucked");
    this.glide(win, side === "left" ? L + this.GAP : R - win.outerWidth - this.GAP, y);
    try {
      win.focus();
    } catch {}
  },

  // Out for a visit: the pointer away from it a while, or a click anywhere
  // else (another app included), puts it back. Read from the system, as
  // the window gets no word of a pointer or a click elsewhere.
  away(win) {
    const state = win.zenithPiP, p = Win32.pointer();
    if (!p || state.animating) return;
    const k = win.devicePixelRatio || 1;
    const inside = p.x >= win.screenX * k && p.x < (win.screenX + win.outerWidth) * k && p.y >= win.screenY * k && p.y < (win.screenY + win.outerHeight) * k;
    if (inside) {
      state.awaySince = null;
      return;
    }
    if (p.down) return this.tuckBack(win);
    state.awaySince ??= Date.now();
    if (Date.now() - state.awaySince > this.AWAY) this.tuckBack(win);
  },

  full(win) {
    return !!(win.document.fullscreenElement || win.windowState === win.STATE_FULLSCREEN || win.fullScreen);
  },

  tuckBack(win) {
    const state = win.zenithPiP;
    // (Going fullscreen takes the focus away for a moment: not a click
    // elsewhere.)
    if (!state?.visiting || state.animating || !this.on() || this.full(win)) return;
    this.tuck(win, state.visiting.side);
  },

  // A short slide to a place (a few steps; the window can't be animated).
  glide(win, x, y, done = null) {
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
        done?.();
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
    // (0.12.0's "On, with the weather" is now On plus its own weather switch.)
    if (Services.prefs.getStringPref(this.PREF, "") === "weather") {
      Services.prefs.setStringPref(this.PREF, "on");
      Services.prefs.setBoolPref("zenith.plus.startpage-weather", true);
    }
    // "on": the home page; "newtab": new tabs too (Zen's URL bar on Ctrl+T
    // gives way to it, and comes back with the rest when it's off).
    const apply = () => {
      const mode = Services.prefs.getStringPref(this.PREF, "");
      const on = !["", "off"].includes(mode), newtab = mode === "newtab";
      Bridge.apply("start", { "browser.startup.homepage": on ? this.URL : null });
      Bridge.apply("start-newtab", { "zen.urlbar.replace-newtab": newtab ? false : null });
      try {
        const { AboutNewTab } = ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs");
        if (newtab && AboutNewTab.newTabURL !== this.URL) AboutNewTab.newTabURL = this.URL;
        else if (!newtab && AboutNewTab.newTabURL === this.URL) AboutNewTab.resetNewTabURL();
      } catch (e) {
        console.error("[Zenith] start page for new tabs", e);
      }
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
        const about = ChromeUtils.importESModule(new URL(`${d}about.sys.mjs`, import.meta.url).href);
        about.register("zenith-start", url, text);
        about.revive("zenith-start");
        SessionStore.promiseAllWindowsRestored?.then(() => about.revive("zenith-start"));
        return true;
      } catch {}
    }
    console.error("[Zenith] about:zenith-start: plus/pages isn't there");
    return false;
  },
};

/* --- Zenith's helpers inside web pages ----------------------------------------
   Window actors from plus/pages, registered the first time they're needed
   (once per run of Zen: every window shares them). Firefox lets an actor
   into a web page's process only when it says it's safe there; Zenith's
   only draw on or restyle the page, and take nothing from it. */
const PageActors = {
  ready: new Map(),

  async url(file) {
    for (const d of ["../pages/", "zenith-pages/"]) {
      const u = new URL(`${d}${file}`, import.meta.url).href;
      if (await fetch(u).then(r => r.ok, () => false)) return u;
    }
    return null;
  },

  // A child only, in every page of some sites, from the page's start.
  async child(name, file, events, matches) {
    const url = await this.url(file);
    if (!url) return;
    try {
      ChromeUtils.registerWindowActor(name, { child: { esModuleURI: url, events }, matches, safeForUntrustedWebProcess: true });
    } catch (e) {
      if (e.name !== "NotSupportedError") console.error(`[Zenith] ${name}`, e); // (another window registered it)
    }
  },

  register(name, file) {
    if (!this.ready.has(name)) {
      this.ready.set(name, (async () => {
        const url = await this.url(file);
        if (!url) throw new Error(`plus/pages/${file} isn't there`);
        try {
          ChromeUtils.registerWindowActor(name, { parent: { esModuleURI: url }, child: { esModuleURI: url }, safeForUntrustedWebProcess: true });
        } catch (e) {
          if (e.name !== "NotSupportedError") throw e; // (another window registered it)
        }
      })());
    }
    return this.ready.get(name);
  },

  // The actor in a tab's page, or null (not a web page, or gone).
  async in(browser, name, file) {
    await this.register(name, file);
    try {
      return browser?.browsingContext?.currentWindowGlobal?.getActor(name) ?? null;
    } catch {
      return null;
    }
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

  // (Safe in a web page's process: it only draws labels and clicks what
  // you pick; it takes nothing from the page to the browser.)
  register() {
    return PageActors.register("ZenithHints", "link-hints.sys.mjs");
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

/* --- The first page, sooner ----------------------------------------------------
   As Zen starts, the page you were on is loaded only once Firefox restores
   the session (a second or two in). Zenith opens the connection to its site
   straight away (the name looked up, connected, the secure handshake done),
   as Firefox itself does for a link you're about to click, so the page
   starts arriving the moment Firefox asks for it. Once per run of Zen,
   nothing is loaded, and nothing happens if the page isn't on the web. */
const WarmStart = {
  async init() {
    window.ZenithWarmStart = this; // for tools/checks
    // (0.12.2's picture of the last page is gone, and so is the picture.)
    if (Services.prefs.prefHasUserValue("zenith.internal.last-page")) {
      Services.prefs.clearUserPref("zenith.internal.last-page");
      Services.prefs.clearUserPref("zenith.plus.last-page");
      IOUtils.remove(PathUtils.join(PathUtils.profileDir, "zenith-last-page.jpg"), { ignoreAbsent: true }).catch(() => {});
    }
    try {
      const SessionStartup = sessionStartup();
      if (!SessionStartup || SessionStartup.zenithWarmed) return;
      SessionStartup.zenithWarmed = true;
      await SessionStartup.onceInitialized;
      const state = SessionStartup.state;
      const win = state?.windows?.[Math.max(0, (state.selectedWindow ?? 1) - 1)] ?? state?.windows?.[0];
      const tab = win?.tabs?.[Math.max(0, (win.selected ?? 1) - 1)];
      const entry = tab?.entries?.[Math.max(0, (tab.index ?? tab.entries?.length ?? 1) - 1)];
      const url = entry?.url;
      if (!url || !/^https?:/.test(url)) return;
      const uri = Services.io.newURI(url);
      const principal = Services.scriptSecurityManager.createContentPrincipal(uri, { userContextId: tab.userContextId ?? 0 });
      Services.io.QueryInterface(Ci.nsISpeculativeConnect).speculativeConnect(uri, principal, null, false);
      this.warmed = uri.host;
    } catch (e) {
      console.error("[Zenith] warm start", e);
    }
  },
};

/* --- Delete a download from its list ---------------------------------------------
   A bin button beside "Show in folder" on each finished download: in the
   sidebar's downloads list (the Library button's list), in Zen's Library
   (Downloads) and in Firefox's Library window. One click deletes the file
   and takes it off the list; or two (Panels › Downloads), the first turning
   the bin red to ask; or no button at all. */
const DownloadDelete = {
  PREF: "zenith.plus.download-delete",

  init() {
    this.adds = [];
    this.watchSidebar();
    this.watchLibrary();
    // Off takes the buttons away (here and in the Library window); on again
    // puts them back.
    const mode = () => {
      if (this.mode === "off") {
        for (const w of [window, ...Services.wm.getEnumerator("Places:Organizer")]) {
          for (const b of w.document.querySelectorAll(".zenith-download-delete")) b.remove();
        }
      } else {
        for (const add of this.adds) add();
      }
    };
    Services.prefs.addObserver(this.PREF, mode);
    onUnload(() => Services.prefs.removeObserver(this.PREF, mode));
    this.listener = { onOpenWindow: x => {
      const w = x.docShell.domWindow;
      w.addEventListener("load", () => w.location.href.startsWith("chrome://browser/content/places/places.xhtml") && this.watchLibraryWindow(w), { once: true });
    }, onCloseWindow() {} };
    Services.wm.addListener(this.listener);
    onUnload(() => Services.wm.removeListener(this.listener));
    window.ZenithDownloadDelete = this; // for tools/checks
  },

  // The file goes and so does its line in the list; the page it came from
  // leaves your history too only if Firefox's own Delete is set to do that.
  async remove(download) {
    const clear = Math.max(1, Services.prefs.getIntPref("browser.download.clearHistoryOnDelete", 0));
    await window.DownloadsCommon.deleteDownloadFiles(download, clear);
  },

  // How many clicks a delete takes: "" one · "confirm" two · "off" none
  // (no buttons).
  get mode() {
    return Services.prefs.getStringPref(this.PREF, "");
  },

  // A bin button. With two clicks: the first turns it red and asks, the
  // second (within three seconds, on the same download) deletes. Zen
  // reuses rows for other downloads, so the asking is tied to the
  // download it was for, and ends after a delete.
  button(doc, getDownload, xul = true) {
    const b = xul ? doc.createXULElement("toolbarbutton") : doc.createElement("button");
    b.className = xul ? "toolbarbutton-1 zenith-download-delete" : "zenith-download-delete";
    const img = xul ? doc.createXULElement("image") : doc.createElement("img");
    img.className = "toolbarbutton-icon";
    img.setAttribute("src", "chrome://browser/skin/zen-icons/trash.svg");
    b.append(img);
    const tip = text => {
      b.setAttribute("tooltiptext", text);
      b.setAttribute("title", text);
    };
    const calm = () => {
      doc.defaultView?.clearTimeout(b.zenithTimer);
      b.removeAttribute("confirm");
      b.zenithFor = null;
      tip("Delete the file");
    };
    b.zenithCalm = calm;
    calm();
    b.addEventListener("click", e => {
      e.stopPropagation();
      e.preventDefault();
      const d = getDownload();
      if (!d) return;
      if (this.mode === "confirm" && b.zenithFor !== d) {
        calm();
        b.setAttribute("confirm", "true");
        b.zenithFor = d;
        tip("Click again to delete the file (it can't be brought back)");
        b.zenithTimer = doc.defaultView?.setTimeout(calm, 3000);
        return;
      }
      calm();
      this.remove(d).catch(err => console.error("[Zenith] deleting a download", err));
    });
    return b;
  },

  finished: d => d?.succeeded && !d.error && d.target?.exists !== false,

  // The sidebar's list: each row knows its download.
  watchSidebar() {
    const add = () => {
      if (this.mode === "off") return;
      for (const row of document.querySelectorAll("#zen-library-download-list .zen-library-download-list-download")) {
        const had = row.querySelector(".zenith-download-delete");
        if (had && had.zenithFor && had.zenithFor !== row.download) had.zenithCalm?.();
        if (had || !this.finished(row.download)) continue;
        const show = row.querySelector(".zen-library-download-action");
        const b = this.button(document, () => row.download);
        if (show) show.after(b);
        else row.append(b);
      }
    };
    this.adds.push(add);
    const watcher = new MutationObserver(add);
    const start = () => {
      const list = document.getElementById("zen-library-download-list");
      if (!list) return false;
      watcher.observe(list, { childList: true, subtree: true });
      add();
      return true;
    };
    if (!start()) {
      const foot = document.getElementById("zen-sidebar-foot-buttons");
      const later = new MutationObserver(() => start() && later.disconnect());
      if (foot) later.observe(foot, { childList: true, subtree: true });
      onUnload(() => later.disconnect());
    }
    onUnload(() => watcher.disconnect());
  },

  // Zen's Library, Downloads: its rows don't carry their download, so each
  // is found by its file name (and where it came from). (Its sections draw
  // inside shadow roots: they're searched, and watched, too.)
  watchLibrary() {
    const lib = document.querySelector("zen-library");
    if (!lib) return;
    const roots = () => {
      const out = [lib];
      for (let i = 0; i < out.length; i++) {
        for (const n of out[i].querySelectorAll("*")) if (n.shadowRoot) out.push(n.shadowRoot);
        if (out[i].shadowRoot) out.push(out[i].shadowRoot);
      }
      return [...new Set(out)];
    };
    const watched = new WeakSet();
    const add = async () => {
      for (const r of roots()) {
        if (watched.has(r)) continue;
        watched.add(r);
        watcher.observe(r, { childList: true, subtree: true });
      }
      if (this.mode === "off") return;
      const rows = roots().flatMap(r => [...r.querySelectorAll(".zen-library-row")])
        .filter(r => !r.querySelector(".zenith-download-delete") && r.querySelector(".zen-library-download-url, .zen-library-download-status"));
      if (!rows.length) return;
      const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
      const all = (await (await Downloads.getList(Downloads.ALL)).getAll()).filter(d => this.finished(d));
      for (const row of rows) {
        const name = row.querySelector(".zen-library-row-title")?.textContent.trim();
        const from = row.querySelector(".zen-library-download-url")?.textContent.trim() ?? "";
        const find = () => all.find(d => PathUtils.filename(d.target.path) === name && (!from || (d.source?.url ?? "").includes(from)));
        if (!name || !find() || row.querySelector(".zenith-download-delete")) continue;
        const actions = row.querySelector(".zen-library-row-actions");
        const more = actions?.querySelector("[data-l10n-id='library-downloads-more-button']");
        const b = this.button(document, find);
        if (more) more.before(b);
        else actions?.append(b);
      }
    };
    this.adds.push(add);
    const watcher = new MutationObserver(() => {
      clearTimeout(this.libTimer);
      this.libTimer = setTimeout(add, 60);
    });
    add();
    onUnload(() => watcher.disconnect());
  },

  // Firefox's Library window (Manage downloads).
  watchLibraryWindow(w) {
    const doc = w.document;
    const add = () => {
      if (this.mode === "off") return;
      for (const item of doc.querySelectorAll("#downloadsListBox richlistitem")) {
        const d = item._shell?.download;
        if (item.querySelector(".zenith-download-delete") || !this.finished(d)) continue;
        const b = this.button(doc, () => item._shell?.download);
        (item.querySelector(".downloadButton") ?? item.lastElementChild)?.before(b);
      }
    };
    const box = doc.getElementById("downloadsListBox");
    if (!box) return;
    this.adds.push(add);
    w.addEventListener("unload", () => (this.adds = this.adds.filter(a => a !== add)), { once: true });
    new MutationObserver(add).observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["state"] });
    add();
  },
};

/* --- Compact mode: the sidebar stays while a tooltip is under the pointer -------
   Firefox's tooltips are little windows of their own. Moving quickly over
   the sidebar (its downloads list, say), the pointer can land on one as it
   appears: for the window, the pointer has left the sidebar (to nowhere),
   and Zen starts tucking it away under your hand. Such a "leave" with the
   pointer still inside the sidebar is held back; once the pointer is
   really elsewhere (no tooltip open, the sidebar not hovered), Zen is told
   after all. */
const SidebarHover = {
  init() {
    const guard = e => {
      if (e.target !== gNavToolbox || e.relatedTarget || !e.isTrusted) return;
      const r = gNavToolbox.getBoundingClientRect();
      if (e.clientX <= r.left + 1 || e.clientX >= r.right - 1 || e.clientY <= r.top + 1 || e.clientY >= r.bottom - 1) return;
      e.stopImmediatePropagation();
      this.watch();
    };
    window.addEventListener("mouseleave", guard, true);
    onUnload(() => {
      window.removeEventListener("mouseleave", guard, true);
      clearInterval(this.timer);
    });
  },

  // Until the pointer is back on the sidebar (nothing to do) or somewhere
  // else with no tooltip open (Zen gets its leave).
  watch() {
    clearInterval(this.timer);
    let checks = 0, away = 0;
    this.timer = setInterval(() => {
      const tooltip = [...document.querySelectorAll("tooltip")].some(t => t.state === "open" || t.state === "showing");
      if (gNavToolbox.matches(":hover")) away = 0;
      else if (!tooltip) away++;
      if (away >= 2) gNavToolbox.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
      if (away >= 2 || gNavToolbox.matches(":hover") && !tooltip || ++checks > 150) clearInterval(this.timer);
    }, 120);
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
    window.ZenithCtrlTab = this; // for tools/checks
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
      if (tabs.length > 2 && CtrlTabOrder.all) {
        this.open();
        CtrlTabOrder.step(this, -1);
        CtrlTabOrder.step(this, -1);
      } else if (tabs.length > 2) {
        this.open();
        // From the next one (open's choice), back past this one to the
        // last; moved directly, so the pictures still wait Firefox's 200ms
        // (stepping with advanceFocus would show them at once).
        const back = i => {
          do i = i > 0 ? i - 1 : this.previews.length - 1;
          while (this.previews[i].hidden);
          return i;
        };
        this._selectedIndex = back(back(this._selectedIndex));
        if (this.selected?._tab) gBrowser.warmupTab(this.selected._tab);
      } else if (tabs.length === 2) {
        gBrowser.selectedTab = tabs[tabs[0].selected ? 1 : 0];
      }
    };
  },

  ownOrder(on) {
    const C = window.ctrlTab;
    if (!C) return;
    this.firefox ??= Object.getOwnPropertyDescriptor(C, "tabList");
    this.open ??= C.open;
    this.advance ??= C.advanceFocus;
    if (on) {
      const self = this;
      Object.defineProperty(C, "tabList", { get: () => this.shown(), configurable: true, enumerable: true });
      // (Firefox starts on the second picture: here, the tab after yours.)
      const open = this.open;
      C.open = function (...args) {
        const r = open.apply(this, args);
        this._selectedIndex = self.cursor - self.from;
        return r;
      };
      C.advanceFocus = function (forward) {
        const p = self.step(this, forward ? 1 : -1);
        if (p?._tab) gBrowser.warmupTab(p._tab);
        if (this._timer) {
          clearTimeout(this._timer);
          this._timer = null;
          this._openPanel();
        }
      };
    } else if (this.firefox) {
      Object.defineProperty(C, "tabList", this.firefox);
      C.open = this.open;
      C.advanceFocus = this.advance;
      this.all = null;
    }
  },

  // The row: as many pictures as it holds, from this space's tabs in order;
  // stepping past either end moves it along, so every tab comes round.
  // (Set afresh each time it opens.)
  shown() {
    if (!this.all || !window.ctrlTab?.isOpen) this.begin();
    return this.all.slice(this.from, this.from + this.max());
  },

  max() {
    return window.ctrlTab?.maxTabPreviews ?? 7;
  },

  begin() {
    const tabs = (this.all = this.inOrder()), n = tabs.length, here = tabs.indexOf(gBrowser.selectedTab);
    this.cursor = n ? (here + 1) % n : 0;
    this.from = Math.max(0, Math.min(here, n - this.max()));
    this.from = this.fit(this.from);
  },

  fit(from) {
    const max = this.max();
    if (this.all.length <= max) return 0;
    if (this.cursor < from) return this.cursor;
    if (this.cursor >= from + max) return this.cursor - max + 1;
    return from;
  },

  step(C, by) {
    const n = this.all?.length;
    if (!n) return null;
    const i = C.previews.indexOf(C.selected);
    if (i >= 0) this.cursor = this.from + i; // (the pointer may have moved it)
    this.cursor = (this.cursor + by + n) % n;
    const from = this.fit(this.from);
    if (from !== this.from) {
      this.from = from;
      C.updatePreviews();
    }
    const j = this.cursor - this.from;
    if (C._selectedIndex === -1) C.previews[j]?.focus();
    else C._selectedIndex = j;
    return C.previews[j];
  },

  // This space's tabs in the sidebar's order, essentials first (asleep
  // ones too). (A tab with a glance open is its glance: that's what's
  // selected and shown for it.)
  inOrder() {
    const tabs = gBrowser.visibleTabs.filter(t => !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab"));
    const essential = tabs.filter(t => t.hasAttribute("zen-essential"));
    return [...essential, ...tabs.filter(t => !essential.includes(t))].map(t => t.glanceTab ?? t);
  },


};

/* --- Groups that don't pin --------------------------------------------------
   Zen's folders pin the tabs you put in them: they stay when closed (Ctrl+W
   puts them to sleep), and a tab that wandered off gets marked to go back to
   its first page. Right-click a folder › Tabs act unpinned: Ctrl+W closes
   its tabs, a tab keeps the page it's on (no "back to its first page" mark),
   and the folder sits below the pinned tabs' separator, with the tabs that
   aren't pinned. Its tabs are still pinned for Firefox (Zen's folders only
   hold pinned tabs), so they come back at startup.
   "Groups that don't pin" off hides the choice. (0.11.2 also offered
   Firefox's own tab groups; they fought Zen's split views and spaces, and
   were taken out in 0.12.1: Firefox's setting comes back as it was.)
   Which folders act unpinned is kept in zenith.internal.unpinned-folders
   (folder ids, which Zen keeps across sessions). */
const UnpinnedGroups = {
  PREF: "zenith.plus.unpinned-groups", // "" folders · off
  KEY: "zenithUnpinnedFolder", // a tab's folder, in its session data
  OLD: "zenith.plus.loose-groups", // (0.11.1)
  FOLDERS: "zenith.internal.unpinned-folders",

  init() {
    Services.prefs.clearUserPref(this.OLD);
    if (Services.prefs.getStringPref(this.PREF, "") === "firefox") Services.prefs.clearUserPref(this.PREF);
    Bridge.apply("groups", { "browser.tabs.groups.enabled": null });
    const apply = () => this.mark();
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => Services.prefs.removeObserver(this.PREF, apply));
    this.folderMenu();
    this.folderBehaviour();
    apply();
    window.ZenithGroups = this; // the tab manager, and tools/checks
  },

  get mode() {
    return Services.prefs.getStringPref(this.PREF, "") === "off" ? "off" : "folders";
  },

  // A folder whose tabs act unpinned.
  loose(g) {
    return !!g?.isZenFolder && g.hasAttribute("zenith-unpinned");
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
    this.place();
    this.remember();
  },

  // Each tab in a folder (any folder: pinned ones too) carries the folder's
  // id in its session data ("~" first for one that acts unpinned), so a
  // closed one (Ctrl+Shift+T) comes back into its folder.
  remember() {
    clearTimeout(this.remembering);
    this.remembering = setTimeout(() => {
      for (const tab of gBrowser.tabs) {
        const loose = this.mode === "folders" && this.folderOf(tab);
        const folder = tab.group?.isZenFolder && !tab.hasAttribute("zen-empty-tab") ? `${loose ? "~" : ""}${tab.group.id}` : "";
        try {
          if ((SessionStore.getCustomTabValue(tab, this.KEY) || "") === folder) continue;
          if (folder) SessionStore.setCustomTabValue(tab, this.KEY, folder);
          else SessionStore.deleteCustomTabValue(tab, this.KEY);
        } catch {}
      }
    }, 200);
  },

  // A tab coming back from being closed: into its folder, if it's still
  // there; else, from a folder that acted unpinned, as the ordinary
  // unpinned tab it acted as.
  restore(tab) {
    let id = "";
    try {
      id = SessionStore.getCustomTabValue(tab, this.KEY) || "";
    } catch {}
    const loose = id.startsWith("~");
    id = id.replace(/^~/, "");
    if (!id) return;
    const folder = document.getElementById(id);
    if (folder?.isZenFolder && folder.isConnected) {
      if (tab.group === folder) return;
      const space = folder.getAttribute("zen-workspace-id");
      if (space && tab.getAttribute("zen-workspace-id") !== space) window.gZenWorkspaces?.moveTabsToWorkspace?.([tab], space);
      if (!tab.pinned) gBrowser.pinTab(tab);
      folder.addTabs([tab]);
    } else if (loose && tab.pinned && !tab.group) {
      gBrowser.unpinTab(tab);
      try {
        SessionStore.deleteCustomTabValue(tab, this.KEY);
      } catch {}
    }
  },

  // Top-level folders that act unpinned go just below the separator, the
  // rest above it (in their order). The separator is inside the pinned
  // container, so their tabs still come first, as pinned tabs must.
  place() {
    let moved = false;
    for (const box of document.querySelectorAll("zen-workspace")) {
      const pinned = box.pinnedTabsContainer, sep = pinned?.querySelector(":scope > .pinned-tabs-container-separator");
      if (!sep) continue;
      const folders = [...pinned.children].filter(c => c.localName === "zen-folder");
      let after = sep;
      for (const f of folders) {
        const below = !!(sep.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (f.hasAttribute("zenith-unpinned")) {
          if (after.nextElementSibling !== f) {
            after.after(f);
            moved = true;
          }
          after = f;
        } else if (below) {
          sep.before(f);
          moved = true;
        }
      }
    }
    if (moved) gBrowser.tabContainer._invalidateCachedTabs?.();
  },

  placeSoon() {
    clearTimeout(this.placing);
    this.placing = setTimeout(() => this.place(), 150);
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
    // Zen brings its folders back from the session after the window opens;
    // a folder dragged above or below the separator goes back to its side.
    const mark = () => this.mark();
    const soon = () => this.placeSoon();
    const grouped = () => this.remember();
    // (Restored from closed: wait for Zen to finish placing it.)
    const restoring = e => setTimeout(() => this.restore(e.target), 0);
    gBrowser.tabContainer.addEventListener("TabGrouped", grouped);
    gBrowser.tabContainer.addEventListener("TabUngrouped", grouped);
    gBrowser.tabContainer.addEventListener("SSTabRestoring", restoring);
    window.addEventListener("SSWindowRestored", mark);
    gBrowser.tabContainer.addEventListener("TabGroupCreate", mark);
    gBrowser.tabContainer.addEventListener("TabGroupMoved", soon);
    gBrowser.tabContainer.addEventListener("TabMove", soon);
    window.gZenWorkspaces?.promiseInitialized?.then(mark);
    onUnload(() => {
      gBrowser.removeTabsProgressListener(this.progress);
      close?.removeEventListener("command", this.onClose, true);
      window.removeEventListener("SSWindowRestored", mark);
      gBrowser.tabContainer.removeEventListener("TabGrouped", grouped);
      gBrowser.tabContainer.removeEventListener("TabUngrouped", grouped);
      gBrowser.tabContainer.removeEventListener("SSTabRestoring", restoring);
      gBrowser.tabContainer.removeEventListener("TabGroupCreate", mark);
      gBrowser.tabContainer.removeEventListener("TabGroupMoved", soon);
      gBrowser.tabContainer.removeEventListener("TabMove", soon);
    });
  },
};

/* --- Cookies: banners, rules, and a page for each site's ---------------------------
   Zenith › Cookies, and about:zenith-cookies (:cookies in the switcher):
     Banners   consent banners answered for you (plus/pages/cookies.sys.mjs:
               Reject pressed; a banner with no Reject hidden, if you like);
               sites left alone in zenith.plus.cookie-banners-skip.
     Policy    Firefox's own cookie setting, through the bridge (yours comes
               back with "Firefox's own"): cross-site cookies, trackers, or
               every cookie but the sites you allow.
     Keep      until they expire (Firefox's way) or until you close Zen,
               except the sites you allow: Firefox clears cookies and site
               data on closing, and only those (history, downloads, the
               cache and the rest are explicitly kept).
     Per site  Allow, Until you close Zen, Block, or as the policy says:
               Firefox's own cookie exceptions (Settings › Privacy shows
               them too); and deleting a site's cookies and data.
     Notices   the first time Zenith does something on a site (this run of
               Zen): a banner refused or hidden, or cookies blocked beyond
               what Firefox blocks on its own; each with Undo, which leaves
               that site alone (so no site stays broken by it).
   Firefox does the keeping and blocking; Zenith only sets it up. Nothing
   from private windows is kept, not even in the page's "lately". */
const Cookies = {
  BANNERS: "zenith.plus.cookie-banners", // "" reject (else hide) · reject · hide · off
  SKIP: "zenith.plus.cookie-banners-skip",
  POLICY: "zenith.plus.cookie-policy", // "" Firefox's own · cross · trackers · all
  KEEP: "zenith.plus.cookie-keep", // "" until they expire · session
  NOTICES: "zenith.plus.cookie-notices",
  URL: "about:zenith-cookies",
  RULES: { allow: Ci.nsIPermissionManager.ALLOW_ACTION, session: 8 /* ACCESS_SESSION */, block: Ci.nsIPermissionManager.DENY_ACTION },

  init() {
    this.register();
    const banners = () => this.banners();
    const policy = () => this.policy();
    Services.prefs.addObserver(this.BANNERS, banners);
    Services.prefs.addObserver(this.POLICY, policy);
    Services.prefs.addObserver(this.KEEP, policy);
    onUnload(() => {
      Services.prefs.removeObserver(this.BANNERS, banners);
      Services.prefs.removeObserver(this.POLICY, policy);
      Services.prefs.removeObserver(this.KEEP, policy);
    });
    banners();
    policy();
    // Cookies blocked beyond Firefox's own blocking: told, with Undo.
    this.blocking = { onContentBlockingEvent: (browser, webProgress, request, event) => webProgress?.isTopLevel !== false && this.blocked(browser, event) };
    gBrowser.addTabsProgressListener(this.blocking);
    onUnload(() => gBrowser.removeTabsProgressListener(this.blocking));
    const commandset = document.createXULElement("commandset");
    const command = document.createXULElement("command");
    command.id = "zenith-cookies-command";
    command.addEventListener("command", () => this.open());
    commandset.append(command);
    root.append(commandset);
    window.ZenithCookies = this; // the page, the switcher's :cookies, and tools/checks
  },

  // The banner answerer, in every page and frame (registered while it's on).
  banners() {
    if (Services.prefs.getStringPref(this.BANNERS, "") === "off" || Cookies.actorReady) return;
    Cookies.actorReady = (async () => {
      for (const d of ["../pages/", "zenith-pages/"]) {
        const url = new URL(`${d}cookies.sys.mjs`, import.meta.url).href;
        if (!(await fetch(url).then(r => r.ok, () => false))) continue;
        this.actorURL = url;
        try {
          ChromeUtils.registerWindowActor("ZenithCookies", {
            parent: { esModuleURI: url },
            child: { esModuleURI: url, events: { DOMContentLoaded: {}, pageshow: {} } },
            allFrames: true,
            matches: ["http://*/*", "https://*/*"],
            safeForUntrustedWebProcess: true,
          });
        } catch (e) {
          if (e.name !== "NotSupportedError") console.error("[Zenith] cookie banners", e); // (another window registered it)
        }
        return true;
      }
      console.error("[Zenith] cookie banners: plus/pages isn't there");
      return false;
    })();
  },

  // Firefox's own settings, through the bridge.
  policy() {
    const P = Services.prefs;
    const behaviour = { cross: 1, trackers: 4, all: 2 }[P.getStringPref(this.POLICY, "")] ?? null;
    Bridge.apply("cookie-policy", { "network.cookie.cookieBehavior": behaviour, "network.cookie.cookieBehavior.pbmode": behaviour });
    const session = P.getStringPref(this.KEEP, "") === "session";
    const v = on => (session ? on : null);
    // Cookies and site data cleared on closing, and nothing else.
    Bridge.apply("cookie-keep", {
      "privacy.sanitize.sanitizeOnShutdown": v(true),
      "privacy.clearOnShutdown_v2.cookiesAndStorage": v(true),
      "privacy.clearOnShutdown_v2.historyFormDataAndDownloads": v(false),
      "privacy.clearOnShutdown_v2.browsingHistoryAndDownloads": v(false),
      "privacy.clearOnShutdown_v2.formdata": v(false),
      "privacy.clearOnShutdown_v2.cache": v(false),
      "privacy.clearOnShutdown_v2.siteSettings": v(false),
      "privacy.clearOnShutdown.cookies": v(true),
      "privacy.clearOnShutdown.offlineApps": v(true),
      "privacy.clearOnShutdown.history": v(false),
      "privacy.clearOnShutdown.formdata": v(false),
      "privacy.clearOnShutdown.downloads": v(false),
      "privacy.clearOnShutdown.sessions": v(false),
      "privacy.clearOnShutdown.cache": v(false),
      "privacy.clearOnShutdown.siteSettings": v(false),
    });
  },

  /* Notices */

  // Told once per site and thing this run of Zen (shared by every window).
  async firstTime(site, what) {
    let told;
    try {
      told = ChromeUtils.importESModule(this.actorURL ?? new URL("../pages/cookies.sys.mjs", import.meta.url).href).told;
    } catch {
      told = Cookies.told ??= new Set();
    }
    const key = `${site} ${what}`;
    if (told.has(key)) return false;
    told.add(key);
    return true;
  },

  noticesOn() {
    return Services.prefs.getBoolPref(this.NOTICES, true);
  },

  // A banner answered (from the page's actor).
  async acted(browser, data, actor) {
    const site = this.site(data?.host);
    if (!site || !this.noticesOn() || !(await this.firstTime(site, data.how))) return;
    const rejected = data.how === "rejected", tool = data.tool && data.tool !== "banner" ? ` (${data.tool})` : "";
    notice({
      title: rejected ? `Cookies refused on ${site}` : `Cookie banner hidden on ${site}`,
      body: rejected ? `Zenith pressed Reject${tool}. Undo forgets that answer and leaves this site's banners to you.`
                     : `It had no Reject button${tool}. Undo shows it again and leaves this site's banners to you.`,
      actions: [
        { label: "Undo", run: () => this.undoBanner(browser, site, rejected, actor) },
        { label: "Cookies…", run: () => this.open(site) },
      ],
    });
  },

  async undoBanner(browser, site, rejected, actor) {
    this.setBannersLeftAlone(site, true);
    try {
      actor?.sendAsyncMessage?.("undo");
    } catch {}
    if (!rejected) return;
    // (The answer the site stored goes, so it asks again.)
    await this.remove(site);
    browser?.reload?.();
  },

  // Firefox told the tab cookies were blocked: beyond its own blocking (a
  // stricter policy of Zenith's), the first time on this site.
  async blocked(browser, event) {
    const F = Ci.nsIWebProgressListener;
    if (!this.noticesOn()) return;
    const kind = event & F.STATE_COOKIES_BLOCKED_ALL ? "all" : event & F.STATE_COOKIES_BLOCKED_FOREIGN ? "cross"
      : event & (F.STATE_COOKIES_BLOCKED_TRACKER | F.STATE_COOKIES_BLOCKED_SOCIALTRACKER) ? "trackers" : null;
    if (!kind) return;
    const site = this.site(browser?.currentURI?.host);
    if (!site || this.rules().get(site) === "allow" || !(await this.firstTime(site, kind))) return;
    notice({
      title: `Cookies blocked on ${site}`,
      body: kind === "all" ? "Every cookie is blocked except on the sites you allow. If this site doesn't work as it should, allow it."
        : kind === "cross" ? "Cookies from other sites are blocked here. If something on this site doesn't work (a login, a video), allow them."
        : "Trackers' cookies are blocked here. If something on this site doesn't work, allow them.",
      actions: [
        { label: "Allow on this site", run: () => this.allowHere(browser, site, kind) },
        { label: "Cookies…", run: () => this.open(site) },
      ],
    });
  },

  async allowHere(browser, site, kind) {
    if (kind === "all") this.setRule(site, "allow");
    else {
      try {
        const { ContentBlockingAllowList } = ChromeUtils.importESModule("resource://gre/modules/ContentBlockingAllowList.sys.mjs");
        ContentBlockingAllowList.add(browser);
      } catch {
        this.setRule(site, "allow");
      }
    }
    browser?.reload?.();
  },

  /* Sites */

  site(host) {
    host = (host || "").replace(/^\./, "");
    try {
      return Services.eTLD.getBaseDomainFromHost(host);
    } catch {
      return host;
    }
  },

  // Every site with cookies: { site, count, rule }, most cookies first.
  sites() {
    const by = new Map();
    for (const c of Services.cookies.cookies) {
      if (c.originAttributes?.privateBrowsingId) continue;
      const site = this.site(c.host);
      const e = by.get(site) ?? { site, count: 0 };
      e.count++;
      by.set(site, e);
    }
    const rules = this.rules();
    for (const site of rules.keys()) if (!by.has(site)) by.set(site, { site, count: 0 });
    return [...by.values()].map(e => ({ ...e, rule: rules.get(e.site) ?? "" })).sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
  },

  // The rule each site has: allow · session · block.
  rules() {
    const names = new Map(Object.entries(this.RULES).map(([k, v]) => [v, k]));
    const out = new Map();
    for (const p of Services.perms.getAllByTypes(["cookie"])) {
      const name = names.get(p.capability);
      if (name) out.set(this.site(p.principal.host), name);
    }
    return out;
  },

  // A site's rule (both http and https, which covers its subdomains), or
  // none: as the policy says.
  setRule(site, rule) {
    for (const scheme of ["https", "http"]) {
      const principal = Services.scriptSecurityManager.createContentPrincipalFromOrigin(`${scheme}://${site}`);
      Services.perms.removeFromPrincipal(principal, "cookie");
      if (this.RULES[rule] != null) Services.perms.addFromPrincipal(principal, "cookie", this.RULES[rule]);
    }
  },

  // A site's cookies and the data it keeps (as Firefox's "Clear cookies
  // and site data").
  remove(site) {
    try {
      const { told } = ChromeUtils.importESModule(this.actorURL ?? new URL("../pages/cookies.sys.mjs", import.meta.url).href);
      for (const key of [...told]) if (key.startsWith(`${site} `)) told.delete(key);
    } catch {}
    for (const key of [...(Cookies.told ?? [])]) if (key.startsWith(`${site} `)) Cookies.told.delete(key);
    const flags = Ci.nsIClearDataService.CLEAR_COOKIES | Ci.nsIClearDataService.CLEAR_DOM_STORAGES |
                  (Ci.nsIClearDataService.CLEAR_COOKIE_BANNER_EXECUTED_RECORD ?? 0);
    return new Promise(resolve => {
      const done = { onDataDeleted: () => resolve(true) };
      try {
        if (Services.clearData.deleteDataFromSite) Services.clearData.deleteDataFromSite(site, {}, true, flags, done);
        else Services.clearData.deleteDataFromBaseDomain(site, true, flags, done);
      } catch (e) {
        console.error("[Zenith] deleting a site's cookies", e);
        resolve(false);
      }
    });
  },

  bannersLeftAlone(site) {
    const list = Services.prefs.getStringPref(this.SKIP, "").split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    return list.includes(site);
  },

  setBannersLeftAlone(site, on) {
    const list = new Set(Services.prefs.getStringPref(this.SKIP, "").split(/[\s,]+/).map(s => s.trim()).filter(Boolean));
    if (on) list.add(site);
    else list.delete(site);
    Services.prefs.setStringPref(this.SKIP, [...list].join(", "));
  },

  // What the banner answerer did lately (this run of Zen).
  async lately() {
    await Cookies.actorReady;
    try {
      return this.actorURL ? ChromeUtils.importESModule(this.actorURL).lately() : [];
    } catch {
      return [];
    }
  },

  /* The page */

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
        const url = new URL(`${d}cookies.html`, import.meta.url).href;
        const about = ChromeUtils.importESModule(new URL(`${d}about.sys.mjs`, import.meta.url).href);
        about.register("zenith-cookies", url, read(url));
        about.revive("zenith-cookies");
        return true;
      } catch {}
    }
    console.error("[Zenith] about:zenith-cookies: plus/pages isn't there");
    return false;
  },

  // The page, open at the site you're on.
  open() {
    const host = gBrowser.selectedBrowser?.currentURI;
    const site = /^https?$/.test(host?.scheme ?? "") ? this.site(host.host) : "";
    const url = this.URL + (site ? `?site=${encodeURIComponent(site)}` : "");
    const tab = gBrowser.visibleTabs.find(t => t.linkedBrowser?.currentURI?.spec?.startsWith(this.URL));
    if (tab) {
      tab.linkedBrowser.loadURI(Services.io.newURI(url), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      gBrowser.selectedTab = tab;
    } else {
      openTrustedLinkIn(url, "tab");
    }
  },
};

/* --- Split views: drag a tab, or the whole split --------------------------------
   In the sidebar, dragging one of a split view's tabs moves only that tab:
   onto another tab of the same split, the two swap places (in the split
   too); onto another split's tab, it joins that split; onto a loose tab
   (not in a folder), it leaves its split and goes before or after it.
   What letting go would do shows as you drag (the tab or split outlined,
   or a line). Escape cancels. A loose tab dragged onto a split's tab
   joins the split (anywhere on it). Pressing on a split's left edge (it
   lights up on hover) drags the whole split, before or after a loose tab
   or another split.
   The tab is moved with the pointer here, not with the browser's
   drag-and-drop: Zen's own drag would take the whole split, and nothing
   of Zen's sidebar is touched. */
const SplitReorder = {
  TYPE: "application/x-moz-tabbrowser-tab",
  EDGE: 10,

  init() {
    const tabOf = n => (n?.nodeType === Node.TEXT_NODE ? n.parentElement : n)?.closest?.("tab.tabbrowser-tab") ?? null;
    const down = e => {
      this.press = null;
      if (e.button !== 0 || e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
      const group = this.split(e.target?.closest?.("tab-group")), tab = tabOf(e.target) ?? group?.tabs[0];
      if (!group || !gBrowser.tabContainer.contains(group)) return;
      const whole = e.clientX - group.getBoundingClientRect().left < this.EDGE;
      this.press = { tab, group, whole, x: e.screenX, y: e.screenY };
    };
    const move = e => {
      const p = this.press;
      if (!p) return;
      if (!(e.buttons & 1)) return this.endDrag();
      if (!this.drag) {
        if (Math.hypot(e.screenX - p.x, e.screenY - p.y) < 6) return;
        this.drag = { tab: p.tab, group: p.group, whole: p.whole, node: p.whole ? p.group : p.tab };
        root.setAttribute("zenith-split-dragging", "true");
        this.drag.node.setAttribute("zenith-split-moving", "true");
      }
      const at = document.elementFromPoint(e.clientX, e.clientY);
      this.mark(this.drag.whole ? this.whatWhole(this.drag.group, at, e) : this.whatDrop(this.drag.tab, this.targetOf(at), e, true));
      root.toggleAttribute("zenith-split-nowhere", !this.marked);
      this.ghost(e);
    };
    const up = e => {
      this.press = null;
      if (!this.drag) return;
      const what = this.marked;
      this.endDrag();
      // (The click this release makes goes nowhere.)
      window.addEventListener("click", c => (c.preventDefault(), c.stopPropagation()), { capture: true, once: true });
      if (what) this.apply(what);
    };
    const key = e => e.key === "Escape" && this.drag && (e.preventDefault(), this.endDrag());
    // The browser's drag of a split's tab (and so Zen's of the whole split)
    // doesn't start: the pointer moves it here.
    const start = e => {
      if (!this.press) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // Zen's drag of a loose tab, over a split's tab: it joins the split.
    const over = e => {
      if (this.drag) return;
      const dragged = e.dataTransfer?.mozGetDataAt?.(this.TYPE, 0);
      if (!dragged?.isConnected || !(dragged instanceof XULElement)) return this.mark(null);
      const what = this.whatDrop(dragged, this.targetOf(e.target), e, false);
      this.mark(what);
      if (!what) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };
    const drop = e => {
      if (this.drag || !this.marked) return;
      const what = this.marked;
      this.mark(null);
      e.preventDefault();
      e.stopImmediatePropagation();
      this.apply(what);
    };
    const end = () => !this.drag && this.mark(null);
    const listeners = [["mousedown", down], ["mousemove", move], ["mouseup", up], ["keydown", key], ["dragstart", start],
                       ["dragover", over], ["drop", drop], ["dragend", end]];
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
    onUnload(() => {
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    });
    window.ZenithSplitReorder = this; // for tools/checks
  },

  split(group) {
    return group?.hasAttribute?.("split-view-group") ? group : null;
  },

  // What's on the move, under the pointer: the tab (its icon and title) or
  // the split's tabs, as Zen shows a tab it drags.
  ghost(e) {
    if (!this.ghostNode) {
      const g = (this.ghostNode = el("div", { id: "zenith-split-ghost" }));
      g.toggleAttribute("whole", !!this.drag.whole);
      for (const t of this.drag.whole ? this.drag.group.tabs : [this.drag.tab]) {
        const chip = el("div", { class: "chip" });
        const icon = el("img", { class: "icon", alt: "" });
        const src = t.getAttribute("image") || t.querySelector(".tab-icon-image")?.src;
        if (src) icon.src = src;
        else icon.setAttribute("blank", "true");
        const label = el("span", { class: "label" });
        label.textContent = t.label;
        chip.append(icon, label);
        g.append(chip);
      }
      (document.getElementById("zen-main-app-wrapper") ?? document.body).append(g);
    }
    this.ghostNode.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
  },

  // The tab under the pointer; between a split's tabs, its first one.
  targetOf(node) {
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    return node?.closest?.("tab.tabbrowser-tab") ?? this.split(node?.closest?.("tab-group"))?.tabs[0] ?? null;
  },

  // The whole split: before or after a loose tab or another split (as
  // pinned as it is; not among the essentials or in a folder).
  whatWhole(group, node, e) {
    const tab = this.targetOf(node);
    if (!tab || group.contains(tab) || tab.hasAttribute("zen-essential") || tab.hasAttribute("zen-glance-tab") ||
        tab.hasAttribute("zen-empty-tab") || tab.pinned !== group.tabs[0]?.pinned) return null;
    const target = this.split(tab.group) ?? (tab.group ? null : tab);
    if (!target) return null;
    const r = target.getBoundingClientRect();
    return { kind: e.clientY < r.top + r.height / 2 ? "before" : "after", whole: true, tab: group, target, node: target };
  },

  endDrag() {
    this.mark(null);
    this.drag?.node.removeAttribute("zenith-split-moving");
    root.removeAttribute("zenith-split-dragging");
    root.removeAttribute("zenith-split-nowhere");
    this.ghostNode?.remove();
    this.ghostNode = null;
    this.drag = null;
    this.press = null;
  },

  // What letting go here would do: swap (same split), join (another
  // split; a loose tab only, or one of a split), or place it before/after
  // a loose tab (leaving its split); null: nothing.
  whatDrop(tab, target, e, ours) {
    if (!target || target === tab || target.hasAttribute("zen-glance-tab") || target.hasAttribute("zen-empty-tab")) return null;
    const mine = this.split(tab.group), theirs = this.split(target.group);
    if (mine && mine === theirs) return { kind: "swap", tab, target, node: target };
    if (theirs) {
      const full = theirs.tabs.length >= (window.gZenViewSplitter?.MAX_TABS ?? 4);
      const movable = mine || (!tab.group && !tab.hasAttribute("zen-essential") && tab.pinned === target.pinned);
      return full || !movable ? null : { kind: "join", tab, target, node: theirs };
    }
    if (!ours || target.group || target.hasAttribute("zen-essential")) return null;
    const r = target.getBoundingClientRect();
    return { kind: e.clientY < r.top + r.height / 2 ? "before" : "after", tab, target, node: target };
  },

  mark(what) {
    if (this.marked?.node === what?.node && this.marked?.kind === what?.kind) return;
    this.marked?.node.removeAttribute(`zenith-split-${this.marked.kind}`);
    this.marked = what;
    what?.node.setAttribute(`zenith-split-${what.kind}`, "true");
  },

  apply({ kind, tab, target, whole }) {
    const S = window.gZenViewSplitter;
    if (!S) return;
    try {
      if (whole) {
        if (kind === "before") gBrowser.moveTabBefore(tab, target);
        else gBrowser.moveTabAfter(tab, target);
        return;
      }
      if (kind === "swap") return this.swap(tab, target);
      if (this.split(tab.group)) S.removeTabFromGroup(tab);
      if (kind === "join") return S.splitTabs([target, tab], undefined, -1, { activate: false });
      // Beside a loose tab, as it is: pinned or not.
      if (target.pinned && !tab.pinned) gBrowser.pinTab(tab);
      else if (!target.pinned && tab.pinned) gBrowser.unpinTab(tab);
      if (kind === "before") gBrowser.moveTabBefore(tab, target);
      else gBrowser.moveTabAfter(tab, target);
    } catch (e) {
      console.error("[Zenith] split view: moving a tab", e);
    }
  },

  swap(a, b) {
    const S = window.gZenViewSplitter;
    const data = S?._data?.find(d => d.tabs.includes(a) && d.tabs.includes(b));
    const na = S?.getSplitNodeFromTab?.(a), nb = S?.getSplitNodeFromTab?.(b);
    if (!data || !na || !nb) return false;
    S.swapNodes(na, nb);
    const i = data.tabs.indexOf(a), j = data.tabs.indexOf(b);
    [data.tabs[i], data.tabs[j]] = [data.tabs[j], data.tabs[i]];
    S.applyGridLayout(data.layoutTree);
    const marker = document.createXULElement("box");
    a.before(marker);
    b.before(a);
    marker.replaceWith(b);
    gBrowser.tabContainer._invalidateCachedTabs?.();
    // (Zen saves split views with the session.)
    try {
      S.saveState?.();
    } catch {}
    return true;
  },
};

/* --- Split views: one pane fills the view (Alt+F), and back -------------------
   For a moment's attention, as a tiling window manager's monocle: the pane
   of the tab you're on fills the split's room, the others wait behind it.
   Only how it looks: the tabs stay in their split, nothing moves or
   reloads. Alt+F again, or a tab outside the split, and the split is as
   it was; another tab of the split takes the room instead. */
const SplitSolo = {
  PREF: "zenith.plus.split-solo",

  init() {
    const commandset = document.createXULElement("commandset");
    const command = document.createXULElement("command");
    command.id = "zenith-split-solo-command";
    command.addEventListener("command", () => this.toggle());
    commandset.append(command);
    const keyset = document.createXULElement("keyset");
    const key = document.createXULElement("key");
    key.id = "zenith-split-solo-key";
    key.setAttribute("modifiers", "alt");
    key.setAttribute("key", "F");
    key.setAttribute("reserved", "true");
    key.setAttribute("command", "zenith-split-solo-command");
    keyset.append(key);
    root.append(commandset, keyset);
    const watch = () => {
      const on = Services.prefs.getBoolPref(this.PREF, true);
      key.toggleAttribute("disabled", !on);
      if (!on) this.off();
    };
    const select = () => this.follow();
    Services.prefs.addObserver(this.PREF, watch);
    gBrowser.tabContainer.addEventListener("TabSelect", select);
    // Zen's layout keys (Ctrl+Alt+G/V/H) on a split: its layout only. Zen's
    // own also takes the next tab in the sidebar into the split (past the
    // end, the first one: an essential).
    const S = window.gZenViewSplitter, layout = S?.toggleShortcut;
    if (layout) {
      S.toggleShortcut = function (gridType) {
        const tab = gBrowser.selectedTab, data = gridType !== "unsplit" && !tab?.multiselected ? this._data?.find(d => d.tabs.includes(tab)) : null;
        if (!data) return layout.call(this, gridType);
        try {
          data.gridType = gridType;
          data.layoutTree = this.calculateLayoutTree(data.tabs, gridType);
          this.applyGridLayout(data.layoutTree);
          this.saveState?.();
        } catch (e) {
          console.error("[Zenith] split view: layout", e);
        }
      };
    }
    onUnload(() => {
      if (layout) S.toggleShortcut = layout;
      Services.prefs.removeObserver(this.PREF, watch);
      gBrowser.tabContainer.removeEventListener("TabSelect", select);
      this.off();
      commandset.remove();
      keyset.remove();
    });
    watch();
    window.ZenithSplitSolo = this; // for tools/checks
  },

  split(tab) {
    const g = tab?.group;
    return g?.hasAttribute?.("split-view-group") ? g : null;
  },

  toggle(on = !this.group) {
    if (!on) return this.off();
    const tab = gBrowser.selectedTab, group = this.split(tab);
    if (!group) return hint("Alt+F fills the view with one pane of a split view");
    this.group = group;
    this.mark(tab);
  },

  mark(tab) {
    const panels = gBrowser.tabpanels;
    for (const n of panels.querySelectorAll("[zenith-split-solo]")) n.removeAttribute("zenith-split-solo");
    tab.linkedBrowser?.closest(".browserSidebarContainer")?.setAttribute("zenith-split-solo", "true");
    panels.setAttribute("zenith-solo", "true");
    tab.linkedBrowser?.focus();
  },

  off() {
    this.group = null;
    const panels = gBrowser.tabpanels;
    panels?.removeAttribute("zenith-solo");
    for (const n of panels?.querySelectorAll("[zenith-split-solo]") ?? []) n.removeAttribute("zenith-split-solo");
  },

  follow() {
    if (!this.group) return;
    const tab = gBrowser.selectedTab;
    if (this.split(tab) === this.group) this.mark(tab);
    else this.off();
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

  // This space's colours from a picture (or, from palette sync, every
  // space's, or this one's: `spaces`).
  apply(bitmap, from, spaces = null) {
    const hues = this.palette(bitmap);
    bitmap.close?.();
    const W = window.gZenWorkspaces, picker = window.gZenThemePicker;
    const active = W?.getActiveWorkspace?.();
    spaces ??= active ? [active] : [];
    if (!hues.length || !spaces.length || !picker) {
      hint("Couldn't find colours there");
      return null;
    }
    const colours = this.colours(hues);
    this.previous = spaces.map(s => ({ uuid: s.uuid, theme: structuredClone(s.theme) }));
    const [r, g, b] = colours[0].map(v => v / 255);
    const lightness = Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100);
    const dots = colours.map((c, i) => ({ c, isCustom: false, isPrimary: i === 0, algorithm: "floating", lightness, type: "explicit-lightness" }));
    for (const space of spaces) {
      const opacity = space.theme?.opacity ?? 0.5, texture = space.theme?.texture ?? 0;
      space.theme = picker.constructor.getTheme?.(structuredClone(dots), opacity, texture) ?? { type: "gradient", gradientColors: structuredClone(dots), opacity, texture };
      W.saveWorkspace(space);
    }
    if (active) picker.onWorkspaceChange(active);
    hint(`${spaces.length > 1 ? "Spaces' colours" : "Space colours"} from ${from}: ${colours.length === 1 ? "one colour" : `${colours.length} colours`}`);
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
      // Your wallpaper (the one Zenith draws: Window material › Wallpaper):
      // when it changes, the spaces take its colours.
      if (kind === "wallpaper") {
        if (!Wallpaper.url || !Wallpaper.sig) return;
        const sig = `wallpaper:${Wallpaper.sig}`;
        if (sig === Services.prefs.getStringPref(this.DONE, "")) return;
        const W = window.gZenWorkspaces;
        const all = Services.prefs.getStringPref("zenith.plus.palette-spaces", "") !== "current";
        const spaces = all ? (W?.getWorkspaces?.() ?? []) : [W?.getActiveWorkspace?.()].filter(Boolean);
        const bitmap = await createImageBitmap(await (await fetch(Wallpaper.url)).blob());
        if (ImageColours.apply(bitmap, "your wallpaper", spaces)) Services.prefs.setStringPref(this.DONE, sig);
        return;
      }
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
    // Every space, or only the one you're in (Palette sync colours).
    const all = Services.prefs.getStringPref("zenith.plus.palette-spaces", "") !== "current";
    const spaces = all ? (W.getWorkspaces?.() ?? []) : [W.getActiveWorkspace?.()].filter(Boolean);
    ImageColours.previous = spaces.map(s => ({ uuid: s.uuid, theme: structuredClone(s.theme) }));
    for (const space of spaces) {
      const opacity = space.theme?.opacity ?? 0.5, texture = space.theme?.texture ?? 0;
      space.theme = picker.constructor.getTheme?.(structuredClone(dots), opacity, texture) ?? { type: "gradient", gradientColors: structuredClone(dots), opacity, texture };
      W.saveWorkspace(space);
    }
    const active = W.getActiveWorkspace?.();
    if (active) picker.onWorkspaceChange(active);
    hint(`${all ? "Spaces follow" : "This space follows"} your palette: ${colours.length === 1 ? "one colour" : `${colours.length} colours`}`);
    return true;
  },
};

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

/* --- Extension copies (experimental; Tabs › Extensions › Extension copies) -------
   A second copy of an extension, with an ID of its own, and so its own
   storage: sign into another account in it (a work and a personal password
   manager from the same maker), and give each its spaces with Runs in
   spaces. Right-click an extension › Copy for other spaces: its files are
   copied into your profile folder (zenith-extension-copies), its ID and
   name changed, and Zenith loads the copy as a temporary add-on at every
   start (so Firefox's signature check isn't involved, and nothing in
   about:config changes). The original then runs in the space you're in,
   the copy in the others.
   The catches, shown before a copy is made: a copy doesn't update itself
   (right-click it › Refresh from the original, offered when the original is
   newer), it loads a moment after Zen starts, an extension's desktop app may
   not talk to a copy, and Firefox lists it as temporary. Copies are kept in
   zenith.internal.extension-copies ([{ id, of }]). */
const ExtensionCopies = {
  PREF: "zenith.plus.extension-copies",
  LIST: "zenith.internal.extension-copies",

  get on() {
    return Services.prefs.getBoolPref(this.PREF, false);
  },

  get list() {
    try {
      return JSON.parse(Services.prefs.getStringPref(this.LIST, "[]"));
    } catch {
      return [];
    }
  },

  save(list) {
    Services.prefs.setStringPref(this.LIST, JSON.stringify(list));
  },

  dir(id) {
    return PathUtils.join(PathUtils.profileDir, "zenith-extension-copies", id.replace(/[^\w.@-]/g, "_"));
  },

  AM() {
    return ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager;
  },

  fileOf(path) {
    const f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    f.initWithPath(path);
    return f;
  },

  // As Zen starts (once, in the first window): the copies load.
  async init() {
    window.ZenithExtensionCopies = this; // for tools/checks
    const Startup = sessionStartup();
    if (!this.on || !Startup || Startup.zenithCopiesLoaded) return;
    Startup.zenithCopiesLoaded = true;
    for (const c of this.list) {
      try {
        if (await this.AM().getAddonByID(c.id)) continue;
        if (await IOUtils.exists(this.dir(c.id))) await this.AM().installTemporaryAddon(this.fileOf(this.dir(c.id)));
      } catch (e) {
        console.error("[Zenith] loading an extension copy", c.id, e);
      }
    }
  },

  copyOf(id) {
    return this.list.find(c => c.id === id) ?? null;
  },

  // The original's files: its package (an .xpi) or its folder.
  async files(addon, dest) {
    const root = addon.getResourceURI("").spec;
    await IOUtils.remove(dest, { recursive: true, ignoreAbsent: true });
    await IOUtils.makeDirectory(dest, { createAncestors: true });
    if (root.startsWith("jar:")) {
      const xpi = Services.io.newURI(root.slice(4, root.indexOf("!/"))).QueryInterface(Ci.nsIFileURL).file;
      const zip = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
      zip.open(xpi);
      try {
        for (const name of zip.findEntries("*")) {
          if (name.endsWith("/") || name.startsWith("META-INF/")) continue;
          const target = PathUtils.join(dest, ...name.split("/"));
          await IOUtils.makeDirectory(PathUtils.parent(target), { createAncestors: true, ignoreExisting: true });
          const stream = zip.getInputStream(name);
          const bin = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
          bin.setInputStream(stream);
          const bytes = new Uint8Array(bin.readByteArray(bin.available()));
          stream.close();
          await IOUtils.write(target, bytes);
        }
      } finally {
        zip.close();
      }
    } else {
      const src = Services.io.newURI(root).QueryInterface(Ci.nsIFileURL).file.path;
      for (const child of await IOUtils.getChildren(src)) {
        if (PathUtils.filename(child) === "META-INF") continue;
        await IOUtils.copy(child, dest, { recursive: true });
      }
    }
  },

  // Its manifest, made a copy's: its own ID and name, no updates.
  async rename(dest, id, addon) {
    const file = PathUtils.join(dest, "manifest.json");
    const manifest = JSON.parse(await IOUtils.readUTF8(file));
    let name = manifest.name ?? addon.name;
    if (/^__MSG_/.test(name)) name = addon.name;
    manifest.name = `${name} (copy)`;
    if (manifest.short_name) manifest.short_name = `${manifest.short_name} (copy)`.slice(0, 40);
    for (const key of ["browser_specific_settings", "applications"]) {
      if (!manifest[key]?.gecko) continue;
      delete manifest[key].gecko.update_url;
    }
    manifest.browser_specific_settings = { ...(manifest.browser_specific_settings ?? {}), gecko: { ...(manifest.browser_specific_settings?.gecko ?? manifest.applications?.gecko ?? {}), id } };
    delete manifest.applications;
    delete manifest.update_url;
    await IOUtils.writeUTF8(file, JSON.stringify(manifest, null, 2));
  },

  async make(ext) {
    const addon = await this.AM().getAddonByID(ext);
    if (!addon) return null;
    const id = `${ext.replace(/[{}]/g, "").replace(/@/g, "-at-")}-copy@zenith`;
    if (this.copyOf(id) && (await this.AM().getAddonByID(id))) {
      hint(`${addon.name} already has a copy`);
      return id;
    }
    const dest = this.dir(id);
    await this.files(addon, dest);
    await this.rename(dest, id, addon);
    await this.AM().installTemporaryAddon(this.fileOf(dest));
    this.save([...this.list.filter(c => c.id !== id), { id, of: ext, version: addon.version }]);
    // The original in this space, the copy in the others.
    const S = window.ZenithSpaceExtensions, here = window.gZenWorkspaces?.activeWorkspace;
    const all = S?.spaces().map(s => s.uuid) ?? [];
    if (S && here && all.length > 1) {
      const mine = S.runs[ext] ?? [here];
      S.setRuns(ext, mine);
      S.setRuns(id, all.filter(u => !mine.includes(u)));
    }
    hint(`${addon.name} (copy) made: it runs in your other spaces; the original here`);
    return id;
  },

  // The original updated: the copy takes its files again (its storage stays).
  async refresh(id) {
    const c = this.copyOf(id), addon = c && (await this.AM().getAddonByID(c.of));
    if (!addon) return false;
    const dest = this.dir(id);
    await this.files(addon, dest);
    await this.rename(dest, id, addon);
    await this.AM().installTemporaryAddon(this.fileOf(dest));
    this.save(this.list.map(x => (x.id === id ? { ...x, version: addon.version } : x)));
    hint(`${addon.name} (copy) refreshed`);
    return true;
  },

  async remove(id) {
    try {
      await (await this.AM().getAddonByID(id))?.uninstall();
    } catch {}
    await IOUtils.remove(this.dir(id), { recursive: true, ignoreAbsent: true });
    this.save(this.list.filter(c => c.id !== id));
    window.ZenithSpaceExtensions?.setRuns(id, null);
    hint("Copy removed");
  },

  // The right-click items for an extension (or a copy).
  async items(ext) {
    if (!this.on || !ext) return [];
    const c = this.copyOf(ext);
    if (c) {
      const original = await this.AM().getAddonByID(c.of);
      return [
        ...(original && original.version !== c.version ? [["Refresh from the original", () => this.refresh(ext)]] : []),
        ["Remove this copy", () => this.remove(ext)],
      ];
    }
    return [["Copy for other spaces…", () => this.confirm(ext)]];
  },

  async confirm(ext) {
    const addon = await this.AM().getAddonByID(ext);
    if (!addon) return;
    const ok = Services.prompt.confirmEx(window, "Copy for other spaces (experimental)",
      `A second ${addon.name} with its own storage (sign into another account in it), running in your other spaces while the ` +
      "original runs in this one.\n\nThe catches: the copy doesn't update itself (right-click it › Refresh from the original), " +
      "it loads a moment after Zen starts, the extension's desktop app may not talk to it, and Firefox lists it as temporary.",
      Services.prompt.STD_YES_NO_BUTTONS, null, null, null, null, {}) === 0;
    if (ok) this.make(ext).catch(e => {
      console.error("[Zenith] copying an extension", e);
      hint(`Couldn't copy ${addon.name}`);
    });
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
    // A link that starts Zen: Zen leaves tabs alone while it starts (they'd
    // be the session's), so its rules (or Ask) apply here once it's ready.
    // (A window Zen opened for them as it started: Zenith's scripts may come
    // after Zen is ready.)
    this.startup();
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

  // The links Zen was started with, as the command line hands them to the
  // window: only strings (a window opened for a link from a page gets
  // more: who opened it, and so on).
  startupLinks() {
    const a = window.arguments?.[0];
    const urls = [];
    try {
      if (!(a instanceof Ci.nsIArray)) return [];
      for (let i = 0; i < a.length; i++) {
        const s = a.queryElementAt(i, Ci.nsISupports);
        if (!(s instanceof Ci.nsISupportsString)) return [];
        urls.push(s.data);
      }
    } catch {
      return [];
    }
    return urls.map(u => u.trim()).filter(u => /^https?:/i.test(u));
  },

  async startup() {
    let started = Date.now();
    try {
      started = Services.startup.getStartupInfo().process.getTime();
    } catch {}
    // (Any window Zen restored may be the one; only links from its start.)
    const urls = Date.now() - started < 120000 ? this.startupLinks() : [];
    this.startupState = urls.length ? "links" : "none"; // (for tools/checks)
    if (!urls.length) return;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const wait = async (ok, tries) => {
      for (let i = 0; i < tries && !ok(); i++) await sleep(100);
    };
    await wait(() => window.gZenStartup?.isReady, 300);
    // (Zen's window sync copies a window's first tab to the other windows
    // once it's started: after that, so its copies go when it goes.)
    await Promise.race([window.gZenStartup?.promiseInitialized, sleep(20000)]);
    await sleep(600);
    // (Zen reads its rules from disk as it starts.)
    await wait(() => this.routing()?.getAllRoutes?.().length, 30);
    for (const url of urls) {
      let tabs = [];
      for (let i = 0; i < 100 && !tabs.length; i++) {
        tabs = this.tabsFor(url, started);
        if (!tabs.length) await sleep(150);
      }
      // (Zen may open more than one for it, a moment apart.)
      await sleep(1500);
      tabs = this.tabsFor(url, started);
      this.startupState = `routing ${tabs.length}`;
      if (tabs.length) await this.route(tabs, url).catch(e => console.error("[Zenith] links: a link that started Zen", e));
      this.startupState = `routed ${tabs.length}`;
    }
  },

  // Every tab this start opened for a link, in any window: Zen may open
  // more than one (the window's first tab, one it routes itself, or one
  // that never loads, a link handed on to an app). Found by where it went,
  // the link it started from (links often redirect), what its address bar
  // shows, or the page it's waiting to load.
  tabsFor(url, started = 0) {
    const bare = u => (u || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    const urlsOf = t => {
      const b = t.linkedBrowser, out = [b?.currentURI?.spec, b?.userTypedValue, b?.documentURI?.spec];
      try {
        out.push(SessionStore.getLazyTabValue(t, "url"));
      } catch {}
      try {
        const h = b?.browsingContext?.sessionHistory;
        for (let i = 0; i < (h?.count ?? 0); i++) {
          const e = h.getEntryAtIndex(i);
          out.push(e.originalURI?.spec, e.URI?.spec);
        }
      } catch {}
      return out;
    };
    // (Not one the session brought back with the same page: those were
    // last used before this start. A tab never selected says 0.)
    const fresh = t => t.selected || !(t.lastAccessed > 0 && t.lastAccessed < started);
    const out = [];
    for (const w of Services.wm.getEnumerator("navigator:browser")) {
      if (w.closed || w.zenithFloatFrom) continue;
      // (Every space's: Zen's gBrowser.tabs is the space you're in.)
      for (const t of w.document.querySelectorAll("tab.tabbrowser-tab")) {
        if (t.pinned || t.closing || t.hasAttribute("zen-essential") || t.hasAttribute("zen-empty-tab") || !fresh(t)) continue;
        if (urlsOf(t).some(u => u && bare(u) === bare(url))) out.push(t);
      }
    }
    return out;
  },

  // A link opened from another app, routed as Zen would have: the space
  // its rule (or the default for other links) names, or the card to ask.
  // One tab is kept for it.
  async route(tabs, url) {
    if (!Array.isArray(tabs)) tabs = [tabs];
    const R = this.routing(), uri = Services.io.newURI(url);
    const settle = space => this.settle(tabs, url, space);
    if (R && this.spaces().length > 1 && this.wanted(uri)) {
      return this.ask(uri, () => settle(gZenWorkspaces.getWorkspaceFromId(gZenWorkspaces.activeWorkspace)));
    }
    const id = R && this.spaces().length > 1 ? R.routeUri(url, { fromExternal: true }) : null;
    return settle(gZenWorkspaces.getWorkspaceFromId?.(id) ?? null);
  },

  // One tab for the link: one already in the space (and its container), or
  // the best of them placed there (the one that loaded, in this window);
  // the others close, with their copies in other windows (Zen's window
  // sync makes them).
  async settle(tabs, url, space) {
    tabs = tabs.filter(t => t.isConnected && !t.closing);
    if (!tabs.length) return null;
    const here = t => t.ownerDocument?.defaultView === window;
    // (Only one that loaded counts: one that never did, a link handed on to
    // an app, has no page, and no space Zen can move it from.)
    const alive = t => !!t.linkedPanel && !["", "about:blank"].includes(t.linkedBrowser?.currentURI?.spec ?? "");
    const fits = t => alive(t) && here(t) && (!space || (t.getAttribute("zen-workspace-id") === space.uuid && (!space.containerTabId || t.userContextId === space.containerTabId)));
    const best = tabs.filter(alive).sort((a, b) => here(b) - here(a))[0] ?? null;
    const keep = tabs.find(fits) ?? (space ? this.place(best, url, space) : best ?? gBrowser.addTrustedTab(url, { skipRoute: true }));
    for (const t of tabs) {
      if (t === keep || !t.isConnected || t.closing || (keep.id && t.id === keep.id)) continue;
      const id = t.id;
      t.ownerDocument.defaultView.gBrowser.removeTab(t, { animate: false });
      if (id) for (const ms of [1500, 5000]) setTimeout(() => this.sweep(id, keep), ms);
    }
    if (space && gZenWorkspaces.activeWorkspace !== space.uuid) await gZenWorkspaces.changeWorkspaceWithID(space.uuid);
    if (keep.ownerDocument?.defaultView === window) gBrowser.selectedTab = keep;
    return keep;
  },

  sweep(id, keep) {
    for (const w of Services.wm.getEnumerator("navigator:browser")) {
      for (const t of [...w.document.querySelectorAll("tab.tabbrowser-tab")]) if (t.id === id && t !== keep && !t.closing) w.gBrowser.removeTab(t, { animate: false });
    }
  },

  // Into a space, and its container (a tab can't change container: opened
  // again in it; with no tab, opened there). The tab it's now in.
  place(tab, url, space) {
    if (!tab || (space.containerTabId && (tab.userContextId ?? 0) !== space.containerTabId)) {
      const fresh = gBrowser.addTrustedTab(url, { userContextId: space.containerTabId || 0, skipRoute: true });
      gZenWorkspaces.moveTabToWorkspace(fresh, space.uuid);
      return fresh;
    }
    if (tab.ownerDocument?.defaultView !== window) tab = gBrowser.adoptTab(tab, { selectTab: false }) ?? tab;
    if (tab.getAttribute("zen-workspace-id") !== space.uuid) gZenWorkspaces.moveTabToWorkspace(tab, space.uuid);
    return tab;
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
    // (The same link asked about again: the card already up stays.)
    if (this.pending?.spec === uri.spec) return;
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
    this.pending = { cancel: () => { done(); open(); }, choose, spaces, tick, spec: uri.spec };
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
      // (In another space the card can't always be matched to its tab: the
      // art it had for the same title stays.)
      const title = this.text(card, ".zen-media-title");
      let src = on ? this.artFor(card) : null;
      if (on && !src && title && this.lastArt?.title === title) src = this.lastArt.src;
      if (src) this.lastArt = { title, src };
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
function notice({ title, body, actions = [], ms = 12000 }) {
  let stack = document.getElementById("zenith-toasts");
  if (!stack) {
    stack = el("div", { id: "zenith-toasts" });
    (document.getElementById("zen-main-app-wrapper") ?? document.body).append(stack);
  }
  const card = el("div", { class: "zenith-toast zenith-ai-notice" });
  const head = el("div", { class: "zenith-toast-title" });
  const text = el("div", { class: "zenith-toast-body" });
  head.textContent = title;
  text.textContent = body;
  card.append(head, text);
  const close = () => card.remove();
  if (actions.length) {
    const row = el("div", { class: "zenith-toast-actions" });
    for (const a of actions) {
      const b = el("button", { class: "zenith-toast-button" });
      b.textContent = a.label;
      b.addEventListener("click", e => {
        e.stopPropagation();
        close();
        a.run();
      });
      row.append(b);
    }
    card.append(row);
  }
  card.addEventListener("click", close);
  let timer = setTimeout(close, ms);
  card.addEventListener("mouseenter", () => clearTimeout(timer));
  card.addEventListener("mouseleave", () => (timer = setTimeout(close, 4000)));
  stack.append(card);
  return card;
}

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
 "zenith.tabs.attention-for": "Zenith Tabs",
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

start("first page sooner", () => WarmStart.init(), true);
start("settings", () => {
  migrateSettings();
  migrateCtrlNumbers();
  migrateGlassEdge();
  watchRealProgress();
}, true);
start("motion bridge", () => MotionBridge.init(), true);
start("window state", () => WindowState.init(), true);
start("sidebar hover", () => SidebarHover.init());
start("delete downloads", () => DownloadDelete.init());
start("link hints", () => LinkHints.init(), true);
start("start page", () => StartPage.init(), true);
start("picture-in-picture", () => PiPWindows.init());
start("float a tab", () => FloatTab.init(), true);
start("keys in Zen's shortcuts", () => ZenithKeys.init());
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
start("split solo", () => SplitSolo.init(), true);
start("groups that don't pin", () => UnpinnedGroups.init(), true);
start("bookmarks bar", () => BookmarksBar.init(), true);
start("colours from an image", () => ImageColours.init());
start("palette sync", () => PaletteSync.init());
start("extensions per space", () => SpaceExtensions.init(), true);
start("extension copies", () => ExtensionCopies.init(), true);
start("split view reordering", () => SplitReorder.init());
start("cookies", () => Cookies.init(), true);
start("links from other apps", () => ExternalLinks.init(), true);
start("blend with the page", () => PageBlend.init());
start("notices on top", noticesOnTop, true);
start("core check", checkCore);
