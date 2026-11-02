/* --- Zenith's helpers inside web pages ----------------------------------------
   Window actors from plus/pages, registered the first time they're needed
   (once per run of Zen: every window shares them). Firefox lets an actor
   into a web page's process only when it says it's safe there; Zenith's
   only draw on or restyle the page, and take nothing from it. */
const PageActors = {
  ready: new Map(),

  async url(file) {
    for (const d of ["../pages/", "zenith-pages/"]) {
      const u = new URL(`${d}${file}`, import.meta.url).href;
      if (await fetch(u).then(r => r.ok, () => false)) return u;
    }
    return null;
  },

  // A child only, in every page of some sites, from the page's start.
  async child(name, file, events, matches) {
    const url = await this.url(file);
    if (!url) return;
    try {
      ChromeUtils.registerWindowActor(name, { child: { esModuleURI: url, events }, matches, safeForUntrustedWebProcess: true });
    } catch (e) {
      if (e.name !== "NotSupportedError") console.error(`[Zenith] ${name}`, e); // (another window registered it)
    }
  },

  register(name, file) {
    if (!this.ready.has(name)) {
      this.ready.set(name, (async () => {
        const url = await this.url(file);
        if (!url) throw new Error(`plus/pages/${file} isn't there`);
        try {
          ChromeUtils.registerWindowActor(name, { parent: { esModuleURI: url }, child: { esModuleURI: url }, safeForUntrustedWebProcess: true });
        } catch (e) {
          if (e.name !== "NotSupportedError") throw e; // (another window registered it)
        }
      })());
    }
    return this.ready.get(name);
  },

  // The actor in a tab's page, or null (not a web page, or gone).
  async in(browser, name, file) {
    await this.register(name, file);
    try {
      return browser?.browsingContext?.currentWindowGlobal?.getActor(name) ?? null;
    } catch {
      return null;
    }
  },
};

