/* --- Minimap: ticks for tabs that need you, while the sidebar is hidden --- */

const Minimap = {
  init() {
    window.ZenithMinimap = this; // for tools/checks
    this.strip = el("div", { id: "zenith-minimap" });
    document.getElementById("zen-tabbox-wrapper")?.append(this.strip);
    const schedule = () => {
      if (!this.pending) {
        this.pending = true;
        requestAnimationFrame(() => {
          this.pending = false;
          this.draw();
        });
      }
    };
    // The minimap shows only in compact mode while the sidebar is away
    // (the CSS decides): otherwise nothing is measured, and only the tab
    // changes it shows (sound, sharing, loading, attention) count.
    const seen = () => Services.prefs.getBoolPref("zenith.plus.minimap", true) && !document.hidden &&
      root.getAttribute("zen-compact-mode") === "true" && !root.hasAttribute("zenith-sidebar-out");
    const maybe = () => seen() && schedule();
    const SHOWN = new Set(["sharing", "attention", "titlechanged", "soundplaying", "muted", "busy"]);
    const changed = e => (e.detail?.changed ?? []).some(a => SHOWN.has(a)) && maybe();
    const tabs = gBrowser.tabContainer;
    const events = ["TabSelect", "TabOpen", "TabClose", "TabMove", "TabPinned", "TabUnpinned"];
    events.forEach(e => tabs.addEventListener(e, maybe));
    tabs.addEventListener("TabAttrModified", changed);
    tabs.addEventListener("scroll", maybe, true);
    window.addEventListener("resize", maybe);
    window.addEventListener("ZenWorkspacesUIUpdate", maybe);
    // On screen again: draw.
    const shown = new MutationObserver(maybe);
    shown.observe(root, { attributeFilter: ["zen-compact-mode", "zenith-sidebar-out"] });
    // Catches folder collapses and anything else that moves tabs, while
    // it's on screen.
    this.interval = setInterval(maybe, 1500);
    onUnload(() => {
      events.forEach(e => tabs.removeEventListener(e, maybe));
      tabs.removeEventListener("TabAttrModified", changed);
      tabs.removeEventListener("scroll", maybe, true);
      window.removeEventListener("resize", maybe);
      window.removeEventListener("ZenWorkspacesUIUpdate", maybe);
      shown.disconnect();
      clearInterval(this.interval);
    });
    maybe();
  },

  // As the tabs show it: no attention dots, no attention ticks; a title
  // that changed counts only if it gets a dot (Sidebar and tabs › Attention dots).
  attentionOn() {
    const P = Services.prefs, v = P.getStringPref("zenith.tabs.attention", "");
    return v ? v === "on" : (P.getStringPref("zenith.tabs.preset", "") || "informative") !== "plain";
  },

  kind(tab) {
    if (tab.hasAttribute("sharing")) return "sharing";
    if (this.attentionOn() && (tab.hasAttribute("attention") ||
        (tab.hasAttribute("titlechanged") && Services.prefs.getStringPref("zenith.tabs.attention-for", "") !== "alerts"))) return "attention";
    if (tab.hasAttribute("soundplaying") && !tab.hasAttribute("muted")) return "playing";
    if (tab.hasAttribute("busy")) return "loading";
    return null;
  },

  draw() {
    const box = this.strip.getBoundingClientRect();
    // Not on screen (the sidebar is shown, or the minimap is off): nothing
    // to measure.
    if (!box.height || document.hidden) return;
    const list = document.querySelector("zen-workspace[active] .workspace-arrowscrollbox") ?? gBrowser.tabContainer;
    const view = list.getBoundingClientRect();
    const ticks = [];
    for (const tab of gBrowser.tabs) {
      const kind = this.kind(tab);
      if (!kind || tab.hasAttribute("zen-glance-tab")) continue;
      // Only the current space (and Essentials) is on screen.
      if (!tab.hasAttribute("zen-essential") && !tab.closest("zen-workspace")?.hasAttribute("active")) continue;
      const r = tab.getBoundingClientRect();
      if (!r.height) continue; // inside a collapsed folder
      let y = r.top + r.height / 2;
      let clamp = "";
      if (y < view.top) [y, clamp] = [view.top + 4, "above"];
      else if (y > view.bottom) [y, clamp] = [view.bottom - 4, "below"];
      ticks.push({ kind, y: y - box.top, h: tab.hasAttribute("zen-essential") ? 6 : Math.max(8, r.height - 12), clamp });
    }
    this.strip.replaceChildren(
      ...ticks.map(t => {
        const tick = el("div", { class: "zenith-tick", kind: t.kind });
        if (t.clamp) tick.setAttribute("clamp", t.clamp);
        tick.style.setProperty("--y", `${Math.round(t.y)}px`);
        tick.style.setProperty("--h", `${Math.round(t.h)}px`);
        return tick;
      })
    );
    this.strip.toggleAttribute("empty", !ticks.length);
  },
};

