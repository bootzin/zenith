/* Zenith's own about: pages, for the whole browser (not one window): each
   address shows a page shipped with the mod (plus/pages), with the
   browser's full rights, like about:preferences. The page's own text is
   handed over with a <base> at the mod's folder, so its styles and script
   load from there while the address stays about:<name>. Registered once;
   the first window to start asks for them. */

const pages = new Map(); // name → the page's text

export function register(name, url, text) {
  const contract = `@mozilla.org/network/protocol/about;1?what=${name}`;
  const base = url.slice(0, url.lastIndexOf("/") + 1);
  pages.set(name, text.replace(/<head>/i, `<head><base href="${base}" />`));
  if (contract in Cc) return false; // (already: the text is updated above)
  const module = {
    QueryInterface: ChromeUtils.generateQI(["nsIAboutModule"]),
    newChannel(uri, loadInfo) {
      const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
      stream.setUTF8Data(pages.get(name));
      const channel = Cc["@mozilla.org/network/input-stream-channel;1"].createInstance(Ci.nsIInputStreamChannel);
      channel.setURI(uri);
      channel.contentStream = stream;
      const ch = channel.QueryInterface(Ci.nsIChannel);
      ch.loadInfo = loadInfo;
      ch.contentType = "text/html";
      ch.contentCharset = "UTF-8";
      ch.owner = Services.scriptSecurityManager.getSystemPrincipal();
      return ch;
    },
    getURIFlags() {
      return Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.IS_SECURE_CHROME_UI;
    },
    getChromeURI() {
      return Services.io.newURI(url);
    },
  };
  Components.manager.QueryInterface(Ci.nsIComponentRegistrar)
    .registerFactory(Services.uuid.generateUUID(), `Zenith about:${name}`, contract, { createInstance: iid => module.QueryInterface(iid) });
  return true;
}

// Tabs that met the page before it was registered (the tab you were on,
// restored as Zen starts, before the mod's scripts run): Firefox put them
// in a web page process, where the page doesn't exist, or showed an error.
// They load again here, in the browser itself. Tabs not loaded yet (asleep)
// are left to load when you go to them.
export function revive(name) {
  const { E10SUtils } = ChromeUtils.importESModule("resource://gre/modules/E10SUtils.sys.mjs");
  const system = Services.scriptSecurityManager.getSystemPrincipal();
  let n = 0;
  for (const win of Services.wm.getEnumerator("navigator:browser")) {
    for (const tab of win.gBrowser?.tabs ?? []) {
      const b = tab.linkedBrowser, spec = b?.currentURI?.spec ?? "";
      if (!spec.startsWith(`about:${name}`) || tab.hasAttribute("pending")) continue;
      const failed = b.isRemoteBrowser || b.documentURI?.spec?.startsWith("about:neterror") || b.documentURI?.spec?.startsWith("about:blank");
      if (!failed) continue;
      try {
        if (b.isRemoteBrowser) win.gBrowser.updateBrowserRemoteness(b, { remoteType: E10SUtils.NOT_REMOTE });
        b.loadURI(Services.io.newURI(spec), { triggeringPrincipal: system });
        n++;
      } catch (e) {
        console.error(`[Zenith] about:${name} after the start`, e);
      }
    }
  }
  return n;
}
