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

