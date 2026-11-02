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

