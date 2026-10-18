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
