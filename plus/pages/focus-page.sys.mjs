// Focus mode's pages (Zenith Plus, Alt+Z with Focus mode › Pages). Three
// ways to quiet a page, each undone the moment you leave focus mode (no
// reload, the page as you left it):
//   - read: an article is shown in a reading view drawn over the page
//     (Firefox's own article parser, a calm column of text); the page
//     itself stays underneath, untouched;
//   - watch: a video site becomes a place to watch rather than a feed:
//     on YouTube the home page is a search page (the logo and the search
//     box, past searches only on request), recommendations, Shorts (a
//     Short opens as an ordinary video), end screens, autoplay, the
//     channel, likes and counts go, the video gets the room (theatre, as
//     tall as the window), and what you chose stays (search, description
//     and chapters, the playlist under the video, comments folded, your
//     subscriptions);
//     on other sites, blocks of recommended videos go;
//   - tidy: any other page that's mostly reading loses what annoyance lists
//     and distraction-free extensions take away (cookie and consent
//     banners, newsletter boxes, share bars, comment sections, "related"
//     and sponsored blocks, ads, side columns) and bars stuck to the top or
//     bottom of the window, never anything holding much of its text.
//
// A window actor: this file runs inside the page's process, where the page
// is. It changes only how the page looks, and takes nothing from the page
// to the browser but whether it's an article, a video page or reading.

const { setTimeout, clearTimeout, setInterval, clearInterval } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

// Firefox's article parser (its Reader view's), wherever this Firefox keeps it.
function readerMode() {
  for (const url of ["resource://gre/modules/ReaderMode.sys.mjs", "moz-src:///toolkit/components/reader/ReaderMode.sys.mjs"]) {
    try {
      return ChromeUtils.importESModule(url).ReaderMode;
    } catch {}
  }
  return null;
}

export class ZenithFocusParent extends JSWindowActorParent {}

const HIDE = [
  // cookie and consent
  "#onetrust-consent-sdk", "#CybotCookiebotDialog", ".qc-cmp2-container", "#usercentrics-root", "#didomi-host", ".fc-consent-root",
  "[id*='cookie-banner' i]", "[class*='cookie-banner' i]", "[id*='cookie-consent' i]", "[class*='cookie-consent' i]",
  "[id*='cookie-notice' i]", "[class*='cookie-notice' i]", "[class*='consent-banner' i]", "[id*='gdpr' i]", "[class*='gdpr' i]",
  // newsletters and sign-up boxes
  "[class*='newsletter' i]", "[id*='newsletter' i]", "[class*='signup-box' i]", "[class*='subscribe-box' i]",
  // share and social
  "[class*='share-bar' i]", "[class*='sharebar' i]", "[class*='social-share' i]", "[class*='share-buttons' i]", "[class*='sharing-buttons' i]",
  // comments
  "#comments", ".comments", "#disqus_thread", "[id*='disqus' i]", "[class*='comments-section' i]", "[class*='comment-section' i]",
  // related, recommended, sponsored
  "[class*='related-posts' i]", "[class*='related-articles' i]", "[class*='recommended' i]", "[class*='outbrain' i]", "[id*='outbrain' i]",
  "[class*='taboola' i]", "[id*='taboola' i]", "[class*='sponsored' i]",
  // ads
  "ins.adsbygoogle", "[id^='google_ads']", "[id^='div-gpt-ad']", "[class*='ad-slot' i]", "[id*='ad-slot' i]", "[class*='advert' i]",
  "iframe[src*='doubleclick']", "iframe[src*='googlesyndication']",
  // side columns
  "aside", "[role='complementary']",
].join(",");

// What a consent prompt says (in a few languages).
// (No word boundaries: banners run their words together; and any space,
// as they use non-breaking ones.)
const CONSENT = /(cookie|consent|your\s+privacy|partner.{0,200}vendors|accept\s+all|aceitar|aceptar|akzeptieren|accepter|accetta)/i;

const HIDDEN_SHEET = "data:text/css," + encodeURIComponent("[zenith-focus-hidden] { display: none !important; }");

// Video sites. YouTube, piece by piece; elsewhere, what's named as more
// videos to watch.
const YOUTUBE = /(^|\.)youtube\.com$/;
const RECOMMENDED = /(recommend|related|up.?next|watch.?next|more.?videos|suggested|you may also like|you might also like|trending)/i;

function youtubeSheet(opts) {
  const hide = [
    // more to watch, beside and after the video, and in the player
    "ytd-watch-flexy #related", "ytd-watch-next-secondary-results-renderer",
    ".ytp-endscreen-content", ".html5-endscreen", ".ytp-ce-element", ".ytp-cards-teaser", ".ytp-pause-overlay",
    ".ytp-autonav-endscreen-countdown-overlay", ".ytp-suggested-action", ".ytp-featured-product", ".ytp-paid-content-overlay",
    ".ytp-title-channel", ".ytp-chrome-top-buttons", ".ytp-cards-button", ".annotation.iv-branding", ".ytp-ce-covering-overlay",
    // the channel, subscribe, likes, share and the rest under the video;
    // the counts and tags; what the description adds around its text
    "ytd-watch-metadata #owner", "ytd-watch-metadata #actions", "ytd-watch-metadata #info-container",
    "ytd-watch-metadata #description a[href^='/hashtag/']",
    "ytd-structured-description-content-renderer #items > :not(ytd-expandable-video-description-body-renderer):not(:has(ytd-macro-markers-list-item-renderer))",
    // the home feed and its topic chips; shelves in search results
    "ytd-browse[page-subtype='home'] #primary", "ytd-browse[page-subtype='home'] #chips-wrapper",
    "ytd-browse[page-subtype='home'] ytd-feed-filter-chip-bar-renderer",
    "ytd-search ytd-shelf-renderer", "ytd-search ytd-horizontal-card-list-renderer", "ytd-search ytd-reel-shelf-renderer",
    // Shorts, everywhere
    "ytd-reel-shelf-renderer", "ytd-rich-shelf-renderer[is-shorts]", "ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])",
    "grid-shelf-view-model:has(ytm-shorts-lockup-view-model)", "ytd-video-renderer:has(a[href^='/shorts/'])",
    "ytd-guide-entry-renderer:has(a[title='Shorts'])", "ytd-mini-guide-entry-renderer[aria-label='Shorts']",
    // the bell, Create and what else YouTube adds to pull you elsewhere
    // (your picture or Sign in stay)
    "ytd-masthead #buttons > :not(ytd-topbar-menu-button-renderer):not(:has(a[href*='ServiceLogin'], a[href*='accounts.google']))",
    "ytd-notification-topbar-button-renderer", "ytd-merch-shelf-renderer", "ytd-statement-banner-renderer", "ytd-ad-slot-renderer",
    "#masthead-ad", "ytd-banner-promo-renderer",
    // the preview that plays as the pointer passes over a video
    "ytd-video-preview", "#video-preview", "ytd-moving-thumbnail-renderer",
    // suggestions and past searches, until you ask for them (the dropdown
    // says Show suggestions)
    "html:not([zenith-yt-suggest]) :is(.ytSearchboxComponentSuggestionsContainer, .sbdd_a) :is(.ytSuggestionComponentSuggestion, .sbsb_c, [role='option'])",
    "html[zenith-yt-suggest] [zenith-yt-suggest-row]",
    // the next Short (scrolling on is blocked too), and on a Short: likes,
    // comments, share, remix, subscribe
    "ytd-shorts #navigation-button-up", "ytd-shorts #navigation-button-down", "ytd-shorts .navigation-container",
    "ytd-shorts :is(.reel-video-in-sequence-new, .reel-video-in-sequence):not(:has(#shorts-player))",
    "ytd-shorts #actions", "ytd-shorts .action-container", "ytd-shorts reel-action-bar-view-model",
    "ytd-shorts :is(yt-subscribe-button-view-model, ytd-subscribe-button-renderer)",
  ];
  // Subscriptions: of the side menu, only your channels (and Home and
  // Subscriptions); and that feed.
  if (opts.subscriptions) {
    hide.push("#guide ytd-guide-section-renderer:not(:first-of-type):not([zenith-yt-subs])",
              "#guide ytd-guide-section-renderer:first-of-type #items > :not(:has(a[href='/'], a[href='/feed/subscriptions']))",
              "#guide ytd-guide-renderer #footer", "#guide ytd-guide-signin-promo-renderer",
              "ytd-mini-guide-entry-renderer:not(:has(a[href='/'], a[href='/feed/subscriptions']))");
  } else {
    hide.push("#guide", "ytd-mini-guide-renderer", "#guide-button", "ytd-browse[page-subtype='subscriptions'] #contents");
  }
  if (!opts.search) hide.push("ytd-masthead #center");
  if (!opts.description) hide.push("ytd-watch-metadata #description", "ytd-watch-flexy #description",
                                   "ytd-engagement-panel-section-list-renderer[target-id*='macro-markers']");
  if (!opts.playlist) hide.push("ytd-playlist-panel-renderer");
  if (!opts.comments) hide.push("ytd-watch-flexy #comments");
  return `
    ${hide.join(",\n    ")} { display: none !important; }
    [zenith-folded] { display: none !important; }
    /* The video first (theatre); the rest under it, in one column (a
       playlist under the video, never beside it) */
    ytd-watch-flexy[theater] #full-bleed-container { height: calc(100vh - var(--ytd-masthead-height, 56px)) !important; max-height: none !important; }
    ytd-watch-flexy[theater] #full-bleed-container :is(#player-full-bleed-container, #player-container, #player-container-outer,
        #player-container-inner, #ytd-player, #container.ytd-player, #movie_player, .html5-video-container) {
      width: 100% !important; height: 100% !important; max-height: none !important; }
    ytd-watch-flexy[theater] #full-bleed-container video.html5-main-video {
      width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; object-fit: contain !important; }
    ytd-watch-flexy[theater] #columns { flex-direction: column !important; align-items: center !important; }
    ytd-watch-flexy[theater] #secondary { width: 100% !important; max-width: var(--ytd-watch-flexy-max-player-width, 1280px) !important;
                                          padding: 0 !important; margin: 0 auto !important; }
    ytd-watch-flexy[theater] #primary { width: 100% !important; max-width: var(--ytd-watch-flexy-max-player-width, 1280px) !important;
                                        margin: 0 auto !important; }
    /* The home page, like a search engine's: the logo, the search box (and
       its microphone), your picture or Sign in */
    html[zenith-yt-home] #masthead-container { position: fixed !important; inset: 0 !important; height: auto !important; z-index: 2020 !important; }
    html[zenith-yt-home] ytd-masthead { height: 100% !important; }
    html[zenith-yt-home] ytd-masthead #container { height: 100% !important; flex-direction: column !important; justify-content: center !important;
                                                   align-items: center !important; gap: 34px !important; padding-bottom: 16vh !important; }
    html[zenith-yt-home] ytd-masthead #start { transform: scale(2.4); transform-origin: center; }
    html[zenith-yt-home] ytd-masthead #guide-button { display: none !important; }
    html[zenith-yt-home] ytd-masthead #center { flex: none !important; width: min(640px, 88vw) !important; margin: 0 !important; }
    html[zenith-yt-home] ytd-masthead #end { position: absolute !important; top: 8px; right: 16px; }
    ytd-shorts #shorts-container { overflow: hidden !important; }
    [zenith-yt-suggest-row] { display: block !important; width: 100% !important; padding: 6px 24px !important; border: 0 !important;
                              background: transparent !important; text-align: start !important; cursor: pointer !important;
                              color: inherit !important; opacity: 0.8; font: 400 1.6rem/2.4rem Roboto, Arial, sans-serif !important; }
    [zenith-yt-suggest-row]:hover { background: color-mix(in srgb, currentColor 10%, transparent) !important; opacity: 1; }
    [zenith-show-comments] {
      display: block; margin: 16px 0; padding: 10px 16px; border: 0; border-radius: 18px; cursor: pointer;
      background: var(--yt-spec-badge-chip-background, rgb(128 128 128 / 0.15)); color: var(--yt-spec-text-primary, inherit);
      font: 500 1.4rem/1 Roboto, system-ui, sans-serif;
    }
  `;
}

const READING_CSS = `
  :host { all: initial; position: fixed; inset: 0; z-index: 2147483646; overflow-y: auto; display: block;
          background: #f7f5f0; color: #1d1d1f; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :host { background: #18181b; color: #e9e7e2; color-scheme: dark; } }
  .page { box-sizing: border-box; max-width: 42em; margin: 0 auto; padding: 9vh 28px 18vh;
          font: 20px/1.65 Georgia, "Iowan Old Style", "Palatino Linotype", serif; }
  .site { font: 13px/1.4 system-ui, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.55; }
  h1.title { font: 600 1.9em/1.2 system-ui, sans-serif; margin: 0.35em 0 0.3em; letter-spacing: -0.01em; }
  .byline { font: 14px/1.4 system-ui, sans-serif; opacity: 0.6; margin-bottom: 2.2em; }
  .content img, .content video, .content figure, .content picture { max-width: 100%; height: auto; }
  .content svg { max-width: 100%; max-height: 4em; }
  .content figure { margin: 1.4em 0; }
  .content figcaption { font: 14px/1.4 system-ui, sans-serif; opacity: 0.6; margin-top: 0.4em; }
  .content a { color: inherit; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); }
  .content pre, .content code { font: 15px/1.5 ui-monospace, Consolas, monospace; }
  .content pre { overflow-x: auto; padding: 12px 14px; border-radius: 8px; background: color-mix(in srgb, currentColor 7%, transparent); }
  .content blockquote { margin: 1.2em 0; padding-left: 1em; border-left: 3px solid color-mix(in srgb, currentColor 25%, transparent); opacity: 0.9; }
  .content table { border-collapse: collapse; max-width: 100%; display: block; overflow-x: auto; font-size: 0.85em; }
  .content td, .content th { border: 1px solid color-mix(in srgb, currentColor 18%, transparent); padding: 4px 8px; }
  .content h2, .content h3, .content h4 { font-family: system-ui, sans-serif; line-height: 1.3; margin: 1.6em 0 0.5em; }
`;

export class ZenithFocusChild extends JSWindowActorChild {
  receiveMessage(msg) {
    switch (msg.name) {
      case "kind": return this.kind();
      case "read": return this.read(true);
      case "unread": return this.read(false);
      case "watch": return this.watch(msg.data ?? {});
      case "unwatch": return this.unwatch();
      case "tidy": return this.tidy(true);
      case "untidy": return this.tidy(false);
      case "undo": return this.undoAll();
      case "state": return { on: !!this.on, hidden: this.hidden?.length ?? 0, reading: this.reading(), read: !!this.host, watch: !!this.watching };
      case "fixed": return this.fixedList(); // (for tools/checks)
      case "watched": return this.watched(); // (for tools/checks)
    }
    return null;
  }

  didDestroy() {
    this.hidden = null;
    this.host = null;
    this.watching = null;
  }

  undoAll() {
    this.read(false);
    this.unwatch();
    this.tidy(false);
    return true;
  }

  // What this page is: a video page (a big video on screen), reading
  // (enough running text), both or neither.
  kind() {
    const host = this.document?.location?.hostname ?? "";
    return { video: !!this.mainVideo(), reading: this.reading(), site: YOUTUBE.test(host) ? "youtube" : "" };
  }

  textLength() {
    let text = 0;
    for (const p of this.document?.querySelectorAll("p") ?? []) text += p.textContent.trim().length;
    return text;
  }

  // Mostly reading: a good amount of running text in paragraphs.
  reading() {
    const doc = this.document;
    if (!doc?.body || doc.contentType !== "text/html") return false;
    return this.textLength() > 1500;
  }

  /* Reading view, over the page */

  async read(on) {
    const doc = this.document, win = this.contentWindow;
    if (!on) {
      this.host?.remove();
      this.host = null;
      if (this.keys) win?.removeEventListener("keydown", this.keys, true);
      this.keys = null;
      return true;
    }
    if (this.host || !doc?.documentElement) return !!this.host;
    let article = null;
    try {
      article = await readerMode()?.parseDocument(doc);
    } catch (e) {
      console.error("[Zenith] focus mode: reading view", e);
    }
    // Too little to be worth it: leave the page (the tidy still applies).
    if (!article?.content || (article.length ?? article.textContent?.length ?? 0) < 500 || !this.contentWindow) return false;
    const utils = Cc["@mozilla.org/parserutils;1"].getService(Ci.nsIParserUtils);
    const safe = utils.sanitize(article.content, utils.SanitizerDropForms | utils.SanitizerDropNonCSSPresentation);
    const host = doc.createElement("zenith-reading");
    const root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = READING_CSS;
    const page = doc.createElement("article");
    page.className = "page";
    const site = doc.createElement("div");
    site.className = "site";
    site.textContent = article.siteName || doc.location?.hostname?.replace(/^www\./, "") || "";
    const title = doc.createElement("h1");
    title.className = "title";
    title.textContent = article.title || doc.title || "";
    const byline = doc.createElement("div");
    byline.className = "byline";
    byline.textContent = [article.byline, article.readingTime ? `${article.readingTime} min` : ""].filter(Boolean).join(" · ");
    const content = doc.createElement("div");
    content.className = "content";
    content.innerHTML = safe;
    // (The article's own first heading, when it's the title again.)
    const first = content.querySelector("h1, h2");
    if (first && first.textContent.trim() === title.textContent.trim()) first.remove();
    page.append(site, title);
    if (byline.textContent) page.append(byline);
    page.append(content);
    root.append(style, page);
    doc.documentElement.append(host);
    this.host = host;
    // Keys scroll the reading view, not the page underneath.
    this.keys = e => {
      if (!this.host || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const step = { ArrowDown: 60, ArrowUp: -60, PageDown: host.clientHeight * 0.9, PageUp: -host.clientHeight * 0.9, " ": (e.shiftKey ? -1 : 1) * host.clientHeight * 0.9 }[e.key];
      if (e.key === "Home" || e.key === "End") host.scrollTop = e.key === "Home" ? 0 : host.scrollHeight;
      else if (step != null) host.scrollBy({ top: step, behavior: "smooth" });
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    win.addEventListener("keydown", this.keys, true);
    return true;
  }

  /* Video sites: a place to watch */

  // The biggest video on screen, if it's a big part of the window.
  mainVideo() {
    const doc = this.document, win = this.contentWindow;
    if (!doc || !win) return null;
    const area = win.innerWidth * win.innerHeight;
    let best = null, bestArea = 0;
    for (const v of doc.querySelectorAll("video")) {
      const r = v.getBoundingClientRect();
      const visible = Math.max(0, Math.min(r.right, win.innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, win.innerHeight) - Math.max(r.top, 0));
      if (visible > bestArea) {
        best = v;
        bestArea = visible;
      }
    }
    return best && bestArea >= area * 0.18 ? best : null;
  }

  // On: the site's sheet (what goes, by what you chose to keep), the
  // video in theatre, autoplay off, again on each of YouTube's own page
  // changes (it doesn't load pages, it swaps them).
  watch(opts) {
    const doc = this.document, win = this.contentWindow;
    if (!doc?.documentElement || !win) return false;
    if (this.watching) return true;
    const site = YOUTUBE.test(doc.location?.hostname ?? "") ? "youtube" : "";
    if (!site && !this.mainVideo()) return false;
    this.watching = { opts, site, sheet: null, theatre: false, autoplay: false, hidden: [], firstPath: doc.location?.pathname };
    if (site === "youtube") {
      this.watching.sheet = "data:text/css," + encodeURIComponent(youtubeSheet(opts));
      try {
        win.windowUtils.loadSheetUsingURIString(this.watching.sheet, win.windowUtils.USER_SHEET);
      } catch {}
      this.onNavigate = () => setTimeout(() => this.settleWatch(), 300);
      doc.addEventListener("yt-navigate-finish", this.onNavigate);
      this.settleWatch();
      // (The player builds its buttons a while after the page: tried each
      // second for 20 seconds, and after each of YouTube's page changes.)
      let tries = 0;
      this.watching.timer = setInterval(() => {
        if (!this.watching || ++tries > 20) return clearInterval(this.watching?.timer);
        this.settleWatch();
      }, 1000);
    } else {
      try {
        win.windowUtils.loadSheetUsingURIString(HIDDEN_SHEET, win.windowUtils.USER_SHEET);
      } catch {}
      this.hideRecommendations();
    }
    return true;
  }

  // YouTube, after each of its page changes: theatre for a video, autoplay
  // off, comments folded behind a button (if kept), the search box ready on
  // the home page.
  settleWatch() {
    const w = this.watching, doc = this.document, win = this.contentWindow;
    if (!w || !doc) return;
    // A Short you go to opens as an ordinary video: no feed to scroll on
    // to. (The one you were on as focus mode started stays, its next one
    // out of reach.)
    const short = doc.location?.pathname.match(/^\/shorts\/([\w-]+)/);
    if (short && doc.location.pathname !== w.firstPath) return void doc.location.replace(`/watch?v=${short[1]}`);
    if (short) this.holdShort(w);
    const home = doc.location?.pathname === "/";
    doc.documentElement.toggleAttribute("zenith-yt-home", home);
    this.searchBox(w);
    this.suggestRow(w);
    this.markGuide(w);
    const flexy = doc.querySelector("ytd-watch-flexy:not([hidden])");
    // (A click before the player is ready does nothing: tried a few times,
    // until it's taken; after that, theatre is yours to turn off.)
    if (flexy?.hasAttribute("theater") && !w.theatreSeen) {
      w.theatreSeen = true;
      // (The player sizes its controls on a resize: to the room it now has.)
      for (const ms of [300, 1200]) setTimeout(() => win?.dispatchEvent(new win.Event("resize")), ms);
    }
    if (flexy && !w.theatreSeen && !flexy.hasAttribute("fullscreen") && (w.theatreTries ?? 0) < 4) {
      const size = doc.querySelector(".ytp-size-button");
      if (size) {
        size.click();
        w.theatreTries = (w.theatreTries ?? 0) + 1;
        w.theatre = true;
        // (Remembered for the tab: it's undone even after another page.)
        try {
          win.sessionStorage.setItem("zenith-theatre", "1");
        } catch {}
      }
    }
    // (Once a page: clicked again and again, the player takes the focus
    // back, and the page scrolls to it.)
    const auto = doc.querySelector(".ytp-autonav-toggle-button[aria-checked='true']");
    if (auto && w.autoplayAt !== doc.location.href) {
      w.autoplayAt = doc.location.href;
      auto.click();
      w.autoplay = true;
    }
    if (w.opts.comments) {
      const comments = flexy?.querySelector("#comments");
      if (comments && !comments.hasAttribute("zenith-folded") && !comments.hasAttribute("zenith-unfolded")) {
        comments.setAttribute("zenith-folded", "");
        const show = doc.createElement("button");
        show.setAttribute("zenith-show-comments", "");
        show.textContent = "Show comments";
        show.addEventListener("click", () => {
          comments.removeAttribute("zenith-folded");
          comments.setAttribute("zenith-unfolded", "");
          show.remove();
        });
        comments.before(show);
      }
    }
    // The home page: the cursor in the search box, once per visit.
    if (w.opts.search && home && w.focused !== doc.location.href) {
      const box = doc.querySelector("input[name='search_query']");
      if (box) {
        w.focused = doc.location.href;
        box.focus();
      }
    } else if (!home) {
      w.focused = null;
    }
  }

  // Suggestions and past searches only when asked: the dropdown shows
  // Show suggestions instead of them, typed or not.
  searchBox(w) {
    const doc = this.document, box = doc.querySelector("input[name='search_query']");
    if (!box || box.zenithWatched) return;
    box.zenithWatched = true;
    // (The dropdown is drawn a moment after the box takes the focus.)
    const row = () => {
      for (const ms of [0, 150, 500]) setTimeout(() => this.suggestRow(w), ms);
    };
    box.addEventListener("input", row);
    box.addEventListener("focus", row);
    box.addEventListener("blur", () => doc.documentElement.removeAttribute("zenith-yt-suggest"));
  }

  suggestRow(w) {
    const doc = this.document;
    const list = doc.querySelector(".ytSearchboxComponentSuggestionsContainer, .sbdd_a");
    if (!list || list.querySelector("[zenith-yt-suggest-row]")) return;
    const row = doc.createElement("button");
    row.setAttribute("zenith-yt-suggest-row", "");
    row.type = "button";
    row.textContent = "Show suggestions";
    row.addEventListener("mousedown", e => e.preventDefault());
    row.addEventListener("click", () => doc.documentElement.setAttribute("zenith-yt-suggest", ""));
    list.prepend(row);
    w.added = [...(w.added ?? []), row];
  }

  // Subscriptions kept: the side menu's part that's your channels (its
  // entries have pictures; Explore's and You's have icons).
  markGuide(w) {
    if (!w.opts.subscriptions) return;
    const doc = this.document;
    for (const sec of doc.querySelectorAll("#guide ytd-guide-section-renderer")) {
      const entries = [...sec.querySelectorAll("ytd-guide-entry-renderer")];
      const channels = entries.filter(e => e.wrappedJSObject?.data?.thumbnail || e.querySelector("img[src*='yt3.']"));
      sec.toggleAttribute("zenith-yt-subs", channels.length > 0 && channels.length * 2 >= entries.length);
    }
    const button = doc.querySelector("#guide-button");
    if (button && !button.zenithWatched) {
      button.zenithWatched = true;
      button.addEventListener("click", () => {
        for (const ms of [100, 600]) setTimeout(() => this.watching && this.markGuide(this.watching), ms);
      });
    }
  }

  // On a Short as focus mode started: no scrolling or keys on to the next.
  holdShort(w) {
    const win = this.contentWindow;
    if (w.holdKeys || !win) return;
    const onShorts = () => /^\/shorts\//.test(this.document?.location?.pathname ?? "");
    w.holdKeys = e => {
      if (onShorts() && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "j", "k"].includes(e.key) && !e.target?.closest?.("input, textarea, [contenteditable]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    w.holdWheel = e => {
      if (!onShorts()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    win.addEventListener("keydown", w.holdKeys, true);
    win.addEventListener("wheel", w.holdWheel, { capture: true, passive: false });
  }

  // What watching changed, as the page shows it (for tools/checks).
  watched() {
    const doc = this.document, win = this.contentWindow;
    const shown = sel => {
      const el = doc.querySelector(sel);
      return el ? win.getComputedStyle(el).display !== "none" : null;
    };
    return { on: !!this.watching, theatre: !!doc.querySelector("ytd-watch-flexy[theater]"),
             autoplay: doc.querySelector(".ytp-autonav-toggle-button")?.getAttribute("aria-checked") ?? null,
             related: shown("ytd-watch-flexy #related"), comments: shown("ytd-watch-flexy #comments"),
             description: shown("ytd-watch-metadata #description"), recs: shown("#recs"),
             home: doc.documentElement.hasAttribute("zenith-yt-home"), owner: shown("ytd-watch-metadata #owner"),
             actions: shown("ytd-watch-metadata #actions"), suggestRow: !!doc.querySelector("[zenith-yt-suggest-row]"),
             bg: win.getComputedStyle(doc.querySelector("#masthead-container") ?? doc.body).backgroundColor, path: doc.location?.pathname };
  }

  // Elsewhere: blocks of recommended videos (a heading or name that says
  // so, and several pictures that are links).
  hideRecommendations() {
    const doc = this.document;
    for (const el of doc.querySelectorAll("section, aside, [class*='related' i], [class*='recommend' i], [id*='related' i], [id*='recommend' i], [class*='up-next' i], [class*='upnext' i]")) {
      if (el === doc.body || el.contains(this.mainVideo())) continue;
      const named = RECOMMENDED.test(`${el.id} ${el.className} ${el.getAttribute("aria-label") ?? ""} ${el.querySelector("h1, h2, h3, h4")?.textContent ?? ""}`);
      if (!named || el.querySelectorAll("a img, a picture").length < 3) continue;
      el.setAttribute("zenith-focus-hidden", "");
      this.watching.hidden.push(el);
    }
  }

  unwatch() {
    const w = this.watching, doc = this.document, win = this.contentWindow;
    if (!w) return true;
    this.watching = null;
    clearInterval(w.timer);
    if (this.onNavigate) doc?.removeEventListener("yt-navigate-finish", this.onNavigate);
    this.onNavigate = null;
    try {
      win?.windowUtils.removeSheetUsingURIString(w.sheet ?? HIDDEN_SHEET, win.windowUtils.USER_SHEET);
    } catch {}
    for (const el of w.hidden) el.removeAttribute("zenith-focus-hidden");
    if (!doc) return true;
    // As it was: theatre and autoplay back as you had them.
    let theatre = w.theatre;
    try {
      theatre ||= win?.sessionStorage.getItem("zenith-theatre") === "1";
      win?.sessionStorage.removeItem("zenith-theatre");
    } catch {}
    if (theatre && doc.querySelector("ytd-watch-flexy[theater]")) doc.querySelector(".ytp-size-button")?.click();
    if (w.holdKeys) win?.removeEventListener("keydown", w.holdKeys, true);
    if (w.holdWheel) win?.removeEventListener("wheel", w.holdWheel, true);
    if (w.autoplay) doc.querySelector(".ytp-autonav-toggle-button[aria-checked='false']")?.click();
    for (const b of doc.querySelectorAll("[zenith-show-comments]")) b.remove();
    for (const n of w.added ?? []) n.remove();
    for (const a of ["zenith-yt-home", "zenith-yt-suggest"]) doc.documentElement.removeAttribute(a);
    for (const n of doc.querySelectorAll("[zenith-yt-subs]")) n.removeAttribute("zenith-yt-subs");
    const box = doc.querySelector("input[name='search_query']");
    if (box) box.zenithWatched = false;
    for (const c of doc.querySelectorAll("[zenith-folded], [zenith-unfolded]")) {
      c.removeAttribute("zenith-folded");
      c.removeAttribute("zenith-unfolded");
    }
    return true;
  }

  /* Tidy */

  // Never hidden: what holds much of the page's text, its title, or the
  // page itself.
  keeps(el, total) {
    const doc = this.document;
    if (el === doc.body || el === doc.documentElement || el.contains(doc.querySelector("main, article, h1"))) return true;
    let text = 0;
    for (const p of el.querySelectorAll("p")) text += p.textContent.trim().length;
    return total > 0 && text > total * 0.2;
  }

  // Hidden by a mark and a rule of the user's own level, which the page's
  // styles and scripts can't override (consent tools keep showing
  // themselves).
  hide(el) {
    if (el.hasAttribute("zenith-focus-hidden")) return;
    el.setAttribute("zenith-focus-hidden", "");
    this.hidden.push(el);
  }

  tidy(on) {
    const doc = this.document, win = this.contentWindow;
    if (!doc || !win) return false;
    if (on && !this.on) {
      if (!this.reading()) return false;
      this.on = true;
      this.hidden = [];
      try {
        win.windowUtils.loadSheetUsingURIString(HIDDEN_SHEET, win.windowUtils.USER_SHEET);
      } catch {}
      const total = this.textLength();
      const sweep = () => {
        for (const el of doc.querySelectorAll(HIDE)) if (!this.keeps(el, total)) this.hide(el);
      };
      sweep();
      this.unstick(total);
      // Banners that turn up a moment later (consent tools load late).
      this.watcher = new win.MutationObserver(() => {
        clearTimeout(this.sweepTimer);
        this.sweepTimer = setTimeout(() => {
          if (!this.on) return;
          sweep();
          this.unstick(total);
        }, 250);
      });
      this.watcher.observe(doc.documentElement, { childList: true, subtree: true });
      setTimeout(() => this.watcher?.disconnect(), 10000);
    } else if (!on && this.on) {
      this.on = false;
      this.watcher?.disconnect();
      this.watcher = null;
      for (const el of this.hidden ?? []) el.removeAttribute("zenith-focus-hidden");
      this.hidden = null;
      try {
        win.windowUtils.removeSheetUsingURIString(HIDDEN_SHEET, win.windowUtils.USER_SHEET);
      } catch {}
    }
    return !!this.on;
  }

  // What's stuck to the window, and what became of it (for tools/checks).
  fixedList() {
    const doc = this.document, win = this.contentWindow, out = [];
    const all = [...doc.querySelectorAll("*")];
    for (const el of all) {
      const cs = win.getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      out.push([el.localName, el.id, String(el.className).slice(0, 40), cs.position, [r.x, r.y, r.width, r.height].map(Math.round),
                cs.display, (el.textContent || "").trim().slice(0, 50), el.hasAttribute("zenith-focus-hidden")]);
      if (out.length > 30) break;
    }
    return { count: all.length, out, iframes: [...doc.querySelectorAll("iframe")].map(f => [f.id, (f.src || "").slice(0, 60), Math.round(f.getBoundingClientRect().height)]).slice(0, 10) };
  }

  // Bars stuck to the top or bottom of the window (headers, banners, chat
  // bubbles) and overlays over most of it, unless they hold the page's
  // text (some sites keep the whole page in a fixed box).
  unstick(total) {
    const doc = this.document, win = this.contentWindow;
    const H = win.innerHeight, Wd = win.innerWidth;
    // (From the root: consent tools often add themselves after the body.)
    const walker = doc.createTreeWalker(doc.documentElement, win.NodeFilter.SHOW_ELEMENT);
    let n = 0;
    for (let el = walker.nextNode(); el && n < 8000; el = walker.nextNode(), n++) {
      if (el === doc.body || el === this.host) continue;
      const cs = win.getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const bar = r.height < H * 0.3 && (cs.position === "sticky" || r.top <= 2 || r.bottom >= H - 2);
      const overlay = cs.position === "fixed" && r.width > Wd * 0.6 && r.height > H * 0.6;
      // A box stuck to the window asking about cookies or privacy goes,
      // however much it says (unless the page itself is in it).
      const consent = cs.position === "fixed" && r.height < H * 0.7 && CONSENT.test(el.textContent.slice(0, 3000)) &&
                      !el.contains(this.document.querySelector("main, article, h1"));
      if (consent) {
        this.hide(el);
        continue;
      }
      if ((!bar && !overlay) || this.keeps(el, total)) continue;
      this.hide(el);
    }
  }
}
