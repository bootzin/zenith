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

