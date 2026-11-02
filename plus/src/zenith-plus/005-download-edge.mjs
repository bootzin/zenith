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

