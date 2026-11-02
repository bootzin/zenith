/* --- Load edge: real page-load progress ---------------------------------- */

const LoadEdge = {
  state: new WeakMap(), // browser -> { value, loading }
  edges: new WeakMap(), // browser -> its edge, at the top of its tile
  creep: null,

  init() {
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
        if (this.shown(browser)) this.render(browser);
      },
      onProgressChange: (browser, webProgress, request, curSelf, maxSelf, curTotal, maxTotal) => {
        const s = this.state.get(browser);
        if (!s?.loading || maxTotal <= 0) return;
        s.value = Math.max(s.value, 0.1 + 0.85 * Math.min(1, curTotal / maxTotal));
        if (this.shown(browser)) this.render(browser);
      },
    };
    gBrowser.addTabsProgressListener(this.listener);
    const onSelect = () => {
      for (const b of this.visible()) this.render(b, true);
      this.creeping(true);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
    onUnload(() => {
      gBrowser.removeTabsProgressListener(this.listener);
      clearInterval(this.creep);
      gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
    });
  },

  // The browsers on screen: the tab you're on, and the other tiles of its
  // split view (each has its own edge, along its own top).
  visible() {
    const tab = gBrowser.selectedTab, data = window.gZenViewSplitter?._data?.find(d => d.tabs.includes(tab));
    return (data ? data.tabs : [tab]).map(t => t.linkedBrowser).filter(Boolean);
  },

  shown(browser) {
    return browser === gBrowser.selectedBrowser || this.visible().includes(browser);
  },

  // Pages rarely report their total size, so progress also creeps towards
  // 90% on its own while a page on screen loads (the timer stops when none is).
  creeping(on) {
    if (!on || this.creep) return;
    this.creep = setInterval(() => {
      let any = false;
      for (const b of this.visible()) {
        const s = this.state.get(b);
        if (!s?.loading) continue;
        any = true;
        s.value += (0.9 - s.value) * 0.05;
        this.render(b);
      }
      if (!any) {
        clearInterval(this.creep);
        this.creep = null;
      }
    }, 250);
  },

  render(browser = gBrowser.selectedBrowser, jump = false) {
    const tab = gBrowser.getTabForBrowser(browser);
    const panel = tab && document.getElementById(tab.linkedPanel);
    if (!panel) return;
    let edge = this.edges.get(browser);
    if (!edge) {
      edge = el("div", { class: "zenith-load-edge", state: "idle" });
      this.edges.set(browser, edge);
      if (browser === gBrowser.selectedBrowser) edge.id = "zenith-load-edge"; // (the first one: for tools/checks)
    }
    if (edge.parentNode !== panel) {
      panel.prepend(edge);
      jump = true;
    }
    const s = this.state.get(browser) ?? { value: 0, loading: browser.webProgress?.isLoadingDocument };
    edge.toggleAttribute("jump", jump);
    edge.style.setProperty("--zth-load-progress", s.value.toFixed(3));
    const next = s.loading ? "loading" : s.value >= 1 ? "done" : "idle";
    edge.setAttribute("state", next);
    if (next === "done") {
      clearTimeout(edge.doneTimer);
      edge.doneTimer = setTimeout(() => {
        if (this.state.get(browser)?.loading === false) {
          this.state.set(browser, { value: 0, loading: false });
          edge.setAttribute("state", "idle");
        }
      }, 500);
    }
  },
};

