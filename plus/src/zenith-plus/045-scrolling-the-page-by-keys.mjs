/* --- Scrolling the page by keys (Ctrl+Alt+H/J/K/L) ---------------------------------
   The page's helper (link hints') scrolls what's under the middle of the
   page (a scrolling box there, else the page), smoothly; held, it keeps on. */
const PageScroll = {
  async by(dir) {
    const actor = await PageActors.in(gBrowser.selectedBrowser, "ZenithHints", "link-hints.sys.mjs");
    const step = 80, now = Date.now(), held = now - (this.last ?? 0) < 120;
    this.last = now;
    const [x, y] = { left: [-step, 0], right: [step, 0], up: [0, -step], down: [0, step] }[dir];
    actor?.sendAsyncMessage("scroll", { x, y, smooth: !held });
  },
};

