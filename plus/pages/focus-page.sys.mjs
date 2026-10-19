// Focus mode's pages (Zenith Plus, Alt+Z with Focus mode › Pages). Three
// ways to quiet a page, each undone the moment you leave focus mode (no
// reload, the page as you left it):
//   - read: an article is shown in a reading view drawn over the page
//     (Firefox's own article parser, a calm column of text); the page
//     itself stays underneath, untouched;
//   - video: a page whose main thing is a video gets its player filling
//     the window (the site's own player and controls, just bigger);
//   - tidy: any other page that's mostly reading loses what annoyance lists
//     and distraction-free extensions take away (cookie and consent
//     banners, newsletter boxes, share bars, comment sections, "related"
//     and sponsored blocks, ads, side columns) and bars stuck to the top or
//     bottom of the window, never anything holding much of its text.
//
// A window actor: this file runs inside the page's process, where the page
// is. It changes only how the page looks, and takes nothing from the page
// to the browser but whether it's an article, a video page or reading.

const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

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
      case "video": return this.video(true);
      case "unvideo": return this.video(false);
      case "tidy": return this.tidy(true);
      case "untidy": return this.tidy(false);
      case "undo": return this.undoAll();
      case "state": return { on: !!this.on, hidden: this.hidden?.length ?? 0, reading: this.reading(), read: !!this.host, video: !!this.player };
      case "fixed": return this.fixedList(); // (for tools/checks)
    }
    return null;
  }

  didDestroy() {
    this.hidden = null;
    this.host = null;
    this.player = null;
  }

  undoAll() {
    this.read(false);
    this.video(false);
    this.tidy(false);
    return true;
  }

  // What this page is: a video page (a big video on screen), reading
  // (enough running text), both or neither.
  kind() {
    return { video: !!this.mainVideo(), reading: this.reading() };
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

  /* Video: the player fills the window */

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

  video(on) {
    const doc = this.document, win = this.contentWindow;
    if (!on) {
      if (!this.player) return true;
      for (const [el, style] of this.saved ?? []) {
        if (style == null) el.removeAttribute("style");
        else el.setAttribute("style", style);
      }
      this.saved = null;
      this.player = null;
      win?.dispatchEvent(new win.Event("resize"));
      return true;
    }
    if (this.player) return true;
    const v = this.mainVideo();
    if (!v) return false;
    // The player: the outermost box around the video that's the video's
    // size (where the site keeps its controls).
    const r = v.getBoundingClientRect();
    let player = v;
    for (let el = v.parentElement; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
      const b = el.getBoundingClientRect();
      if (Math.abs(b.width - r.width) > 6 || Math.abs(b.height - r.height) > 6) break;
      player = el;
    }
    this.saved = [[player, player.getAttribute("style")], [doc.documentElement, doc.documentElement.getAttribute("style")]];
    if (player !== v) this.saved.push([v, v.getAttribute("style")]);
    const set = (el, props) => {
      for (const [k, val] of Object.entries(props)) el.style.setProperty(k, val, "important");
    };
    set(player, { position: "fixed", inset: "0", width: "100vw", height: "100vh", "max-width": "none", "max-height": "none",
                  margin: "0", transform: "none", "z-index": "2147483646", background: "black" });
    if (player !== v) set(v, { width: "100%", height: "100%", "object-fit": "contain", left: "0", top: "0" });
    set(doc.documentElement, { overflow: "hidden" });
    this.player = player;
    // (Players lay themselves out again on a resize.)
    win.dispatchEvent(new win.Event("resize"));
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
