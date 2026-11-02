/* --- Cookies: banners, rules, and a page for each site's ---------------------------
   Zenith › Cookies, and about:zenith-cookies (:cookies in the switcher):
     Banners   consent banners answered for you (plus/pages/cookies.sys.mjs:
               Reject pressed; a banner with no Reject hidden, if you like);
               sites left alone in zenith.plus.cookie-banners-skip.
     Policy    Firefox's own cookie setting, through the bridge (yours comes
               back with "Firefox's own"): cross-site cookies, trackers, or
               every cookie but the sites you allow.
     Keep      until they expire (Firefox's way) or until you close Zen,
               except the sites you allow: Firefox clears cookies and site
               data on closing, and only those (history, downloads, the
               cache and the rest are explicitly kept).
     Per site  Allow, Until you close Zen, Block, or as the policy says:
               Firefox's own cookie exceptions (Settings › Privacy shows
               them too); and deleting a site's cookies and data.
     Notices   the first time Zenith does something on a site (this run of
               Zen): a banner refused or hidden, or cookies blocked beyond
               what Firefox blocks on its own; each with Undo, which leaves
               that site alone (so no site stays broken by it).
   Firefox does the keeping and blocking; Zenith only sets it up. Nothing
   from private windows is kept, not even in the page's "lately". */
const Cookies = {
  BANNERS: "zenith.plus.cookie-banners", // "" reject (else hide) · reject · hide · off
  SKIP: "zenith.plus.cookie-banners-skip",
  POLICY: "zenith.plus.cookie-policy", // "" Firefox's own · cross · trackers · all
  KEEP: "zenith.plus.cookie-keep", // "" until they expire · session
  NOTICES: "zenith.plus.cookie-notices",
  URL: "about:zenith-cookies",
  RULES: { allow: Ci.nsIPermissionManager.ALLOW_ACTION, session: 8 /* ACCESS_SESSION */, block: Ci.nsIPermissionManager.DENY_ACTION },

  init() {
    this.register();
    const banners = () => this.banners();
    const policy = () => this.policy();
    Services.prefs.addObserver(this.BANNERS, banners);
    Services.prefs.addObserver(this.POLICY, policy);
    Services.prefs.addObserver(this.KEEP, policy);
    onUnload(() => {
      Services.prefs.removeObserver(this.BANNERS, banners);
      Services.prefs.removeObserver(this.POLICY, policy);
      Services.prefs.removeObserver(this.KEEP, policy);
    });
    banners();
    policy();
    // Cookies blocked beyond Firefox's own blocking: told, with Undo.
    this.blocking = { onContentBlockingEvent: (browser, webProgress, request, event) => webProgress?.isTopLevel !== false && this.blocked(browser, event) };
    gBrowser.addTabsProgressListener(this.blocking);
    onUnload(() => gBrowser.removeTabsProgressListener(this.blocking));
    const commandset = document.createXULElement("commandset");
    const command = document.createXULElement("command");
    command.id = "zenith-cookies-command";
    command.addEventListener("command", () => this.open());
    commandset.append(command);
    root.append(commandset);
    window.ZenithCookies = this; // the page, the switcher's :cookies, and tools/checks
  },

  // The banner answerer, in every page and frame (registered while it's on).
  banners() {
    if (Services.prefs.getStringPref(this.BANNERS, "") === "off" || Cookies.actorReady) return;
    Cookies.actorReady = (async () => {
      for (const d of ["../pages/", "zenith-pages/"]) {
        const url = new URL(`${d}cookies.sys.mjs`, import.meta.url).href;
        if (!(await fetch(url).then(r => r.ok, () => false))) continue;
        this.actorURL = url;
        try {
          ChromeUtils.registerWindowActor("ZenithCookies", {
            parent: { esModuleURI: url },
            child: { esModuleURI: url, events: { DOMContentLoaded: {}, pageshow: {} } },
            allFrames: true,
            matches: ["http://*/*", "https://*/*"],
            safeForUntrustedWebProcess: true,
          });
        } catch (e) {
          if (e.name !== "NotSupportedError") console.error("[Zenith] cookie banners", e); // (another window registered it)
        }
        return true;
      }
      console.error("[Zenith] cookie banners: plus/pages isn't there");
      return false;
    })();
  },

  // Firefox's own settings, through the bridge.
  policy() {
    const P = Services.prefs;
    const behaviour = { cross: 1, trackers: 4, all: 2 }[P.getStringPref(this.POLICY, "")] ?? null;
    Bridge.apply("cookie-policy", { "network.cookie.cookieBehavior": behaviour, "network.cookie.cookieBehavior.pbmode": behaviour });
    const session = P.getStringPref(this.KEEP, "") === "session";
    const v = on => (session ? on : null);
    // Cookies and site data cleared on closing, and nothing else.
    Bridge.apply("cookie-keep", {
      "privacy.sanitize.sanitizeOnShutdown": v(true),
      "privacy.clearOnShutdown_v2.cookiesAndStorage": v(true),
      "privacy.clearOnShutdown_v2.historyFormDataAndDownloads": v(false),
      "privacy.clearOnShutdown_v2.browsingHistoryAndDownloads": v(false),
      "privacy.clearOnShutdown_v2.formdata": v(false),
      "privacy.clearOnShutdown_v2.cache": v(false),
      "privacy.clearOnShutdown_v2.siteSettings": v(false),
      "privacy.clearOnShutdown.cookies": v(true),
      "privacy.clearOnShutdown.offlineApps": v(true),
      "privacy.clearOnShutdown.history": v(false),
      "privacy.clearOnShutdown.formdata": v(false),
      "privacy.clearOnShutdown.downloads": v(false),
      "privacy.clearOnShutdown.sessions": v(false),
      "privacy.clearOnShutdown.cache": v(false),
      "privacy.clearOnShutdown.siteSettings": v(false),
    });
  },

  /* Notices */

  // Told once per site and thing this run of Zen (shared by every window).
  async firstTime(site, what) {
    let told;
    try {
      told = ChromeUtils.importESModule(this.actorURL ?? new URL("../pages/cookies.sys.mjs", import.meta.url).href).told;
    } catch {
      told = Cookies.told ??= new Set();
    }
    const key = `${site} ${what}`;
    if (told.has(key)) return false;
    told.add(key);
    return true;
  },

  noticesOn() {
    return Services.prefs.getBoolPref(this.NOTICES, true);
  },

  // A banner answered (from the page's actor).
  async acted(browser, data, actor) {
    const site = this.site(data?.host);
    if (!site || !this.noticesOn() || !(await this.firstTime(site, data.how))) return;
    const rejected = data.how === "rejected", tool = data.tool && data.tool !== "banner" ? ` (${data.tool})` : "";
    notice({
      title: rejected ? `Cookies refused on ${site}` : `Cookie banner hidden on ${site}`,
      body: rejected ? `Zenith pressed Reject${tool}. Undo forgets that answer and leaves this site's banners to you.`
                     : `It had no Reject button${tool}. Undo shows it again and leaves this site's banners to you.`,
      actions: [
        { label: "Undo", run: () => this.undoBanner(browser, site, rejected, actor) },
        { label: "Cookies…", run: () => this.open(site) },
      ],
    });
  },

  async undoBanner(browser, site, rejected, actor) {
    this.setBannersLeftAlone(site, true);
    try {
      actor?.sendAsyncMessage?.("undo");
    } catch {}
    if (!rejected) return;
    // (The answer the site stored goes, so it asks again.)
    await this.remove(site);
    browser?.reload?.();
  },

  // Firefox told the tab cookies were blocked: beyond its own blocking (a
  // stricter policy of Zenith's), the first time on this site.
  async blocked(browser, event) {
    const F = Ci.nsIWebProgressListener;
    if (!this.noticesOn()) return;
    const kind = event & F.STATE_COOKIES_BLOCKED_ALL ? "all" : event & F.STATE_COOKIES_BLOCKED_FOREIGN ? "cross"
      : event & (F.STATE_COOKIES_BLOCKED_TRACKER | F.STATE_COOKIES_BLOCKED_SOCIALTRACKER) ? "trackers" : null;
    if (!kind) return;
    const site = this.site(browser?.currentURI?.host);
    if (!site || this.rules().get(site) === "allow" || !(await this.firstTime(site, kind))) return;
    notice({
      title: `Cookies blocked on ${site}`,
      body: kind === "all" ? "Every cookie is blocked except on the sites you allow. If this site doesn't work as it should, allow it."
        : kind === "cross" ? "Cookies from other sites are blocked here. If something on this site doesn't work (a login, a video), allow them."
        : "Trackers' cookies are blocked here. If something on this site doesn't work, allow them.",
      actions: [
        { label: "Allow on this site", run: () => this.allowHere(browser, site, kind) },
        { label: "Cookies…", run: () => this.open(site) },
      ],
    });
  },

  async allowHere(browser, site, kind) {
    if (kind === "all") this.setRule(site, "allow");
    else {
      try {
        const { ContentBlockingAllowList } = ChromeUtils.importESModule("resource://gre/modules/ContentBlockingAllowList.sys.mjs");
        ContentBlockingAllowList.add(browser);
      } catch {
        this.setRule(site, "allow");
      }
    }
    browser?.reload?.();
  },

  /* Sites */

  site(host) {
    host = (host || "").replace(/^\./, "");
    try {
      return Services.eTLD.getBaseDomainFromHost(host);
    } catch {
      return host;
    }
  },

  // Every site with cookies: { site, count, rule }, most cookies first.
  sites() {
    const by = new Map();
    for (const c of Services.cookies.cookies) {
      if (c.originAttributes?.privateBrowsingId) continue;
      const site = this.site(c.host);
      const e = by.get(site) ?? { site, count: 0 };
      e.count++;
      by.set(site, e);
    }
    const rules = this.rules();
    for (const site of rules.keys()) if (!by.has(site)) by.set(site, { site, count: 0 });
    return [...by.values()].map(e => ({ ...e, rule: rules.get(e.site) ?? "" })).sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
  },

  // The rule each site has: allow · session · block.
  rules() {
    const names = new Map(Object.entries(this.RULES).map(([k, v]) => [v, k]));
    const out = new Map();
    for (const p of Services.perms.getAllByTypes(["cookie"])) {
      const name = names.get(p.capability);
      if (name) out.set(this.site(p.principal.host), name);
    }
    return out;
  },

  // A site's rule (both http and https, which covers its subdomains), or
  // none: as the policy says.
  setRule(site, rule) {
    for (const scheme of ["https", "http"]) {
      const principal = Services.scriptSecurityManager.createContentPrincipalFromOrigin(`${scheme}://${site}`);
      Services.perms.removeFromPrincipal(principal, "cookie");
      if (this.RULES[rule] != null) Services.perms.addFromPrincipal(principal, "cookie", this.RULES[rule]);
    }
  },

  // A site's cookies and the data it keeps (as Firefox's "Clear cookies
  // and site data").
  remove(site) {
    try {
      const { told } = ChromeUtils.importESModule(this.actorURL ?? new URL("../pages/cookies.sys.mjs", import.meta.url).href);
      for (const key of [...told]) if (key.startsWith(`${site} `)) told.delete(key);
    } catch {}
    for (const key of [...(Cookies.told ?? [])]) if (key.startsWith(`${site} `)) Cookies.told.delete(key);
    const flags = Ci.nsIClearDataService.CLEAR_COOKIES | Ci.nsIClearDataService.CLEAR_DOM_STORAGES |
                  (Ci.nsIClearDataService.CLEAR_COOKIE_BANNER_EXECUTED_RECORD ?? 0);
    return new Promise(resolve => {
      const done = { onDataDeleted: () => resolve(true) };
      try {
        if (Services.clearData.deleteDataFromSite) Services.clearData.deleteDataFromSite(site, {}, true, flags, done);
        else Services.clearData.deleteDataFromBaseDomain(site, true, flags, done);
      } catch (e) {
        console.error("[Zenith] deleting a site's cookies", e);
        resolve(false);
      }
    });
  },

  bannersLeftAlone(site) {
    const list = Services.prefs.getStringPref(this.SKIP, "").split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    return list.includes(site);
  },

  setBannersLeftAlone(site, on) {
    const list = new Set(Services.prefs.getStringPref(this.SKIP, "").split(/[\s,]+/).map(s => s.trim()).filter(Boolean));
    if (on) list.add(site);
    else list.delete(site);
    Services.prefs.setStringPref(this.SKIP, [...list].join(", "));
  },

  // What the banner answerer did lately (this run of Zen).
  async lately() {
    await Cookies.actorReady;
    try {
      return this.actorURL ? ChromeUtils.importESModule(this.actorURL).lately() : [];
    } catch {
      return [];
    }
  },

  /* The page */

  register() {
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
        const url = new URL(`${d}cookies.html`, import.meta.url).href;
        const about = ChromeUtils.importESModule(new URL(`${d}about.sys.mjs`, import.meta.url).href);
        about.register("zenith-cookies", url, read(url));
        about.revive("zenith-cookies");
        return true;
      } catch {}
    }
    console.error("[Zenith] about:zenith-cookies: plus/pages isn't there");
    return false;
  },

  // The page, open at the site you're on.
  open() {
    const host = gBrowser.selectedBrowser?.currentURI;
    const site = /^https?$/.test(host?.scheme ?? "") ? this.site(host.host) : "";
    const url = this.URL + (site ? `?site=${encodeURIComponent(site)}` : "");
    const tab = gBrowser.visibleTabs.find(t => t.linkedBrowser?.currentURI?.spec?.startsWith(this.URL));
    if (tab) {
      tab.linkedBrowser.loadURI(Services.io.newURI(url), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      gBrowser.selectedTab = tab;
    } else {
      openTrustedLinkIn(url, "tab");
    }
  },
};

