/* --- Compact mode: the sidebar stays while a tooltip is under the pointer -------
   Firefox's tooltips are little windows of their own. Moving quickly over
   the sidebar (its downloads list, say), the pointer can land on one as it
   appears: for the window, the pointer has left the sidebar (to nowhere),
   and Zen starts tucking it away under your hand. Such a "leave" with the
   pointer still inside the sidebar is held back; once the pointer is
   really elsewhere (no tooltip open, the sidebar not hovered), Zen is told
   after all. */
const SidebarHover = {
  init() {
    const guard = e => {
      if (e.target !== gNavToolbox || e.relatedTarget || !e.isTrusted) return;
      const r = gNavToolbox.getBoundingClientRect();
      if (e.clientX <= r.left + 1 || e.clientX >= r.right - 1 || e.clientY <= r.top + 1 || e.clientY >= r.bottom - 1) return;
      e.stopImmediatePropagation();
      this.watch();
    };
    window.addEventListener("mouseleave", guard, true);
    onUnload(() => {
      window.removeEventListener("mouseleave", guard, true);
      clearInterval(this.timer);
    });
  },

  // Until the pointer is back on the sidebar (nothing to do) or somewhere
  // else with no tooltip open (Zen gets its leave).
  watch() {
    clearInterval(this.timer);
    let checks = 0, away = 0;
    this.timer = setInterval(() => {
      const tooltip = [...document.querySelectorAll("tooltip")].some(t => t.state === "open" || t.state === "showing");
      if (gNavToolbox.matches(":hover")) away = 0;
      else if (!tooltip) away++;
      if (away >= 2) gNavToolbox.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
      if (away >= 2 || gNavToolbox.matches(":hover") && !tooltip || ++checks > 150) clearInterval(this.timer);
    }, 120);
  },
};

