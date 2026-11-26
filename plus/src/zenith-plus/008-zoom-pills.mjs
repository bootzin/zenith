/* --- Zoom pills: one per pane whose zoom isn't 100% ------------------------
   When you zoom (Zenith › Small touches): a pill on the zoomed pane (it
   stays while the pane isn't at 100%; a click resets it), Zen's toast with
   the new zoom (Zen 1.24.3), both or neither. The setting is on the root
   for the CSS ([zenith-zoom-shows]); Zen's zoom toast is let through only
   when it's wanted. */

const ZoomPills = {
  PREF: "zenith.plus.zoom-shows", // pill · toast · both · neither

  shows() {
    const v = Services.prefs.getStringPref(this.PREF, "");
    return ["pill", "toast", "both", "neither"].includes(v) ? v : "pill";
  },

  init() {
    // (0.18.3's "Zoom pill" switch: off was no pill, which is Zen's toast now.)
    if (Services.prefs.prefHasUserValue("zenith.plus.zoom-pill")) {
      if (!Services.prefs.getBoolPref("zenith.plus.zoom-pill", true) && !Services.prefs.prefHasUserValue(this.PREF)) Services.prefs.setStringPref(this.PREF, "toast");
      Services.prefs.clearUserPref("zenith.plus.zoom-pill");
    }
    const mark = () => root.setAttribute("zenith-zoom-shows", this.shows());
    mark();
    Services.prefs.addObserver(this.PREF, mark);
    onUnload(() => Services.prefs.removeObserver(this.PREF, mark));
    const UI = window.gZenUIManager;
    if (UI?.showToast && !UI.zenithShowToast) {
      const orig = (UI.zenithShowToast = UI.showToast);
      UI.showToast = function (id, ...rest) {
        if (id === "zen-zoom-changed-toast" && !["toast", "both"].includes(ZoomPills.shows())) return;
        return orig.call(this, id, ...rest);
      };
      onUnload(() => {
        UI.showToast = orig;
        delete UI.zenithShowToast;
      });
    }
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

