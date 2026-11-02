/* --- Bookmarks bar: its own strip ------------------------------------------
   Zen puts the bookmarks bar in the strip above the page that also holds
   the window buttons, and Zenith floats that strip in the top-right corner:
   so the bookmarks only showed beside the window buttons, on a corner hover.
   With the bar on (Ctrl+Shift+B), Zenith can give it its own place:
     zen     where Zen puts it, beside the window buttons (default)
     above   a slim strip across the top of the page, always there
     hover   the same strip over the top of the page, shown when the pointer
             reaches the page's top edge (or a bookmark folder is open)
   The bar itself is moved (it's the same toolbar, so customising it still
   works) and put back for "Zen's own". Firefox's "Import bookmarks…"
   button on it is hidden unless "Import bookmarks button" says Shown. */
const BookmarksBar = {
  PREF: "zenith.plus.bookmarks-bar",
  IMPORT: "zenith.plus.bookmarks-import",

  init() {
    this.bar = document.getElementById("PersonalToolbar");
    if (!this.bar) return;
    this.home = this.bar.parentNode;
    this.homeNext = this.bar.nextSibling;
    const apply = () => this.apply();
    for (const p of [this.PREF, this.IMPORT]) Services.prefs.addObserver(p, apply);
    onUnload(() => {
      for (const p of [this.PREF, this.IMPORT]) Services.prefs.removeObserver(p, apply);
    });
    apply();
  },

  apply() {
    root.toggleAttribute("zenith-import-button", Services.prefs.getStringPref(this.IMPORT, "") === "shown");
    const mode = Services.prefs.getStringPref(this.PREF, "") || "zen";
    const content = document.getElementById("zen-appcontent-wrapper");
    const page = document.getElementById("zen-tabbox-wrapper");
    if (mode === "zen" || !content || !page || page.parentNode !== content) {
      root.removeAttribute("zenith-bookmarks");
      if (this.bar.parentNode !== this.home) this.home.insertBefore(this.bar, this.homeNext?.parentNode === this.home ? this.homeNext : null);
      return;
    }
    // Above the page: just before it. Over the page: inside it, at its top.
    if (mode === "hover") {
      if (this.bar.parentNode !== page) page.prepend(this.bar);
    } else if (this.bar.nextSibling !== page) {
      content.insertBefore(this.bar, page);
    }
    root.setAttribute("zenith-bookmarks", mode);
  },
};

