/* --- Not-secure hint: a hover strip along the amber edge ------------------
   The amber edge itself is CSS; this only adds a thin strip at the top of
   the current tab's pane so hovering the edge can show a label. The CSS
   shows the strip only while the edge is on. */

const InsecureHint = {
  init() {
    this.hint = el("div", { id: "zenith-insecure-hint" });
    const place = () => {
      const panel = document.getElementById(gBrowser.selectedTab.linkedPanel);
      if (panel && this.hint.parentNode !== panel) panel.append(this.hint);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", place);
    onUnload(() => gBrowser.tabContainer.removeEventListener("TabSelect", place));
    place();
  },
};

