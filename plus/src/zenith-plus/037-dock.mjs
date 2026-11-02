/* --- Dock: the edge the sidebar sits on ----------------------------------------
   One answer, for every script, to "which edge is the bar on" (left, right;
   top when Zen's tabs aren't vertical), and one way to move it: Zen's own
   setting, so Zen lays out the window around it (window buttons included).
   Scripts ask ZenithDock.edge, .near (the page's side beside the bar) and
   .far, and hear "ZenithDock" on the window when it moves. Zenith's CSS
   reads Zen's [zen-right-side] itself (nothing to wait for at start).
   Groundwork for a tiling layout, where the bar can sit on any edge. */
const Dock = {
  init() {
    this.last = this.edge;
    const moved = new MutationObserver(() => {
      if (this.edge === this.last) return;
      this.last = this.edge;
      window.dispatchEvent(new CustomEvent("ZenithDock", { detail: { edge: this.last } }));
    });
    moved.observe(root, { attributeFilter: ["zen-right-side"] });
    onUnload(() => moved.disconnect());
    window.ZenithDock = this;
  },

  get edge() {
    if (!Services.prefs.getBoolPref("zen.tabs.vertical", true)) return "top";
    return root.getAttribute("zen-right-side") === "true" ? "right" : "left";
  },

  get near() {
    return this.edge === "right" ? "right" : "left";
  },

  get far() {
    return this.near === "left" ? "right" : "left";
  },

  set(edge) {
    Services.prefs.setBoolPref("zen.tabs.vertical.right-side", edge === "right");
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
      const push = Dock.edge === "right" ? window.innerWidth - tb.offsetLeft : tb.offsetLeft + tb.offsetWidth;
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

