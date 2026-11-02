/* --- The first page, sooner ----------------------------------------------------
   As Zen starts, the page you were on is loaded only once Firefox restores
   the session (a second or two in). Zenith opens the connection to its site
   straight away (the name looked up, connected, the secure handshake done),
   as Firefox itself does for a link you're about to click, so the page
   starts arriving the moment Firefox asks for it. Once per run of Zen,
   nothing is loaded, and nothing happens if the page isn't on the web. */
const WarmStart = {
  async init() {
    window.ZenithWarmStart = this; // for tools/checks
    // (0.12.2's picture of the last page is gone, and so is the picture.)
    if (Services.prefs.prefHasUserValue("zenith.internal.last-page")) {
      Services.prefs.clearUserPref("zenith.internal.last-page");
      Services.prefs.clearUserPref("zenith.plus.last-page");
      IOUtils.remove(PathUtils.join(PathUtils.profileDir, "zenith-last-page.jpg"), { ignoreAbsent: true }).catch(() => {});
    }
    try {
      const SessionStartup = sessionStartup();
      if (!SessionStartup || SessionStartup.zenithWarmed) return;
      SessionStartup.zenithWarmed = true;
      await SessionStartup.onceInitialized;
      const state = SessionStartup.state;
      const win = state?.windows?.[Math.max(0, (state.selectedWindow ?? 1) - 1)] ?? state?.windows?.[0];
      const tab = win?.tabs?.[Math.max(0, (win.selected ?? 1) - 1)];
      const entry = tab?.entries?.[Math.max(0, (tab.index ?? tab.entries?.length ?? 1) - 1)];
      const url = entry?.url;
      if (!url || !/^https?:/.test(url)) return;
      const uri = Services.io.newURI(url);
      const principal = Services.scriptSecurityManager.createContentPrincipal(uri, { userContextId: tab.userContextId ?? 0 });
      Services.io.QueryInterface(Ci.nsISpeculativeConnect).speculativeConnect(uri, principal, null, false);
      this.warmed = uri.host;
    } catch (e) {
      console.error("[Zenith] warm start", e);
    }
  },
};

