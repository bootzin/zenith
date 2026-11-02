/* --- The Dash, on demand (plus/pages/dash.mjs) --------------------------------------
   Alt+N, or the bar's clock: imported the first time it opens. */
const DashLoader = {
  async toggle(anchor = null) {
    // (It opens where Bars › Where the Dash opens says, whatever asked.)
    try {
      this.mod ??= await import(await BarLoader.page("dash.mjs"));
      this.mod.toggle({ anchor, Bridge });
    } catch (e) {
      console.error("[Zenith] Dash", e);
    }
  },
};
window.ZenithDash = DashLoader; // the bar's clock, tools/checks

