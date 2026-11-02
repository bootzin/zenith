/* --- Start page (about:zenith-start) -----------------------------------------
   A clock, a search box (Peek's engine) that also finds your bookmarks, and
   the bookmarks with number keys; see-through, on the window's glass. As
   the home page (Firefox's, through the bridge: yours comes back with Off),
   so the Home button and new windows that open the home page show it. The
   page lives in plus/pages; it's registered at once (its text read there
   and then), so a home page restored at start never misses it. */
const StartPage = {
  PREF: "zenith.plus.startpage",
  URL: "about:zenith-start",

  init() {
    this.register();
    // (0.12.0's "On, with the weather" is now On plus its own weather switch.)
    if (Services.prefs.getStringPref(this.PREF, "") === "weather") {
      Services.prefs.setStringPref(this.PREF, "on");
      Services.prefs.setBoolPref("zenith.plus.startpage-weather", true);
    }
    // "on": the home page; "newtab": new tabs too (Zen's URL bar on Ctrl+T
    // gives way to it, and comes back with the rest when it's off).
    const apply = () => {
      const mode = Services.prefs.getStringPref(this.PREF, "");
      const on = !["", "off"].includes(mode), newtab = mode === "newtab";
      Bridge.apply("start", { "browser.startup.homepage": on ? this.URL : null });
      Bridge.apply("start-newtab", { "zen.urlbar.replace-newtab": newtab ? false : null });
      try {
        const { AboutNewTab } = ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs");
        if (newtab && AboutNewTab.newTabURL !== this.URL) AboutNewTab.newTabURL = this.URL;
        else if (!newtab && AboutNewTab.newTabURL === this.URL) AboutNewTab.resetNewTabURL();
      } catch (e) {
        console.error("[Zenith] start page for new tabs", e);
      }
    };
    Services.prefs.addObserver(this.PREF, apply);
    onUnload(() => Services.prefs.removeObserver(this.PREF, apply));
    apply();
  },

  register() {
    return registerAbout("zenith-start", "start.html");
  },
};

// A page of Zenith's own at about:<name> (its file in plus/pages, read
// there and then, so a tab restored at start never meets an unknown page;
// one that did is reloaded).
function registerAbout(name, file) {
  const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
  const read = url => {
    const stream = NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true }).open();
    try {
      return NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" });
    } finally {
      stream.close();
    }
  };
  for (const d of ["../pages/", "zenith-pages/"]) {
    try {
      const url = new URL(`${d}${file}`, import.meta.url).href;
      const text = read(url);
      const about = ChromeUtils.importESModule(new URL(`${d}about.sys.mjs`, import.meta.url).href);
      about.register(name, url, text);
      about.revive(name);
      SessionStore.promiseAllWindowsRestored?.then(() => about.revive(name));
      return true;
    } catch {}
  }
  console.error(`[Zenith] about:${name}: plus/pages isn't there`);
  return false;
}

