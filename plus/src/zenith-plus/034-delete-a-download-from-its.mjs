/* --- Delete a download from its list ---------------------------------------------
   A bin button beside "Show in folder" on each finished download: in the
   sidebar's downloads list (the Library button's list), in Zen's Library
   (Downloads) and in Firefox's Library window. One click deletes the file
   and takes it off the list; or two (Panels › Downloads), the first turning
   the bin red to ask; or no button at all. */
const DownloadDelete = {
  PREF: "zenith.plus.download-delete",

  init() {
    this.adds = [];
    this.watchSidebar();
    this.watchLibrary();
    // Off takes the buttons away (here and in the Library window); on again
    // puts them back.
    const mode = () => {
      if (this.mode === "off") {
        for (const w of [window, ...Services.wm.getEnumerator("Places:Organizer")]) {
          for (const b of w.document.querySelectorAll(".zenith-download-delete")) b.remove();
        }
      } else {
        for (const add of this.adds) add();
      }
    };
    Services.prefs.addObserver(this.PREF, mode);
    onUnload(() => Services.prefs.removeObserver(this.PREF, mode));
    this.listener = { onOpenWindow: x => {
      const w = x.docShell.domWindow;
      w.addEventListener("load", () => w.location.href.startsWith("chrome://browser/content/places/places.xhtml") && this.watchLibraryWindow(w), { once: true });
    }, onCloseWindow() {} };
    Services.wm.addListener(this.listener);
    onUnload(() => Services.wm.removeListener(this.listener));
    window.ZenithDownloadDelete = this; // for tools/checks
  },

  // The file goes and so does its line in the list; the page it came from
  // leaves your history too only if Firefox's own Delete is set to do that.
  async remove(download) {
    const clear = Math.max(1, Services.prefs.getIntPref("browser.download.clearHistoryOnDelete", 0));
    await window.DownloadsCommon.deleteDownloadFiles(download, clear);
  },

  // How many clicks a delete takes: "" one · "confirm" two · "off" none
  // (no buttons).
  get mode() {
    return Services.prefs.getStringPref(this.PREF, "");
  },

  // A bin button. With two clicks: the first turns it red and asks, the
  // second (within three seconds, on the same download) deletes. Zen
  // reuses rows for other downloads, so the asking is tied to the
  // download it was for, and ends after a delete.
  button(doc, getDownload, xul = true) {
    const b = xul ? doc.createXULElement("toolbarbutton") : doc.createElement("button");
    b.className = xul ? "toolbarbutton-1 zenith-download-delete" : "zenith-download-delete";
    const img = xul ? doc.createXULElement("image") : doc.createElement("img");
    img.className = "toolbarbutton-icon";
    img.setAttribute("src", "chrome://browser/skin/zen-icons/trash.svg");
    b.append(img);
    const tip = text => {
      b.setAttribute("tooltiptext", text);
      b.setAttribute("title", text);
    };
    const calm = () => {
      doc.defaultView?.clearTimeout(b.zenithTimer);
      b.removeAttribute("confirm");
      b.zenithFor = null;
      tip("Delete the file");
    };
    b.zenithCalm = calm;
    calm();
    b.addEventListener("click", e => {
      e.stopPropagation();
      e.preventDefault();
      const d = getDownload();
      if (!d) return;
      if (this.mode === "confirm" && b.zenithFor !== d) {
        calm();
        b.setAttribute("confirm", "true");
        b.zenithFor = d;
        tip("Click again to delete the file (it can't be brought back)");
        b.zenithTimer = doc.defaultView?.setTimeout(calm, 3000);
        return;
      }
      calm();
      this.remove(d).catch(err => console.error("[Zenith] deleting a download", err));
    });
    return b;
  },

  finished: d => d?.succeeded && !d.error && d.target?.exists !== false,

  // The sidebar's list: each row knows its download.
  watchSidebar() {
    const add = () => {
      if (this.mode === "off") return;
      for (const row of document.querySelectorAll("#zen-library-download-list .zen-library-download-list-download")) {
        const had = row.querySelector(".zenith-download-delete");
        if (had && had.zenithFor && had.zenithFor !== row.download) had.zenithCalm?.();
        if (had || !this.finished(row.download)) continue;
        const show = row.querySelector(".zen-library-download-action");
        const b = this.button(document, () => row.download);
        if (show) show.after(b);
        else row.append(b);
      }
    };
    this.adds.push(add);
    const watcher = new MutationObserver(add);
    const start = () => {
      const list = document.getElementById("zen-library-download-list");
      if (!list) return false;
      watcher.observe(list, { childList: true, subtree: true });
      add();
      return true;
    };
    if (!start()) {
      const foot = document.getElementById("zen-sidebar-foot-buttons");
      const later = new MutationObserver(() => start() && later.disconnect());
      if (foot) later.observe(foot, { childList: true, subtree: true });
      onUnload(() => later.disconnect());
    }
    onUnload(() => watcher.disconnect());
  },

  // Zen's Library, Downloads: its rows don't carry their download, so each
  // is found by its file name (and where it came from). (Its sections draw
  // inside shadow roots: they're searched, and watched, too.)
  watchLibrary() {
    const lib = document.querySelector("zen-library");
    if (!lib) return;
    const roots = () => {
      const out = [lib];
      for (let i = 0; i < out.length; i++) {
        for (const n of out[i].querySelectorAll("*")) if (n.shadowRoot) out.push(n.shadowRoot);
        if (out[i].shadowRoot) out.push(out[i].shadowRoot);
      }
      return [...new Set(out)];
    };
    const watched = new WeakSet();
    const add = async () => {
      for (const r of roots()) {
        if (watched.has(r)) continue;
        watched.add(r);
        watcher.observe(r, { childList: true, subtree: true });
      }
      if (this.mode === "off") return;
      const rows = roots().flatMap(r => [...r.querySelectorAll(".zen-library-row")])
        .filter(r => !r.querySelector(".zenith-download-delete") && r.querySelector(".zen-library-download-url, .zen-library-download-status"));
      if (!rows.length) return;
      const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
      const all = (await (await Downloads.getList(Downloads.ALL)).getAll()).filter(d => this.finished(d));
      for (const row of rows) {
        const name = row.querySelector(".zen-library-row-title")?.textContent.trim();
        const from = row.querySelector(".zen-library-download-url")?.textContent.trim() ?? "";
        const find = () => all.find(d => PathUtils.filename(d.target.path) === name && (!from || (d.source?.url ?? "").includes(from)));
        if (!name || !find() || row.querySelector(".zenith-download-delete")) continue;
        const actions = row.querySelector(".zen-library-row-actions");
        const more = actions?.querySelector("[data-l10n-id='library-downloads-more-button']");
        const b = this.button(document, find);
        if (more) more.before(b);
        else actions?.append(b);
      }
    };
    this.adds.push(add);
    const watcher = new MutationObserver(() => {
      clearTimeout(this.libTimer);
      this.libTimer = setTimeout(add, 60);
    });
    add();
    onUnload(() => watcher.disconnect());
  },

  // Firefox's Library window (Manage downloads).
  watchLibraryWindow(w) {
    const doc = w.document;
    const add = () => {
      if (this.mode === "off") return;
      for (const item of doc.querySelectorAll("#downloadsListBox richlistitem")) {
        const d = item._shell?.download;
        if (item.querySelector(".zenith-download-delete") || !this.finished(d)) continue;
        const b = this.button(doc, () => item._shell?.download);
        (item.querySelector(".downloadButton") ?? item.lastElementChild)?.before(b);
      }
    };
    const box = doc.getElementById("downloadsListBox");
    if (!box) return;
    this.adds.push(add);
    w.addEventListener("unload", () => (this.adds = this.adds.filter(a => a !== add)), { once: true });
    new MutationObserver(add).observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["state"] });
    add();
  },
};

