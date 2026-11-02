// ==UserScript==
// @name           Zenith Plus
// @description    Zenith Plus: real load and download progress, the sidebar minimap, zoom pills, page colours, the matching sidebar colour and more.
// @include        main
// @version        0.18.1
// ==/UserScript==
// SPDX-License-Identifier: GPL-3.0-or-later

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

const ZENITH_VERSION = "0.18.1"; // (tools/bump_version.py keeps it)
window.ZenithVersion = ZENITH_VERSION; // about:zenith-fetch, the rice file
const HTML_NS = "http://www.w3.org/1999/xhtml";
const root = document.documentElement;

// A space's tabs as its sidebar shows them, by Zen's own rule: its own tabs,
// and the essentials, each space only its container's when Zen keeps them
// apart (Zen › Separate essentials, by default). The bar, the Dash, the
// switcher and the tab manager ask this.
window.ZenithSpaceTabs = {
  shows(tab, uuid = window.gZenWorkspaces?.activeWorkspace) {
    const W = window.gZenWorkspaces;
    if (!W || !uuid) return true;
    if (tab.hasAttribute("zen-essential")) {
      if (!W.containerSpecificEssentials) return true;
      const spaces = W.getWorkspaces?.() ?? [];
      const container = spaces.find(s => s.uuid === uuid)?.containerTabId || 0;
      const own = parseInt(tab.getAttribute("usercontextid") || "0", 10) || 0;
      return container ? own === container : !own || !spaces.some(s => s.containerTabId === own);
    }
    const id = tab.getAttribute("zen-workspace-id");
    return !id || id === uuid;
  },

  // Where a tab shows: its space, or for an essential the first space of its
  // container (Zen's choice when you go to it); null when it shows here.
  home(tab) {
    const W = window.gZenWorkspaces;
    if (!W || this.shows(tab)) return null;
    return (W.getWorkspaces?.() ?? []).find(s => this.shows(tab, s.uuid)) ?? null;
  },

  // This space's tabs in the sidebar's order: essentials, pinned (folders'
  // too), then the rest.
  tabs(uuid) {
    const W = window.gZenWorkspaces;
    const rank = t => (t.hasAttribute("zen-essential") ? 0 : t.pinned ? 1 : 2);
    return [...new Set(W?.allStoredTabs ?? gBrowser.tabs)]
      .filter(t => t.isConnected && !t.closing && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("zen-glance-tab") && this.shows(t, uuid))
      .sort((a, b) => rank(a) - rank(b) || a._tPos - b._tPos);
  },

  // Go to a tab, in whatever space it shows (an essential of another
  // container: that container's space, as Zen does).
  go(tab) {
    const W = window.gZenWorkspaces;
    if (W?.switchTabIfNeeded && !this.shows(tab)) return W.switchTabIfNeeded(tab);
    gBrowser.selectedTab = tab;
    return Promise.resolve();
  },
};
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

