/* --- Glance's and Peek's buttons -------------------------------------------------
   Where they sit (Panels › Glance's and Peek's buttons): beside the page
   as Zen has them, on the other side, above or below it in a row. And a
   reload button with them. */
const GlanceButtons = {
  PREF: "zenith.plus.glance-buttons", // zen · other-side · top · bottom

  init() {
    const where = () => root.setAttribute("zenith-glance-buttons", Services.prefs.getStringPref(this.PREF, "") || "zen");
    where();
    Services.prefs.addObserver(this.PREF, where);
    // (Zen makes the buttons each time a Glance or Peek opens.)
    const panels = gBrowser.tabpanels;
    const seen = new MutationObserver(list => {
      for (const m of list) for (const n of m.addedNodes) {
        const box = n.nodeType === 1 && (n.matches(".zen-glance-sidebar-container") ? n : n.querySelector?.(".zen-glance-sidebar-container"));
        if (box) this.add(box);
      }
    });
    seen.observe(panels, { childList: true, subtree: true });
    // (Peek's page floats in a host of its own, at the window's top level.)
    const wrapper = document.getElementById("zen-main-app-wrapper");
    const hosts = new MutationObserver(() => setTimeout(() => {
      for (const box of document.querySelectorAll("#zen-glance-detached .zen-glance-sidebar-container")) this.add(box);
    }, 0));
    if (wrapper) hosts.observe(wrapper, { childList: true });
    onUnload(() => {
      hosts.disconnect();
      seen.disconnect();
      Services.prefs.removeObserver(this.PREF, where);
    });
  },

  add(box) {
    if (box.querySelector(".zenith-glance-reload")) return;
    const b = document.createXULElement("toolbarbutton");
    b.className = "zenith-glance-reload toolbarbutton-1";
    b.setAttribute("image", "chrome://global/skin/icons/reload.svg");
    b.setAttribute("tooltiptext", "Reload (F5)");
    b.addEventListener("command", () => {
      const browser = box.parentElement?.querySelector("browser") ?? window.gZenGlanceManager?.detachedBrowser;
      browser?.reload();
    });
    const close = box.querySelector(".zen-glance-sidebar-close");
    close ? close.after(b) : box.append(b);
  },
};

